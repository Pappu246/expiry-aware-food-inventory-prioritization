# Local verification record

Date: 2026-10-11

The prepared C11 package was rebuilt and tested locally before the repository history was normalized.

- `make all`: passed (research CLI and interactive inventory application).
- `make test`: 13/13 test groups passed.
- `make test-allocation-failure`: 14/14 test groups passed.
- `make app-smoke`: passed all four grouped end-to-end smoke scenarios.
- `make test-sanitize`: 13/13 test groups passed under AddressSanitizer/UndefinedBehaviorSanitizer.
- `cd website && node --test tests/*.test.js`: 27/27 tests passed.

These are local test results from the prepared package. They are not a substitute for the current GitHub Actions run; use the Actions result for the remote CI status.
