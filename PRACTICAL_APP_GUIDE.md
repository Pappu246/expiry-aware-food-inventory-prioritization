# Practical Inventory Application Guide

## What this adds

`build/inventory_app` is an interactive, offline C11 application for maintaining a small stock-room/canteen inventory. It uses the same tested C11 FEFO engine, but unlike the benchmark commands it accepts live user entries and saves them locally. It supports multiple item names and will never allocate stock from another item when you issue one product.

## Launch on Windows

1. Extract the complete ZIP into a normal writable folder (for example `Downloads\A6_Food_Inventory_Ready_Package`). Do not run it from inside the ZIP preview.
2. Double-click **`START_INVENTORY_APP.bat`**.
3. The launcher compiles the C sources using GCC and opens the text menu. You do not need to open VS Code or manually change PowerShell execution policy.
4. Select `1` to enter a batch, `2` to view inventory, `4` to issue stock, `5` to view expiry alerts, and `0` to save and exit.

GCC is required. The launcher first looks for `gcc` on PATH and also checks `C:\mingw64\bin\gcc.exe`, which was the compiler path seen in the earlier demo. If neither location is available, install MinGW-w64 GCC and make its `bin` folder available.

## First use: put real stock in

Choose `1. Receive / add a stock batch` and enter a unique batch ID, item name, quantity, received date, and expiry date. For example:

- Batch ID: `RICE-2026-001`
- Item: `Rice`
- Quantity: `30`
- Received date: press Enter to use today's computer date
- Expiry date: enter the actual date from the package label in `YYYY-MM-DD` format

Use one consistent unit for a given item (for example, all Rice quantities in kg, or all packets). Batch IDs must be unique across the lifetime of the local records. Use the same item name consistently; matching ignores case, but spelling differences can create separate item categories.

## Issue stock and see exactly what was used

1. Choose `4. Issue stock`.
2. Type the exact item name, such as `Rice`.
3. Choose `1 = FEFO` for normal expiry-aware stock rotation. This chooses the eligible batch with earliest expiry date; receipt date and batch ID break ties.
4. Enter the requested amount.
5. The program prints each batch used, quantity taken, fulfilled amount and any shortfall. It saves updated quantities immediately and writes each allocation to the transaction log.

`2 = FIFO` is provided for the academic comparison. It tries oldest received batches first, but still excludes batches marked expired. Do not choose FIFO just to imitate the comparison if local procedure requires expiry-first rotation.

## Alerts and reports

- The dashboard shows active batches, available quantity, expired stock, batches expiring within 7 days, and per-item low stock.
- `5. Expiry report` lets you choose an upcoming window such as 7, 14, or 30 days. Expired stock is shown separately from eligible stock.
- `10. Change low-stock alert threshold` sets a global quantity threshold per item; `0` disables low-stock warnings.
- `7. Export current stock report CSV` writes a spreadsheet-friendly report including status and days until expiry.
- `8. View recent transaction history` displays recent receipt/issue/adjustment/expiry events. The full log can be opened in Excel.
- `9. Import multiple batches from CSV` accepts a CSV header `batch_id,item,quantity,received_date,expiry_date`. Start from `templates/stock_import_template.csv`. Existing IDs and invalid/past-expiry rows are skipped, not overwritten.

## Local files created

| File | Purpose |
|---|---|
| `data/inventory.csv` | Current batch records and quantities; this is the saved inventory. |
| `data/inventory_backup.csv` | Previous inventory snapshot, when a previous file was available. |
| `data/transactions.csv` | Append-only receipt, issue, import, adjustment and expiry event log. |
| `data/settings.txt` | Low-stock threshold. |
| `data/stock_report.csv` | Last exported inventory report. |

The data directory is created beside the launcher. Use **the launcher**, which sets the correct working directory, so data stays with the project folder. Do not launch `build\inventory_app.exe` from a different working directory.

## Practice mode

Menu item `D` loads four clearly labelled `DEMO-*` practice batches, only when the inventory is empty. Do not mix these records into real stock. For a clean practice run, extract a fresh copy of the ZIP to another folder; do not delete your real `data` folder.

## Data integrity and limits

- Inventory saves use a temporary file before replacing the current CSV; a previous snapshot is maintained where possible.
- The app supports up to 10,000 registered batches in one local data file.
- It is designed for one local operator at a time. It is not a multi-user/cloud database; do not run two app copies against the same data folder simultaneously.
- Batch IDs remain reserved after a batch is exhausted or expired, preventing accidental historical ID reuse.
- The app stores dates and quantities provided by the operator; it cannot verify package labels or supplier records.

## Food-safety limitation

This is an inventory rotation aid, not food-safety certification. A date alert does not evaluate temperature history, broken seals, handling, allergens, recalls, use-by/best-before distinctions, or local disposal/donation rules. Follow the actual product label, responsible staff procedures, and applicable rules. Do not serve or donate an item because this program says it is `ACTIVE`.

## Testing the software

On a development machine with GCC and Python 3, run:

```sh
make all
make test
make test-allocation-failure
make app-smoke
```

`make app-smoke` tests stock entry, per-item isolation, FEFO allocations, shortfall, persistence across restart, CSV export and sample FEFO ordering. The original `demo.ps1` and `build\fefo.exe` remain available for the academic benchmark and reproducible synthetic experiments.