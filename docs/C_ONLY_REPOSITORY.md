# C11-only repository snapshot

Snapshot date: 2026-10-11.

This root snapshot preserves the current Data Structures project as a C11 implementation:
- custom binary Min-Heap for FEFO allocation and the Hash Table batch lookup;
- C11 research/benchmark harness and interactive inventory application;
- local browser demonstration, source tests, Windows launchers and CI workflow;
- project specifications, user guides, test notes and reproducible benchmark CSVs.

No Java source files, Java build setup, or Maven `pom.xml` are part of the active project snapshot. New project changes should remain aligned with the C11 specification.

A separate C-only Git bundle and complete source ZIP were created as recovery artifacts before history cleanup. Local inventory data files are intentionally excluded from source control.
