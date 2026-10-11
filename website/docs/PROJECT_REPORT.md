# Project Report: Expiry-Aware Food Inventory Prioritization Website

## 1. Abstract

FreshTrack is a local-first web application for small food stockrooms, kitchens and canteens. It records inventory by batch, tracks received and expiry dates, highlights stock approaching expiry, allocates stock using First Expiry, First Out (FEFO) or First In, First Out (FIFO), records each stock movement and exports data for reporting. It converts the core inventory policy demonstrated by the accompanying C/Data Structures prototype into browser-based forms and a persistent local application.

## 2. Problem statement

Food inventory is often tracked in notebooks or disconnected spreadsheets. If a product's different batches have different expiry dates, selecting stock only by arrival order can leave sooner-expiring stock unused. Missing movement records also make it hard to reconcile quantities or explain waste. A practical inventory tool should capture each batch separately, make expiry risk visible, apply a repeatable issue rule and keep an audit trail.

## 3. Objectives

- Capture real batch, item, supplier, quantity, unit, received-date and expiry-date information.
- Flag expired and soon-to-expire stock using a configurable alert window.
- Allocate requested stock with FEFO or FIFO while excluding expired batches from automatic allocation.
- Record receipts, issues, quantity corrections and expired-stock write-offs.
- Import inventory by CSV and export stock/movement reports.
- Provide a restorable data backup and readable dashboard.
- Demonstrate correctness through automated validation and HTTP integration tests.

## 4. Scope

The implemented application runs on the user's computer with a browser-based interface and Node.js local server. Its JSON data file persists inventory across application restarts on that computer. It supports multiple batches per item, fractional quantities to three decimal places, per-unit estimated costs, search/filter, batch editing, adjustments, FEFO/FIFO issue, CSV operations, JSON backup/restore and report printing.

The present version does not provide user accounts, shared cloud storage, cross-device sync, barcode scanning, automatic supplier data, an external database, multi-server transaction coordination or a verified food-safety certification workflow. It should not be exposed directly to the public internet.

## 5. System architecture

**Presentation layer:** `public/index.html`, `public/styles.css` and `public/app.js` deliver a responsive website without a frontend package dependency.

**Application/API layer:** `server.js` uses Node.js's built-in HTTP server to serve the UI and validate API requests. Mutations are processed through a single in-process queue and the data file is replaced atomically after a successful update.

**Business-logic layer:** `lib/inventory.js` validates batches and dates, calculates statuses, allocates stock and calculates summaries. FEFO builds a binary Min-Heap ordered by expiry date, received date and batch code; heap construction is linear in the number of eligible batches and each extraction is logarithmic. FIFO orders candidates by received date, expiry date and batch code, then traverses the ordered list. The application validates that an on-hand stock issue is dated today so a user cannot back-date an issue and accidentally consume a batch that has since expired.

**Persistence layer:** `data/inventory.json` stores batch records, movement records, configuration and metadata. The JSON file is simple to inspect and back up, but has limits for multi-user workloads and concurrent server instances.

## 6. Data model

A batch contains a unique identifier, batch code, item name, category, remaining quantity, unit, received date, expiry date, supplier, unit cost, notes, archive status and timestamps.

A movement contains an identifier, date/time, batch identifier/code, item name, unit, movement type, quantity, selected FEFO/FIFO policy if applicable, reference and notes. Movement types include initial receipt, issue, adjustment add, adjustment remove and expired-stock write-off.

Application settings currently include the expiry alert window in days.

## 7. Allocation rules

### FEFO

Eligible batches must be active, have positive remaining quantity, match the requested item and unit, and have an expiry date on or after the issue date. Eligible batches are ordered by:

1. Earliest expiry date.
2. Earliest received date.
3. Batch code (deterministic tie-breaker).

The allocator takes the minimum of the batch's remaining quantity and the unfilled request, then continues until the request is fulfilled or eligible stock is exhausted.

### FIFO

The eligible-batch filter is the same, but batches are ordered by earliest received date, then expiry date, then batch code. It therefore represents arrival order among eligible, unexpired stock, not an instruction to issue already-expired items.

### Partial fulfillment

When available stock is less than the requested quantity, the application records the amount that could be issued and reports the remainder as a shortfall. It does not claim that the entire request was fulfilled.

## 8. Expiry and stock accounting

A batch is considered expired when its expiry date is earlier than the current local date. A batch remains eligible through the expiry date itself, unless the user has a stricter organisational rule. An expiring-soon alert covers batches between today and the configured alert-window boundary, inclusive. Expired stock is still shown as physical on-hand stock until a user records a write-off or removal, but it is excluded from automatic stock issue.

Inventory valuation is an estimate based on remaining quantity multiplied by the unit cost that the user supplied. The application cannot verify the real stock or quality of food; accurate results depend on correct entry and regular reconciliation.

## 9. Testing and verification

The automated test suite uses Node's built-in test runner and does not require external dependencies. It tests calendar-date validation, field constraints, expiry classification, Min-Heap ordering, FEFO allocation, FIFO ordering, unit matching, exclusion of expired/archived batches, partial fulfillment, invalid policies, report totals, quoted CSV parsing and header aliases.

The integration test launches the HTTP server against an isolated temporary data directory, adds batches through the API, rejects a duplicate code, issues stock through FEFO, confirms expired stock was not allocated, inspects remaining quantities and movements, checks CSV/JSON exports, and rejects a mismatched request origin.

Verification result for this package build: **15 tests passed, 0 failed**. This demonstrates the tested cases; it is not a proof that every possible real-world failure has been eliminated.

## 10. How to run

On Windows, double-click `START_WEBSITE.bat` and keep the server window open. On another Node.js-supported environment, run `node server.js` in this folder and visit `http://127.0.0.1:4173`. Run `node --test` or `npm test` to execute the automated tests.

## 11. Future work

Recommended next steps for a multi-user deployment are authenticated roles, a transactional database, schema migrations, scheduled backup/restore drills, HTTPS, deployment monitoring, data-retention controls, automated tests on every change, and an explicit review of expiry/disposal rules with the facility's food-safety procedure. Barcode scanning, low-stock thresholds and supplier purchase workflows can be added after that foundation is selected.

## 12. Conclusion

FreshTrack provides a working website for batch-level inventory, expiry alerts, FEFO/FIFO allocation, movement tracking and data exports. It supports a practical stockroom workflow and preserves the Data Structures theme of ordering batches by priority, while keeping its limits explicit: deployment security, shared multi-user operation and any measured food-waste reduction still require additional work and real-world evaluation.