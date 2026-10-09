# Benchmark and Simulation Protocol

## 1. Purpose

This protocol defines how results are generated and reported. Its purpose is to prevent misleading comparisons, policy feedback effects, inconsistent expiry rules, and timing measurements contaminated by input/output.

There are two separate experiments:

- **Experiment A — Data-structure effect:** heap-based FEFO versus linear-scan FEFO. Both implement the same policy.
- **Experiment B — Policy effect:** FEFO versus FIFO. This compares stock-rotation outcomes, not raw speed.

Never combine the two into a single “fastest algorithm” ranking.

## 2. Shared definitions

- **n:** number of generated batches in a dataset.
- **m:** number of extraction/allocation operations in a structure benchmark trial.
- **today:** integer simulation day.
- **Eligible batch:** status ACTIVE, quantity > 0, and today <= expiryDay.
- **Expired batch:** today > expiryDay.
- **Priority order:** expiryDay ascending, then receivedDay ascending, then batchId lexicographically ascending.
- **Supply:** sum of quantities arriving in the trace.
- **Demand:** sum of requested quantities in the trace.
- **Demand/supply ratio:** total requested quantity divided by total arriving quantity, targeted at 0.50, 0.80, or 1.00.

A batch is still eligible on its expiry day and becomes expired on the following day. This boundary must be identical in all policies, the simulator, tests, and report.

## 3. Experiment A — Data-structure effect

### Question

For the same FEFO selection rule, how does a custom Min-Heap compare with an unsorted linear scan for repeatedly selecting and removing the earliest-expiring batch?

### Algorithms

**A1: Linear-scan FEFO**
- Store batches in an unsorted list.
- For each operation, scan all active eligible batches and select the minimum under the frozen priority order.
- After selecting the minimum, remove the selected list element by replacing it with the last element and truncating the last position. The list remains deliberately unsorted.

**A2: Heap FEFO**
- Store the same logical batches in the custom Min-Heap.
- For each operation, select and extract the minimum.

Both implementations must return the same batch ID sequence for the same initial dataset and operation trace. A separate correctness run verifies this; correctness checking and output printing are not included in elapsed-time measurements.

### Dataset sizes

Run with:

- 1,000 batches
- 5,000 batches
- 10,000 batches
- 50,000 batches
- 100,000 batches

Each benchmark dataset is a single homogeneous stock pool. For this specific extraction workload, each batch has quantity 1 so each successful operation removes one selected batch. All batches begin unexpired. The workload isolates priority selection/removal; it does not model daily food demand.

### Workload size

Set **m = min(200, n)** extraction operations per timed trial. With the required dataset sizes, m is 200. This intentionally caps the quadratic scan work at the largest dataset.

Generate unique batch IDs and varied received/expiry days from a documented fixed seed. Include some repeated expiry days to exercise deterministic tie-breaking. Every expiry day must be greater than or equal to received day and greater than the starting day.

### Measurements

Record separately:

1. **Initial build time** to construct the heap or the unsorted list from the same batch input. Do not mix it into extraction time.
2. **Extraction workload time** for m operations.
3. **Comparator count**.
4. **Heap comparisons, swaps, insertions and extractions**, where applicable.
5. **Selected batch sequence equality** in an untimed correctness run.

Report median runtime and trial range. Do not claim the heap wins every individual run; timing noise and small datasets may obscure differences.

### Timing procedure

For each algorithm and dataset size:

1. Generate the input outside the timed region.
2. Use fresh, independent batch objects for each strategy.
3. Construct the data structure outside the extraction timer; separately time and report construction/building.
4. Run one warm-up trial.
5. Run seven measured trials.
6. Measure with Java System.nanoTime().
7. Run no console output, file I/O, CSV writing, graph creation, random generation, or correctness-oracle scan inside the timed region.
8. Report the median of the seven measured trials, along with the minimum and maximum.
9. Keep the machine, JDK version, power mode and other running workload as consistent as reasonably possible.

Operation counters can add overhead. Prefer one timing mode with counters disabled and one separate instrumentation mode for counting operations. State this in the report.

### Structure experiment output

Produce one CSV row per algorithm, dataset size, and measured trial, including:

- dataset size n
- workload size m
- algorithm
- seed
- trial number
- build time
- extraction time
- comparator/operation counts from the instrumented run
- selected-sequence equivalence status from the separate correctness run

Do not put invented or pre-filled timing values into the CSV.

## 4. Experiment B — Policy effect

### Question

Under the same controlled inventory arrivals and demand, how do FEFO and FIFO differ in fulfilled demand, shortfall, expired quantity, and final unexpired stock?

### Policies

- **FEFO:** always choose the earliest-expiring eligible batch, using the frozen total order.
- **FIFO:** choose the oldest-received eligible batch, breaking same-day ties by batch ID.

FEFO is implemented with the Min-Heap; FIFO is implemented with an arrival-ordered queue. FIFO queue operations themselves may be O(1), but removing expired entries that are inside the queue can require a linear filtering pass. Do not describe overall FIFO allocation or expiry maintenance as unconditionally O(1).

### Simulation sizes and repetitions

Use 1,000, 5,000, and 10,000 batches for the policy experiment. The structure benchmark separately covers up to 100,000 batches.

For each size, generate at least 10 fixed seeds and run these target total demand/supply ratios:

- 50%
- 80%
- 100%

These ratios describe total requested quantity over the full trace, not a promise that each daily request can be fulfilled.

### Generate one immutable event trace

For each seed and scenario, generate arrivals and demands once, then replay that exact trace against independent copies of both policies.

Each arrival contains:
- batch ID
- integer quantity
- received day
- expiry day

Each demand contains:
- day
- integer requested quantity

Requirements:
- Demand is exogenous and does not react to prior allocations or shortfalls.
- Shortfalls are recorded and are not re-queued.
- The same batches, arrival order, quantities, expiry days, demand dates and quantities go to both policies.
- Use varied shelf lives for scenarios where FEFO and FIFO can differ.
- Include a control scenario where expiry order follows arrival order; FEFO and FIFO should agree on selection when all other tie rules align.
- Use a documented fixed seed for reproducibility.

A practical synthetic trace can use a 30–40 day horizon, arrivals spread over the early part of the horizon, varied positive shelf lives, integer batch quantities, and daily demand totals generated to meet the selected overall ratio. Choose the horizon so expiries are processed before the final report; report remaining unexpired stock separately if any remains.

### Fixed daily event order

Every simulation day must use this order:

1. Add that day's arrivals.
2. Account for and remove batches that became expired, using the strict rule today > expiryDay.
3. Process that day's demand requests.

Because the rule is strict, a batch with expiryDay equal to today may still be allocated on that day.

### Independent waste accounting

The simulation coordinator must use the same accounting routine for each policy.

At the expiry event, before strategy-specific removal:
- inspect the policy's remaining batch state;
- if a batch is ACTIVE, has positive remaining quantity, and today > expiryDay, record that remaining quantity as expired waste exactly once;
- mark that batch EXPIRED;
- remove it from the policy's active structure while preserving the policy's remaining ordering rules.

The FEFO heap can purge expired roots because expiry is the first heap key. The FIFO baseline must filter any expired entries wherever they occur and preserve the relative order of remaining eligible entries. The linear implementation must remove expired entries using the same expiry boundary.

Do not calculate waste as “number of items the heap popped.” That would measure implementation behavior rather than the stock quantity that actually expired.

### Policy metrics

For each run, record:

- total arriving quantity
- total requested quantity
- fulfilled quantity
- shortfall quantity
- expired/wasted quantity
- unexpired remaining quantity at the end
- completed request count
- FIFO priority-inversion count and rate

**Priority inversion** is a diagnostic: a FIFO allocation is an inversion when another currently eligible batch with an earlier expiry existed at the moment the FIFO allocation was made. It is defined using the FEFO rule, so label it as a diagnostic rather than an independent proof that FEFO is superior.

Do not claim that FEFO must reduce waste in every workload. With aligned arrival and expiry order, both policies may have the same outcomes. Report the simulation assumptions with the outcomes.

## 5. Correctness tests, not performance metrics

“FEFO priority correctness” is a correctness criterion, not a useful performance metric. The heap will be checked against the linear oracle for every allocation decision in differential tests. Also run a Min-Heap invariant test after structural changes in test/debug mode.

Report:
- total differential decisions checked
- mismatches
- heap invariant failures
- edge cases passed/failed

Expected acceptance result is zero mismatches and zero invariant failures. Do not call this an empirical model accuracy score.

## 6. Required edge-case scenarios

The test suite must cover:

1. Empty inventory.
2. One batch.
3. Different expiry days.
4. Equal expiry days.
5. Equal expiry and receipt day, resolved by batch ID.
6. Expiry-day boundary: today equals expiry day.
7. Expired boundary: today is after expiry day.
8. One or more expired heap roots.
9. Partial allocation that leaves quantity positive.
10. Allocation that exactly exhausts a batch.
11. Request larger than eligible stock.
12. Duplicate batch ID.
13. Zero and negative quantity rejection.
14. Expiry earlier than receipt day.
15. No eligible stock after expiry cleanup.
16. Repeated allocation requests.
17. Control simulation where FIFO and FEFO agree.
18. Scenario where FIFO consumes later-expiring stock while an earlier-expiring eligible batch exists.
19. Reproducibility: same seed produces identical trace and outcome.
20. Independent waste accounting counts each expired remaining quantity once.

## 7. Recommended graphs and tables

At minimum, prepare these report artifacts after real experiments:

1. Median extraction time vs batch count: linear FEFO and heap FEFO.
2. Comparator count vs batch count: linear FEFO and heap FEFO.
3. Initial build time vs batch count.
4. Observed speedup (linear time divided by heap time) vs batch count, with actual values.
5. Expired quantity by policy and demand/supply ratio.
6. Fulfilled quantity and shortfall by policy.
7. Remaining unexpired quantity by policy.
8. Results summary across seeds (mean and standard deviation for policy metrics).
9. Correctness/edge-case test summary.

Use actual measured values only. Do not fit a theoretical complexity curve to a handful of points or present a synthetic expected outcome as a measured result.

## 8. Reproducibility record

Every final result set must include:

- Git commit or source version
- JDK version
- OS and relevant machine details
- dataset size
- seed
- m for structure benchmark
- demand/supply ratio and horizon for policy simulation
- number of timing warm-ups and measured trials
- timing statistic reported
- whether operation counters were enabled

## 9. Acceptance criteria

The benchmark is ready for the report only when:

- FEFO heap and linear FEFO produce identical choices for identical traces.
- Heap invariant tests pass.
- All tested policies use identical inputs per scenario.
- Waste is accounted independently and once per batch.
- The expiry boundary and day-event order are consistent.
- Timed sections contain no I/O or graph creation.
- Runtime and operation-count runs are separated where instrumentation changes runtime.
- Results are exported and reproducible from documented seeds.
- Limitations and simulation assumptions are reported honestly.
