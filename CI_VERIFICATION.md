# Verification and submission evidence

## Repository and source of truth

- Repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Canonical source branch: `main`.
- The live [C11 CI workflow history](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml) is authoritative for the exact commit and result. This file is a guide, not a substitute for the run attached to the current branch head.
- The latest verified source/test snapshot is commit `f6075349866e9bc32d8172e74a7e355ab5ae8b7f`, tested by [C11 CI run 38158044856](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38158044856). The same commit passed [archive validation run 38158044840](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38158044840), which validated the current submission ZIP. The later README-only deployment-status update does not change application source; the archive workflow will refresh the ZIP from current docs.

## Active C11 workflow

The current `.github/workflows/ci.yml` job runs on Ubuntu and performs:

1. GCC C11 build of both C applications.
2. Engine regression tests.
3. Allocation-failure injection tests.
4. Interactive inventory application smoke tests.
5. Showcase behavior/contract tests.
6. AddressSanitizer/UndefinedBehaviorSanitizer regression tests.
7. Website Node.js unit and HTTP integration tests.

The latest verified C11 CI run reports: engine **13/13**, allocation-failure **14/14**, interactive-app smoke **6/6 grouped scenarios**, showcase **4/4**, ASan/UBSan **13/13**, and website **29/29**. The separate archive job validates the refreshed ZIP's paths and CRCs, the PDF/DOCX/PPTX container structure, the six core report/presentation/viva deliverables, and checks that key packaged source files exactly match the checked-out source.

The active workflow does **not** configure a Clang/PowerShell job or a Node.js version matrix. Older local/CI notes about those checks are historical and should not be presented as steps in the current workflow. The optional inventory website is a local single-user app; the separate static showcase is deployed on Vercel. Successful source CI does not itself verify public HTTP reachability.

## Submission archive integrity

The dedicated [submission archive refresh workflow](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/refresh-submission-archive.yml) overlays current tracked source and documentation into `submission/A6_Submission_Artifacts.zip`, validates archive paths and CRCs, checks the required report/presentation/viva deliverables, and verifies that key source files inside the archive match the checked-out repository. Existing report PDFs/DOCX and presentation files are preserved and structurally checked; this automated check does not independently fact-check every sentence in those report documents.

## Benchmark snapshot

The benchmark compares heap FEFO and linear-scan FEFO on the same synthetic stock-selection workload. It is separate from the FEFO-versus-FIFO policy experiment.

| Batches | Heap selection median (ms) | Linear selection median (ms) | Linear/heap |
|---:|---:|---:|---:|
| 1,000 | 0.0126 | 0.7507 | 59.63x |
| 5,000 | 0.0256 | 4.0727 | 158.79x |
| 10,000 | 0.0500 | 8.7019 | 174.12x |
| 50,000 | 0.0713 | 43.7464 | 613.83x |
| 100,000 | 0.1104 | 89.8488 | 814.16x |

Each timing row summarises seven measured trials after a warm-up on a GitHub-hosted runner, using 200 selection/removal operations. Treat the ratios as results for this synthetic workload and that runner, not a universal performance guarantee. Correctness checks compare the selected IDs outside the timed region. Policy experiment data is also synthetic and must not be represented as measured real-world food-waste reduction.

## Operational limits

- The C11 program and local Node.js website use separate data stores; they do not synchronize inventory.
- The website refuses non-loopback binding because it has no authentication and is not a production multi-user service.
- The system helps rotate recorded stock. It does not certify food safety, track temperature/cold-chain conditions, or establish real-world waste reduction.
- Static showcase production deployment `dpl_A7UMpsf4TSwPnDbXiY2K7EmZeMtE` reports `READY` for main commit `f6075349866e9bc32d8172e74a7e355ab5ae8b7f`. The optional inventory web server remains local-only because it has no authentication.
