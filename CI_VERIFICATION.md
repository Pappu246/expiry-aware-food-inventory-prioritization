# CI verification snapshot

## Latest remote verification — 11 October 2026

- Repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Latest main commit: `085f09cc6d7402ee2a1f98c182d58309413f9098`
- Latest main C11 CI run: [GitHub Actions run 38154997489](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38154997489) — **success**.
- C11 engine regression suite: **13/13 passed**; dedicated allocation-failure suite: **14/14 passed**.
- Interactive-app smoke script: **5/5 grouped scenarios passed**, including future-date validation and fail-closed behavior for a malformed saved inventory.
- Showcase contract/behavior suite: **4/4 passed**; AddressSanitizer/UndefinedBehaviorSanitizer suite: **13/13 passed**; website Node test suite: **28/28 passed**.
- The current workflow is [.github/workflows/ci.yml](.github/workflows/ci.yml). It runs GCC C11 build/tests and Node tests on Ubuntu. It does **not** currently configure a Clang/PowerShell job or a Node 20/22 matrix.
- Verified branches at the same commit: `main`, `dev`, `audit/benchmark-correctness`, `c11-clean-main-2026-10-11`, and `c11-full-inventory-app-2026-10-11`.
- Hosting remains unverified: Vercel reports a build-rate limit, and GitHub Pages site setup is denied by the current Actions integration permissions.

The remaining bullets and benchmark table below preserve a **historical validation snapshot** from an earlier commit. Do not interpret its branch state, artifact IDs, or CI-step list as the current workflow configuration.


- Repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Historical audited branch at the time of that run: `audit/benchmark-correctness` (it was later synchronized with current `main`; see current verification above).
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
- Historical note superseded by current remote verification above: the current website suite passed 28/28 tests in the C11 CI run linked at the top. The active workflow does not configure a Node.js 20/22 matrix.
- Website scope remains local-only. No public deployment, hosted database, authentication, or multi-user production operation is included.