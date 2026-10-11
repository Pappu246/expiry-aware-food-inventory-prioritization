# Application test record - 10 October 2026

## Code/build checks run in the package environment

- GCC C11 build with `-Wall -Wextra -Wpedantic -Werror -O2`: passed for the original research CLI and new interactive inventory app.
- Existing engine regression suite: 13/13 groups passed.
- Existing allocation-failure injection suite: 14/14 groups passed.
- Existing engine ASan/UBSan suite: 13/13 passed.
- Clang static analysis on research CLI and interactive inventory app: completed without diagnostics.
- Research CLI demo and 100-batch synthetic simulation: passed.
- Policy experiment: 180 raw rows plus 18 summary rows generated.
- Five-size benchmark: all 200 selected choices matched between Heap FEFO and Linear Scan at each size.
- Operation counter CSV: generated for five sizes.

## New interactive-app black-box checks

Run `make app-smoke` to reproduce the following checks using an isolated temporary data directory:

1. Manual stock entry for two different items; issue for Rice does not consume Beans.
2. FEFO allocation selects the earliest eligible expiry, reports shortfalls honestly, and persists quantities across restart.
3. Transaction history and stock-report CSV are created.
4. CSV import accepts a quoted item name containing a comma and rejects invalid or past-expiry stock.
5. Expiry status uses the documented boundary: stock remains eligible on its expiry date and expires the following day; input dates are strict and future receipt dates are rejected.
6. Corrupt inventory files are not partially loaded and overwritten, and a missing primary file is not recreated empty when a recovery backup exists.

The black-box script now contains six grouped scenarios, including strict date validation, backup preservation, and missing-primary-file recovery. These tests use test-only records and isolated directories; they do not modify real user stock.

## CI distinction

`CI_VERIFICATION.md` separates the historical benchmark snapshot from current verification. The remote workflow passed for the functional implementation commit [06c38dce](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38155231772): six grouped app smoke scenarios, including strict date validation, corrupt-file preservation, and missing-primary-file recovery. Follow-on documentation-only commits were also checked by the C11 workflow; use the [workflow history](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/workflows/ci.yml) for the current default-branch run.

## Deep-audit regressions added — 11 October 2026

The latest smoke run verifies that a malformed saved inventory cannot be silently partially loaded and rewritten on exit, and that a missing primary file is not recreated empty when a previous backup still exists. The app stops before its normal expiry/exit save path, preserving the available recovery files for manual recovery.
