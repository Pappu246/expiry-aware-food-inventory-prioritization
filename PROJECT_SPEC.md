# Project Specification

## Project identity

- **Title:** Expiry-Aware Food Inventory Prioritization Engine Using Data Structures
- **Course:** UGCSE201 — Data Structures
- **Project type:** Single-student academic prototype and controlled benchmark
- **Implementation target:** Java 17+ with a minimal Maven build
- **Status:** Scope frozen for MVP; changes require an explicit review
- **Official A-6 completion deadline:** 12 November 2026
- **Internal target:** Core engine and benchmark results by 16 October 2026; academic package targeted by 18 October 2026, subject to testing and actual progress

## 1. Problem statement

Food inventory can contain multiple batches of the same product with different receipt and expiry dates. Staff need to identify the earliest-expiring eligible batch quickly and allocate stock in a way that respects expiry order.

The prototype implements **FEFO (First Expire, First Out)** with a custom Min-Heap and compares it against an unsorted linear-search implementation of the same FEFO rule. A separate FIFO baseline is used to study the operational effect of choosing stock by receipt order rather than expiry order.

The project does not claim to eliminate food waste or to improve a real institution's outcomes. It measures data-structure performance and stock-rotation outcomes under explicitly controlled simulations.

## 2. Central research question

Can a Min-Heap implementation identify and allocate the earliest-expiring eligible batch more efficiently than a linear scan, while a controlled policy simulation measures the difference between FEFO and FIFO?

## 3. Goals

1. Implement a binary Min-Heap without using Java's built-in PriorityQueue for the proposed engine.
2. Maintain fast batch-ID lookup and duplicate-ID rejection with a Hash Map.
3. Implement FEFO allocation with partial fulfillment and consistent expiry rules.
4. Build a linear-scan FEFO baseline that acts as an independent correctness oracle.
5. Build a FIFO policy baseline for the separate operational simulation.
6. Measure runtime and operation counts without file I/O or console output inside timed regions.
7. Simulate the same arrivals and demand for each policy, with reproducible seeds and independent waste accounting.
8. Produce machine-readable CSV results, graphs, a 20–25-page report, a presentation, and viva preparation.

## 4. Non-goals

The MVP will not implement:

- A commercial inventory-management or ERP system.
- A full food-donation marketplace, NGO matching, or recipient recommendation.
- GPS, road routing, travel-time prediction, or live logistics.
- AI/ML or demand forecasting.
- Barcode hardware, mobile applications, cloud deployment, accounts, or authentication.
- A food-safety certification or inspection system.
- Multiple incompatible product categories in one allocation pool.
- Complex eligibility rules, temporary holds, allergen rules, cold-chain monitoring, or recalls.
- A large web dashboard or an Excel-like interface.

## 5. Operating assumptions

1. **One homogeneous stock pool per run.** Quantities within one run are interchangeable units of the same product or approved product pool. Multi-SKU allocation is out of scope.
2. A batch is eligible exactly when its status is ACTIVE, its remaining quantity is greater than zero, and today is not later than its expiry day.
3. A batch is expired exactly when **today > expiryDay**. It remains eligible on its expiry day in the simulation and is expired from the next day onward.
4. The application uses recorded dates and quantities only. It does not determine whether food is physically safe.
5. All simulation strategies receive the same immutable arrival and demand trace.
6. Requests are exogenous: later demand does not change based on a strategy's earlier outcome. Shortfalls are recorded and are not re-queued.
7. The simulation day order is fixed: arrivals, expiry accounting/removal, then demand.
8. A product's expiry/received-date ordering fields and batch ID are immutable after insertion.
9. Quantities are positive integers at insertion and are reduced using integer arithmetic.
10. Synthetic data is labelled as synthetic. Results from synthetic simulation are not reported as real-world savings.

## 6. Batch model

Each batch contains:

- **batchId:** unique immutable string.
- **itemName:** descriptive label; all batches within a run must belong to the same interchangeable pool.
- **quantity:** remaining integer quantity.
- **receivedDay:** immutable integer day value.
- **expiryDay:** immutable integer day value.
- **status:** ACTIVE, EXHAUSTED, or EXPIRED.

Validation rules:

- Reject blank or duplicate batch IDs.
- Reject non-positive quantities.
- Reject an expiry day earlier than the received day.
- Reject a batch that is already expired on entry to the live demo.
- Keep exhausted/expired IDs in the ID map so an ID cannot silently be reused.
- The heap and ID map must reference the same batch object within an engine. Do not keep stale copies.

For generated data, integer day values are relative to a documented simulation start day. A CLI date can be converted to/from an integer day representation.

## 7. Frozen priority order

Use one deterministic total-order key:

1. Earlier **expiryDay**
2. Earlier **receivedDay**
3. Lexicographically smaller **batchId**

Do not add a risk or perishability score to the heap key. A deterministic tie-break is needed because a heap is not stable for equal keys.

## 8. Required behavior

### Batch operations

- Insert a valid batch.
- Reject duplicate IDs and invalid input.
- Look up a batch by ID.
- Show the earliest eligible batch.
- Show a clear result when no eligible stock exists.

### FEFO allocation

For a positive integer request:

1. Purge expired batches at the heap root while **today > expiryDay**.
2. If no eligible batch remains, return fulfilled quantity 0 and the entire request as shortfall.
3. Allocate from the earliest-expiring eligible batch.
4. Reduce the batch quantity in place.
5. If quantity reaches zero, remove that batch from the heap and mark it EXHAUSTED.
6. If quantity remains, leave it at the heap root; its immutable priority key has not changed.
7. Continue until the request is fulfilled or no eligible stock remains.
8. Return allocated batch IDs, quantities, fulfilled amount, and shortfall.

No backorders are implemented. Partial fulfillment is allowed. Temporary holds are out of scope. Expiry removal must not cause the policy simulation to count waste differently between strategies.

## 9. Required data structures

- **Custom binary Min-Heap:** the primary FEFO structure; supports insert, peek, extract-min, and invariant validation.
- **Hash Map:** maps batch ID to the same batch object; supports expected constant-time lookup and duplicate-ID checks.
- **Unsorted list:** used by the linear-scan FEFO baseline, not as a replacement for the proposed heap.
- **FIFO queue:** used only by the FIFO policy baseline. It is not part of the proposed FEFO engine.
- **In-memory append-only event/transaction records:** minimal evidence for tests and simulation accounting, not a user-facing audit subsystem.

Do not add a Stack, Graph, balanced tree, or another structure merely to demonstrate more DSA.

## 10. Baselines and experiment separation

### Experiment A — Structure effect

Compare **FEFO with a Min-Heap** against **FEFO with an unsorted linear scan**. They implement the same priority rule and must produce the same allocation choices for the same trace. The linear implementation is the differential correctness oracle.

Primary measures: aggregate operation time, comparison count, and selected batch sequence.

### Experiment B — Policy effect

Compare **FEFO** with **FIFO** under the same arrivals, demand, day order, and expiry boundary. This experiment measures simulated expired quantity, fulfilled quantity, shortfall, and remaining unexpired stock. It is not a pure speed contest; FIFO's queue operations can be O(1), while expiry cleanup may require a linear pass.

## 11. Correctness and quality requirements

Before claiming completion:

- Heap invariant tests pass.
- FEFO heap and linear oracle select the same batch at each eligible allocation decision.
- Expired and exhausted batches are never allocated.
- Equal expiry/receipt keys are resolved by batch ID.
- Partial allocation does not reinsert an unchanged key.
- Duplicate IDs are rejected.
- Empty inventory and shortfall are handled explicitly.
- Waste is counted exactly once using the common simulation accounting layer.
- Fixed-seed simulation results are reproducible.
- No invented or hard-coded performance results are presented as experimental findings.

## 12. Food-safety boundary

This is a scheduling/prioritization prototype, not a food-safety decision system. It operates on inventory records already deemed eligible by responsible staff and uses a simplified hard expiry boundary for simulation. It does not evaluate temperature history, opened packages, allergens, recalls, handling practices, or the legal status of a donation. Real use would require trained staff and applicable food-safety procedures.

## 13. Deliverables

1. Java source code for the custom Min-Heap and FEFO engine.
2. Linear-scan FEFO and FIFO baselines.
3. Unit, edge-case, and differential tests.
4. Reproducible synthetic data generator.
5. Benchmark runner and controlled policy simulator.
6. CSV result exports and report-ready tables/graphs.
7. README, architecture, benchmark protocol, test evidence, and limitations.
8. A 20–25-page A-6 report, presentation, and viva notes.

## 14. Source context

The real-world motivation is informed by FSSAI's surplus-food regulations and catering guidance. These sources justify expiry-aware records and timely handling; they do not imply that this prototype certifies food safety.

- FSSAI, Food Safety and Standards (Recovery and Distribution of Surplus Food) Regulations, 2019: https://fssai.gov.in/upload/uploadfiles/files/Gazette_Notification_Surplus_Food_06_08_2019.pdf
- FSSAI, Guidance Document for Catering Sector: https://fssai.gov.in/upload/uploadfiles/files/Guidance_Document_Catering_Sector_19_01_2018.pdf
- FAO, Food Loss and Food Waste: https://www.fao.org/policy-support/policy-themes/food-loss-and-food-waste/en
