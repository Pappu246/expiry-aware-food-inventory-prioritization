# A-6 Project — Quick Start

## Primary application: FreshTrack website

1. Extract the complete ZIP into a writable folder.
2. Install Node.js 18 or later if it is not already installed. The website has no third-party runtime dependencies and requires no `npm install`.
3. Double-click the root-level `START_WEBSITE.bat`.
4. Keep the server terminal open and use `http://127.0.0.1:4173` in your browser.
5. Choose **Try demo data** only to practice with fictional records. For real stock, use **Add batch** or **Inventory → Import CSV** and enter the actual label dates and quantities.
6. Use **Settings & backup** to download a full JSON backup and to restore a previous backup if required.

The website saves its stock and movement history in `website\data\inventory.json`; the previous valid state is stored at `website\data\inventory.json.bak` after a change. Keep the project folder writable and back up important inventory data. The website is local-only: there is no login or shared cloud database, and it must not be exposed directly to the public internet.

The C command-line app stores its data separately under root `data\`; its records do not automatically sync with the website.

## Secondary application: C11 command-line version

1. Ensure GCC is installed and available as `gcc` on PATH.
2. Double-click `START_INVENTORY_APP.bat`.
3. Use menu option `1` to receive stock, `2` to view it, `4` to issue using FEFO, and `5` to review expiry alerts.

## Data-structure experiments

- `RUN_QUICK_DEMO.bat` runs the short test/simulation flow.
- `RUN_FULL_DEMO.bat` runs the full synthetic benchmark and policy experiment.

The benchmark inputs are synthetic research data; do not confuse them with your actual inventory records.

## Website test suite

From the `website` folder run `npm test`. The current website package contains 28 automated tests covering validation, expiry rules, FEFO/FIFO allocation, concurrency, backups/recovery, CSV behavior, API integration, and persistence across process restart.