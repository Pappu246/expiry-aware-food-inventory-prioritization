# Architecture

## 1. Architecture decision

The MVP is an in-memory Java 17+ command-line application. It has no database server, web server, external API, or cloud dependency. The core is a custom binary Min-Heap used by the FEFO policy. The visual interface is deliberately secondary.

The architecture supports three separate implementations for controlled experiments:

1. Heap-based FEFO — proposed data structure.
2. Linear-scan FEFO — same policy, different selection structure; also the correctness oracle.
3. FIFO — different stock-rotation policy; used only for the policy simulation.

Do not compare the three as if all were interchangeable speed competitors.

## 2. High-level component diagram

~~~text
                 CLI / Test / Benchmark Runner
                              |
                 Batch data and event trace
                              |
                  +-----------+-----------+
                  |                       |
             FEFO heap policy       Linear FEFO policy
                  |                       |
             Custom Min-Heap          Unsorted List
                  |                       |
                  +-----------+-----------+
                              |
                       Allocation Results
                              |
                  Differential Correctness Check

    Separate policy simulation:
    Immutable arrivals + exogenous demand + fixed day order
                    |                         |
               FEFO policy               FIFO policy
                    |                         |
                    +------------+------------+
                                 |
                     Shared expiry/accounting rules
                                 |
                Waste / fulfillment / shortfall results
                                 |
                           CSV exports
~~~

## 3. Technology choices

- **Language:** Java 17 or a later compatible LTS JDK.
- **Build:** minimal Maven project.
- **Tests:** JUnit 5 if dependency retrieval is available; core behavior must remain testable with a standard local build.
- **Runtime dependencies:** Java standard library only.
- **Persistence:** in-memory only for the MVP; CSV export for generated results.
- **Interface:** command-line demo.
- **Charts:** use exported CSV with a spreadsheet tool or a small optional plotting script. Chart generation must never be included in benchmark timing.

Do not add a web framework, database server, dependency-injection framework, or charting framework to the MVP.

## 4. Proposed source layout

~~~text
expiry-aware-food-inventory-prioritization/
├── README.md
├── PROJECT_SPEC.md
├── ARCHITECTURE.md
├── BENCHMARK_PROTOCOL.md
├── pom.xml
├── .gitignore
├── src/
│   ├── main/
│   │   └── java/
│   │       └── edu/vgu/fefo/
│   │           ├── app/
│   │           │   └── CliApp.java
│   │           ├── model/
│   │           │   ├── FoodBatch.java
│   │           │   ├── BatchStatus.java
│   │           │   ├── AllocationResult.java
│   │           │   └── AllocationLine.java
│   │           ├── ds/
│   │           │   └── MinHeap.java
│   │           ├── engine/
│   │           │   ├── InventoryPolicy.java
│   │           │   ├── FefoHeapPolicy.java
│   │           │   ├── LinearFefoPolicy.java
│   │           │   ├── FifoPolicy.java
│   │           │   └── BatchOrder.java
│   │           ├── simulation/
│   │           │   ├── EventTrace.java
│   │           │   ├── DatasetGenerator.java
│   │           │   ├── SimulationRunner.java
│   │           │   ├── WasteLedger.java
│   │           │   └── SimulationSummary.java
│   │           └── benchmark/
│   │               ├── BenchmarkRunner.java
│   │               ├── OperationCounters.java
│   │               ├── BenchmarkResult.java
│   │               └── CsvExporter.java
│   └── test/
│       └── java/
│           └── edu/vgu/fefo/
│               ├── ds/MinHeapTest.java
│               ├── engine/FefoDifferentialTest.java
│               ├── engine/AllocationEdgeCasesTest.java
│               └── simulation/SimulationReproducibilityTest.java
└── results/
    └── (generated CSV results; commit only final selected results)
~~~

The implementation agent may make small naming adjustments to fit clean Java conventions, but it must preserve the component boundaries and behavior defined in the specification.

## 5. Components and responsibilities

### 5.1 FoodBatch and BatchStatus

FoodBatch represents one batch within one homogeneous product pool.

Immutable fields:
- batch ID
- received day
- expiry day
- descriptive item label

Mutable fields:
- remaining integer quantity
- status

Statuses:
- ACTIVE
- EXHAUSTED
- EXPIRED

A batch quantity is decremented in place. When the quantity reaches zero, status becomes EXHAUSTED and the batch is removed from the active priority structure. The ID registry retains the ID so duplicate IDs are rejected rather than silently reused.

### 5.2 BatchOrder

BatchOrder defines the one allowed deterministic total order:

1. expiry day ascending
2. received day ascending
3. batch ID lexicographically ascending

Expiry day, received day, and batch ID are immutable. No dynamic score is used as the heap key.

### 5.3 MinHeap

MinHeap is a custom array-backed binary Min-Heap. It must implement:

- insert
- peek minimum
- extract minimum
- size and empty checks
- an invariant checker for tests

It must not be replaced by Java's built-in PriorityQueue.

The heap stores references to the same FoodBatch objects held by that policy's ID registry. No duplicated batch snapshots are allowed in the active heap.

The heap does not support arbitrary deletion or priority-key mutation. The MVP does not need either operation: allocations always consume the root, and ordering fields are immutable.

### 5.4 FEFO heap policy

FefoHeapPolicy owns:
- the custom Min-Heap
- a HashMap from batch ID to the batch object
- minimal counters and transaction/allocation output

Operations:
- insert a validated batch
- look up a batch by ID
- find the earliest eligible batch
- allocate a requested integer quantity
- remove expired root entries before selecting stock

Because the heap key is expiry-first, every expired batch is at the front of the heap order. Repeatedly remove the root while today is later than its expiry day. If the root is not expired, no later heap entry can be expired under the same expiry rule.

When a root batch is partially allocated, decrement its quantity in place. Its priority key is unchanged, so do not remove and reinsert it. If its quantity reaches zero, extract it.

### 5.5 Linear FEFO policy

LinearFefoPolicy applies the exact same eligibility rule and total-order key as the heap policy but selects the minimum by scanning an unsorted list.

It is the correctness oracle for differential tests. Given the same state and request trace, it must choose the same sequence of batch IDs and fulfill the same quantities as FefoHeapPolicy.

For the timing experiment, remove a selected record from the unsorted list with swap-with-last removal after the scan, so list shifting does not add unrelated O(n) cost to the selection measurement. This is an internal benchmark detail; explain it in the report.

### 5.6 FIFO policy

FifoPolicy allocates from the oldest received eligible batch, resolving same-day arrival ties by batch ID. It uses a queue only as the baseline's representation of arrival order.

At the start of each simulated day, an expired batch may be in the middle of the FIFO queue because expiry order can differ from arrival order. The baseline must therefore filter expired entries while preserving the relative arrival order of eligible entries. This maintenance pass can be O(n); policy simulation results are not a pure FIFO-vs-heap speed contest.

FIFO is used to compare stock-rotation outcomes, not to prove that a heap is faster than a queue.

### 5.7 ID registry and single source of truth

Each policy instance has its own HashMap of batch IDs to its own batch objects. The heap/list/queue for that policy references those same objects. Different policies use separate copies of the same initial batch data so a run of one policy cannot mutate another policy's state.

The registry retains exhausted and expired IDs for duplicate rejection and test inspection.

### 5.8 Simulation runner and EventTrace

EventTrace is immutable after generation and holds:
- batch arrivals (batch ID, quantity, received day, expiry day)
- demand events (day, integer requested quantity)
- seed and workload metadata

SimulationRunner replays the same trace against each policy. Demand is exogenous and shortfalls are not re-queued. Day order is fixed:
1. arrivals
2. expiry accounting and removal
3. demands

### 5.9 WasteLedger

WasteLedger uses one shared accounting rule for every strategy. At the expiry event, remaining quantity is recorded as waste exactly once when today is later than expiry day. Accounting is done before strategy-specific removal, and the simulation reports expired quantity separately from unexpired stock remaining at the end.

Do not calculate waste by counting how many records a policy happened to purge from its heap or queue. That would bias the policy comparison.

### 5.10 BenchmarkRunner and OperationCounters

BenchmarkRunner runs the structure experiment independently from the policy simulation. It:
- creates reproducible input traces
- warms up the JVM
- runs multiple measured trials
- records aggregate elapsed time and median
- exports results after the timed region

OperationCounters record comparisons and structural operations in a separate instrumented run where practical. Avoid counting instrumentation overhead as if it were pure runtime.

### 5.11 CLI

The CLI is intentionally small. It can:
- load or generate a batch scenario
- insert a batch
- display the earliest eligible batch
- request allocation
- show fulfilled quantity and shortfall
- run the benchmark
- run the policy simulation
- export CSV results

No login, database, web UI, or real-world donation workflow is required.

## 6. Core API contract

Use a small consistent contract rather than creating a large service layer.

~~~text
InventoryPolicy
  addBatch(FoodBatch batch)
  findEarliestEligible(today)
  allocate(requestedQuantity, today) -> AllocationResult
  removeExpiredBefore(today)
  snapshotForAccounting()
~~~

Names may be adjusted to valid Java signatures. The behavioral contract may not change without updating PROJECT_SPEC.md and BENCHMARK_PROTOCOL.md.

AllocationResult must include:
- requested quantity
- fulfilled quantity
- shortfall quantity
- allocation lines (batch ID and allocated quantity)
- a clear empty/partial/full outcome

## 7. Key invariants

1. A batch ID is unique within one policy instance.
2. Expiry day, received day, and batch ID never change after insertion.
3. Quantity is never negative.
4. An EXHAUSTED batch has quantity zero and is absent from its active priority structure.
5. An EXPIRED batch is never allocated.
6. An ACTIVE batch in a policy's eligible index has positive quantity.
7. The custom heap satisfies parent <= child for BatchOrder.
8. Heap policy and linear FEFO policy choose the same eligible minimum.
9. No demand or batch-arrival event is changed based on policy output.
10. Waste is counted once by the shared simulation accounting rules.

## 8. Complexity reference

| Operation | Expected/worst-case claim |
|---|---|
| Custom heap insertion | O(log n) worst case |
| Heap peek | O(1) when root is valid |
| Heap extract-min | O(log n) |
| HashMap lookup | O(1) expected; O(n) worst case |
| Linear FEFO selection | O(n) per selection |
| FIFO enqueue/dequeue | O(1) queue operation |
| FIFO expired-item filtering pass | O(n) in the number of queued batches |
| Heap bulk heapify, if implemented | O(n) |
| Repeated heap insertion for initial build | O(n log n) |

An allocation can consume several batches or purge several expired roots; do not describe every allocation as O(log n). State complexity in terms of the number of batches exhausted and expired during that request.

## 9. Architecture decision guardrails

Do not add a data structure or module merely to make the project appear more advanced. Any proposed change must pass all three tests:

1. It solves a requirement that is already in the frozen project scope.
2. It has a clear correctness/performance reason.
3. It does not invalidate the benchmark protocol or the 7-day delivery target.

If implementation uncovers a genuine contradiction, stop and report the contradiction rather than silently expanding the architecture.
