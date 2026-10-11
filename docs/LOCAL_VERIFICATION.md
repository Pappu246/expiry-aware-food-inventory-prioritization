# Local verification record

Date: 2026-10-11

The first section below records an earlier local packaging snapshot. Its website test count predates the added non-loopback bind-guard regression test. The latest authoritative remote status is recorded in the section at the end.

- `make all`: passed (research CLI and interactive inventory application).
- `make test`: 13/13 test groups passed.
- `make test-allocation-failure`: 14/14 test groups passed.
- `make app-smoke`: passed all four grouped end-to-end smoke scenarios.
- `make test-sanitize`: 13/13 test groups passed under AddressSanitizer/UndefinedBehaviorSanitizer.
- `cd website && node --test tests/*.test.js`: 27/27 tests passed.

These are local test results from the prepared package. They are not a substitute for the current GitHub Actions run; use the Actions result for the remote CI status.

## Latest remote verification — 11 October 2026

- Commit: `42a246a1e4cd29afa065466b43c57ecee732d581`
- GitHub Actions: [C11 CI run 38154078428](https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38154078428) — success.
- C engine suite: 13/13; allocation-failure suite: 14/14; app smoke tests: all four grouped scenarios passed.
- Showcase contract/behavior suite: 4/4; ASan/UBSan regression suite: 13/13; website suite: 28/28.
- This is a remote Linux CI result, not a claim that Windows-specific or Clang CI jobs ran in the current workflow.
