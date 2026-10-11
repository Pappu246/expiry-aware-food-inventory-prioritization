'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addDaysISO, allocateStock, compareFefo, getBatchStatus, isValidDate, MinHeap, normalizeImportedRow,
  parseCsv, summarize, todayISO, validateBatch,
} = require('../lib/inventory');

const today = todayISO();
function batch(overrides = {}) {
  return {
    id: 'id-1', batchCode: 'RICE-01', itemName: 'Basmati Rice', category: 'Grains', quantity: 10,
    unit: 'kg', receivedDate: addDaysISO(today, -3), expiryDate: addDaysISO(today, 30),
    supplier: 'Example Supplier', costPerUnit: 70, notes: '', archived: false, ...overrides,
  };
}

test('validates real calendar dates instead of accepting impossible dates', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('10/10/2026'), false);
});

test('rejects missing batch identifiers, non-positive quantities, and invalid costs', () => {
  const result = validateBatch({ batchCode: '', itemName: '', quantity: 0, receivedDate: today, expiryDate: today, unit: 'kg', costPerUnit: -1 });
  assert.ok(result.errors.some((e) => e.includes('Batch code')));
  assert.ok(result.errors.some((e) => e.includes('Item name')));
  assert.ok(result.errors.some((e) => e.includes('Quantity')));
  assert.ok(result.errors.some((e) => e.includes('Cost')));
});

test('normalizes a valid batch record and default category', () => {
  const result = validateBatch({ batchCode: ' MILK-1 ', itemName: ' Milk ', quantity: '2.5', unit: 'L', receivedDate: today, expiryDate: addDaysISO(today, 5), costPerUnit: '40' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.batchCode, 'MILK-1');
  assert.equal(result.value.itemName, 'Milk');
  assert.equal(result.value.category, 'Uncategorized');
  assert.equal(result.value.quantity, 2.5);
  assert.equal(result.value.costPerUnit, 40);
});



test('rejects quantities that would round to zero and received dates in the future', () => {
  const tooSmall = validateBatch({ ...batch(), quantity: 0.0004 });
  assert.ok(tooSmall.errors.some((e) => e.includes('at least 0.001')));
  const futureReceived = validateBatch({ ...batch(), receivedDate: addDaysISO(today, 1), expiryDate: addDaysISO(today, 30) });
  assert.ok(futureReceived.errors.some((e) => e.includes('future')));
});

test('rejects an expiry date earlier than the received date', () => {
  const result = validateBatch({ ...batch(), receivedDate: addDaysISO(today, -1), expiryDate: addDaysISO(today, -2) });
  assert.ok(result.errors.some((e) => e.includes('before the received date')));
});

test('expiry status treats the expiry date itself as eligible until the next day', () => {
  assert.equal(getBatchStatus(batch({ expiryDate: addDaysISO(today, -1) }), today, 7), 'expired');
  assert.equal(getBatchStatus(batch({ expiryDate: today }), today, 7), 'expiring');
  assert.equal(getBatchStatus(batch({ expiryDate: addDaysISO(today, 7) }), today, 7), 'expiring');
  assert.equal(getBatchStatus(batch({ expiryDate: addDaysISO(today, 8) }), today, 7), 'available');
});


test('MinHeap returns FEFO keys in ascending order with deterministic tie-breaks', () => {
  const items = [
    batch({ id: 'c', batchCode: 'C', expiryDate: addDaysISO(today, 5), receivedDate: today }),
    batch({ id: 'b', batchCode: 'B', expiryDate: addDaysISO(today, 2), receivedDate: today }),
    batch({ id: 'a', batchCode: 'A', expiryDate: addDaysISO(today, 2), receivedDate: today }),
    batch({ id: 'd', batchCode: 'D', expiryDate: addDaysISO(today, 2), receivedDate: addDaysISO(today, -1) }),
  ];
  const heap = new MinHeap(items, compareFefo);
  assert.deepEqual([heap.pop().id, heap.pop().id, heap.pop().id, heap.pop().id], ['d', 'a', 'b', 'c']);
  assert.equal(heap.pop(), undefined);
});

test('FEFO chooses nearest expiry even when that batch arrived later', () => {
  const items = [
    batch({ id: 'old', batchCode: 'OLDER-ARRIVAL', receivedDate: addDaysISO(today, -10), expiryDate: addDaysISO(today, 20), quantity: 20 }),
    batch({ id: 'soon', batchCode: 'SOONER-EXPIRY', receivedDate: addDaysISO(today, -1), expiryDate: addDaysISO(today, 2), quantity: 3 }),
  ];
  const result = allocateStock(items, { itemName: 'Basmati Rice', unit: 'kg', quantity: 4, policy: 'FEFO', issueDate: today });
  assert.equal(result.fulfilled, 4);
  assert.equal(result.shortfall, 0);
  assert.deepEqual(result.allocations.map((a) => [a.batchId, a.quantity]), [['soon', 3], ['old', 1]]);
});

test('FIFO chooses the earliest received batch, not the nearest expiry', () => {
  const items = [
    batch({ id: 'old', batchCode: 'OLDER-ARRIVAL', receivedDate: addDaysISO(today, -10), expiryDate: addDaysISO(today, 20), quantity: 20 }),
    batch({ id: 'soon', batchCode: 'SOONER-EXPIRY', receivedDate: addDaysISO(today, -1), expiryDate: addDaysISO(today, 2), quantity: 3 }),
  ];
  const result = allocateStock(items, { itemName: 'Basmati Rice', unit: 'kg', quantity: 4, policy: 'FIFO', issueDate: today });
  assert.deepEqual(result.allocations.map((a) => a.batchId), ['old']);
  assert.equal(result.fulfilled, 4);
});

test('allocation is case-insensitive for item and unit but does not mix different units', () => {
  const items = [batch({ id: 'kg', itemName: 'Rice', unit: 'kg', quantity: 10 }), batch({ id: 'bag', itemName: 'Rice', unit: 'bag', quantity: 20 })];
  const result = allocateStock(items, { itemName: 'rice', unit: 'KG', quantity: 2, policy: 'FEFO', issueDate: today });
  assert.deepEqual(result.allocations.map((a) => a.batchId), ['kg']);
});

test('expired and archived stock is not issued', () => {
  const items = [
    batch({ id: 'expired', expiryDate: addDaysISO(today, -1), quantity: 50 }),
    batch({ id: 'archived', archived: true, quantity: 50 }),
  ];
  const result = allocateStock(items, { itemName: 'Basmati Rice', unit: 'kg', quantity: 3, policy: 'FEFO', issueDate: today });
  assert.equal(result.fulfilled, 0);
  assert.equal(result.shortfall, 3);
  assert.deepEqual(result.allocations, []);
});



test('future-received stock is not allocatable even if its expiry is in the future', () => {
  const future = batch({ id: 'future', receivedDate: addDaysISO(today, 2), expiryDate: addDaysISO(today, 30) });
  const result = allocateStock([future], { itemName: 'Basmati Rice', unit: 'kg', quantity: 1, policy: 'FEFO', issueDate: today });
  assert.equal(result.fulfilled, 0);
  assert.equal(result.shortfall, 1);
});

test('reports partial fulfillment instead of silently claiming the full request', () => {
  const result = allocateStock([batch({ quantity: 2 })], { itemName: 'Basmati Rice', unit: 'kg', quantity: 5, policy: 'FEFO', issueDate: today });
  assert.equal(result.requested, 5);
  assert.equal(result.fulfilled, 2);
  assert.equal(result.shortfall, 3);
});

test('rejects invalid policy and date in allocator', () => {
  assert.throws(() => allocateStock([batch()], { itemName: 'Basmati Rice', unit: 'kg', quantity: 1, policy: 'RANDOM', issueDate: today }), /Policy/);
  assert.throws(() => allocateStock([batch()], { itemName: 'Basmati Rice', unit: 'kg', quantity: 1, policy: 'FEFO', issueDate: 'not-a-date' }), /Issue date/);
});

test('summary excludes archived batches, values expiry risk and keeps category quantities', () => {
  const items = [
    batch({ id: 'a', category: 'Grains', quantity: 4, costPerUnit: 10, expiryDate: addDaysISO(today, -1) }),
    batch({ id: 'b', category: 'Dairy', quantity: 2, costPerUnit: 20, expiryDate: addDaysISO(today, 2) }),
    batch({ id: 'c', category: 'Archived', quantity: 500, archived: true }),
  ];
  const report = summarize(items, [{ id: 'move' }], { alertDays: 7 }, today);
  assert.equal(report.totalBatches, 2);
  assert.equal(report.totalUnits, 6);
  assert.equal(report.expiredUnits, 4);
  assert.equal(report.expiringUnits, 2);
  assert.equal(report.stockValue, 80);
  assert.equal(report.movementCount, 1);
  assert.deepEqual({ ...report.categories }, { Grains: 4, Dairy: 2 });
});

test('category aggregation safely preserves unusual user-provided category names', () => {
  const report = summarize([batch({ category: '__proto__', quantity: 2 })], [], { alertDays: 7 }, today);
  assert.equal(report.categories['__proto__'], 2);
  assert.equal(JSON.parse(JSON.stringify(report)).categories['__proto__'], 2);
});

test('CSV parser supports commas and escaped quotes inside quoted values', () => {
  const rows = parseCsv('batchCode,itemName,notes\r\nA-1,"Rice, premium","stored in \"\"cool\"\" room"\r\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['A-1', 'Rice, premium', 'stored in "cool" room']);
});

test('rejects a CSV with an unclosed quoted field', () => {
  assert.throws(() => parseCsv('batchCode,itemName,notes\nR-1,Rice,"missing close\n'), /unclosed quotation mark/i);
});

test('CSV header aliases map spreadsheet-friendly names into app field names', () => {
  assert.deepEqual(normalizeImportedRow({ 'Batch ID': 'R-1', 'Item Name': 'Rice', Qty: '5', Unit: 'kg', 'Received Date': today, 'Expiry Date': addDaysISO(today, 3) }), {
    batchCode: 'R-1', itemName: 'Rice', quantity: '5', unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 3),
  });
});