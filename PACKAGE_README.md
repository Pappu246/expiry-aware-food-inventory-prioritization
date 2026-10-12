# A-6 Project Submission Package

**Project:** Expiry-Aware Food Inventory Prioritization Engine Using Data Structures  
**Language:** C11 for the DSA engine; local-first Node.js website and account-based FreshTrack cloud UI
**Canonical repository:** https://github.com/Pappu246/expiry-aware-food-inventory-prioritization  
**Canonical branch:** `main`

This package is refreshed from the selected Git branch by the [submission archive workflow](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/refresh-submission-archive.yml). The C source, website source, tests, build scripts, CSVs and Markdown guides are synchronized with the repository files; the curated report, slide and viva documents are preserved inside the ZIP and structurally checked.

## Deliverables

- `A6_Project_Report.docx` and `A6_Project_Report.pdf` — report with abstract, background/literature context, method, measured results, limitations, references and appendices.
- `A6_Project_Presentation.pptx` and `A6_Project_Presentation.pdf` — presentation for the project review.
- `A6_Viva_Notes.docx` and `A6_Viva_Notes.pdf` — viva preparation.
- A6_Rubric_Alignment.md, CI_VERIFICATION.md, START_HERE.md, DEMO_GUIDE.md, C11 source, local website, the FreshTrack cloud UI in freshtrack-app/, tests, build scripts and benchmark protocol.
- Data files: smoke simulation, raw FEFO/FIFO policy matrix, summary matrix, structure benchmark, benchmark summary and separate operation-count CSVs.
- Figures and the supplied VGU A-6 notice/rubric PDF are preserved from the curated package.

The archive verifier requires the report, presentation and viva deliverables in their expected file formats, rejects unsafe ZIP paths/corrupt CRCs, and compares the packaged C11 engine, interactive app, website server and test sources against the corresponding files in the selected repository commit.

## What is implemented

The C11 engine implements a custom binary Min-Heap for FEFO allocation, a hash table for batch ID lookup/duplicate prevention, an independent linear-scan FEFO correctness/performance baseline, and a separate FIFO policy experiment. The practical command-line app supports multiple item names, manual/CSV intake, FEFO/FIFO issue comparisons, expiry and low-stock views, transaction history, CSV export and local persistence.

The optional website remains a separate local-first Node.js app with its own local JSON store. The account-based FreshTrack app under freshtrack-app/ preserves the deployed UI and Supabase-backed inventory workspace and adds a Google OAuth entry point. It does not synchronize with the C11 app/local website. A real payment gateway is not implemented or represented as working.

## Run on Windows

1. Extract the ZIP completely into a writable folder; do not run from the ZIP preview.
2. Install GCC with C11 support and Python 3 for the C app smoke test.
3. Double-click `START_INVENTORY_APP.bat` for the C11 console application or `START_WEBSITE.bat` for the local website.
4. For the website, keep the server terminal open and use `http://127.0.0.1:4173`.
5. For coursework demonstrations, `RUN_QUICK_DEMO.bat` runs the short research-demo flow and `RUN_FULL_DEMO.bat` runs the synthetic benchmark/policy experiments.

Node.js 18 or later is required for the website; no third-party runtime packages are required. The local website is not an authenticated cloud service and must not be exposed directly to the public internet.

## Tests and evidence

The current [C11 CI workflow history](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml) is the source of truth for the exact commit tested. The workflow compiles C11 with strict warnings, runs engine and allocation-failure tests, checks the interactive-app and showcase behavior, runs ASan/UBSan, and executes the website's Node.js tests. The website tests include validation, FEFO/FIFO ordering, concurrency, backup recovery, CSV behavior, API integration and process-restart persistence.

The latest verified source/test snapshot is [commit `f6075349866e9bc32d8172e74a7e355ab5ae8b7f`](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/commit/f6075349866e9bc32d8172e74a7e355ab5ae8b7f), tested by [C11 CI run 38158044856](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38158044856): engine **13/13**, allocation-failure **14/14**, app smoke **6/6 grouped scenarios**, showcase **4/4**, sanitizer **13/13**, and website **29/29** tests. [Archive verification run 38158044840](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38158044840) validated the refreshed package with 75 files (5 PDFs, 3 DOCX files and 1 PPTX file) and exact source-file comparisons. The Vercel production deployment is `READY` for this source commit; see [the hosted showcase](https://expiry-aware-food-inventory-priorit.vercel.app/).

Older package notes referenced a different branch, commit and test matrix. They are not the current source of truth. Current workflow history supersedes those snapshots. The active C11 CI workflow is Linux/Ubuntu-based and does not run Clang/PowerShell or a Node.js version matrix on each push.

## Limits

Benchmark inputs and policy outcomes are synthetic. Reported selection speedups apply to the specified workload and CI runner only. The prototype does not prove real-world food-waste reduction, certify food safety, or track storage temperature, allergens or recalls. Use consistent units and actual package dates, follow local procedures, and keep independent backups of real inventory data.
