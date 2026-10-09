# Expiry-Aware Food Inventory Prioritization Engine

A Data Structures project implementing FEFO (First Expire, First Out) prioritization in C using a custom binary Min-Heap and a custom hash table, with reproducible benchmarks.

## Project status

**Specification and architecture are ready; application code has not started yet.** The MVP is a local C11 command-line prototype and controlled benchmark. It is not a production inventory system and does not certify food safety.

## Read these first

1. [PROJECT_SPEC.md](PROJECT_SPEC.md) — problem, scope, assumptions, requirements, and exclusions.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — C modules, memory ownership, data structures, interfaces, invariants, and complexity expectations.
3. [BENCHMARK_PROTOCOL.md](BENCHMARK_PROTOCOL.md) — fair experiments, simulation rules, metrics, test requirements, and reproducibility.

## Frozen technical direction

- C11, standard library only.
- Custom array-backed binary Min-Heap for FEFO.
- Custom open-addressing hash table for batch-ID lookup.
- Linear-scan FEFO as same-policy benchmark and correctness oracle.
- FIFO queue only for the separate policy baseline.
- Local command-line app; CSV results.
- No Java/Maven, Python runtime, third-party library, AI/ML, GPS, web/mobile app, external API, or database server in the application.

## Research questions

1. For the same FEFO policy, how does a custom Min-Heap compare with an unsorted linear scan for selecting/removing the earliest-expiring batch?
2. Under the same controlled arrivals and demand, how do FEFO and FIFO differ in expired quantity, fulfillment, shortfall, and remaining unexpired stock?

All performance values must come from actual reproducible runs. Synthetic simulation outcomes must not be presented as real-world food-waste savings.

## Build and test

The Windows build script will use GCC available on PATH:

~~~powershell
.\build.ps1
.\build.ps1 -Test
~~~

If a C compiler is not installed, install a compatible GCC/Clang toolchain before building. The core application has no third-party runtime dependencies.

## Safety boundary

The prototype prioritizes inventory records already deemed eligible by responsible staff. It does not determine food safety, inspect storage/temperature conditions, or replace applicable food-safety procedures.
