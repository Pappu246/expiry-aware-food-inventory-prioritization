#ifndef FEFO_ENGINE_H
#define FEFO_ENGINE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#define FEFO_BATCH_ID_CAP 32
#define FEFO_ITEM_NAME_CAP 64
typedef enum { FEFO_OK=0, FEFO_ERR_INVALID, FEFO_ERR_DUPLICATE, FEFO_ERR_NOMEM, FEFO_ERR_EMPTY } FefoStatus;
typedef enum { BATCH_ACTIVE=0, BATCH_EXHAUSTED, BATCH_EXPIRED } BatchStatus;
typedef enum { POLICY_HEAP_FEFO=0, POLICY_LINEAR_FEFO, POLICY_FIFO } PolicyKind;
typedef enum { ALLOC_EMPTY=0, ALLOC_PARTIAL, ALLOC_FULL } AllocationOutcome;
typedef struct { char id[FEFO_BATCH_ID_CAP]; char item[FEFO_ITEM_NAME_CAP]; int quantity, received_day, expiry_day; BatchStatus status; } FoodBatch;
typedef struct { char batch_id[FEFO_BATCH_ID_CAP]; int quantity; } AllocationLine;
typedef struct { int requested, fulfilled, shortfall; AllocationOutcome outcome; AllocationLine *lines; size_t line_count; } AllocationResult;
typedef struct { FoodBatch *batch; } HashSlot;
typedef struct { FoodBatch **items; size_t size, capacity; HashSlot *slots; size_t map_capacity, map_size; PolicyKind kind; } Inventory;
typedef struct { int day; char batch_id[FEFO_BATCH_ID_CAP]; char item[FEFO_ITEM_NAME_CAP]; int quantity, received_day, expiry_day; } ArrivalEvent;
typedef struct { int day, quantity; } DemandEvent;
typedef struct { ArrivalEvent *arrivals; size_t arrival_count; DemandEvent *demands; size_t demand_count; int horizon_days; uint32_t seed; double demand_ratio; long long total_supply, total_demand; } EventTrace;
typedef struct { PolicyKind policy; long long supply, demand, fulfilled, shortfall, expired, remaining; size_t expired_batches, completed_requests, requests, priority_inversions; } SimulationResult;
const char *fefo_status_string(FefoStatus status);
const char *policy_name(PolicyKind kind);
FefoStatus food_batch_init(FoodBatch *out,const char *id,const char *item,int quantity,int received_day,int expiry_day);
bool food_batch_eligible(const FoodBatch *batch,int today);
int food_batch_compare(const FoodBatch *a,const FoodBatch *b);
FefoStatus inventory_init(Inventory *inventory,PolicyKind kind);
void inventory_destroy(Inventory *inventory);
bool inventory_heap_valid(const Inventory *inventory);
FefoStatus inventory_add(Inventory *inventory,FoodBatch *batch,int today);
FoodBatch *inventory_lookup(const Inventory *inventory,const char *id);
FefoStatus inventory_purge_expired(Inventory *inventory,int today,size_t *purged);
FefoStatus inventory_earliest(Inventory *inventory,int today,FoodBatch **out);
/* Zero-initialize out before first use; destroy it before reusing it. */
FefoStatus inventory_allocate(Inventory *inventory,int request,int today,AllocationResult *out);
void allocation_result_destroy(AllocationResult *result);
FefoStatus event_trace_generate(EventTrace *trace,size_t count,int days,uint32_t seed,double demand_ratio);
void event_trace_destroy(EventTrace *trace);
FefoStatus simulation_run(const EventTrace *trace,PolicyKind policy,SimulationResult *out);
void simulation_csv_header(FILE *stream);
void simulation_csv_row(FILE *stream,const EventTrace *trace,const SimulationResult *result);
FefoStatus benchmark_structure(FILE *stream);
#endif
