# Architecture

## 1. Architecture decision

The MVP is a dependency-free C11 command-line program. It has no database, web server, external API, or cloud runtime dependency. A custom array-backed binary Min-Heap implements FEFO. The primary academic contribution is the DSA engine and fair benchmark, not the interface.

Three policy/selection implementations are kept separate:
1. Heap FEFO — proposed data structure.
2. Linear-scan FEFO — same policy, different selection structure and correctness oracle.
3. FIFO — different stock-rotation policy used for the operational simulation.

Do not compare all three as interchangeable speed competitors.

## 2. Component diagram

~~~text
                CLI / Test / Benchmark Runner
                             |
                Batch data / immutable event trace
                             |
                 +-----------+-----------+
                 |                       |
            Heap-based FEFO         Linear-scan FEFO
                 |                       |
             Custom Min-Heap        Unsorted dynamic array
                 |                       |
                 +-----------+-----------+
                             |
                 Allocation results / oracle

 Separate policy simulation:
 Same arrivals + same exogenous demand + fixed day ordering
                 |                           |
             FEFO policy                 FIFO policy
                 |                           |
                 +-------------+-------------+
                               |
                   Shared expiry/waste ledger
                               |
                Waste / fulfillment / shortfall
                               |
                         CSV exports
~~~

## 3. Language and build

- **Language standard:** ISO C11.
- **Compiler target:** GCC or Clang; MSVC can be supported only if the selected code path remains C11-compatible.
- **Dependencies:** standard C library only; no third-party test framework.
- **Build/test on Windows:** a PowerShell script invokes a C compiler such as GCC. The compiler must be installed and available on PATH.
- **Build/test on Linux/macOS:** GCC or Clang can compile the same sources with C11 warnings enabled.
- **Interface:** command-line only.
- **Charts:** export CSV and make charts separately; charting is never timed.

The repository must not use Java, Maven, Python, or an external C runtime package as part of the application. A separate optional charting tool may be used to visualize exported results but is not part of the engine.

## 4. Proposed source layout

~~~text
expiry-aware-food-inventory-prioritization/
├── README.md
├── PROJECT_SPEC.md
├── ARCHITECTURE.md
├── BENCHMARK_PROTOCOL.md
├── .gitignore
├── build.ps1
├── include/
│   └── fefo/
│       ├── food_batch.h
│       ├── min_heap.h
│       ├── hash_table.h
│       ├── policy.h
│       ├── event_trace.h
│       ├── waste_ledger.h
│       └── benchmark.h
├── src/
│   ├── food_batch.c
│   ├── min_heap.c
│   ├── hash_table.c
│   ├── fefo_heap.c
│   ├── fefo_linear.c
│   ├── fifo_policy.c
│   ├── event_trace.c
│   ├── waste_ledger.c
│   ├── simulation.c
│   ├── benchmark.c
│   └── main.c
├── tests/
│   └── test_main.c
└── results/
    └── (generated CSV outputs)
~~~

Keep the module count small. The implementation agent may adjust file names slightly if needed, but it must preserve the frozen behavior and boundaries.

## 5. Core models and memory ownership

### FoodBatch

A FoodBatch stores:
- bounded batch ID string
- bounded descriptive item name
- integer remaining quantity
- immutable received day
- immutable expiry day
- ACTIVE, EXHAUSTED, or EXPIRED status

Use documented character capacities and reject overlong input; never silently truncate IDs. Allocate FoodBatch objects once and maintain explicit ownership. The owning inventory/policy frees each object exactly once. Heap, hash table, list, and queue entries contain non-owning pointers to that same object.

### Comparator

One deterministic total order:
1. expiry day ascending
2. received day ascending
3. batch ID lexicographically ascending

The key is immutable after insertion. The comparator must be used by both heap and linear FEFO to avoid inconsistent choices.

### Custom Min-Heap

Use a dynamically resized array of FoodBatch pointers. Implement:
- insert
- peek-min
- extract-min
- size / empty
- heap invariant validation for tests

Do not use an existing priority-queue implementation. Check allocation failures before modifying the data structure, and avoid corrupting the heap if memory allocation fails.

The heap does not support arbitrary deletion or changing priority keys. These operations are not required: allocation consumes only the root and priority fields do not change.

### Custom hash table

Use open addressing with linear probing and dynamic resizing. Each occupied slot refers to the same FoodBatch object that is held by the policy's active structure. Rehash when the planned insertion would exceed a load factor of 0.70. No deletions are needed in the MVP, because IDs remain registered after exhaustion/expiry and therefore cannot be reused.

Document the hash function and collision strategy. Validate duplicate IDs before inserting into the heap/list.

### FEFO heap policy

Owns:
- custom Min-Heap
- custom hash table mapping ID to FoodBatch pointer
- minimal allocation result records/counters

Operations:
- insert validated batch
- lookup by ID
- identify earliest eligible batch
- allocate requested integer quantity
- purge expired roots before allocation

For expiry, repeatedly remove the heap root while today > expiry day. If root is not expired, no later heap entry can be expired because expiry day is the first key. Mark purged batches EXPIRED and report them to shared simulation accounting.

On partial allocation, decrement quantity in place. Since heap ordering fields do not change, leave the batch at root. When quantity reaches zero, extract it and mark EXHAUSTED.

### Linear FEFO baseline

Store a dynamic array of batch pointers. For each selection, scan eligible entries and return the minimum using the exact same comparator. This acts as the correctness oracle. During the timed structure experiment, remove the selected record by swap-with-last to avoid measuring array shifting as an unrelated cost.

### FIFO baseline

The simulator stores FIFO batches in an arrival-ordered dynamic array, breaking same-day ties by batch ID. FIFO is only used for the policy experiment. When a batch is exhausted at the front, this implementation shifts remaining pointers, so front removal is O(n); expiry maintenance also filters expired entries wherever they occur while preserving order and may be O(n). Do not describe this array implementation as providing O(1) dequeue.

### Immutable event trace and simulation

Generate arrivals and demand events once per seed. Each policy run receives a deep-cloned initial state and the same immutable trace. Demand does not respond to prior fulfillment/shortfalls, and shortfalls are not re-queued.

Each simulation day follows:
1. Process arrivals.
2. Account and remove batches for which today > expiry day.
3. Process demand.

### Shared waste ledger

Use one shared accounting rule for every policy. At the expiry event, record the remaining positive quantity of each expired active batch exactly once, then mark it EXPIRED. Do not count waste by the number of heap or queue removals; that would bias results.

### Benchmark runner

Run structure timing separately from policy simulation. Use a high-resolution timer available in the target C environment (for example, QueryPerformanceCounter on Windows or clock_gettime on POSIX) behind a small portable timer interface. If only a lower-resolution timer is available, aggregate many operations and disclose the timer used.

Warm up, repeat trials, record median and range, and keep input generation, correctness comparison, logging, file output, and chart generation outside timed regions. Run operation counters separately when counters would materially change timing.

### CLI

Keep it small:
- load/generate scenario
- add batch
- show earliest eligible batch
- request allocation
- display fulfilled quantity and shortfall
- run structure benchmark
- run policy simulation
- export CSV

No login, database, web UI, or live donation flow is required.

## 6. Function contract

Expose a small consistent interface, adapted to C header/source conventions:

~~~text
fefo_heap_add_batch(...)
fefo_heap_find_earliest(...)
fefo_heap_allocate(...)
fefo_heap_purge_expired(...)

linear_fefo_add_batch(...)
linear_fefo_find_earliest(...)
linear_fefo_allocate(...)

fifo_add_batch(...)
fifo_allocate(...)

min_heap_insert(...)
min_heap_peek(...)
min_heap_extract_min(...)
min_heap_is_valid(...)
~~~

Use explicit status/result structs and return error codes for invalid inputs, duplicate IDs, and allocation failures. Avoid hidden global state.

Allocation results should include requested quantity, fulfilled quantity, shortfall, allocation lines, and a full/partial/empty outcome.

## 7. Key invariants

1. Batch IDs are unique within a policy instance.
2. Expiry day, received day, and ID never change after insertion.
3. Quantity is never negative.
4. An EXHAUSTED batch has zero quantity and is absent from its active policy structure.
5. An EXPIRED batch is never allocated.
6. An ACTIVE batch in the eligible index has positive quantity.
7. The heap satisfies parent <= child under the frozen comparator.
8. Heap FEFO and linear FEFO choose the same eligible minimum.
9. No policy changes the shared demand or arrival trace.
10. Waste is counted once by shared simulation rules.
11. Owned C allocations are freed exactly once; no use-after-free or double-free.

## 8. Complexity reference

| Operation | Expected/worst-case claim |
|---|---|
| Custom heap insertion | O(log n) worst case |
| Heap peek | O(1) when root is valid |
| Heap extract-min | O(log n) |
| Open-addressed hash lookup | Expected O(1) at controlled load factor; worst case O(n) |
| Linear FEFO selection | O(n) per selection |
| FIFO append | Amortized O(1) array append (excluding ID-map growth) |
| FIFO exhausted-front removal | O(n) pointer shifting in the arrival-ordered array |
| FIFO expiry filter | O(n) in queued batch count |
| Heapify, if used | O(n) |
| Repeated insertion initial build | O(n log n) |

An allocation may exhaust several batches and purge several expired roots; do not describe every allocation as O(log n). State complexity in terms of batches consumed and expired during that request.

## 9. Change guardrails

Do not add a data structure or feature merely to make the project look more advanced. A proposed change must solve a frozen requirement, have a correctness/performance reason, and not invalidate the benchmark protocol or the early finish target. If a real contradiction is discovered, report it before changing the design.
