# CI verification snapshot

- Repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Audited branch: `audit/benchmark-correctness` (isolated; not merged into `dev` or `main`)
- Verified commit: `7448b507d72837ecd6cbad44ad703bad9715be57`
- Successful GitHub Actions run: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38035688983
- Generated-results artifact ID: `11664281424`; expires 9 November 2026
- Runnable-source artifact ID: `11663701726`; expires 9 November 2026
- Regular C test harness: **13/13 groups passed**; dedicated allocation-failure injection harness: **14/14 groups passed**
- GCC build, Clang static analysis/build/regression/fault injection, PowerShell parser checks, ASan/UBSan, demo, 100-batch simulation, 180-row policy matrix, benchmark, separate operation counts, full Windows demo and Windows CSV row-count checks: **PASS**

## Final measured selection/removal medians

| Batches | Heap (ms) | Linear scan (ms) | Linear/heap | Matching choices |
|---:|---:|---:|---:|---:|
| 1,000 | 0.0126 | 0.7507 | 59.63x | 200/200 |
| 5,000 | 0.0256 | 4.0727 | 158.79x | 200/200 |
| 10,000 | 0.0500 | 8.7019 | 174.12x | 200/200 |
| 50,000 | 0.0713 | 43.7464 | 613.83x | 200/200 |
| 100,000 | 0.1104 | 89.8488 | 814.16x | 200/200 |

Timing data is seven measured trials after one warm-up on the GitHub-hosted runner, for this specific 200-removal synthetic workload; it is not a universal performance promise. Instrumented operation counters were collected in a separate executable. The generated-results artifact contains six CSV files; the source artifact contains the C11 source tree, tests, Makefile, PowerShell build/demo scripts and project documentation.

- Actual Windows CI ran `demo.ps1` end-to-end, including compilation, 13/13 regular tests, 14/14 allocation-failure tests, demo, simulation, full policy matrix, benchmark, operation-count export and all six CSV row-count checks.
- Local Linux verification on the packaged source also passed build, 13/13 tests, ASan/UBSan, 14/14 allocation-failure tests, demo, simulation, policy experiment, benchmark, operation counts and six CSV shape checks.
- All scenario inputs are synthetic. The program does not certify physical food safety or establish real-world food-waste savings.


## Additional practical-app verification (package extension, 2026-10-10)

The interactive application `src/inventory_app.c` was added after the GitHub Actions run listed above. It is **not included in that historical run**. The extension was compiled and checked locally in the packaging environment with GCC 14.2 using C11, `-Wall -Wextra -Wpedantic -Werror -O2`; Clang static analysis completed without diagnostics. The black-box test script `tests/inventory_app_smoke.py` passed checks for manual stock entry, item isolation, FEFO allocation and shortfall, persistence across restart, transaction history, stock CSV export, sample ordering, quoted-name CSV import, rejection of past-expiry imports, and status transition at the declared expiry boundary. Original engine tests also remained 13/13 passing, allocation-failure tests 14/14, and ASan/UBSan regression tests passed. The Windows launcher is included, but the new interactive app's Windows CI step is configured in the bundled workflow and has not yet been observed in a remote workflow run for this package extension.


## Browser website extension (11 October 2026)

- Added `website/`, a local-first browser application with its own Node.js HTTP API and JSON persistence. It is a separate application from the C command-line app; their inventory files are not synchronized.
- Local verification using Node.js **v22.16.0** for the included website source: `node --check server.js`, `node --check lib/inventory.js`, `node --check public/app.js` passed, and the Node test runner reported **15/15 passing tests** (unit plus HTTP integration tests).
- The workflow now contains a `website-tests` matrix for Node.js 20 and 22. No new remote GitHub Actions run is claimed from this packaging environment; the job must run in GitHub to confirm those CI runners.
- Website scope remains local-only. No public deployment, hosted database, authentication, or multi-user production operation is included.