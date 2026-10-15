# FreshTrack Inventory — Expiry-Aware Food Inventory Prioritization Engine

**C11 Data Structures & Algorithms project** — a custom binary Min-Heap for FEFO stock allocation, a hash table for batch ID lookup, an independent linear-scan FEFO baseline and a separate FIFO policy experiment.

## Open the project

- **Interactive showcase source:** [showcase/index.html](showcase/index.html) — client-side FEFO/FIFO demo committed in this repository.
- **Primary production URL:** https://expiry-aware-food-inventory-priorit.vercel.app/ — serves the consolidated FreshTrack Inventory cloud UI.
- **Secondary FreshTrack alias:** https://freshtrack-inventory.vercel.app/ — may not automatically follow future production deployments; use the primary URL above for the canonical release.
- **GitHub source repository:** https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- **C11 engine source:** [src/](src/)
- **Interactive offline inventory app:** [src/inventory_app.c](src/inventory_app.c)
- **Website source (local Node.js application):** website/
- **Full FreshTrack cloud UI source:** [freshtrack-app/](freshtrack-app/) — account-based dashboard, inventory, expiry alerts, FEFO/FIFO issuing, movements, reports, export/backup, Supabase config and Continue with Google.
- **Project specification:** [PROJECT_SPEC.md](PROJECT_SPEC.md)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Benchmark methodology:** [BENCHMARK_PROTOCOL.md](BENCHMARK_PROTOCOL.md)
- **Practical app guide:** [PRACTICAL_APP_GUIDE.md](PRACTICAL_APP_GUIDE.md)
- **VGU A6 rubric alignment:** [A6_Rubric_Alignment.md](A6_Rubric_Alignment.md)
- **Submission bundle (PDF/DOCX/PPTX reports, viva notes, rubric and figures):** [Download ZIP](submission/A6_Submission_Artifacts.zip)
- **Tests:** [tests/](tests/)
- **Benchmark and experiment CSVs:** [CSV results in repository root](./)
- **C11 CI workflow and run history:** [GitHub Actions](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml)

The account-based cloud UI source is in `freshtrack-app/` and is deployed by the linked Vercel project. The primary URL above is the canonical production address; check the Vercel deployment details for the exact current commit. The secondary alias may lag behind a future release unless it is reassigned. The old Vercel project `freshtrack-inventory-legacy` is retained for rollback. Google OAuth redirect preflight has been checked, but a complete interactive sign-in and return to the dashboard has not been verified by automated tests.

## Features

- C11 custom Min-Heap FEFO engine (First Expire, First Out).
- Hash table for batch ID lookup and duplicate checking.
- Independent linear-scan FEFO correctness/performance baseline.
- FIFO policy comparison using documented synthetic workloads.
- Practical offline C inventory manager: receive batches, search, issue stock, expiry alerts, low-stock warnings, CSV import/export, settings and transaction log.
- Optional local browser inventory website with isolated tests.
- Account-based FreshTrack cloud UI with Supabase authentication, email/password and Continue with Google; production HTTP smoke and Google authorization redirect preflight passed. A real interactive Google consent/sign-in return has not been completed by automated tests.
- Client-only C11 showcase demo;

## Build on Windows (PowerShell)

Requirements: GCC or Clang with C11 support; Python 3 is used by the app smoke test.

```powershell
.\build.ps1 -App
.\build.ps1 -Test
.\build.ps1 -AllocFail
.\build.ps1
```

## Build and test on Linux/macOS

```sh
make all
make test
make test-allocation-failure
make app-smoke
make test-sanitize
make operations
```

For the optional local browser application, install Node.js 18 or later and run the start script described in [website/README.md](website/README.md).

## Interpretation and safety limits

Benchmark and policy experiment outputs describe the documented synthetic workloads only; timing varies by machine and compiler. The project does not prove real-world food-waste reduction, certify food safety, or track storage temperature. The C11 DSA engine, local JSON-backed website, and account-based cloud UI are separate implementations and do not automatically share inventory data. Use actual product labels and food-safety procedures for operational decisions.

The `showcase/` directory is a client-only teaching demo with fixed sample records and no persistent storage. The `website/` directory is the local JSON-backed browser app and is intended for single-workstation use; do not expose its local Node.js server directly to the public internet. The `freshtrack-app/` directory contains the account-based Supabase cloud UI.
