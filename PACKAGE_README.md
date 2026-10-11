# A-6 Project Submission Package

**Project:** Expiry-Aware Food Inventory Prioritization Engine Using Data Structures  
**Language:** C11  
**Repository:** https://github.com/Pappu246/expiry-aware-food-inventory-prioritization  
**Audited branch:** `audit/benchmark-correctness`  
**Verified source commit:** `7448b507d72837ecd6cbad44ad703bad9715be57`  
**Latest CI run:** https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38035688983

## Added practical local inventory mode (2026-10-10)

This updated bundle adds `src/inventory_app.c` and `START_INVENTORY_APP.bat`. The interactive app accepts manual or CSV-imported stock batches, separates issue allocations by item name, uses the FEFO engine to allocate requested quantities, reports shortfalls and expiry/low-stock alerts, and saves local inventory plus a transaction log. See `PRACTICAL_APP_GUIDE.md`. The added app passed local GCC build, Clang static analysis and black-box app smoke tests; the pre-existing GitHub CI run documented above was for the original benchmark harness and did not execute this later extension.

## Added browser-based website (2026-10-11)

This package now also includes a browser-based version in `website/`, without replacing or altering the C11 program, Min-Heap/Hash Table engine, benchmark files, reports, presentation or original viva notes. It has a dashboard, manual batch form, searchable inventory, FEFO and FIFO stock issue, expiry alerts, adjustments and write-offs, movement history, CSV import/export, JSON backup/restore and reporting. The FEFO allocator uses a Min-Heap; the FIFO comparison is ordered by receipt date.

### Run the website

1. Install Node.js 18 or later; no `npm install` is required.
2. Double-click `START_WEBSITE.bat` at the package root.
3. Use `http://127.0.0.1:4173` and keep its local server terminal open.
4. Start with fictional demo data or enter/import actual stock.

Website-specific source, tests and instructions are in `website/`; run `npm test` inside that directory to test the website API and allocation rules. The website's JSON file (`website/data/inventory.json`) and the C app's files under root `data/` are separate; they do not sync automatically. The website is local-only and has no login/cloud database. Do not expose it directly to the public internet. The older C app remains the academic experiment reference and retains the original benchmark evidence.

### Run the practical app

1. Extract the ZIP fully into a writable folder.
2. Double-click `START_INVENTORY_APP.bat`.
3. Add stock with menu option `1`, view it with `2`, issue using FEFO with `4`, check expiry alerts with `5`, then exit with `0`.
4. Local application data is stored in `data\`; synthetic experiment outputs are stored separately in `results\generated\`.

## Included files

- `A6_Project_Report.docx` and `.pdf` — full report with declaration, acknowledgement, abstract, focused literature review/research gap, method, results, limitations, references and appendices.
- `A6_Project_Presentation.pptx` and `.pdf` — 14 slides with problem, literature review, method, measured results, limitations, references and acknowledgement.
- `A6_Viva_Notes.docx` and `.pdf` — viva preparation, including live demonstration and FIFO-complexity answers.
- `A6_Rubric_Alignment.md`, `CI_VERIFICATION.md`, `START_HERE.md`, `DEMO_GUIDE.md`.
- **Runnable source tree:** `src/` (including the interactive inventory app), `website/` (browser app, API, tests and guides), `include/`, `tests/`, `templates/`, `.github/workflows/ci.yml`, `Makefile`, `build.ps1`, `demo.ps1`, the Windows launchers, `README.md`, `PRACTICAL_APP_GUIDE.md`, `PROJECT_SPEC.md`, and `BENCHMARK_PROTOCOL.md`.
- Six CSVs: smoke simulation, 180-row raw policy matrix, 18-row summary, 70-row benchmark, five-row benchmark summary and ten-row operation-count data.
- Figures: benchmark, policy experiment, operation counts, smoke simulation and system architecture.
- Supplied VGU A-6 notice/rubric PDF.

## Verified checks

- GCC 13.3.0 / Ubuntu 24.04; C11 warnings as errors with `-O2`.
- Regular tests: **13/13 PASS**; allocation-failure injection: **14/14 PASS**.
- Clang static analysis/build/regression, PowerShell script syntax, ASan/UBSan, demo, 100-batch smoke run, policy matrix, benchmark, separate operation counters and artifact uploads: **PASS**.
- Local GCC 14.2 checks repeated: build, regular/sanitizer/fault-injection tests, demo, smoke, full experiment, benchmark, counters and Clang static analysis passed.
- Latest CI artifacts: generated CSVs `11664281424` and runnable source `11663701726`, retained until 9 November 2026.

## Classroom demo

1. Extract this ZIP and open its root folder in VS Code.
2. Open a PowerShell terminal at that folder and run `.\demo.ps1 -Quick`.
3. Show `src/engine.c`, the console FEFO allocations, the FEFO/FIFO simulation table and `results/generated/policy_simulation.csv`.
4. Use `.\demo.ps1` for the full benchmark and result generation.

The Windows scripts passed PowerShell parser validation in CI; rehearse the command once on your laptop before class. A C compiler is required. The original C module remains a C11 command-line prototype; the package now also contains a separate local-first website in `website/`.

## Limits and release state

All results use synthetic data; performance ratios belong to the CI runner/workload. The application does not evaluate physical food safety or establish real-world food-waste savings. The audit branch is intentionally isolated; no merge into `dev` or `main` was made. No separate report template was specified beyond the supplied notice.