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
2. FEFO allocates from the earliest-expiring batch first, reports shortfall honestly, and persists the updated quantities after restart.
3. Transaction log and stock-report CSV are created.
4. CSV bulk import accepts a quoted item name containing a comma and skips a batch whose expiry date has already passed.
5. An ACTIVE saved batch past its date becomes EXPIRED at startup and is written to the log; a batch expiring today remains eligible under the project's declared boundary rule.

The black-box test script previously printed PASS for each of its four original grouped scenarios; the current script now has five scenarios. These tests use test-only records and isolated directories; they do not modify real user stock.

## CI distinction

`CI_VERIFICATION.md` records the previous GitHub Actions run for the original benchmark workflow. The interactive application is a package extension created after that run, so its local checks above should not be misrepresented as a remote GitHub Actions result. The current remote workflow now passes the expanded smoke suite on [commit 085f09cc](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38154997489): five grouped app scenarios, including strict date and corrupt-file preservation regressions.

## Deep-audit regressions added — 11 October 2026

The latest smoke run also verifies that a malformed saved inventory cannot be silently partially loaded and rewritten on exit. The app now stops before its normal expiry/exit save path, preserving both the original file and the last backup for manual recovery.
