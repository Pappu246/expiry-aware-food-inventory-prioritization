#include "fefo/engine.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#include <direct.h>
#else
#include <sys/stat.h>
#endif

#define APP_MAX_BATCHES 10000U
#define APP_LINE_CAP 512U
#define CSV_MAX_FIELDS 8U
#define CSV_FIELD_CAP 256U
#define DEFAULT_LOW_STOCK 10
#define INVENTORY_FILE "data/inventory.csv"
#define INVENTORY_TEMP "data/inventory.csv.tmp"
#define INVENTORY_BACKUP "data/inventory_backup.csv"
#define TRANSACTION_FILE "data/transactions.csv"
#define SETTINGS_FILE "data/settings.txt"
#define STOCK_REPORT_FILE "data/stock_report.csv"

typedef struct {
    char name[FEFO_ITEM_NAME_CAP];
    long long available_qty;
    long long expired_qty;
    size_t active_batches;
    size_t expired_batches;
} ProductSummary;

static FoodBatch g_batches[APP_MAX_BATCHES];
static size_t g_batch_count = 0U;
static int g_low_stock_threshold = DEFAULT_LOW_STOCK;
static int g_today = 0;
static bool g_inventory_load_failed = false;

static void ensure_data_dir(void) {
#ifdef _WIN32
    (void)_mkdir("data");
#else
    (void)mkdir("data", 0755);
#endif
}

static char *trim(char *s) {
    size_t n;
    char *start = s;
    while (*start && isspace((unsigned char)*start)) ++start;
    if (start != s) memmove(s, start, strlen(start) + 1U);
    n = strlen(s);
    while (n > 0U && isspace((unsigned char)s[n - 1U])) s[--n] = '\0';
    return s;
}

static bool read_line(const char *prompt, char *buffer, size_t capacity) {
    size_t n;
    int ch;
    if (prompt) { fputs(prompt, stdout); fflush(stdout); }
    if (!fgets(buffer, (int)capacity, stdin)) return false;
    n = strlen(buffer);
    if (n > 0U && buffer[n - 1U] == '\n') buffer[--n] = '\0';
    else if (!feof(stdin)) {
        while ((ch = getchar()) != '\n' && ch != EOF) { }
        puts("Input was too long. Please enter a shorter value.");
        buffer[0] = '\0';
        return false;
    }
    if (n > 0U && buffer[n - 1U] == '\r') buffer[--n] = '\0';
    trim(buffer);
    return true;
}

static bool parse_int_strict(const char *s, int *out) {
    char *end = NULL;
    long v;
    if (!s || !*s || !out) return false;
    errno = 0;
    v = strtol(s, &end, 10);
    if (errno == ERANGE || end == s || *end != '\0' || v < INT_MIN || v > INT_MAX) return false;
    *out = (int)v;
    return true;
}

static bool ask_int(const char *prompt, int minimum, int maximum, int *out) {
    char line[APP_LINE_CAP];
    int v;
    for (;;) {
        if (!read_line(prompt, line, sizeof(line))) {
            if (feof(stdin)) return false;
            continue;
        }
        if (parse_int_strict(line, &v) && v >= minimum && v <= maximum) {
            *out = v;
            return true;
        }
        printf("Enter a whole number from %d to %d.\n", minimum, maximum);
    }
}

static bool ask_text(const char *prompt, char *out, size_t capacity, bool allow_blank) {
    for (;;) {
        if (!read_line(prompt, out, capacity)) {
            if (feof(stdin)) return false;
            continue;
        }
        if (allow_blank && out[0] == '\0') return true;
        if (out[0] == '\0') {
            puts("This value cannot be empty.");
            continue;
        }
        if (strlen(out) >= capacity) {
            printf("Keep this value below %lu characters.\n", (unsigned long)capacity);
            continue;
        }
        return true;
    }
}

static int days_in_month(int year, int month) {
    static const int days[] = { 31,28,31,30,31,30,31,31,30,31,30,31 };
    if (month < 1 || month > 12) return 0;
    if (month == 2 && ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0)) return 29;
    return days[month - 1];
}

static long long days_from_civil(int year, unsigned month, unsigned day) {
    int y = year;
    int era;
    unsigned yoe, doy, doe;
    y -= month <= 2U;
    era = (y >= 0 ? y : y - 399) / 400;
    yoe = (unsigned)(y - era * 400);
    doy = (153U * (month + (month > 2U ? (unsigned)-3 : 9U)) + 2U) / 5U + day - 1U;
    doe = yoe * 365U + yoe / 4U - yoe / 100U + doy;
    return (long long)era * 146097LL + (long long)doe - 719468LL;
}

static void civil_from_days(int day_number, int *year, unsigned *month, unsigned *day) {
    long long z = (long long)day_number + 719468LL;
    long long era = (z >= 0 ? z : z - 146096LL) / 146097LL;
    unsigned doe = (unsigned)(z - era * 146097LL);
    unsigned yoe = (doe - doe / 1460U + doe / 36524U - doe / 146096U) / 365U;
    int y = (int)yoe + (int)(era * 400LL);
    unsigned doy = doe - (365U * yoe + yoe / 4U - yoe / 100U);
    unsigned mp = (5U * doy + 2U) / 153U;
    unsigned d = doy - (153U * mp + 2U) / 5U + 1U;
    unsigned m = mp + (mp < 10U ? 3U : (unsigned)-9);
    y += m <= 2U;
    *year = y; *month = m; *day = d;
}

static bool parse_date(const char *text, int *day_number) {
    int year, month, day;
    size_t i;
    long long serial;
    if (!text || !day_number || strlen(text) != 10U || text[4] != '-' || text[7] != '-') return false;
    for (i = 0U; i < 10U; ++i) {
        if (i != 4U && i != 7U && !isdigit((unsigned char)text[i])) return false;
    }
    year = (text[0] - '0') * 1000 + (text[1] - '0') * 100 + (text[2] - '0') * 10 + (text[3] - '0');
    month = (text[5] - '0') * 10 + (text[6] - '0');
    day = (text[8] - '0') * 10 + (text[9] - '0');
    if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > days_in_month(year, month)) return false;
    serial = days_from_civil(year, (unsigned)month, (unsigned)day);
    if (serial < 0 || serial > INT_MAX) return false;
    *day_number = (int)serial;
    return true;
}

static void format_date(int day_number, char out[11]) {
    int year; unsigned month, day;
    civil_from_days(day_number, &year, &month, &day);
    out[0] = (char)('0' + ((year / 1000) % 10));
    out[1] = (char)('0' + ((year / 100) % 10));
    out[2] = (char)('0' + ((year / 10) % 10));
    out[3] = (char)('0' + (year % 10));
    out[4] = '-';
    out[5] = (char)('0' + (month / 10U));
    out[6] = (char)('0' + (month % 10U));
    out[7] = '-';
    out[8] = (char)('0' + (day / 10U));
    out[9] = (char)('0' + (day % 10U));
    out[10] = '\0';
}

static int today_day(void) {
    time_t now = time(NULL);
    struct tm *local = localtime(&now);
    long long serial;
    if (!local) return 0;
    serial = days_from_civil(local->tm_year + 1900, (unsigned)local->tm_mon + 1U, (unsigned)local->tm_mday);
    if (serial < 0 || serial > INT_MAX) return 0;
    return (int)serial;
}

static void timestamp_now(char out[20]) {
    time_t now = time(NULL);
    struct tm *local = localtime(&now);
    if (!local) { (void)snprintf(out, 20U, "unknown-time"); return; }
    (void)strftime(out, 20U, "%Y-%m-%d %H:%M:%S", local);
}

static int compare_case_insensitive(const char *a, const char *b) {
    while (*a && *b) {
        int ca = tolower((unsigned char)*a), cb = tolower((unsigned char)*b);
        if (ca != cb) return (ca > cb) - (ca < cb);
        ++a; ++b;
    }
    return (*a != '\0') - (*b != '\0');
}

static bool contains_case_insensitive(const char *haystack, const char *needle) {
    size_t n;
    const char *p;
    if (!needle || !*needle) return true;
    n = strlen(needle);
    for (p = haystack; *p; ++p) {
        size_t i;
        for (i = 0U; i < n; ++i) {
            if (!p[i] || tolower((unsigned char)p[i]) != tolower((unsigned char)needle[i])) break;
        }
        if (i == n) return true;
    }
    return false;
}

static const char *status_name(BatchStatus status) {
    switch (status) {
        case BATCH_ACTIVE: return "ACTIVE";
        case BATCH_EXHAUSTED: return "EXHAUSTED";
        case BATCH_EXPIRED: return "EXPIRED";
        default: return "UNKNOWN";
    }
}

static bool parse_status(const char *text, BatchStatus *status) {
    if (strcmp(text, "ACTIVE") == 0) *status = BATCH_ACTIVE;
    else if (strcmp(text, "EXHAUSTED") == 0) *status = BATCH_EXHAUSTED;
    else if (strcmp(text, "EXPIRED") == 0) *status = BATCH_EXPIRED;
    else return false;
    return true;
}

static int csv_write_field(FILE *f, const char *text) {
    const char *p;
    bool quote = false;
    for (p = text; *p; ++p) if (*p == ',' || *p == '"' || *p == '\n' || *p == '\r') { quote = true; break; }
    if (quote && fputc('"', f) == EOF) return -1;
    for (p = text; *p; ++p) {
        if (*p == '"' && quote && fputc('"', f) == EOF) return -1;
        if (fputc((unsigned char)*p, f) == EOF) return -1;
    }
    if (quote && fputc('"', f) == EOF) return -1;
    return 0;
}

/* Reads one RFC-4180-style CSV row. Returns 1=row, 0=EOF, -1=malformed/too wide. */
static int csv_read_row(FILE *f, char fields[CSV_MAX_FIELDS][CSV_FIELD_CAP], size_t *field_count) {
    size_t fi = 0U, len = 0U;
    bool in_quotes = false, at_field_start = true, got_any = false;
    int c;
    for (fi = 0U; fi < CSV_MAX_FIELDS; ++fi) fields[fi][0] = '\0';
    fi = 0U;
    for (;;) {
        c = fgetc(f);
        if (c == EOF) {
            if (!got_any) return 0;
            if (in_quotes) return -1;
            break;
        }
        got_any = true;
        if (in_quotes) {
            if (c == '"') {
                int next = fgetc(f);
                if (next == '"') c = '"';
                else {
                    in_quotes = false;
                    if (next != EOF) (void)ungetc(next, f);
                    continue;
                }
            }
        } else {
            if (c == '\n') break;
            if (c == '\r') {
                int next = fgetc(f);
                if (next != '\n' && next != EOF) (void)ungetc(next, f);
                break;
            }
            if (c == ',' ) {
                if (fi + 1U >= CSV_MAX_FIELDS) return -1;
                ++fi; len = 0U; at_field_start = true; continue;
            }
            if (c == '"' && at_field_start) { in_quotes = true; at_field_start = false; continue; }
        }
        at_field_start = false;
        if (len + 1U >= CSV_FIELD_CAP) return -1;
        fields[fi][len++] = (char)c;
        fields[fi][len] = '\0';
    }
    *field_count = fi + 1U;
    return 1;
}

static int copy_file(const char *from, const char *to) {
    FILE *in = fopen(from, "rb"), *out;
    int ch;
    if (!in) return 0;
    out = fopen(to, "wb");
    if (!out) { (void)fclose(in); return -1; }
    while ((ch = fgetc(in)) != EOF) {
        if (fputc(ch, out) == EOF) { (void)fclose(in); (void)fclose(out); return -1; }
    }
    {
        int read_failed = ferror(in) ? 1 : 0;
        int close_in_failed = fclose(in) != 0 ? 1 : 0;
        int close_out_failed = fclose(out) != 0 ? 1 : 0;
        if (read_failed || close_in_failed || close_out_failed) return -1;
    }
    return 1;
}

/* Return 1 when files match, 0 when different or the right file is absent, -1 on I/O errors. */
static int files_identical(const char *left, const char *right) {
    FILE *a = fopen(left, "rb"), *b;
    int ca, cb, identical = 1, read_failed = 0, saved_errno;
    if (!a) return -1;
    b = fopen(right, "rb");
    if (!b) {
        saved_errno = errno;
        if (fclose(a) != 0) return -1;
        return saved_errno == ENOENT ? 0 : -1;
    }
    for (;;) {
        ca = fgetc(a);
        cb = fgetc(b);
        if (ca != cb) { identical = 0; break; }
        if (ca == EOF) break;
    }
    if (ferror(a) || ferror(b)) read_failed = 1;
    if (fclose(a) != 0) read_failed = 1;
    if (fclose(b) != 0) read_failed = 1;
    if (read_failed) return -1;
    return identical ? 1 : 0;
}

static bool save_inventory(void) {
    FILE *f;
    size_t i;
    int backup_result;
    f = fopen(INVENTORY_TEMP, "w");
    if (!f) { perror("Cannot write inventory file"); return false; }
    if (fprintf(f, "batch_id,item,quantity,received_date,expiry_date,status\n") < 0) {
        (void)fclose(f); (void)remove(INVENTORY_TEMP); return false;
    }
    for (i = 0U; i < g_batch_count; ++i) {
        char received[11], expiry[11], qty[32];
        FoodBatch *b = &g_batches[i];
        format_date(b->received_day, received); format_date(b->expiry_day, expiry);
        (void)snprintf(qty, sizeof(qty), "%d", b->quantity);
        if (csv_write_field(f, b->id) != 0 || fputc(',', f) == EOF ||
            csv_write_field(f, b->item) != 0 || fputc(',', f) == EOF ||
            fputs(qty, f) == EOF || fputc(',', f) == EOF || fputs(received, f) == EOF || fputc(',', f) == EOF ||
            fputs(expiry, f) == EOF || fputc(',', f) == EOF || fputs(status_name(b->status), f) == EOF || fputc('\n', f) == EOF) {
            (void)fclose(f); (void)remove(INVENTORY_TEMP); return false;
        }
    }
    {
        int write_failed = ferror(f) ? 1 : 0;
        int close_failed = fclose(f) != 0 ? 1 : 0;
        if (write_failed || close_failed) { (void)remove(INVENTORY_TEMP); return false; }
    }
    {
        int same_result = files_identical(INVENTORY_TEMP, INVENTORY_FILE);
        if (same_result == 1) {
            (void)remove(INVENTORY_TEMP);
            return true; /* An unchanged save must not replace the previous-state backup. */
        }
        if (same_result < 0) {
            fprintf(stderr, "Cannot verify existing inventory; refusing to replace it.\n");
            (void)remove(INVENTORY_TEMP);
            return false;
        }
    }
    backup_result = copy_file(INVENTORY_FILE, INVENTORY_BACKUP);
    if (backup_result < 0) {
        fprintf(stderr, "Warning: could not refresh backup '%s'.\n", INVENTORY_BACKUP);
    }
#ifdef _WIN32
    /* Never remove the last persisted copy unless a backup was made successfully. */
    if (backup_result == 1 && remove(INVENTORY_FILE) != 0) {
        perror("Cannot replace inventory file"); (void)remove(INVENTORY_TEMP); return false;
    }
#endif
    if (rename(INVENTORY_TEMP, INVENTORY_FILE) != 0) {
        perror("Cannot replace inventory file");
#ifdef _WIN32
        if (backup_result == 1 && copy_file(INVENTORY_BACKUP, INVENTORY_FILE) != 1) {
            fprintf(stderr, "Critical warning: inventory replacement failed and backup restoration also failed. Preserve '%s'.\n", INVENTORY_BACKUP);
        }
#endif
        (void)remove(INVENTORY_TEMP);
        return false;
    }
    return true;
}

static bool append_transaction(const char *action, const char *item, const char *batch_id, int quantity, const char *detail) {
    FILE *f;
    char timestamp[20], qty[32];
    bool new_file = false;
    f = fopen(TRANSACTION_FILE, "r");
    if (!f) new_file = true; else (void)fclose(f);
    f = fopen(TRANSACTION_FILE, "a");
    if (!f) { perror("Cannot open transaction log"); return false; }
    if (new_file && fputs("timestamp,action,item,batch_id,quantity,detail\n", f) == EOF) { (void)fclose(f); return false; }
    timestamp_now(timestamp); (void)snprintf(qty, sizeof(qty), "%d", quantity);
    if (csv_write_field(f, timestamp) != 0 || fputc(',', f) == EOF || csv_write_field(f, action) != 0 || fputc(',', f) == EOF ||
        csv_write_field(f, item ? item : "") != 0 || fputc(',', f) == EOF || csv_write_field(f, batch_id ? batch_id : "") != 0 ||
        fputc(',', f) == EOF || fputs(qty, f) == EOF || fputc(',', f) == EOF || csv_write_field(f, detail ? detail : "") != 0 || fputc('\n', f) == EOF || ferror(f)) {
        (void)fclose(f); return false;
    }
    return fclose(f) == 0;
}

static void ensure_transaction_file(void) {
    FILE *f = fopen(TRANSACTION_FILE, "r");
    if (f) { (void)fclose(f); return; }
    f = fopen(TRANSACTION_FILE, "w");
    if (f) { fputs("timestamp,action,item,batch_id,quantity,detail\n", f); (void)fclose(f); }
}

static void load_settings(void) {
    FILE *f = fopen(SETTINGS_FILE, "r");
    int n;
    if (!f) return;
    if (fscanf(f, "%d", &n) == 1 && n >= 0 && n <= 1000000) g_low_stock_threshold = n;
    (void)fclose(f);
}

static bool save_settings(void) {
    FILE *f = fopen(SETTINGS_FILE, "w");
    if (!f) return false;
    if (fprintf(f, "%d\n", g_low_stock_threshold) < 0) { (void)fclose(f); return false; }
    return fclose(f) == 0;
}

static bool id_exists(const char *id) {
    size_t i;
    for (i = 0U; i < g_batch_count; ++i) if (strcmp(g_batches[i].id, id) == 0) return true;
    return false;
}

static bool add_to_memory(const char *id, const char *item, int qty, int received_day, int expiry_day, bool allow_expired, size_t *index_out) {
    FoodBatch b;
    FefoStatus s;
    if (g_batch_count >= APP_MAX_BATCHES) { puts("Inventory capacity reached (10,000 batches). Export/ archive data before adding more."); return false; }
    if (id_exists(id)) { printf("Batch ID '%s' already exists. IDs are not reused, including after stock is exhausted.\n", id); return false; }
    if (received_day > g_today) { puts("This date is in the future; future receipts cannot be added as on-hand stock."); return false; }
    if (!allow_expired && expiry_day < g_today) { puts("This batch is already past its expiry date. Do not add it as active stock."); return false; }
    s = food_batch_init(&b, id, item, qty, received_day, expiry_day);
    if (s != FEFO_OK) { printf("Invalid batch: %s\n", fefo_status_string(s)); return false; }
    if (expiry_day < g_today) b.status = BATCH_EXPIRED;
    g_batches[g_batch_count] = b;
    if (index_out) *index_out = g_batch_count;
    ++g_batch_count;
    return true;
}

static void load_inventory(void) {
    static const char *expected_header[6] = {
        "batch_id", "item", "quantity", "received_date", "expiry_date", "status"
    };
    FILE *f = fopen(INVENTORY_FILE, "r");
    char fields[CSV_MAX_FIELDS][CSV_FIELD_CAP];
    size_t field_count = 0U, line_no = 0U, i;
    int row_result;
    if (!f) {
        if (errno == ENOENT) {
            FILE *backup = fopen(INVENTORY_BACKUP, "r");
            if (backup) {
                if (fclose(backup) != 0) perror("Cannot inspect existing inventory backup");
                fprintf(stderr, "ERROR: inventory.csv is missing but inventory_backup.csv exists; refusing to initialize an empty inventory. Restore a known-good backup first.\n");
                g_inventory_load_failed = true;
                return;
            }
            if (errno != ENOENT) {
                perror("Cannot inspect inventory backup");
                g_inventory_load_failed = true;
                return;
            }
            if (!save_inventory()) {
                fprintf(stderr, "Warning: unable to initialise inventory storage.\n");
                g_inventory_load_failed = true;
            }
        } else {
            perror("Cannot read existing inventory file");
            g_inventory_load_failed = true;
        }
        return;
    }

    row_result = csv_read_row(f, fields, &field_count);
    if (row_result <= 0 || field_count != 6U) {
        fprintf(stderr, "ERROR: inventory CSV is empty or its header is malformed.\n");
        g_inventory_load_failed = true;
        (void)fclose(f);
        return;
    }
    for (i = 0U; i < 6U; ++i) {
        if (compare_case_insensitive(fields[i], expected_header[i]) != 0) {
            fprintf(stderr, "ERROR: inventory CSV header does not match the expected format.\n");
            g_inventory_load_failed = true;
            (void)fclose(f);
            return;
        }
    }
    ++line_no;

    while ((row_result = csv_read_row(f, fields, &field_count)) != 0) {
        int quantity, received, expiry;
        BatchStatus status;
        FoodBatch *b;
        if (row_result < 0 || field_count != 6U || !fields[0][0] || !fields[1][0] ||
            !parse_int_strict(fields[2], &quantity) || quantity < 0 ||
            !parse_date(fields[3], &received) || !parse_date(fields[4], &expiry) ||
            received > g_today || expiry < received || !parse_status(fields[5], &status) ||
            strlen(fields[0]) >= FEFO_BATCH_ID_CAP || strlen(fields[1]) >= FEFO_ITEM_NAME_CAP) {
            fprintf(stderr, "ERROR: malformed inventory row near line %lu; refusing to load partial stock.\n",
                    (unsigned long)(line_no + 1U));
            g_inventory_load_failed = true;
            break;
        }
        if (g_batch_count >= APP_MAX_BATCHES) {
            fprintf(stderr, "ERROR: inventory exceeds the app limit; refusing to load partial stock.\n");
            g_inventory_load_failed = true;
            break;
        }
        if (id_exists(fields[0])) {
            fprintf(stderr, "ERROR: duplicate batch ID '%s' in saved data; refusing partial load.\n", fields[0]);
            g_inventory_load_failed = true;
            break;
        }
        b = &g_batches[g_batch_count];
        memset(b, 0, sizeof(*b));
        (void)memcpy(b->id, fields[0], strlen(fields[0]) + 1U);
        (void)memcpy(b->item, fields[1], strlen(fields[1]) + 1U);
        b->quantity = quantity;
        b->received_day = received;
        b->expiry_day = expiry;
        b->status = status;
        if (b->status == BATCH_ACTIVE && b->quantity == 0) b->status = BATCH_EXHAUSTED;
        ++g_batch_count;
        ++line_no;
    }

    if (ferror(f)) {
        fprintf(stderr, "ERROR: read error while loading saved inventory; refusing to save a partial result.\n");
        g_inventory_load_failed = true;
    }
    if (fclose(f) != 0) {
        fprintf(stderr, "ERROR: closing the inventory file failed; refusing to save a partial result.\n");
        g_inventory_load_failed = true;
    }
}
static size_t mark_expired_batches(void) {
    FoodBatch *changed_batches[APP_MAX_BATCHES];
    size_t i, changed = 0U;
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        if (b->status == BATCH_ACTIVE && b->quantity > 0 && g_today > b->expiry_day) {
            b->status = BATCH_EXPIRED;
            changed_batches[changed++] = b;
        }
    }
    if (changed == 0U) return 0U;

    if (!save_inventory()) {
        for (i = 0U; i < changed; ++i) changed_batches[i]->status = BATCH_ACTIVE;
        puts("Warning: expiry status changes were not saved; they were rolled back and no EXPIRE events were logged.");
        return 0U;
    }

    for (i = 0U; i < changed; ++i) {
        FoodBatch *b = changed_batches[i];
        if (!append_transaction("EXPIRE", b->item, b->id, b->quantity,
                                "Date-based inventory alert; follow local food-safety procedure")) {
            fprintf(stderr, "Warning: inventory status was saved, but EXPIRE event logging failed for %s.\n", b->id);
        }
    }
    printf("Expiry check: %lu batch(es) moved to EXPIRED status.\n", (unsigned long)changed);
    return changed;
}
static int batch_expiry_ptr_compare(const void *left, const void *right) {
    const FoodBatch *a = *(FoodBatch * const *)left;
    const FoodBatch *b = *(FoodBatch * const *)right;
    if (a->expiry_day != b->expiry_day) return (a->expiry_day > b->expiry_day) - (a->expiry_day < b->expiry_day);
    if (a->received_day != b->received_day) return (a->received_day > b->received_day) - (a->received_day < b->received_day);
    return strcmp(a->id, b->id);
}

static int batch_fifo_ptr_compare(const void *left, const void *right) {
    const FoodBatch *a = *(FoodBatch * const *)left;
    const FoodBatch *b = *(FoodBatch * const *)right;
    if (a->received_day != b->received_day) return (a->received_day > b->received_day) - (a->received_day < b->received_day);
    return strcmp(a->id, b->id);
}

static void print_table_header(void) {
    printf("%-18s %-24s %8s %-12s %-12s %-10s\n", "BATCH ID", "ITEM", "QTY", "RECEIVED", "EXPIRY", "STATUS");
    puts("------------------------------------------------------------------------------------------------------------");
}

static void print_batch(const FoodBatch *b) {
    char received[11], expiry[11];
    format_date(b->received_day, received); format_date(b->expiry_day, expiry);
    printf("%-18.18s %-24.24s %8d %-12s %-12s %-10s\n", b->id, b->item, b->quantity, received, expiry, status_name(b->status));
}

static size_t available_stock_for_item(const char *item, long long *qty_out) {
    size_t i, count = 0U;
    long long qty = 0;
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        if (compare_case_insensitive(b->item, item) == 0 && b->status == BATCH_ACTIVE && b->quantity > 0 && b->received_day <= g_today && b->expiry_day >= g_today) {
            qty += b->quantity; ++count;
        }
    }
    if (qty_out) *qty_out = qty;
    return count;
}

static int product_summary_compare(const void *left, const void *right) {
    const ProductSummary *a = (const ProductSummary *)left;
    const ProductSummary *b = (const ProductSummary *)right;
    return compare_case_insensitive(a->name, b->name);
}

static ProductSummary *build_product_summaries(size_t *count_out) {
    ProductSummary *items;
    size_t i, n = 0U, merged = 0U;
    items = calloc(g_batch_count ? g_batch_count : 1U, sizeof(*items));
    if (!items) return NULL;
    for (i = 0U; i < g_batch_count; ++i) {
        const FoodBatch *b = &g_batches[i];
        ProductSummary *p = &items[n++];
        (void)memcpy(p->name, b->item, strlen(b->item) + 1U);
        if (b->status == BATCH_ACTIVE && b->quantity > 0 && b->received_day <= g_today && b->expiry_day >= g_today) {
            p->available_qty = b->quantity; p->active_batches = 1U;
        } else if (b->status == BATCH_EXPIRED && b->quantity > 0) {
            p->expired_qty = b->quantity; p->expired_batches = 1U;
        }
    }
    qsort(items, n, sizeof(*items), product_summary_compare);
    for (i = 0U; i < n; ++i) {
        if (merged > 0U && compare_case_insensitive(items[merged - 1U].name, items[i].name) == 0) {
            items[merged - 1U].available_qty += items[i].available_qty;
            items[merged - 1U].expired_qty += items[i].expired_qty;
            items[merged - 1U].active_batches += items[i].active_batches;
            items[merged - 1U].expired_batches += items[i].expired_batches;
        } else {
            if (merged != i) items[merged] = items[i];
            ++merged;
        }
    }
    *count_out = merged;
    return items;
}

static void dashboard(void) {
    size_t i, active = 0U, expired = 0U, exhausted = 0U, expiring = 0U, products_n = 0U;
    long long available = 0, expired_qty = 0;
    ProductSummary *products;
    char today_text[11]; format_date(g_today, today_text);
    for (i = 0U; i < g_batch_count; ++i) {
        const FoodBatch *b = &g_batches[i];
        if (b->status == BATCH_ACTIVE && b->quantity > 0 && b->received_day <= g_today && b->expiry_day >= g_today) {
            ++active; available += b->quantity;
            if (b->expiry_day - g_today <= 7) ++expiring;
        } else if (b->status == BATCH_EXPIRED && b->quantity > 0) { ++expired; expired_qty += b->quantity; }
        else if (b->status == BATCH_EXHAUSTED || b->quantity == 0) ++exhausted;
    }
    puts("\n================ INVENTORY DASHBOARD ================");
    printf("Today: %s | Low-stock threshold: %d unit(s) per item\n", today_text, g_low_stock_threshold);
    printf("Registered batches : %lu\n", (unsigned long)g_batch_count);
    printf("Active batches     : %lu\n", (unsigned long)active);
    printf("Available quantity : %lld unit(s)\n", available);
    printf("Expiring in 7 days : %lu batch(es)\n", (unsigned long)expiring);
    printf("Expired stock      : %lu batch(es), %lld unit(s)\n", (unsigned long)expired, expired_qty);
    printf("Exhausted batches  : %lu\n", (unsigned long)exhausted);
    products = build_product_summaries(&products_n);
    if (!products) { puts("Warning: could not calculate per-item low-stock summary."); return; }
    puts("\nLow-stock items:");
    {
        bool any = false;
        for (i = 0U; i < products_n; ++i) if (g_low_stock_threshold > 0 && products[i].available_qty < g_low_stock_threshold) {
            printf("  %-24.24s available=%lld, threshold=%d\n", products[i].name, products[i].available_qty, g_low_stock_threshold); any = true;
        }
        if (!any) puts("  None");
    }
    free(products);
}

static void view_inventory(void) {
    FoodBatch *list[APP_MAX_BATCHES];
    size_t i, n = 0U;
    if (g_batch_count == 0U) { puts("Inventory is empty. Use 'Receive stock' to add your first batch."); return; }
    for (i = 0U; i < g_batch_count; ++i) list[n++] = &g_batches[i];
    qsort(list, n, sizeof(list[0]), batch_expiry_ptr_compare);
    puts("\n================ INVENTORY (earliest expiry first) ================");
    print_table_header();
    for (i = 0U; i < n; ++i) print_batch(list[i]);
    printf("Total registered batch records: %lu\n", (unsigned long)n);
}

static bool input_date(const char *prompt, int *out, bool blank_means_today) {
    char line[APP_LINE_CAP];
    for (;;) {
        if (!read_line(prompt, line, sizeof(line))) { if (feof(stdin)) return false; continue; }
        if (blank_means_today && !line[0]) { *out = g_today; return true; }
        if (parse_date(line, out)) return true;
        puts("Enter a real date in YYYY-MM-DD format, for example 2026-10-15.");
    }
}

static void receive_stock(void) {
    char id[FEFO_BATCH_ID_CAP], item[FEFO_ITEM_NAME_CAP];
    int qty, received, expiry;
    char received_text[11], expiry_text[11];
    size_t idx;
    puts("\n--- RECEIVE / ADD STOCK ---");
    if (!ask_text("Unique batch ID (e.g. RICE-001): ", id, sizeof(id), false) ||
        !ask_text("Food item name (e.g. Rice): ", item, sizeof(item), false) ||
        !ask_int("Quantity in your chosen unit (e.g. bags, packets, kg): ", 1, INT_MAX, &qty) ||
        !input_date("Received date YYYY-MM-DD (blank = today): ", &received, true) ||
        !input_date("Expiry date YYYY-MM-DD: ", &expiry, false)) return;
    if (received > g_today) { puts("Rejected: received date cannot be in the future for stock already on hand."); return; }
    if (expiry < received) { puts("Rejected: expiry date cannot be before received date."); return; }
    if (expiry < g_today) { puts("Rejected: this batch is already expired; it cannot be added as active stock."); return; }
    if (!add_to_memory(id, item, qty, received, expiry, false, &idx)) return;
    if (!save_inventory()) { g_batch_count--; puts("Stock was not saved. The in-memory addition was rolled back."); return; }
    if (!append_transaction("RECEIVE", item, id, qty, "Stock batch received")) puts("Warning: stock saved, but transaction log append failed.");
    format_date(received, received_text); format_date(expiry, expiry_text);
    printf("Saved: %s | %s | qty %d | received %s | expiry %s\n", id, item, qty, received_text, expiry_text);
}

static void search_inventory(void) {
    char query[APP_LINE_CAP];
    size_t i, found = 0U;
    if (!ask_text("Search by part of batch ID or item name: ", query, sizeof(query), false)) return;
    print_table_header();
    for (i = 0U; i < g_batch_count; ++i) if (contains_case_insensitive(g_batches[i].id, query) || contains_case_insensitive(g_batches[i].item, query)) {
        print_batch(&g_batches[i]); ++found;
    }
    printf("Matches: %lu\n", (unsigned long)found);
    if (!found) puts("No matching batch found.");
}

static void issue_stock(void) {
    char item[FEFO_ITEM_NAME_CAP], detail[96];
    int request, policy_choice;
    size_t i, candidate_count = 0U;
    FoodBatch *candidates[APP_MAX_BATCHES];
    FoodBatch *snapshot = NULL;
    Inventory inv = {0};
    AllocationResult result = {0};
    PolicyKind policy;
    FefoStatus status;
    long long available = 0;
    puts("\n--- ISSUE / ALLOCATE STOCK ---");
    if (g_batch_count == 0U) { puts("No inventory is recorded yet."); return; }
    if (!ask_text("Exact item name to issue (e.g. Rice): ", item, sizeof(item), false)) return;
    (void)available_stock_for_item(item, &available);
    if (available <= 0) { printf("No unexpired, active stock is available for '%s'. Check item spelling or expiry report.\n", item); return; }
    printf("Available for '%s': %lld unit(s)\n", item, available);
    if (!ask_int("Issue policy: 1 = FEFO (recommended), 2 = FIFO (comparison): ", 1, 2, &policy_choice) ||
        !ask_int("Requested quantity: ", 1, INT_MAX, &request)) return;
    policy = policy_choice == 1 ? POLICY_HEAP_FEFO : POLICY_FIFO;
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        if (compare_case_insensitive(b->item, item) == 0 && b->status == BATCH_ACTIVE && b->quantity > 0 && b->expiry_day >= g_today)
            candidates[candidate_count++] = b;
    }
    if (candidate_count == 0U) { puts("No eligible batches were found."); return; }
    if (policy == POLICY_FIFO) qsort(candidates, candidate_count, sizeof(candidates[0]), batch_fifo_ptr_compare);
    status = inventory_init(&inv, policy);
    if (status != FEFO_OK) { printf("Could not initialise allocator: %s\n", fefo_status_string(status)); return; }
    for (i = 0U; i < candidate_count; ++i) {
        status = inventory_add(&inv, candidates[i], g_today);
        if (status != FEFO_OK) {
            printf("Could not build allocator: %s\n", fefo_status_string(status)); inventory_destroy(&inv); return;
        }
    }
    if (candidate_count > SIZE_MAX / sizeof(*snapshot)) {
        puts("Unable to safely snapshot inventory before issuing stock.");
        inventory_destroy(&inv); return;
    }
    snapshot = malloc(candidate_count * sizeof(*snapshot));
    if (!snapshot) {
        puts("Unable to allocate a rollback snapshot; no stock was issued.");
        inventory_destroy(&inv); return;
    }
    for (i = 0U; i < candidate_count; ++i) snapshot[i] = *candidates[i];

    status = inventory_allocate(&inv, request, g_today, &result);
    if (status != FEFO_OK) {
        for (i = 0U; i < candidate_count; ++i) *candidates[i] = snapshot[i];
        free(snapshot);
        printf("Allocation failed: %s\n", fefo_status_string(status));
        inventory_destroy(&inv); allocation_result_destroy(&result); return;
    }
    printf("\nPolicy: %s\nRequested: %d | Fulfilled: %d | Shortfall: %d\n", policy_name(policy), result.requested, result.fulfilled, result.shortfall);
    if (result.line_count > 0U) {
        puts("Allocated from:");
        for (i = 0U; i < result.line_count; ++i)
            printf("  %-18s %d unit(s)\n", result.lines[i].batch_id, result.lines[i].quantity);
    }

    /* Persist stock before writing audit events: a failed stock save must not leave false issue records. */
    if (!save_inventory()) {
        for (i = 0U; i < candidate_count; ++i) *candidates[i] = snapshot[i];
        free(snapshot);
        puts("ERROR: inventory save failed; the issue was rolled back in memory and no issue events were logged.");
        inventory_destroy(&inv); allocation_result_destroy(&result); return;
    }

    for (i = 0U; i < result.line_count; ++i) {
        size_t j;
        for (j = 0U; j < g_batch_count; ++j) if (strcmp(g_batches[j].id, result.lines[i].batch_id) == 0) {
            (void)snprintf(detail, sizeof(detail), "Policy=%s; request=%d; fulfilled=%d; shortfall=%d", policy_name(policy), request, result.fulfilled, result.shortfall);
            if (!append_transaction(policy == POLICY_HEAP_FEFO ? "ISSUE_FEFO" : "ISSUE_FIFO", g_batches[j].item, g_batches[j].id, result.lines[i].quantity, detail))
                fprintf(stderr, "Warning: stock was saved but issue audit log append failed for %s.\n", g_batches[j].id);
            break;
        }
    }
    if (result.shortfall > 0) {
        printf("Shortfall recorded: %d unit(s) could not be issued.\n", result.shortfall);
        if (!append_transaction("SHORTFALL", item, "", result.shortfall, "Request exceeded eligible stock"))
            puts("Warning: stock was saved, but shortfall transaction could not be logged.");
    }
    free(snapshot);
    inventory_destroy(&inv); allocation_result_destroy(&result);
}
static void expiry_report(void) {
    int days_ahead;
    size_t i, expired_count = 0U, soon_count = 0U;
    long long expired_qty = 0;
    if (!ask_int("Show expiry window in days (0..365, default example 7): ", 0, 365, &days_ahead)) return;
    puts("\n================ EXPIRY REPORT ================");
    printf("As of today; upcoming window = %d day(s). Expired quantity is excluded from available stock.\n", days_ahead);
    print_table_header();
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        if (b->status == BATCH_EXPIRED && b->quantity > 0) { print_batch(b); ++expired_count; expired_qty += b->quantity; }
    }
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        if (b->status == BATCH_ACTIVE && b->quantity > 0 && b->received_day <= g_today && b->expiry_day >= g_today && b->expiry_day - g_today <= days_ahead) {
            print_batch(b); ++soon_count;
        }
    }
    printf("Expired batches: %lu | recorded expired quantity: %lld\n", (unsigned long)expired_count, expired_qty);
    printf("Active batches expiring within %d day(s): %lu\n", days_ahead, (unsigned long)soon_count);
    puts("Important: this report uses recorded dates only. It does not certify food safety.");
}

static void adjust_quantity(void) {
    char id[FEFO_BATCH_ID_CAP], reason[APP_LINE_CAP];
    int new_quantity;
    size_t i;
    FoodBatch *b = NULL;
    if (!ask_text("Batch ID to adjust: ", id, sizeof(id), false)) return;
    for (i = 0U; i < g_batch_count; ++i) if (strcmp(g_batches[i].id, id) == 0) { b = &g_batches[i]; break; }
    if (!b) { puts("Batch ID not found."); return; }
    if (b->status == BATCH_EXPIRED || g_today > b->expiry_day) { puts("Expired batches cannot be reactivated or adjusted as usable stock. Follow your site disposal/record procedure."); return; }
    printf("Current quantity for %s (%s): %d\n", b->id, b->item, b->quantity);
    if (!ask_int("Correct quantity (0..INT_MAX): ", 0, INT_MAX, &new_quantity) ||
        !ask_text("Reason for adjustment: ", reason, sizeof(reason), false)) return;
    {
        int old_quantity = b->quantity;
        BatchStatus old_status = b->status;
        b->quantity = new_quantity;
        b->status = new_quantity == 0 ? BATCH_EXHAUSTED : BATCH_ACTIVE;
        if (!save_inventory()) {
            b->quantity = old_quantity; b->status = old_status;
            puts("Adjustment could not be saved; original in-memory quantity restored."); return;
        }
        {
            char detail[APP_LINE_CAP];
            (void)snprintf(detail, sizeof(detail), "Old=%d; new=%d; reason=%.400s", old_quantity, new_quantity, reason);
            if (!append_transaction("ADJUST", b->item, b->id, new_quantity - old_quantity, detail)) puts("Warning: quantity saved, but audit log append failed.");
        }
        printf("Quantity updated: %d -> %d.\n", old_quantity, new_quantity);
    }
}

static void export_stock_report(void) {
    FILE *f = fopen(STOCK_REPORT_FILE, "w");
    size_t i;
    if (!f) { perror("Could not create stock report"); return; }
    if (fputs("batch_id,item,quantity,received_date,expiry_date,status,days_until_expiry,available_quantity\n", f) == EOF) {
        (void)fclose(f); puts("Report write failed."); return;
    }
    for (i = 0U; i < g_batch_count; ++i) {
        FoodBatch *b = &g_batches[i];
        char received[11], expiry[11], quantity[32], days[32], available[32];
        format_date(b->received_day, received); format_date(b->expiry_day, expiry);
        (void)snprintf(quantity, sizeof(quantity), "%d", b->quantity);
        (void)snprintf(days, sizeof(days), "%d", b->expiry_day - g_today);
        (void)snprintf(available, sizeof(available), "%d", (b->status == BATCH_ACTIVE && b->quantity > 0 && b->received_day <= g_today && b->expiry_day >= g_today) ? b->quantity : 0);
        if (csv_write_field(f, b->id) || fputc(',', f) == EOF || csv_write_field(f, b->item) || fputc(',', f) == EOF ||
            fputs(quantity, f) == EOF || fputc(',', f) == EOF || fputs(received, f) == EOF || fputc(',', f) == EOF ||
            fputs(expiry, f) == EOF || fputc(',', f) == EOF || fputs(status_name(b->status), f) == EOF || fputc(',', f) == EOF ||
            fputs(days, f) == EOF || fputc(',', f) == EOF || fputs(available, f) == EOF || fputc('\n', f) == EOF) {
            (void)fclose(f); puts("Report write failed."); return;
        }
    }
    {
        int write_failed = ferror(f) ? 1 : 0;
        int close_failed = fclose(f) != 0 ? 1 : 0;
        if (write_failed || close_failed) { puts("Report write failed."); return; }
    }
    printf("Stock report exported to %s\n", STOCK_REPORT_FILE);
}

static void import_stock_csv(void) {
    char path[APP_LINE_CAP];
    FILE *f;
    char fields[CSV_MAX_FIELDS][CSV_FIELD_CAP];
    size_t field_count = 0U, line_no = 1U, imported = 0U, skipped = 0U, start_count = g_batch_count, i;
    int row;
    puts("CSV format: batch_id,item,quantity,received_date,expiry_date");
    puts("Dates must be YYYY-MM-DD. Existing batch IDs are not overwritten.");
    if (!ask_text("CSV file path (relative to this folder or full path): ", path, sizeof(path), false)) return;
    f = fopen(path, "r");
    if (!f) { perror("Could not open import file"); return; }
    row = csv_read_row(f, fields, &field_count);
    if (row <= 0) { (void)fclose(f); puts("CSV is empty or malformed."); return; }
    if (field_count < 5U || compare_case_insensitive(fields[0], "batch_id") != 0) {
        (void)fclose(f); puts("Expected header: batch_id,item,quantity,received_date,expiry_date"); return;
    }
    while ((row = csv_read_row(f, fields, &field_count)) != 0) {
        int qty, received, expiry;
        if (row < 0 || field_count != 5U || !fields[0][0] || !fields[1][0] || !parse_int_strict(fields[2], &qty) || qty < 1 ||
            !parse_date(fields[3], &received) || !parse_date(fields[4], &expiry) || expiry < received || expiry < g_today ||
            strlen(fields[0]) >= FEFO_BATCH_ID_CAP || strlen(fields[1]) >= FEFO_ITEM_NAME_CAP || g_batch_count >= APP_MAX_BATCHES || id_exists(fields[0])) {
            printf("Skipped invalid row near line %lu.\n", (unsigned long)(line_no + 1U)); ++skipped; ++line_no; continue;
        }
        if (!add_to_memory(fields[0], fields[1], qty, received, expiry, false, NULL)) { ++skipped; ++line_no; continue; }
        ++imported; ++line_no;
    }
    if (ferror(f)) puts("Warning: an input read error occurred.");
    (void)fclose(f);
    if (imported > 0U && !save_inventory()) {
        g_batch_count = start_count;
        imported = 0U;
        puts("ERROR: imported stock could not be saved; all imported records were rolled back in memory and no import events were logged.");
    } else {
        for (i = start_count; i < g_batch_count; ++i) {
            if (!append_transaction("IMPORT", g_batches[i].item, g_batches[i].id, g_batches[i].quantity, "Imported from CSV"))
                fprintf(stderr, "Warning: stock was saved but import audit log append failed for %s.\n", g_batches[i].id);
        }
    }
    printf("Import complete: %lu added, %lu skipped.\n", (unsigned long)imported, (unsigned long)skipped);
}
static void change_low_stock_threshold(void) {
    int old_value = g_low_stock_threshold, new_value;
    if (!ask_int("Low-stock threshold in units per item (0 disables alerts): ", 0, 1000000, &new_value)) return;
    g_low_stock_threshold = new_value;
    if (!save_settings()) {
        g_low_stock_threshold = old_value;
        puts("Could not save settings; previous threshold restored."); return;
    }
    printf("Low-stock threshold saved: %d unit(s).\n", g_low_stock_threshold);
}

static void view_transactions(void) {
    FILE *f = fopen(TRANSACTION_FILE, "r");
    char line[APP_LINE_CAP], ring[20][APP_LINE_CAP];
    size_t count = 0U, i;
    if (!f) { puts("No transaction history available yet."); return; }
    while (fgets(line, sizeof(line), f)) {
        size_t n = strlen(line);
        if (n && line[n - 1U] == '\n') line[n - 1U] = '\0';
        (void)snprintf(ring[count % 20U], APP_LINE_CAP, "%s", line);
        ++count;
    }
    (void)fclose(f);
    puts("\n--- MOST RECENT TRANSACTIONS (CSV rows) ---");
    if (count == 0U) { puts("No transaction events yet."); return; }
    {
        size_t start = count > 20U ? count - 20U : 0U;
        for (i = start; i < count; ++i) puts(ring[i % 20U]);
    }
    puts("Full history is in data/transactions.csv (open with Excel if needed).");
}

static void load_sample_data(void) {
    int quantities[] = { 20, 12, 10, 24 };
    int exp_offsets[] = { 5, 12, 2, 30 };
    const char *ids[] = { "DEMO-RICE-001", "DEMO-RICE-002", "DEMO-MILK-001", "DEMO-FLOUR-001" };
    const char *names[] = { "Rice", "Rice", "Milk", "Flour" };
    size_t i, start_count = g_batch_count;
    if (g_batch_count != 0U) { puts("Sample data is only available when inventory is empty. No changes made."); return; }
    puts("This adds clearly labelled DEMO records for practice. Do not mix them with your real stock.");
    for (i = 0U; i < 4U; ++i) {
        if (!add_to_memory(ids[i], names[i], quantities[i], g_today, g_today + exp_offsets[i], false, NULL)) {
            g_batch_count = start_count; puts("Sample data load failed; no sample records retained."); return;
        }
    }
    if (!save_inventory()) { g_batch_count = start_count; puts("Could not save sample data."); return; }
    for (i = 0U; i < 4U; ++i) (void)append_transaction("DEMO_SEED", names[i], ids[i], quantities[i], "Synthetic practice data; remove data folder to reset only if safe");
    puts("Four practice batches loaded. Record them as demo data only.");
}

static void print_menu(void) {
    puts("\n===============================================================");
    puts(" EXPIRY-AWARE FOOD INVENTORY MANAGER (Offline C11 application)");
    puts("===============================================================");
    puts(" 1. Receive / add a stock batch");
    puts(" 2. View all inventory (sorted by expiry)");
    puts(" 3. Search batch or item");
    puts(" 4. Issue stock (FEFO recommended; FIFO comparison optional)");
    puts(" 5. Expiry report / upcoming expiry alerts");
    puts(" 6. Adjust a batch quantity with an audit reason");
    puts(" 7. Export current stock report CSV");
    puts(" 8. View recent transaction history");
    puts(" 9. Import multiple batches from CSV");
    puts("10. Change low-stock alert threshold");
    puts(" D. Load practice-only sample data (empty inventory only)");
    puts(" H. Show help / operating limits");
    puts(" 0. Save and exit");
}

static void show_help(void) {
    puts("\n--- HELP / OPERATING LIMITS ---");
    puts("- Use one consistent unit per item: for example packets, bags, cartons or kg.");
    puts("- Each batch ID must be unique, including exhausted/expired IDs.");
    puts("- Date input is YYYY-MM-DD. The app uses your computer's local date.");
    puts("- FEFO issues the eligible batch with earliest expiry first; FIFO is for comparison.");
    puts("- Stock, settings, and audit events are stored locally under the data folder.");
    puts("- inventory_backup.csv is the previous saved inventory snapshot where available.");
    puts("- This is an offline prototype, not multi-user software; do not open two instances on the same data folder.");
    puts("- It does not manage separate units within the same item name, temperatures, allergens, recalls, supplier lots, or legal donation status.");
    puts("- Date alerts do not certify food safety. Follow the product label and applicable food-safety rules.");
    puts("- Limit: 10,000 registered batch records; quantity is a non-negative C int.");
}

int main(void) {
    char choice[APP_LINE_CAP];
    bool running = true;
    ensure_data_dir();
    g_today = today_day();
    load_settings();
    ensure_transaction_file();
    load_inventory();
    if (g_inventory_load_failed) {
        fprintf(stderr, "Inventory load was incomplete. The app stopped without rewriting data/inventory.csv. Preserve both inventory.csv and inventory_backup.csv, then recover from a known-good copy before restarting.\n");
        return 2;
    }
    (void)mark_expired_batches();
    if (g_batch_count > 0U && !save_inventory()) puts("Warning: could not refresh saved inventory after startup.");
    puts("Inventory data location: data/inventory.csv");
    puts("A local backup is maintained at: data/inventory_backup.csv");
    puts("Current records are saved locally; exiting does not erase them.");
    dashboard();
    while (running) {
        print_menu();
        if (!read_line("Select an option: ", choice, sizeof(choice))) {
            if (feof(stdin)) break;
            continue;
        }
        if (strcmp(choice, "1") == 0) receive_stock();
        else if (strcmp(choice, "2") == 0) view_inventory();
        else if (strcmp(choice, "3") == 0) search_inventory();
        else if (strcmp(choice, "4") == 0) issue_stock();
        else if (strcmp(choice, "5") == 0) expiry_report();
        else if (strcmp(choice, "6") == 0) adjust_quantity();
        else if (strcmp(choice, "7") == 0) export_stock_report();
        else if (strcmp(choice, "8") == 0) view_transactions();
        else if (strcmp(choice, "9") == 0) import_stock_csv();
        else if (strcmp(choice, "10") == 0) change_low_stock_threshold();
        else if (compare_case_insensitive(choice, "D") == 0) load_sample_data();
        else if (compare_case_insensitive(choice, "H") == 0 || compare_case_insensitive(choice, "HELP") == 0) show_help();
        else if (strcmp(choice, "0") == 0 || compare_case_insensitive(choice, "Q") == 0) running = false;
        else puts("Unknown choice. Enter a menu number, D, H, or 0.");
        if (running) dashboard();
    }
    if (!save_inventory()) puts("Warning: could not save final inventory state.");
    puts("Inventory application closed. Your data remains in the data folder.");
    return 0;
}
