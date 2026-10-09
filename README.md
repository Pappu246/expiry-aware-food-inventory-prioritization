# Expiry-Aware Food Inventory Prioritization Engine

A B.Tech A-6 Data Structures project that implements FEFO (First Expire, First Out) stock prioritization using a custom binary Min-Heap and evaluates it with reproducible benchmarks.

## Project status

**Specification frozen; implementation has not started yet.** This repository is private during development. The MVP is intentionally limited to an in-memory Java command-line prototype and controlled experiments. It is not a production inventory system and does not certify food safety.

## Read these first

1. [Project specification](PROJECT_SPEC.md) — problem, scope, assumptions, requirements, non-goals, and acceptance criteria.
2. [Architecture](ARCHITECTURE.md) — components, data structures, source layout, API contract, invariants, and complexity expectations.
3. [Benchmark protocol](BENCHMARK_PROTOCOL.md) — fair experiments, timing rules, controlled simulation, metrics, test requirements, and reproducibility.

## Frozen technical direction

- Custom binary Min-Heap for FEFO.
- Hash Map for batch-ID lookup and duplicate-ID checks.
- Unsorted linear-scan FEFO baseline for performance comparison and correctness checking.
- FIFO queue only for the separate policy baseline.
- Java 17+ and a minimal Maven build.
- No AI/ML, GPS, web/mobile app, external APIs, or database server in the MVP.

## Main research questions

1. For the same FEFO rule, how does a custom Min-Heap compare with an unsorted linear scan for selecting/removing the earliest-expiring batch?
2. Under the same controlled arrivals and demand, how do FEFO and FIFO differ in expired quantity, fulfilled demand, shortfall, and remaining unexpired stock?

All performance values must come from actual reproducible runs. Synthetic simulation outcomes must not be presented as real-world food-waste savings.

## Build and test

The project uses Maven. Once implementation files are added, run:

~~~bash
mvn test
~~~

## Safety boundary

The prototype prioritizes recorded inventory that has already been deemed eligible by responsible staff. It does not determine food safety, inspect storage/temperature conditions, or replace applicable food-safety procedures.
