# FreshTrack — Expiry-Aware Food Inventory Website

A practical, local-first website for managing food inventory by batch and expiry date. The project extends the Data Structures prototype **“Expiry-Aware Food Inventory Prioritization Engine Using Data Structures”** into a usable browser application.

## Start the website (Windows)

1. Extract the ZIP into a normal folder, for example `Desktop\A6_FreshTrack_Website`.
2. Install Node.js 18 or later if it is not already installed: <https://nodejs.org/>. No npm package installation is required.
3. Double-click **`START_WEBSITE.bat`**.
4. Keep the FreshTrack server terminal open while using the website. Your browser should open at `http://127.0.0.1:4173`.
5. To try fictional example stock, choose **Try demo data**. This only works while the active inventory is empty. Demo batches are clearly labelled `DEMO-...` and are not real records.
6. For actual inventory, choose **Add batch** or **Inventory → Import CSV**. Use the real quantity, unit, received date and expiry date from your stock labels/records.

If the browser does not open, open a terminal in the extracted project folder and run:

```text
node server.js
```

Then visit `http://127.0.0.1:4173` manually. Close the terminal (or use `STOP_WEBSITE.bat`) when finished.

## Website functions

- **Overview:** active batches, units available (excluding expired stock), expiry warnings, category quantities and stock needing attention.
- **Inventory:** add and edit batches, search/filter inventory, receive additional stock, remove/correct quantities, write off expired stock and archive zero-quantity batches.
- **FEFO issue:** select an item and quantity; stock is allocated from the batch with the earliest eligible expiry date, then by received date and batch code as tie-breakers.
- **FIFO issue:** allocate eligible stock by earliest received date, then expiry and batch code. Expired stock is excluded from both automatic allocation policies.
- **Audit history:** each receipt, issue, adjustment and expired-stock write-off is recorded in the movement log.
- **CSV import:** bulk-import up to 5,000 rows per upload. Duplicate batch codes are skipped rather than overwriting existing stock. Invalid rows are reported.
- **CSV exports:** download the active inventory or the movement log for spreadsheet analysis.
- **JSON backup/restore:** save batches, movement history and alert settings; restore validates the whole payload before replacement. A valid downloaded backup can recover even if the current JSON data file is damaged.
- **Automatic previous-state snapshot:** before each inventory/settings mutation, the server saves the last semantically valid dataset as `data/inventory.json.bak`. Download it from Settings → Backup or select the `.bak` file in the restore control.
- **Date rollover refresh:** if the website remains open past midnight, it notices the local date change and reloads inventory alerts so expiry labels do not stay stuck on yesterday.
- **Reports:** category breakdown, estimated stock value based on cost/unit entered, expiry exposure and print-to-PDF through the browser's print dialog.
- **Settings:** configure an expiry alert window from 1 to 90 days (default: 7 days).

## CSV import format

Required headers:

```csv
batchCode,itemName,category,quantity,unit,receivedDate,expiryDate,supplier,costPerUnit,notes
RICE-2026-01,Basmati Rice,Grains,25,kg,2026-10-10,2027-04-10,Example Supplier,72,Sample only
```

Dates must be real calendar dates in `YYYY-MM-DD` format. CSV headers are case-insensitive and common aliases such as `Batch ID`, `Item Name`, `Qty`, `Received Date`, and `Expiry Date` are accepted. The dates in this example are just an import-format illustration; replace them with actual dates.

## Data storage and privacy

The application saves records to **`data/inventory.json`** on the computer running the server. This is a local-first single-workstation version, not a cloud-synchronised service. The server binds to `127.0.0.1` by default. There is no login, multi-user concurrency across servers, managed database, remote access, barcode scanner, or supplier integration. **Do not expose this server directly to the public internet or bind it to a public network.** For a multi-staff production rollout, add authentication, role-based permissions, a managed database with backups, HTTPS, audit retention rules and deployment monitoring first.

The JSON file is the application database. Back it up before moving the project folder, restoring an older backup or editing the file manually. Keep backup files private if supplier prices or operating quantities are sensitive.

## Data rules

- A batch code must be unique among active batches.
- Quantity must be at least `0.001` when a new batch is added or stock is adjusted; later stock changes use the adjustment flow so they are audited.
- Received date cannot be in the future for stock already on hand, and the expiry date cannot precede the received date. Stock with an expiry date in the past can be recorded for tracking but cannot be issued through FEFO/FIFO.
- Batch metadata can be edited without changing remaining stock; stock adjustments are recorded as movements.
- The Add/Edit Batch form previews the expiry countdown before saving. Inventory rows show days remaining, and the dashboard raises alerts according to the selected window.
- Expiry is treated as current through the batch's expiry date. The batch is classed as expired beginning the following date.
- An expired batch is never selected automatically by FEFO or FIFO.
- FEFO/FIFO reports refer to **quantity-allocation policy**; they do not prove that a real facility has reduced food waste. Use real operating data to assess impact.
- An estimated stock value is only as accurate as the cost/unit values entered.

## Tests

The project has no third-party dependencies. From the project folder, run:

```text
npm test
```

or:

```text
node --test
```

The test suite covers validation, date and expiry logic, FEFO/FIFO ordering, partial fulfillment, unit consistency, CSV parsing, reporting and a live HTTP API workflow. It uses an isolated temporary data directory, so it does not overwrite `data/inventory.json`.

## Project structure

```text
A6_FreshTrack_Website/
├── server.js                  # Local HTTP server and JSON-backed API
├── lib/inventory.js           # Validation, expiry, FEFO/FIFO and CSV utilities
├── public/index.html          # Website layout and forms
├── public/styles.css          # Responsive UI styles
├── public/app.js              # Dashboard, forms, tables and client-side actions
├── data/inventory.json        # Local working records (starts empty)
├── tests/                     # Unit and HTTP integration tests
├── docs/USER_GUIDE.md         # Practical website guide
├── START_WEBSITE.bat          # Windows one-click launcher
└── STOP_WEBSITE.bat           # Stops the local server on port 4173
```

## Technology stack

HTML5, CSS3, vanilla JavaScript, Node.js built-in `http`, and JSON-file storage. The website's current allocator filters eligible batches and sorts FEFO candidates by expiry date, received date and batch code; FIFO sorts by received date, expiry date and batch code. The C prototype is the part that implements the custom Min-Heap and Hash Table and produces the structure benchmarks. Website results must not be described as Min-Heap benchmark results.

## Academic integrity note

Benchmark figures from the C prototype should not be presented as benchmarks of this web application. This website's current purpose is operational batch tracking, audit logging, FEFO/FIFO allocation and reporting. Measure and document any performance claim against the exact version, hardware, compiler/runtime and workload used.