# Viva Questions & Answers

### 1. What real problem does the project address?
Food stock may expire when staff cannot easily see batch expiry dates or choose the right batch to use first. This website tracks batches, shows expiry risk and records stock issues.

### 2. What is FEFO?
FEFO means First Expiry, First Out. Among eligible unexpired stock for the selected item and unit, it chooses the batch with the earliest expiry date first.

### 3. What is FIFO?
FIFO means First In, First Out. It chooses the eligible batch that was received earliest first.

### 4. How are FEFO and FIFO different?
FEFO is ordered by expiry date; FIFO is ordered by received date. The oldest batch to arrive is not always the batch that expires first.

### 5. Why store separate batches for the same product?
Different receipts can have different quantities and expiry dates. Keeping them separate preserves traceability and permits accurate stock rotation.

### 6. What does the website do when the requested quantity exceeds available stock?
It issues only the eligible amount that exists, records those allocations and reports the shortage. It does not silently mark the whole request as fulfilled.

### 7. Can expired stock be issued automatically?
No. Batches whose expiry date is before the issue date are excluded from FEFO/FIFO allocation. The user can record a separate removal/write-off according to the facility's policy.

### 8. Which data structures or algorithms are demonstrated?
The project demonstrates deterministic priority ordering for FEFO/FIFO, batch lookup by identifiers, filtering/grouping for reports, and audit records. The original C prototype separately demonstrates a Min-Heap, Hash Table and Linear Scan.

### 9. Is the web version itself using a Min-Heap?
Not in its current allocator; the website's `lib/inventory.js` filters and sorts eligible records before allocating. Do not claim the website uses the C prototype's Min-Heap implementation. A heap can be added if measured workload justifies it.

### 10. How does the data persist?
The Node.js server stores batches, movement records and settings in `data/inventory.json`. The server writes a replacement file when a mutation succeeds.

### 11. What is the role of the movement log?
It records receipts, issues and adjustments so quantity changes can be traced to a batch and a reason/reference.

### 12. What is the purpose of CSV import/export?
CSV import helps load a real inventory from a spreadsheet. CSV exports let users analyse current quantities and the movement trail using spreadsheet software.

### 13. Why validate dates and quantities?
Impossible dates and non-positive batch/issue quantities can create invalid alerts or incorrect inventory. Validation prevents common input errors before saving.

### 14. What is a limitation of the project?
The current edition is a local single-workstation app. It has no login, cloud database or secure multi-user access and must not be exposed directly to the public internet.

### 15. Does the project prove food waste has been reduced?
No. It provides tools intended to support better stock rotation. Actual waste reduction must be measured from real before/after operational data.

### 16. How was it tested?
The built-in Node test runner checks validations, allocation ordering, expiry handling, report calculations and CSV parsing. An integration test also starts the server and tests the inventory API workflow and exports.

### 17. How can it be run on a Windows laptop?
Install Node.js 18 or later, extract the package, double-click `START_WEBSITE.bat` and open `http://127.0.0.1:4173` if the browser does not open automatically.

### 18. What does the stock-value number mean?
It is a simple estimate calculated as remaining quantity multiplied by the entered cost per unit. It is not a verified financial/accounting valuation.