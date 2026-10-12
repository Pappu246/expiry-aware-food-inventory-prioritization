# FreshTrack Inventory — Expiry-Aware Food Inventory Prioritization Engine

**C11 Data Structures & Algorithms project** — a custom binary Min-Heap for FEFO stock allocation, a hash table for batch ID lookup, an independent linear-scan FEFO baseline and a separate FIFO policy experiment.

## Open the project

- **Interactive showcase source:** [showcase/index.html](showcase/index.html) — client-side FEFO/FIFO demo committed in this repository.
- **Current production URL (not yet migrated):** https://expiry-aware-food-inventory-priorit.vercel.app/ — this still serves the static C11 demo. The consolidated FreshTrack UI source is being prepared under freshtrack-app/; production cutover is deferred.
- **GitHub source repository:** https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- **C11 engine source:** [src/](src/)
- **Interactive offline inventory app:** [src/inventory_app.c](src/inventory_app.c)
- **Website source (local Node.js application):** website/
- **Full FreshTrack cloud UI source:** freshtrack-app/ — the prior account-based UI, Supabase config, and Continue with Google entry point. This branch is not deployed to production yet.
- **Project specification:** [PROJECT_SPEC.md](PROJECT_SPEC.md)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Benchmark methodology:** [BENCHMARK_PROTOCOL.md](BENCHMARK_PROTOCOL.md)
- **Practical app guide:** [PRACTICAL_APP_GUIDE.md](PRACTICAL_APP_GUIDE.md)
- **VGU A6 rubric alignment:** [A6_Rubric_Alignment.md](A6_Rubric_Alignment.md)
- **Submission bundle (PDF/DOCX/PPTX reports, viva notes, rubric and figures):** [Download ZIP](submission/A6_Submission_Artifacts.zip)
- **Tests:** [tests/](tests/)
- **Benchmark and experiment CSVs:** [CSV results in repository root](./)
- **C11 CI workflow and run history:** [GitHub Actions](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml)

The core C11 engine, local apps, benchmark outputs, guides and submission ZIP remain in this repository. This integration branch adds the existing FreshTrack cloud UI source under freshtrack-app/. The production alias remains unchanged until this source passes CI and release smoke checks.

## Features

- C11 custom Min-Heap FEFO engine (First Expire, First Out).
- Hash table for batch ID lookup and duplicate checking.
- Independent linear-scan FEFO correctness/performance baseline.
- FIFO policy comparison using documented synthetic workloads.
- Practical offline C inventory manager: receive batches, search, issue stock, expiry alerts, low-stock warnings, CSV import/export, settings and transaction log.
- Optional local browser inventory website with isolated tests.
- Account-based FreshTrack cloud UI with Supabase authentication and inventory workflows; this branch adds the Google OAuth button. A payment gateway is not wired yet.
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

Benchmark and policy experiment outputs describe the documented synthetic workloads only. Timing varies by machine and compiler. The project does not prove real-world food-waste reduction, certify food safety, track storage temperature, or support concurrent multi-user stock editing. Use consistent units and follow actual product labels and local food-safety procedures.

The **showcase website** is an explanatory client-only demo and never stores actual stock. The **local inventory website** stores inventory in a local JSON file; do not publicly expose its local-only Node server as a shared production service.
