# Project Specification

## Project identity

- **Title:** Expiry-Aware Food Inventory Prioritization Engine Using Data Structures
- **Academic focus:** Data Structures and Algorithms
- **Language:** C11
- **Application type:** Local command-line prototype with controlled benchmarks
- **External/runtime dependencies:** None; standard C library only
- **Scope:** Frozen MVP. Any change must be justified, reviewed, and reflected in all specification documents.
- **Deadline context:** Finish implementation and experiments early, leaving a buffer before 12 November 2026.

## 1. Problem statement

Food inventory may contain batches with different receipt and expiry dates. Staff need to find the earliest-expiring eligible batch quickly and allocate stock consistently according to FEFO (First Expire, First Out).

The prototype implements FEFO using a custom binary Min-Heap. It compares that implementation with an unsorted linear-scan implementation of the same FEFO rule. A separate FIFO baseline studies the operational effect of selecting stock by arrival order instead of expiry order.

The project does not claim to eliminate food waste or improve a real institution's outcomes. It measures data-structure performance and stock-rotation outcomes under declared, controlled simulation assumptions.

## 2. Research questions

1. For the same FEFO selection policy, how does a custom Min-Heap compare with an unsorted linear scan for selecting and allocating the earliest-expiring batch?
2. Under identical controlled arrivals and demand, how do FEFO and FIFO differ in expired quantity, fulfilled demand, shortfall, and remaining unexpired stock?

## 3. Goals

1. Implement an array-backed binary Min-Heap manually in C11.
2. Implement a small custom hash table for batch-ID lookup and duplicate-ID rejection.
3. Implement FEFO allocation, partial fulfillment, and consistent expiry semantics.
4. Build a linear-scan FEFO baseline that acts as an independent correctness oracle.
5. Build a FIFO baseline for the separate policy simulation.
6. Measure runtime with a monotonic/high-resolution timing facility where supported and count operations separately.
7. Replay identical immutable event traces for every policy, with reproducible seeds and independent waste accounting.
8. Export machine-readable CSV results and create report-ready graphs/tables.
9. Prepare the report, presentation, and viva notes from actual implementation and results.

## 4. Non-goals

The MVP will not implement a commercial inventory system, ERP, donation marketplace, NGO matching, recipient recommendation, GPS, road routing, AI/ML, demand forecasting, barcode hardware, mobile application, web application, authentication, cloud deployment, database server, food-safety certification, cold-chain monitoring, allergen handling, recall handling, complex multi-SKU allocation, or a large user interface.

## 5. Operating assumptions

1. **One homogeneous stock pool per run.** Quantities within one run are interchangeable units of the same product or approved product pool. Multi-SKU allocation is out of scope.
2. A batch is eligible exactly when its status is ACTIVE, its remaining quantity is greater than zero, and today is not later than its expiry day.
3. A batch is expired exactly when **today > expiryDay**. It remains eligible on expiryDay and becomes expired from the next day onward.
4. The application uses recorded dates and quantities only. It does not determine whether food is physically safe.
5. All simulation strategies receive the same immutable arrival and demand trace.
6. Requests are exogenous: future demand does not change according to a policy's earlier outcome. Shortfalls are recorded and are not re-queued.
7. The simulation day order is fixed: arrivals, expiry accounting/removal, then demand.
8. Batch ID, received day, and expiry day are immutable after insertion.
9. Quantities are positive integers at insertion and reduced using integer arithmetic.
10. Synthetic data is labelled as synthetic. Results from synthetic simulations are not reported as real-world savings.

## 6. FoodBatch model

Each batch contains:
- batch ID: unique immutable string stored in a bounded character array.
- item name: descriptive label; all batches in one run are interchangeable.
- remaining quantity: positive integer while active.
- received day: immutable integer day value.
- expiry day: immutable integer day value.
- status: ACTIVE, EXHAUSTED, or EXPIRED.

Validation:
- Reject blank or overlong IDs.
- Reject duplicate batch IDs.
- Reject zero/negative quantities.
- Reject expiry day earlier than received day.
- Reject already-expired batches when adding to the live demo.
- Keep IDs registered after a batch is exhausted/expired so IDs cannot be silently reused.
- The heap and hash table refer to the same FoodBatch object/pointer; no stale copies.
- Document capacities for fixed character arrays and reject values that exceed them rather than truncate silently.

Generated data uses integer day values relative to a documented simulation start day. The CLI may accept human-readable dates and convert them to/from day values, but benchmarks use integers.

## 7. Frozen priority order

Use one deterministic total-order key:
1. Earlier expiry day.
2. Earlier received day.
3. Lexicographically smaller batch ID.

Do not add dynamic risk/perishability scores to the heap key. The final tie-break makes behavior deterministic because a heap is not stable for equal keys.

## 8. Required behavior

### Batch operations

- Add a valid batch.
- Reject duplicate IDs and invalid input.
- Look up a batch by ID.
- Show the earliest eligible batch.
- Return a clear no-stock result when nothing eligible remains.

### FEFO allocation

For a positive integer request:
1. Purge expired batches at the heap root while today is later than expiryDay.
2. If no eligible batch remains, return fulfilled quantity 0 and the full request as shortfall.
3. Allocate from the earliest-expiring eligible batch.
4. Decrement the batch quantity in place.
5. If quantity reaches zero, extract that batch and mark it EXHAUSTED.
6. If quantity remains positive, leave it at the root; its priority key is unchanged.
7. Continue until the request is fulfilled or no eligible stock remains.
8. Return allocation lines, fulfilled amount, and shortfall.

No backorders are implemented. Partial fulfillment is allowed. Temporary holds are out of scope. Waste must not be counted differently between strategies just because they remove expired items differently.

## 9. Required data structures

- **Custom binary Min-Heap:** primary FEFO structure; supports insert, peek-min, extract-min, size/empty, and invariant validation.
- **Custom hash table:** maps batch ID to the same FoodBatch pointer; supports expected fast lookup and duplicate rejection. Use open addressing with linear probing and grow/rehash before the load factor exceeds 0.70. There are no map deletions in the MVP; IDs remain reserved after exhaustion.
- **Unsorted dynamic array/list:** used by the linear FEFO baseline and correctness oracle.
- **FIFO queue:** used only by the FIFO policy baseline; not part of the heap-based FEFO engine.
- **Minimal in-memory event records:** for reproducibility and shared accounting, not a full transaction-history subsystem.

Do not add Stack, Graph, balanced tree, or other structures merely to make the project look more advanced.

## 10. Baselines and experiments

### Experiment A — Structure effect

Compare FEFO with a Min-Heap against FEFO with an unsorted linear scan. Both implement the same priority rule and must produce identical allocation choices for identical inputs.

Measure aggregate operation time, comparison count, and selected batch sequence. The linear version is the differential correctness oracle.

### Experiment B — Policy effect

Compare FEFO with FIFO under the same arrivals, demand, day order, and expiry boundary. Measure simulated expired quantity, fulfilled quantity, shortfall, and remaining unexpired stock. This is not a pure speed contest; queue operations can be O(1), but filtering expired items within FIFO can require a linear pass.

## 11. Correctness and quality requirements

- Heap invariant tests pass.
- Heap FEFO and linear FEFO choose the same eligible minimum.
- Expired and exhausted batches are never allocated.
- Equal expiry/receipt keys are resolved by batch ID.
- Partial allocation does not reinsert an unchanged key.
- Duplicate IDs are rejected.
- Empty inventory and shortfall are explicit.
- Waste is counted once via shared simulation accounting.
- Fixed-seed results are reproducible.
- Malformed simulation traces are rejected before processing when event order, day ranges, bounded strings, demand quantities, metadata totals, or policy values are invalid.
- No made-up or hard-coded performance values are presented as measured findings.
- All allocations and memory are checked for failure where appropriate; owned memory is freed.

## 12. Food-safety boundary

This is a scheduling/prioritization prototype, not a food-safety decision system. It operates on inventory records already deemed eligible by responsible staff and uses a simplified hard expiry boundary for simulation. It does not evaluate temperature history, opened packages, allergens, recalls, handling practices, or the legal status of a donation. Real use would require trained staff and applicable food-safety procedures.

## 13. Deliverables

1. C11 source code for the custom Min-Heap, hash table, and FEFO engine.
2. Linear-scan FEFO and FIFO baselines.
3. Dependency-free C test harness and edge/differential tests.
4. Reproducible synthetic data generator.
5. Benchmark runner and controlled policy simulator.
6. CSV result exports and report-ready tables/graphs.
7. README, architecture, benchmark protocol, test evidence, and limitations.
8. A 20–25-page A-6 report, presentation, and viva preparation.

### Implementation and submission status

At the audited branch head, the repository contains the C11 CLI, custom heap/hash-table engine, linear FEFO baseline, FIFO simulation, thirteen-test harness with INT_MAX boundary cases, test-only allocation-failure injection, CI, raw/summary benchmark CSV export and the full 10-seed / three-ratio policy experiment command. The generated report, slide deck, viva notes and figures are available separately in the submission package. Instrumented comparator/operation counts are now exported separately. Controlled one-shot allocation-failure injection and INT_MAX quantity/day-boundary tests are implemented as a separate CI gate; the 12-seed randomized differential suite and sanitizer CI step remain enabled. The audit branch is intentionally not merged into dev/main. Faculty-specific report/template compliance still needs confirmation.

## 14. Source context

The real-world motivation is informed by FSSAI's surplus-food regulations and catering guidance. These sources support expiry-aware records and timely handling; they do not mean this prototype certifies food safety.

- FSSAI, Food Safety and Standards (Recovery and Distribution of Surplus Food) Regulations, 2019: https://fssai.gov.in/upload/uploadfiles/files/Gazette_Notification_Surplus_Food_06_08_2019.pdf
- FSSAI, Guidance Document for Catering Sector: https://fssai.gov.in/upload/uploadfiles/files/Guidance_Document_Catering_Sector_19_01_2018.pdf
- FAO, Food Loss and Food Waste: https://www.fao.org/policy-support/policy-themes/food-loss-and-food-waste/en
