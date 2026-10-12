# Verification and submission evidence

## Repository and source of truth

- Repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Canonical source branch: `main`.
- The live [C11 CI workflow history](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml) is authoritative for the exact commit and result. This file is a guide, not a substitute for the run attached to the current branch head.
- The consolidated FreshTrack UI is merged to `main` at `82d1dc36a8096beef302f24bec340233609f6e91`. [C11 CI run 38250133282](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38250133282) and [archive validation run 38250132643](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38250132643) both succeeded for that commit. The archive workflow checks ZIP paths/CRCs, required document containers and source-file parity.

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

The active workflow does **not** configure a Clang/PowerShell job or a Node.js version matrix. Older notes are historical and should not be presented as active steps. The local JSON inventory website is a single-user app; the static C11 showcase is a separate demo. Successful source CI does not itself verify public HTTP reachability.

## Submission archive integrity

The dedicated [submission archive refresh workflow](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/refresh-submission-archive.yml) overlays current tracked source and documentation into `submission/A6_Submission_Artifacts.zip`, validates archive paths and CRCs, checks the required report/presentation/viva deliverables, and verifies that key source files inside the archive match the checked-out repository. Existing report PDFs/DOCX and presentation files are preserved and structurally checked; this automated check does not independently fact-check every sentence in those report documents.

## FreshTrack cloud UI consolidation

The merged FreshTrack UI is in `freshtrack-app/`. Its **10/10 contract tests**, static build and Vercel security-header assertions pass in CI. A separate axe audit found **0 violations** on login-mobile, dashboard-desktop and dashboard-mobile. A headless browser check using mock inventory validated dashboard counts, search/clear filters, empty results, expiry filter, navigation and mobile layout with no page errors. These UI checks used fake inventory data and do not prove real-account CRUD.

Production deployment `dpl_EMGvTwVKg472sj5MoFSGTw8sjciX` is `READY`; both `expiry-aware-food-inventory-priorit.vercel.app` and `freshtrack-inventory.vercel.app` return HTTP 200 and serve the FreshTrack title, Google button, JS/CSS/config assets and security headers. Supabase reports Google enabled, and the authorize endpoint redirects both hostnames to `accounts.google.com`. Full interactive Google consent/return is still unverified.

The first Git-source Vercel deployment failed with `git_info_fail`; the live deployment was then built successfully by uploading the merged `freshtrack-app/` source with the configured Vercel build command. Future Git-based auto-deploys should be rechecked/reconnected before relying on automatic promotion.

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
- Production now serves the account-based FreshTrack UI at both public hostnames above. The previous static-showcase deployment remains available as a rollback candidate but is no longer the active production alias. The optional local JSON inventory website remains local-only because it has no authentication.
