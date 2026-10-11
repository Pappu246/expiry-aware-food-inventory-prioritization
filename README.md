# Expiry-Aware Food Inventory Prioritization Engine

A dependency-free C11 Data Structures project with **three complementary ways to use it**:

1. **Practical local inventory app** (`START_INVENTORY_APP.bat`): actual manual stock entry, per-item inventory, FEFO stock issue, expiry alerts, low-stock alerts, CSV import/export, persistent records and a transaction log.
2. **Browser website** (`START_WEBSITE.bat`, code in `website/`): batch-entry forms, searchable inventory, FEFO/FIFO issue, expiry dashboard, movement history, CSV import/export, JSON backup/restore and reports. Requires Node.js 18+; no external npm packages.
3. **Academic experiment harness** (`RUN_QUICK_DEMO.bat`, `RUN_FULL_DEMO.bat`): custom binary Min-Heap FEFO, independent Linear Scan FEFO baseline, FIFO policy simulation, deterministic synthetic traces, correctness tests and performance measurements.

The interactive app reuses the same C11 engine. It is offline and stores data locally; it does not require an API key, cloud account, database server or repository clone. GCC is required to compile it on Windows.

## Windows: start here

Extract the ZIP into a writable folder, then double-click:

- `START_INVENTORY_APP.bat` - opens the real-data inventory menu.
- `RUN_QUICK_DEMO.bat` - runs regular/fault-injection tests and a small synthetic simulation.
- `RUN_FULL_DEMO.bat` - generates all benchmark and policy experiment CSV evidence as well.
- `START_WEBSITE.bat` - opens the local browser-based inventory website.

The batch launchers set the working directory to the package folder. This keeps the `data` folder beside the project. They also launch PowerShell with a process-only execution-policy bypass for the existing demo script, if needed.

## Practical inventory features

- Receive a new batch with a unique ID, item name, positive quantity, received date and expiry date.
- View and search inventory, kept separate by item name.
- Issue a requested quantity using FEFO (earliest eligible expiry first), printing each batch allocation and any shortfall. FIFO is available only as an explicit comparison option.
- Show expired batches and upcoming expiry windows, plus low-stock warnings.
- Adjust quantities with a reason recorded in the audit log.
- Import batches from a CSV template and export the current stock report.
- Keep inventory and transaction data across restarts, with a prior inventory snapshot where available.

Full instructions, CSV format and limitations for the C app: [PRACTICAL_APP_GUIDE.md](PRACTICAL_APP_GUIDE.md). Website instructions: [website/README.md](website/README.md).

## Build/test on Windows (PowerShell)

```powershell
.\build.ps1 -App
.\build.ps1 -Test
.\build.ps1 -AllocFail
.\build.ps1
.\build\fefo.exe demo
.\build\fefo.exe simulate 1000
.\build\fefo.exe experiment
.\build\fefo.exe benchmark
.\build.ps1 -Metrics
```

## Build/test on Linux/macOS

```sh
make all
make test
make test-sanitize
make test-allocation-failure
make app-smoke
./build/fefo demo
./build/fefo simulate 1000
./build/fefo experiment
./build/fefo benchmark
make operations
```

## Benchmark interpretation

FEFO Heap and FEFO Linear Scan must select the same batch sequence for identical inventory. Benchmark speedup is selection/removal timing, not overall application speed. The policy experiment compares FEFO with FIFO using the same synthetic arrivals and demand; expired quantity is not a real-world savings estimate.

## Safety and deployment boundary

The C app and website are local prototypes for a small stock room/canteen workflow, not a commercial multi-user system. The website stores its records in `website/data/inventory.json`; the C app uses the root `data/` directory. These stores are separate and are not synchronised. It does not assess temperature history, handling, allergens, recalls, legal donation status or whether food is safe to serve. Follow actual package labels and local food-safety procedures. Use one canonical name and one consistent quantity unit per item. Do not run two instances against the same data folder.
