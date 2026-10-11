# Benchmark and Simulation Protocol

## 1. Purpose

This protocol prevents unfair comparisons, inconsistent expiry rules, strategy-dependent demand, and timing contaminated by I/O.

There are two distinct experiments:

- **Experiment A — Data-structure effect:** custom heap FEFO versus linear-scan FEFO. Same selection policy.
- **Experiment B — Policy effect:** FEFO versus FIFO. Compare operational outcomes, not just speed.

Do not combine these into one “fastest algorithm” contest.

## Current implementation status

The CLI currently runs one fixed-seed policy scenario per invocation (seed `20261009`, demand/supply ratio `0.80`, 35 days). The structure benchmark uses independent batch-object arrays for heap and linear FEFO, checks selected IDs in a separate untimed pass, discards one warm-up run per algorithm and size, then records seven raw measured trials. Build timing includes inventory initialization and insertions. The raw CSV contains build and selection/removal seconds; a second CSV contains median, minimum, maximum, and median-based linear/heap selection speedup.

The `experiment` command exports the full policy matrix at 1,000, 5,000 and 10,000 batches, over ten reproducible seeds and target demand/supply ratios 0.50, 0.80 and 1.00. For every trace, demand/supply totals are fixed before independently replaying the exact same arrivals and demand events against heap-FEFO and FIFO states. It writes 180 raw rows (90 size/ratio/seed traces × two policies) and 18 summary rows containing means and sample standard deviations for supply, demand, fulfillment, shortfall, expired quantity, remaining quantity and FIFO priority inversions. The timing executable does not export comparator/operation counters inline. A separate instrumented executable now exports build and selection comparator counts, heap swaps, insertions, removals and heap extractions to `results/generated/structure_operation_counts.csv`; its counters are collected outside the timing process so instrumentation does not contaminate wall-clock timing. Graphs and report/presentation/viva files are separate submission assets. The regular harness contains 13 test groups, including exact INT_MAX quantity/day-boundary arithmetic. A separate test-only allocator wrapper injects a one-shot failure to exercise inventory insertion, hash-table growth, and allocation-result failure paths without changing production allocation behavior. CI runs that 14th fault-injection group in a dedicated build, alongside the 12-seed randomized differential workload (64 batches per seed) and AddressSanitizer/UndefinedBehaviorSanitizer. The harness also covers bulk expired-root purging and malformed EventTrace rejection (invalid horizon, unordered/out-of-range events, negative demand, non-terminated fixed-width IDs, invalid expiry, inconsistent totals, and unsupported policy enum). `simulation_run` validates event order, bounded strings, non-negative quantities and trace totals before processing. The current `.github/workflows/ci.yml` runs the GCC C11 build, engine regression tests, allocation-failure tests, C inventory app smoke tests, showcase contract/behavior tests, AddressSanitizer/UndefinedBehaviorSanitizer, and the website Node test suite. Clang and PowerShell checks documented in older verification snapshots are not steps in the current workflow. Do not generalize beyond these synthetic workloads.

## 2. Shared definitions

- **n:** number of generated batches in a data set.
- **m:** number of selection/removal operations in a structure benchmark trial.
- **today:** integer simulation day.
- **Eligible:** ACTIVE, quantity > 0, and today <= expiry day.
- **Expired:** today > expiry day.
- **FEFO order:** expiry day ascending, received day ascending, then batch ID lexicographically ascending.
- **Supply:** total quantity in arrivals.
- **Demand:** total requested quantity.
- **Demand/supply ratio:** total requested quantity divided by total arriving quantity, targeted at 0.50, 0.80, or 1.00.

A batch remains eligible on its expiry day and expires on the next day. Use this same boundary everywhere.

## 3. Experiment A — Data-structure effect

### Question

For the same FEFO rule, how does a custom Min-Heap compare with an unsorted linear scan when repeatedly selecting and removing the earliest-expiring batch?

### Algorithms

**A1: Linear-scan FEFO**
- Keep batches in an unsorted dynamic array.
- For every operation, scan active eligible batches and select the minimum using the frozen comparator.
- Remove a selected entry with swap-with-last and decrement the array length. Do not shift all following elements.

**A2: Heap FEFO**
- Keep the same logical batches in the custom Min-Heap.
- Select and extract the minimum for every operation.

Both must generate the same selected batch ID sequence from the same data. Run an untimed differential correctness check.

### Dataset sizes

Use:
- 1,000 batches
- 5,000 batches
- 10,000 batches
- 50,000 batches
- 100,000 batches

This is a synthetic stress benchmark, not a claim that every campus canteen manages 100,000 distinct batches.

For this extraction workload, set each batch quantity to one and begin with all batches unexpired. This isolates priority selection/removal; it does not simulate food demand.

### Workload

Set m = min(200, n) extraction operations per measured trial. Generate unique batch IDs, varied received/expiry days, and some repeated expiry days to exercise tie-breaking. Expiry must not precede receipt or the benchmark start day.

### Measurements

Record separately:
1. Initial build time to construct the list/heap.
2. Time for m selection/removal operations.
3. Comparator count.
4. Heap comparisons, swaps, insertions, and extractions as appropriate.
5. Selected-sequence equality in the separate correctness run.

Do not include data generation or CSV output in timed regions.

### Timing procedure

For each algorithm and data set size:
1. Generate data outside the timed region.
2. Use fresh independent batch objects for each strategy.
3. Construct the structure outside the extraction timer; report build time separately.
4. Run one warm-up trial.
5. Run seven measured trials.
6. Use an appropriate high-resolution timer for the operating system. Aggregate many operations instead of trusting single-operation timing.
7. Do not print, perform file I/O, generate random values, or run oracle comparisons inside timed regions.
8. Report median, minimum, and maximum.
9. Keep machine, compiler version, optimization flags, power mode, and background workload as consistent as reasonably possible.

Operation counters can add overhead. Perform one timing run without counters and a separate instrumented run for counts.

### Structure experiment output

Export a CSV row per algorithm, data set size, and trial with:
- n
- m
- algorithm
- random seed
- trial
- build time
- selection/removal time
- comparator/operation counts from the instrumented run
- correctness-equivalence status from the separate run

Only real measured values belong in final result files.

## 4. Experiment B — Policy effect

### Question

Under identical inventory arrivals and demand, how do FEFO and FIFO differ in fulfilled demand, shortfall, expired quantity, and unexpired stock remaining?

### Policies

- **FEFO:** selects the earliest-expiring eligible batch with the frozen comparator.
- **FIFO:** selects the oldest received eligible batch, with batch ID as a deterministic same-day tie-break.

The FIFO baseline uses an arrival-ordered dynamic array, not a circular queue. Exhausted-front removal shifts remaining pointers and therefore can be O(n); expiry maintenance also scans/compacts entries in O(n). The policy experiment compares operational outcomes rather than FIFO operation speed.

### Simulation sizes

Use 1,000, 5,000, and 10,000 batches for policy simulation. The structure benchmark separately reaches 100,000 batches.

For each size, use at least 10 reproducible seeds and demand/supply ratios:
- 50%
- 80%
- 100%

The ratios are totals over the horizon, not guarantees that each daily request will be fulfilled.

### Immutable event trace

For each seed/scenario, generate arrivals and demands once and replay the exact same trace against independent policy states.

Arrival fields:
- batch ID
- integer quantity
- received day
- expiry day

Demand fields:
- day
- integer requested quantity

Rules:
- Demand is exogenous; it never changes based on prior allocations or shortfalls.
- Shortfalls are recorded and not re-queued.
- Both policies receive the same batches, quantities, dates, arrivals, demand events, and day order.
- Include variable shelf lives so expiry order sometimes differs from arrival order.
- Include a control scenario where arrival order and expiry order align, so policies can agree.
- Use a fixed, documented random seed.
- Use a documented 30–40 day simulation horizon or another fixed horizon chosen before running experiments.

### Fixed daily order

1. Add arrivals.
2. Account for and remove batches that are now expired.
3. Process demand.

Expiry is strict: a batch with expiryDay equal to today is still eligible today.

### Independent waste accounting

One shared accounting function must apply equally to each policy. On each expiry event, before policy-specific removal:
- find each active batch with positive remaining quantity whose expiry day is earlier than today;
- record its remaining quantity as expired exactly once;
- mark it EXPIRED;
- remove it from that policy's active selection structure while preserving remaining policy order.

Do not count waste by the number of heap/queue removals. That would count implementation behavior rather than actual expired quantity and could bias results.

### Policy metrics

Record:
- total arriving quantity
- total requested quantity
- total fulfilled quantity
- total shortfall
- expired quantity
- remaining unexpired quantity at the horizon end
- completed request count
- FIFO priority-inversion count/rate

A **priority inversion** is a FIFO allocation made while another currently eligible batch with an earlier expiry existed. Label this a diagnostic rather than independent proof of FEFO superiority because it is defined relative to FEFO's rule.

Do not claim FEFO reduces waste in every workload. If arrival and expiry orders align, the policies may produce the same outcome.

## 5. Correctness tests, not performance metrics

“FEFO priority correctness” is a test, not a performance metric. Compare every heap FEFO choice against the independent linear FEFO oracle in differential tests. Also validate the heap invariant after structural modifications in test mode.

Report:
- differential decisions checked
- mismatches
- heap invariant failures
- edge cases passed/failed

The acceptance target is zero mismatches and zero invariant failures. Do not call this a machine-learning accuracy score.

## 6. Required edge cases

1. Empty inventory.
2. One batch.
3. Different expiry days.
4. Equal expiry dates.
5. Equal expiry/receipt day with batch-ID tie-break.
6. Today equals expiry day.
7. Today is after expiry day.
8. Multiple expired heap roots.
9. Partial allocation leaving quantity positive.
10. Allocation exactly exhausts a batch.
11. Request greater than available eligible stock.
12. Duplicate batch ID.
13. Zero and negative quantity rejection.
14. Expiry earlier than receipt day.
15. No stock after expired items are purged.
16. Repeated allocations.
17. Control scenario where FIFO and FEFO agree.
18. Scenario where FIFO selects a later-expiring batch while an earlier-expiring eligible batch exists.
19. Fixed seed reproduces the same trace/outcome.
20. Expired quantity is accounted exactly once.

## 7. Required graphs/tables

1. Median selection/removal time vs n: linear FEFO and heap FEFO.
2. Comparator count vs n.
3. Initial build time vs n.
4. Observed speedup (linear time divided by heap time), using actual values.
5. Expired quantity by policy and demand/supply ratio.
6. Fulfilled quantity and shortfall by policy.
7. Remaining unexpired quantity by policy.
8. Policy outcome summaries across seeds, including mean and standard deviation.
9. Correctness and edge-case test summary.

Do not hard-code example numbers. Do not claim expected results are measured results. Do not infer theoretical complexity by fitting a curve to only a few measurements.

## 8. Reproducibility record

For the final report, record:
- Git commit/source version
- compiler name/version
- OS and machine details
- compiler optimization flags
- data set size
- seed
- m for the structure benchmark
- demand/supply ratio and simulation horizon for policy experiments
- warm-up and measured trial counts
- timing statistic
- whether operation counters were enabled

## 9. Acceptance criteria

The experiment is ready to report only when:
- heap FEFO and linear FEFO produce identical choices on identical traces;
- heap invariants pass;
- policies replay identical input traces;
- waste is accounted independently and exactly once;
- expiry boundary/day order is consistent;
- timed regions contain no I/O or graph creation;
- timing and operation-count runs are separated where needed;
- results are exported and reproducible from the documented seed;
- synthetic simulation assumptions and limitations are disclosed honestly.
