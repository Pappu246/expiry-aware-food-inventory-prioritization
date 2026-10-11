# Application architecture

## Two modes, one C11 engine

```text
START_INVENTORY_APP.bat
        |
        v
src/inventory_app.c  ---- reads / writes ---- data/inventory.csv
        |                              |------- data/inventory_backup.csv
        |                              |------- data/transactions.csv
        |                              |------- data/settings.txt
        |                              `------- data/stock_report.csv
        v
src/engine.c + include/fefo/engine.h
        |-- custom binary Min-Heap (FEFO)
        |-- open-addressing Hash Table (batch IDs / duplicate checks)
        |-- linear FEFO baseline (research harness)
        `-- FIFO baseline (policy comparison)

RUN_QUICK_DEMO.bat / RUN_FULL_DEMO.bat
        |
        v
src/main.c -> synthetic simulation, experiment, benchmark and operation counts
        `---- results/generated/*.csv
```

## Practical issue operation

The app finds active, positive-quantity batches whose expiry date has not passed and whose item name matches the requested item. It builds a temporary `Inventory` with pointers to only those batch records, then calls the shared C11 allocation engine. FEFO uses the heap and its deterministic comparator: expiry day, received day, then lexicographical batch ID. The optional FIFO comparison sorts eligible batch pointers by received day then batch ID before constructing its FIFO inventory. Other item names cannot be allocated by this request.

After an issue, per-batch quantities and statuses are written to `data/inventory.csv`; allocations, adjustments, imports and expiry status changes are appended to `data/transactions.csv`. A previous inventory snapshot is copied to `data/inventory_backup.csv` when available. CSV export creates `data/stock_report.csv`.

## Persistence model

- `data/inventory.csv`: current batch records; IDs stay registered after exhaustion or expiry.
- `data/transactions.csv`: event history for received/imported/issued/adjusted/expired stock.
- `data/settings.txt`: global low-stock quantity threshold.
- `data/stock_report.csv`: last user-exported stock report.
- `results/generated/*.csv`: synthetic study/benchmark output; never used as real stock data.

## Operational assumptions

This is a single-user local prototype. Use one canonical item name and one consistent unit per item (for example, all rice batches use kg). Dates are entered as `YYYY-MM-DD` and compared to the computer's local date. The application does not determine physical food safety, does not provide concurrent multi-user access, and does not track suppliers, temperatures, allergens, recalls or detailed food-safety workflows.
