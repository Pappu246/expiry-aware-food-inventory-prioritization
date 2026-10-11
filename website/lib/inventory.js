'use strict';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDaysISO(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cleanText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function validateBatch(input) {
  const errors = [];
  const batchCode = cleanText(input?.batchCode, 60);
  const itemName = cleanText(input?.itemName, 120);
  const category = cleanText(input?.category, 80) || 'Uncategorized';
  const unit = cleanText(input?.unit, 24) || 'units';
  const supplier = cleanText(input?.supplier, 120);
  const notes = cleanText(input?.notes, 500);
  const receivedDate = String(input?.receivedDate ?? '').trim();
  const expiryDate = String(input?.expiryDate ?? '').trim();
  const quantity = Number(input?.quantity);
  const costPerUnit = input?.costPerUnit === '' || input?.costPerUnit == null ? 0 : Number(input.costPerUnit);

  if (!batchCode) errors.push('Batch code is required.');
  if (!itemName) errors.push('Item name is required.');
  if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 1e9) errors.push('Quantity must be at least 0.001 and at most 1,000,000,000.');
  if (!isValidDate(receivedDate)) errors.push('Received date must be a valid date in YYYY-MM-DD format.');
  if (!isValidDate(expiryDate)) errors.push('Expiry date must be a valid date in YYYY-MM-DD format.');
  if (isValidDate(receivedDate) && receivedDate > todayISO()) errors.push('Received date cannot be in the future for stock already on hand.');
  if (isValidDate(receivedDate) && isValidDate(expiryDate) && expiryDate < receivedDate) errors.push('Expiry date cannot be before the received date.');
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0 || costPerUnit > 1e9) errors.push('Cost per unit must be 0 or a positive number.');

  return {
    errors,
    value: {
      batchCode, itemName, category, unit, supplier, notes,
      quantity: Number.isFinite(quantity) ? roundQty(quantity) : quantity,
      receivedDate, expiryDate,
      costPerUnit: Number.isFinite(costPerUnit) ? roundQty(costPerUnit) : costPerUnit,
    },
  };
}

function roundQty(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getBatchStatus(batch, today = todayISO(), alertDays = 7) {
  if (batch.archived) return 'archived';
  const qty = Number(batch.quantity) || 0;
  if (qty <= 0) return 'out-of-stock';
  if (batch.expiryDate < today) return 'expired';
  if (batch.expiryDate <= addDaysISO(today, alertDays)) return 'expiring';
  return 'available';
}

function eligibleBatches(batches, itemName, unit, issueDate = todayISO()) {
  const itemKey = normalizeKey(itemName);
  const unitKey = normalizeKey(unit);
  return batches.filter((batch) =>
    !batch.archived &&
    normalizeKey(batch.itemName) === itemKey &&
    normalizeKey(batch.unit) === unitKey &&
    Number(batch.quantity) > 0 &&
    isValidDate(batch.receivedDate) && batch.receivedDate <= issueDate &&
    isValidDate(batch.expiryDate) && batch.expiryDate >= issueDate
  );
}


function compareFefo(a, b) {
  return a.expiryDate.localeCompare(b.expiryDate) ||
    a.receivedDate.localeCompare(b.receivedDate) ||
    a.batchCode.localeCompare(b.batchCode);
}

function compareFifo(a, b) {
  return a.receivedDate.localeCompare(b.receivedDate) ||
    a.expiryDate.localeCompare(b.expiryDate) ||
    a.batchCode.localeCompare(b.batchCode);
}

class MinHeap {
  constructor(values = [], compare = (a, b) => a - b) {
    this.values = values.slice();
    this.compare = compare;
    for (let index = Math.floor(this.values.length / 2) - 1; index >= 0; index--) this.siftDown(index);
  }
  get size() { return this.values.length; }
  peek() { return this.values[0]; }
  push(value) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[index], this.values[parent]) >= 0) break;
      [this.values[index], this.values[parent]] = [this.values[parent], this.values[index]];
      index = parent;
    }
  }
  pop() {
    if (!this.values.length) return undefined;
    const minimum = this.values[0];
    const last = this.values.pop();
    if (this.values.length) { this.values[0] = last; this.siftDown(0); }
    return minimum;
  }
  siftDown(start) {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.values.length && this.compare(this.values[left], this.values[smallest]) < 0) smallest = left;
      if (right < this.values.length && this.compare(this.values[right], this.values[smallest]) < 0) smallest = right;
      if (smallest === index) return;
      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
      index = smallest;
    }
  }
}

function allocateStock(batches, { itemName, unit, quantity, policy = 'FEFO', issueDate = todayISO() }) {
  const wanted = Number(quantity);
  if (!Number.isFinite(wanted) || wanted < 0.001 || wanted > 1e9) throw new Error('Requested quantity must be at least 0.001 and at most 1,000,000,000.');
  if (!['FEFO', 'FIFO'].includes(String(policy).toUpperCase())) throw new Error('Policy must be FEFO or FIFO.');
  if (!isValidDate(issueDate)) throw new Error('Issue date must be a valid YYYY-MM-DD date.');

  const normalizedPolicy = String(policy).toUpperCase();
  const candidates = eligibleBatches(batches, itemName, unit, issueDate).slice();
  const allocator = normalizedPolicy === 'FEFO'
    ? new MinHeap(candidates, compareFefo)
    : candidates.sort(compareFifo);

  let remaining = roundQty(wanted);
  let fifoIndex = 0;
  const allocations = [];
  while (remaining > 0) {
    const batch = normalizedPolicy === 'FEFO' ? allocator.pop() : allocator[fifoIndex++];
    if (!batch) break;
    const take = roundQty(Math.min(Number(batch.quantity), remaining));
    if (take <= 0) continue;
    allocations.push({ batchId: batch.id, batchCode: batch.batchCode, itemName: batch.itemName, unit: batch.unit, quantity: take, expiryDate: batch.expiryDate });
    remaining = roundQty(remaining - take);
  }
  const fulfilled = roundQty(wanted - remaining);
  return {
    policy: normalizedPolicy,
    requested: roundQty(wanted),
    fulfilled,
    shortfall: Math.max(0, roundQty(remaining)),
    allocations,
  };
}

function summarize(batches, movements = [], settings = {}, today = todayISO()) {
  const alertDays = Number.isInteger(Number(settings.alertDays)) ? Number(settings.alertDays) : 7;
  const active = batches.filter((b) => !b.archived);
  const status = (b) => getBatchStatus(b, today, alertDays);
  const totalUnits = roundQty(active.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0));
  const availableUnits = roundQty(active.filter((b) => status(b) !== 'expired').reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0));
  const expiredUnits = roundQty(active.filter((b) => status(b) === 'expired').reduce((sum, b) => sum + (Number(b.quantity) || 0), 0));
  const expiringUnits = roundQty(active.filter((b) => status(b) === 'expiring').reduce((sum, b) => sum + (Number(b.quantity) || 0), 0));
  const stockValue = roundQty(active.reduce((sum, b) => sum + (Number(b.quantity) || 0) * (Number(b.costPerUnit) || 0), 0));
  const categories = Object.create(null);
  for (const batch of active) {
    const category = batch.category || 'Uncategorized';
    categories[category] = roundQty((categories[category] || 0) + (Number(batch.quantity) || 0));
  }
  return {
    today,
    totalBatches: active.length,
    totalUnits,
    availableUnits,
    expiredUnits,
    expiringUnits,
    stockValue,
    movementCount: movements.length,
    categories,
    alertDays,
    alerts: active.filter((b) => ['expired', 'expiring'].includes(status(b))).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  if (quoted) throw new Error('CSV contains an unclosed quotation mark.');
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function normalizeImportedRow(row) {
  const aliases = {
    batchcode: 'batchCode', 'batch id': 'batchCode', batch_id: 'batchCode', batch: 'batchCode',
    itemname: 'itemName', 'item name': 'itemName', item: 'itemName', product: 'itemName',
    category: 'category', quantity: 'quantity', qty: 'quantity', unit: 'unit',
    receiveddate: 'receivedDate', 'received date': 'receivedDate', received_date: 'receivedDate',
    expirydate: 'expiryDate', 'expiry date': 'expiryDate', expiry_date: 'expiryDate',
    supplier: 'supplier', costperunit: 'costPerUnit', 'cost per unit': 'costPerUnit', cost_per_unit: 'costPerUnit', notes: 'notes',
  };
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    const compact = key.trim().toLowerCase().replace(/\s+/g, ' ');
    const compactNoSpaces = compact.replace(/ /g, '');
    const target = (Object.hasOwn(aliases, compact) ? aliases[compact] : undefined) || (Object.hasOwn(aliases, compactNoSpaces) ? aliases[compactNoSpaces] : undefined);
    if (target) normalized[target] = value;
  }
  return normalized;
}

module.exports = {
  addDaysISO, allocateStock, cleanText, compareFefo, compareFifo, eligibleBatches, getBatchStatus, MinHeap,
  isValidDate, normalizeImportedRow, normalizeKey, parseCsv, roundQty,
  summarize, todayISO, validateBatch,
};