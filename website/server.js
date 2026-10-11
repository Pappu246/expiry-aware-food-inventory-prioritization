'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  addDaysISO, allocateStock, cleanText, normalizeKey, parseCsv, roundQty,
  isValidDate, summarize, todayISO, validateBatch,
} = require('./lib/inventory');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.FRESHTRACK_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'inventory.json');
const PREVIOUS_BACKUP_FILE = path.join(DATA_DIR, 'inventory.json.bak');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 10 * 1024 * 1024;
let mutationQueue = Promise.resolve();

function initialDb() {
  return { version: 1, settings: { alertDays: 7 }, batches: [], movements: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DB_FILE); }
  catch { await fs.writeFile(DB_FILE, JSON.stringify(initialDb(), null, 2) + '\n', 'utf8'); }
}

async function readDb() {
  await ensureDb();
  const parsed = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
  if (!isValidStoredDatabase(parsed)) throw new Error('Inventory database is invalid or inconsistent. Restore a valid JSON backup or the previous automatic snapshot.');
  return parsed;
}

async function preservePreviousSnapshot() {
  let raw;
  try { raw = await fs.readFile(DB_FILE, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  let previous;
  try { previous = JSON.parse(raw); } catch { return; } // Never overwrite a good snapshot with a corrupt database file.
  if (!isValidStoredDatabase(previous)) return; // Syntactically valid but semantically damaged data must not replace a good snapshot.
  const backup = { ...previous, backupFormat: 'freshtrack-backup-v1', exportedAt: new Date().toISOString() };
  const temp = `${PREVIOUS_BACKUP_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(backup, null, 2) + '\n', 'utf8');
  await fs.rename(temp, PREVIOUS_BACKUP_FILE);
}

async function writeDb(db) {
  // Preserve the last valid state before every mutation; rename remains the atomic commit step.
  await preservePreviousSnapshot();
  db.updatedAt = new Date().toISOString();
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(db, null, 2) + '\n', 'utf8');
  await fs.rename(temp, DB_FILE);
}

function mutate(fn) {
  const work = mutationQueue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  mutationQueue = work.catch(() => {});
  return work;
}

// Backup restore must also work when inventory.json itself is damaged, so it cannot depend on readDb().
function replaceDatabase(replacement) {
  const work = mutationQueue.then(async () => {
    const now = new Date().toISOString();
    const db = {
      version: 1,
      createdAt: typeof replacement.createdAt === 'string' && !Number.isNaN(Date.parse(replacement.createdAt)) ? replacement.createdAt.slice(0, 40) : now,
      updatedAt: now,
      settings: replacement.settings,
      batches: replacement.batches,
      movements: replacement.movements,
    };
    await writeDb(db);
    return { batches: db.batches.length, movements: db.movements.length };
  });
  mutationQueue = work.catch(() => {});
  return work;
}

function respond(res, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

function fail(res, status, message, details) {
  respond(res, status, { error: message, ...(details ? { details } : {}) });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidStoredDatabase(db) {
  if (!isRecord(db) || !Array.isArray(db.batches) || !Array.isArray(db.movements) || !isRecord(db.settings)) return false;
  if (db.version !== undefined && db.version !== 1) return false;
  if (db.settings.alertDays !== undefined) {
    const days = Number(db.settings.alertDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) return false;
  }

  const batchIds = new Set();
  const activeCodes = new Set();
  for (const batch of db.batches) {
    if (!isRecord(batch)) return false;
    if (typeof batch.id !== 'string' || !batch.id.trim() || batch.id.trim().length > 100 || batchIds.has(batch.id.trim())) return false;
    const quantity = Number(batch.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1e9) return false;
    if (typeof batch.archived !== 'boolean') return false;
    const validation = validateBatch({ ...batch, quantity: quantity > 0 ? quantity : 0.001 });
    if (validation.errors.length) return false;
    const id = batch.id.trim();
    batchIds.add(id);
    if (!batch.archived) {
      const code = normalizeKey(validation.value.batchCode);
      if (activeCodes.has(code)) return false;
      activeCodes.add(code);
    }
  }

  const movementTypes = new Set(['RECEIVE', 'ISSUE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'EXPIRED_WRITE_OFF']);
  const movementIds = new Set();
  for (const movementRecord of db.movements) {
    if (!isRecord(movementRecord)) return false;
    const quantity = Number(movementRecord.quantity);
    if (!movementTypes.has(movementRecord.type) || !isValidDate(String(movementRecord.date || '')) || !Number.isFinite(quantity) || quantity < 0.001 || quantity > 1e9) return false;
    if (typeof movementRecord.id !== 'string' || !movementRecord.id.trim() || movementRecord.id.trim().length > 100 || movementIds.has(movementRecord.id.trim())) return false;
    if (!cleanText(movementRecord.batchCode, 60) || !cleanText(movementRecord.itemName, 120) || !cleanText(movementRecord.unit, 24)) return false;
    if (movementRecord.policy && !['FEFO', 'FIFO'].includes(String(movementRecord.policy).toUpperCase())) return false;
    if (movementRecord.batchId != null && (typeof movementRecord.batchId !== 'string' || !batchIds.has(movementRecord.batchId))) return false;
    movementIds.add(movementRecord.id.trim());
  }
  return true;
}

async function readBody(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function movement(db, entry) {
  const record = {
    id: crypto.randomUUID(),
    date: entry.date || todayISO(),
    createdAt: new Date().toISOString(),
    batchId: entry.batchId || entry.id || null,
    batchCode: entry.batchCode || '',
    itemName: entry.itemName || '',
    unit: entry.unit || '',
    type: entry.type,
    quantity: roundQty(entry.quantity),
    policy: entry.policy || '',
    reference: cleanText(entry.reference, 80),
    notes: cleanText(entry.notes, 500),
  };
  db.movements.unshift(record);
  return record;
}

function batchById(db, id) { return db.batches.find((b) => b.id === id && !b.archived); }
function duplicateCode(db, code, exceptId) { return db.batches.some((b) => !b.archived && normalizeKey(b.batchCode) === normalizeKey(code) && b.id !== exceptId); }
function csvCell(value) {
  let s = String(value ?? '');
  // Prefix spreadsheet formula-like text so exported user content is not executed as a formula.
  if (/^[\t\r ]*[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, headers) {
  return [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\r\n') + '\r\n';
}
function csvResponse(res, filename, csv) {
  const body = Buffer.from('\uFEFF' + csv, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.host === req.headers.host;
  } catch { return false; }
}
function makeDemoRows() {
  const today = todayISO();
  return [
    { batchCode: 'DEMO-RICE-01', itemName: 'Basmati Rice', category: 'Grains', quantity: 24, unit: 'kg', receivedDate: addDaysISO(today, -15), expiryDate: addDaysISO(today, 2), supplier: 'Demo Foods Ltd', costPerUnit: 72, notes: 'Demo batch: use first' },
    { batchCode: 'DEMO-MILK-02', itemName: 'Milk', category: 'Dairy', quantity: 12, unit: 'L', receivedDate: addDaysISO(today, -1), expiryDate: addDaysISO(today, 1), supplier: 'Demo Dairy', costPerUnit: 58, notes: 'Demo batch: short shelf life' },
    { batchCode: 'DEMO-LENTIL-03', itemName: 'Lentils', category: 'Pulses', quantity: 35, unit: 'kg', receivedDate: addDaysISO(today, -4), expiryDate: addDaysISO(today, 90), supplier: 'Demo Foods Ltd', costPerUnit: 110, notes: 'Demo batch: long shelf life' },
    { batchCode: 'DEMO-PANEER-04', itemName: 'Paneer', category: 'Dairy', quantity: 3, unit: 'kg', receivedDate: addDaysISO(today, -6), expiryDate: addDaysISO(today, -1), supplier: 'Demo Dairy', costPerUnit: 280, notes: 'Demo expired stock for alert demonstration' },
    { batchCode: 'DEMO-OIL-05', itemName: 'Cooking Oil', category: 'Essentials', quantity: 10, unit: 'L', receivedDate: addDaysISO(today, -7), expiryDate: addDaysISO(today, 240), supplier: 'Demo Supplies', costPerUnit: 145, notes: 'Demo batch' },
  ];
}

async function apiHandler(req, res, url) {
  const { pathname } = url;
  const method = req.method || 'GET';
  if (method !== 'GET' && !allowedOrigin(req)) return fail(res, 403, 'Request origin rejected. Use this app from its local website address.');

  if (method === 'GET' && pathname === '/api/health') return respond(res, 200, { ok: true, app: 'FreshTrack Inventory', version: 1, storage: 'local-json' });
  if (method === 'GET' && pathname === '/api/state') {
    const db = await readDb();
    return respond(res, 200, { settings: db.settings, batches: db.batches, movements: db.movements, summary: summarize(db.batches, db.movements, db.settings) });
  }
  if (method === 'GET' && pathname === '/api/backup') {
    const db = await readDb();
    const body = Buffer.from(JSON.stringify({ ...db, backupFormat: 'freshtrack-backup-v1', exportedAt: new Date().toISOString() }, null, 2) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="freshtrack-backup-${todayISO()}.json"`, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (method === 'GET' && pathname === '/api/backup/previous') {
    let raw;
    try { raw = await fs.readFile(PREVIOUS_BACKUP_FILE, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return fail(res, 404, 'No automatic snapshot exists yet. Add or change stock once to create one.'); throw error; }
    let backup;
    try { backup = JSON.parse(raw); } catch { return fail(res, 500, 'The previous automatic snapshot is damaged. Use a downloaded backup if available.'); }
    if (backup.backupFormat !== 'freshtrack-backup-v1') return fail(res, 500, 'The previous automatic snapshot has an invalid format.');
    const body = Buffer.from(JSON.stringify(backup, null, 2) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="freshtrack-previous-snapshot-${todayISO()}.json"`, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (method === 'GET' && pathname === '/api/export/inventory.csv') {
    const db = await readDb();
    const headers = ['batchCode', 'itemName', 'category', 'quantity', 'unit', 'receivedDate', 'expiryDate', 'supplier', 'costPerUnit', 'notes', 'archived'];
    return csvResponse(res, 'freshtrack-inventory.csv', toCsv(db.batches.filter((b) => !b.archived), headers));
  }
  if (method === 'GET' && pathname === '/api/export/movements.csv') {
    const db = await readDb();
    const headers = ['date', 'type', 'itemName', 'batchCode', 'quantity', 'unit', 'policy', 'reference', 'notes'];
    return csvResponse(res, 'freshtrack-movements.csv', toCsv(db.movements, headers));
  }

  if (method === 'POST' && pathname === '/api/batches') {
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    const validation = validateBatch(input);
    if (validation.errors.length) return fail(res, 400, 'Please fix the batch form.', validation.errors);
    const result = await mutate((db) => {
      if (duplicateCode(db, validation.value.batchCode)) throw Object.assign(new Error('A batch with this code already exists.'), { status: 409 });
      const batch = { ...validation.value, id: crypto.randomUUID(), archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db.batches.unshift(batch);
      movement(db, { ...batch, type: 'RECEIVE', quantity: batch.quantity, notes: 'Initial stock entry' });
      return batch;
    });
    return respond(res, 201, { batch: result });
  }

  if (method === 'POST' && pathname === '/api/import') {
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    if (!Array.isArray(input.rows) || input.rows.length === 0) return fail(res, 400, 'No rows were supplied for import.');
    if (input.rows.length > 5000) return fail(res, 413, 'Import is limited to 5,000 batches per upload.');
    const result = await mutate((db) => {
      let imported = 0;
      let skipped = 0;
      const errors = [];
      input.rows.forEach((raw, index) => {
        const validation = validateBatch(raw);
        const rowNum = index + 2;
        if (validation.errors.length) { errors.push({ row: rowNum, batchCode: cleanText(raw?.batchCode, 60), errors: validation.errors }); skipped++; return; }
        if (duplicateCode(db, validation.value.batchCode)) { errors.push({ row: rowNum, batchCode: validation.value.batchCode, errors: ['Duplicate batch code; existing batch was not changed.'] }); skipped++; return; }
        const batch = { ...validation.value, id: crypto.randomUUID(), archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        db.batches.unshift(batch);
        movement(db, { ...batch, type: 'RECEIVE', quantity: batch.quantity, notes: 'Imported from CSV' });
        imported++;
      });
      return { imported, skipped, errors };
    });
    return respond(res, 200, result);
  }

  const batchMatch = pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (method === 'PATCH' && batchMatch) {
    const id = decodeURIComponent(batchMatch[1]);
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    const result = await mutate((db) => {
      const batch = batchById(db, id);
      if (!batch) throw Object.assign(new Error('Batch not found.'), { status: 404 });
      const allowed = ['batchCode', 'itemName', 'category', 'unit', 'receivedDate', 'expiryDate', 'supplier', 'costPerUnit', 'notes'];
      const candidate = { ...batch };
      for (const key of allowed) if (Object.hasOwn(input, key)) candidate[key] = input[key];
      const currentQuantity = Number(batch.quantity) || 0;
      candidate.quantity = Math.max(currentQuantity, 0.001);
      const validation = validateBatch(candidate);
      if (validation.errors.length) throw Object.assign(new Error('Please fix the batch form.'), { status: 400, details: validation.errors });
      if (duplicateCode(db, validation.value.batchCode, id)) throw Object.assign(new Error('A different batch already uses this code.'), { status: 409 });
      Object.assign(batch, validation.value, { quantity: currentQuantity, updatedAt: new Date().toISOString() });
      return batch;
    });
    return respond(res, 200, { batch: result });
  }

  const archiveMatch = pathname.match(/^\/api\/batches\/([^/]+)\/archive$/);
  if (method === 'POST' && archiveMatch) {
    const id = decodeURIComponent(archiveMatch[1]);
    const result = await mutate((db) => {
      const batch = batchById(db, id);
      if (!batch) throw Object.assign(new Error('Batch not found.'), { status: 404 });
      if (Number(batch.quantity) > 0) throw Object.assign(new Error('A batch can be archived only when its remaining quantity is zero. Adjust or write off its stock first.'), { status: 409 });
      batch.archived = true;
      batch.updatedAt = new Date().toISOString();
      return batch;
    });
    return respond(res, 200, { batch: result });
  }

  if (method === 'POST' && pathname === '/api/issue') {
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    const itemName = cleanText(input.itemName, 120);
    const unit = cleanText(input.unit, 24);
    const quantity = Number(input.quantity);
    const policy = String(input.policy || 'FEFO').toUpperCase();
    const issueDate = input.issueDate || todayISO();
    if (!itemName || !unit) return fail(res, 400, 'Choose an item and unit.');
    if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 1e9) return fail(res, 400, 'Issue quantity must be at least 0.001 and at most 1,000,000,000.');
    if (!['FEFO', 'FIFO'].includes(policy)) return fail(res, 400, 'Choose FEFO or FIFO policy.');
    if (issueDate !== todayISO()) return fail(res, 400, 'Stock issue date must be today. This local on-hand inventory version does not support back-dated issues.');
    const result = await mutate((db) => {
      const allocation = allocateStock(db.batches, { itemName, unit, quantity, policy, issueDate });
      if (allocation.fulfilled <= 0) throw Object.assign(new Error('No unexpired stock is available for this item.'), { status: 409 });
      for (const line of allocation.allocations) {
        const batch = db.batches.find((b) => b.id === line.batchId);
        batch.quantity = Math.max(0, roundQty(Number(batch.quantity) - line.quantity));
        batch.updatedAt = new Date().toISOString();
        movement(db, { ...batch, type: 'ISSUE', quantity: line.quantity, policy, date: issueDate, reference: cleanText(input.reference, 80), notes: cleanText(input.notes, 500) || `Stock issued using ${policy}` });
      }
      return allocation;
    });
    return respond(res, 200, result);
  }

  if (method === 'POST' && pathname === '/api/adjust') {
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    const quantity = Number(input.quantity);
    const action = String(input.action || '').toLowerCase();
    if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 1e9) return fail(res, 400, 'Adjustment quantity must be at least 0.001 and at most 1,000,000,000.');
    if (!['receive', 'remove', 'writeoff'].includes(action)) return fail(res, 400, 'Choose receive, remove, or writeoff.');
    const result = await mutate((db) => {
      const batch = batchById(db, String(input.batchId || ''));
      if (!batch) throw Object.assign(new Error('Batch not found.'), { status: 404 });
      const note = cleanText(input.notes, 500);
      if (action === 'receive' && batch.expiryDate < todayISO()) throw Object.assign(new Error('This batch is already expired. Create a new batch with the correct expiry date instead.'), { status: 409 });
      if (action === 'receive' && Number(batch.quantity) + quantity > 1e9) throw Object.assign(new Error('The resulting batch quantity cannot exceed 1,000,000,000.'), { status: 409 });
      if (action !== 'receive' && quantity > Number(batch.quantity)) throw Object.assign(new Error(`Cannot remove ${quantity} ${batch.unit}; this batch has only ${batch.quantity} ${batch.unit}.`), { status: 409 });
      if (action === 'writeoff' && batch.expiryDate >= todayISO()) throw Object.assign(new Error('Only expired batches can be written off as expired stock.'), { status: 409 });
      if (action === 'receive') {
        batch.quantity = roundQty(Number(batch.quantity) + quantity);
        movement(db, { ...batch, type: 'ADJUSTMENT_ADD', quantity, notes: note || 'Additional stock received' });
      } else {
        batch.quantity = Math.max(0, roundQty(Number(batch.quantity) - quantity));
        movement(db, { ...batch, type: action === 'writeoff' ? 'EXPIRED_WRITE_OFF' : 'ADJUSTMENT_REMOVE', quantity, notes: note || (action === 'writeoff' ? 'Expired stock removed' : 'Stock adjustment/removal') });
      }
      batch.updatedAt = new Date().toISOString();
      return batch;
    });
    return respond(res, 200, { batch: result });
  }

  if (method === 'POST' && pathname === '/api/settings') {
    const input = await readBody(req);
    if (!isRecord(input)) return fail(res, 400, 'Request body must be a JSON object.');
    const alertDays = Number(input.alertDays);
    if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 90) return fail(res, 400, 'Alert window must be a whole number from 1 to 90 days.');
    const settings = await mutate((db) => { db.settings.alertDays = alertDays; return db.settings; });
    return respond(res, 200, { settings });
  }

  if (method === 'POST' && pathname === '/api/demo') {
    const result = await mutate((db) => {
      if (db.batches.some((b) => !b.archived)) throw Object.assign(new Error('Demo data can only be loaded into an empty inventory. Export a backup first or clear the inventory manually.'), { status: 409 });
      const batches = makeDemoRows().map((row) => ({ ...row, id: crypto.randomUUID(), archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      for (const batch of batches) { db.batches.unshift(batch); movement(db, { ...batch, type: 'RECEIVE', quantity: batch.quantity, notes: 'Seed demo inventory' }); }
      return { imported: batches.length };
    });
    return respond(res, 201, result);
  }

  if (method === 'POST' && pathname === '/api/restore') {
    const input = await readBody(req);
    if (!input || input.backupFormat !== 'freshtrack-backup-v1' || !Array.isArray(input.batches) || !Array.isArray(input.movements) || !input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
      return fail(res, 400, 'This file is not a valid FreshTrack backup. Download a fresh JSON backup from this website.');
    }
    if (input.batches.length > 50000 || input.movements.length > 250000) return fail(res, 413, 'Backup is too large.');
    const alertDays = Number(input.settings.alertDays ?? 7);
    if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 90) return fail(res, 400, 'Backup contains invalid alert settings.');

    // Validate and normalize the complete backup before changing any saved records.
    const batchIds = new Set();
    const activeCodes = new Set();
    const restoredBatches = [];
    for (let index = 0; index < input.batches.length; index++) {
      const b = input.batches[index];
      if (!b || typeof b !== 'object' || Array.isArray(b)) return fail(res, 400, 'Backup contains an invalid batch record.', { row: index + 1 });
      const quantity = Number(b.quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1e9) return fail(res, 400, 'Backup contains an invalid quantity.', { row: index + 1, batchCode: b.batchCode });
      if (b.archived !== undefined && typeof b.archived !== 'boolean') return fail(res, 400, 'Backup contains an invalid archived flag.', { row: index + 1, batchCode: b.batchCode });
      const validation = validateBatch({ ...b, quantity: quantity > 0 ? quantity : 0.001 });
      if (validation.errors.length) return fail(res, 400, 'Backup contains an invalid batch.', { row: index + 1, batchCode: b.batchCode, errors: validation.errors });
      if (typeof b.id !== 'string' || !b.id.trim() || b.id.trim().length > 100) return fail(res, 400, 'Backup contains a missing or invalid batch ID.', { row: index + 1, batchCode: b.batchCode });
      const id = b.id.trim();
      if (batchIds.has(id)) return fail(res, 400, 'Backup contains duplicate batch IDs.', { batchId: id });
      batchIds.add(id);
      const archived = b.archived === true;
      const code = normalizeKey(validation.value.batchCode);
      if (!archived && activeCodes.has(code)) return fail(res, 400, 'Backup contains duplicate active batch codes.', { batchCode: validation.value.batchCode });
      if (!archived) activeCodes.add(code);
      const now = new Date().toISOString();
      restoredBatches.push({
        ...validation.value,
        id,
        quantity: roundQty(quantity),
        archived,
        createdAt: typeof b.createdAt === 'string' && !Number.isNaN(Date.parse(b.createdAt)) ? b.createdAt.slice(0, 40) : now,
        updatedAt: typeof b.updatedAt === 'string' && !Number.isNaN(Date.parse(b.updatedAt)) ? b.updatedAt.slice(0, 40) : now,
      });
    }

    const knownMovementTypes = new Set(['RECEIVE', 'ISSUE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'EXPIRED_WRITE_OFF']);
    const movementIds = new Set();
    const restoredMovements = [];
    for (let index = 0; index < input.movements.length; index++) {
      const m = input.movements[index];
      if (!m || typeof m !== 'object' || Array.isArray(m)) return fail(res, 400, 'Backup contains an invalid movement record.', { row: index + 1 });
      const quantity = Number(m.quantity);
      if (!knownMovementTypes.has(m.type) || !isValidDate(String(m.date || '')) || !Number.isFinite(quantity) || quantity < 0.001 || quantity > 1e9) {
        return fail(res, 400, 'Backup contains an invalid movement record.', { row: index + 1, type: m.type });
      }
      const policy = String(m.policy || '').toUpperCase();
      if (policy && !['FEFO', 'FIFO'].includes(policy)) return fail(res, 400, 'Backup contains an invalid movement policy.', { row: index + 1 });
      if (!cleanText(m.batchCode, 60) || !cleanText(m.itemName, 120) || !cleanText(m.unit, 24)) return fail(res, 400, 'Backup movement is missing its item, batch code or unit.', { row: index + 1 });
      if (m.batchId != null && (typeof m.batchId !== 'string' || m.batchId.length > 100 || !batchIds.has(m.batchId))) return fail(res, 400, 'Backup movement references an unknown batch ID.', { row: index + 1 });
      if (typeof m.id !== 'string' || !m.id.trim() || m.id.trim().length > 100) return fail(res, 400, 'Backup contains a missing or invalid movement ID.', { row: index + 1 });
      const id = m.id.trim();
      if (movementIds.has(id)) return fail(res, 400, 'Backup contains duplicate movement IDs.', { movementId: id });
      movementIds.add(id);
      const now = new Date().toISOString();
      restoredMovements.push({
        id,
        date: String(m.date),
        createdAt: typeof m.createdAt === 'string' && !Number.isNaN(Date.parse(m.createdAt)) ? m.createdAt.slice(0, 40) : now,
        batchId: typeof m.batchId === 'string' ? cleanText(m.batchId, 100) : null,
        batchCode: cleanText(m.batchCode, 60),
        itemName: cleanText(m.itemName, 120),
        unit: cleanText(m.unit, 24),
        type: m.type,
        quantity: roundQty(quantity),
        policy,
        reference: cleanText(m.reference, 80),
        notes: cleanText(m.notes, 500),
      });
    }

    const result = await replaceDatabase({
      createdAt: input.createdAt,
      batches: restoredBatches,
      movements: restoredMovements,
      settings: { alertDays },
    });
    return respond(res, 200, { restored: result });
  }

  return fail(res, 404, 'API route not found.');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return fail(res, 400, 'Invalid URL path.'); }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return fail(res, 403, 'Path is not allowed.');
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return fail(res, 404, 'File not found.');
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': pathname === '/index.html' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { return fail(res, 404, 'File not found.'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname.startsWith('/api/')) {
      await apiHandler(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed.');
    await serveStatic(req, res, url);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(`[FreshTrack] ${error.stack || error.message}`);
    if (!res.headersSent) fail(res, status, status >= 500 ? 'Server error. Check the console and inventory backup.' : error.message, error.details);
    else res.destroy();
  }
});

async function start() {
  await ensureDb();
  server.listen(PORT, HOST, () => {
    const address = server.address();
    console.log(`FreshTrack Inventory running at http://${HOST}:${address.port}`);
    console.log(`Data file: ${DB_FILE}`);
    console.log('Local-only mode: do not expose this server to the public internet.');
  });
}

if (require.main === module) start().catch((err) => { console.error(err); process.exitCode = 1; });
module.exports = { server, start };