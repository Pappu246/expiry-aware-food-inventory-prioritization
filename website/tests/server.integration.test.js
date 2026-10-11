'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { addDaysISO, todayISO } = require('../lib/inventory');

let child;
let baseUrl;
let tempDir;

async function startServer(existingTempDir) {
  tempDir = existingTempDir || await fs.mkdtemp(path.join(os.tmpdir(), 'freshtrack-test-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', FRESHTRACK_DATA_DIR: tempDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const portPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for server startup. Output: ${output}`)), 7000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/FreshTrack Inventory running at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { if (!output.includes('FreshTrack Inventory running at')) { clearTimeout(timer); reject(new Error(`Server exited with code ${code}. Output: ${output}`)); } });
  });
  const port = await portPromise;
  baseUrl = `http://127.0.0.1:${port}`;
}

async function request(route, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, payload, response };
}

test('HTTP server supports the main inventory workflow end-to-end', async (t) => {
  await startServer();
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); }
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.payload.ok, true);

  const today = todayISO();
  const createBatch = async (batchCode, receivedOffset, expiryOffset, quantity) => request('/api/batches', 'POST', {
    batchCode, itemName: 'Basmati Rice', category: 'Grains', quantity, unit: 'kg',
    receivedDate: addDaysISO(today, receivedOffset), expiryDate: addDaysISO(today, expiryOffset), supplier: 'Test Supplier', costPerUnit: 60,
  });
  assert.equal((await createBatch('RICE-OLD', -10, 20, 10)).status, 201);
  assert.equal((await createBatch('RICE-SOON', -1, 2, 3)).status, 201);
  assert.equal((await createBatch('RICE-EXPIRED', -15, -1, 99)).status, 201);
  assert.equal((await createBatch('RICE-OLD', -1, 2, 1)).status, 409, 'duplicate batch codes must be rejected');
  assert.equal((await createBatch('TOO-SMALL', -1, 2, 0.0004)).status, 400, 'positive values that round to zero must be rejected');
  assert.equal((await createBatch('BAD-DATE-ORDER', -5, -10, 2)).status, 400, 'expiry cannot be before the receipt date');
  assert.equal((await createBatch('FUTURE-RECEIPT', 2, 30, 2)).status, 400, 'future receipt dates are not valid on-hand inventory');

  assert.equal((await request('/api/issue', 'POST', { itemName: 'Basmati Rice', unit: 'kg', quantity: 0.0004, policy: 'FEFO', issueDate: today })).status, 400, 'sub-milliquantities must be rejected');
  const backdatedIssue = await request('/api/issue', 'POST', { itemName: 'Basmati Rice', unit: 'kg', quantity: 4, policy: 'FEFO', issueDate: addDaysISO(today, -1), reference: 'Backdated test' });
  assert.equal(backdatedIssue.status, 400, 'current on-hand inventory must reject back-dated stock issues');
  const issue = await request('/api/issue', 'POST', { itemName: 'Basmati Rice', unit: 'kg', quantity: 4, policy: 'FEFO', issueDate: today, reference: 'Integration test' });
  assert.equal(issue.status, 200);
  assert.equal(issue.payload.fulfilled, 4);
  assert.deepEqual(issue.payload.allocations.map((a) => [a.batchCode, a.quantity]), [['RICE-SOON', 3], ['RICE-OLD', 1]]);
  assert.equal(issue.payload.allocations.some((a) => a.batchCode === 'RICE-EXPIRED'), false);

  const createTea = await request('/api/batches', 'POST', { batchCode: 'TEA-RACE', itemName: 'Tea', quantity: 10, unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 10) });
  assert.equal(createTea.status, 201);
  const simultaneousIssues = await Promise.all([
    request('/api/issue', 'POST', { itemName: 'Tea', unit: 'kg', quantity: 7, policy: 'FEFO', issueDate: today }),
    request('/api/issue', 'POST', { itemName: 'Tea', unit: 'kg', quantity: 7, policy: 'FEFO', issueDate: today }),
  ]);
  assert.ok(simultaneousIssues.every((r) => r.status === 200), 'both concurrent requests should return a truthful allocation result');
  assert.equal(simultaneousIssues.reduce((sum, r) => sum + r.payload.fulfilled, 0), 10, 'serialized stock changes must not over-issue a batch');
  assert.equal(simultaneousIssues.reduce((sum, r) => sum + r.payload.shortfall, 0), 4, 'concurrent requests must preserve the true shortfall');
  const teaState = await request('/api/state');
  assert.equal(teaState.payload.batches.find((b) => b.batchCode === 'TEA-RACE').quantity, 0);

  const state = await request('/api/state');
  assert.equal(state.status, 200);
  assert.equal(state.payload.batches.find((b) => b.batchCode === 'RICE-SOON').quantity, 0);
  assert.equal(state.payload.batches.find((b) => b.batchCode === 'RICE-OLD').quantity, 9);
  assert.equal(state.payload.movements.filter((m) => m.type === 'ISSUE').length, 4, 'two Rice allocations and two serialized Tea issue requests should be logged');
  assert.ok(state.payload.movements.filter((m) => m.type === 'ISSUE').every((m) => typeof m.batchId === 'string' && m.batchId.length > 0), 'movement rows must link to their source batch');

  const csv = await request('/api/export/inventory.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.payload, /RICE-EXPIRED/);
  assert.match(csv.response.headers.get('content-type'), /text\/csv/);

  const imported = await request('/api/import', 'POST', { rows: [
    { batchCode: 'OIL-1', itemName: 'Cooking Oil', category: 'Essentials', quantity: 2, unit: 'L', receivedDate: today, expiryDate: addDaysISO(today, 60), notes: '=1+1' },
    { batchCode: 'RICE-OLD', itemName: 'Duplicate Rice', quantity: 7, unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 10) },
    { batchCode: 'BAD-ROW', itemName: 'No expiry', quantity: 1, unit: 'kg', receivedDate: today },
  ] });
  assert.equal(imported.status, 200);
  assert.equal(imported.payload.imported, 1);
  assert.equal(imported.payload.skipped, 2);
  const injectionSafeCsv = await request('/api/export/inventory.csv');
  assert.match(injectionSafeCsv.payload, /'=1\+1/, 'CSV text beginning with a formula character must be prefixed safely');
  const stateAfterImport = await request('/api/state');
  const oilId = stateAfterImport.payload.batches.find((b) => b.batchCode === 'OIL-1').id;
  assert.equal((await request('/api/adjust', 'POST', { batchId: oilId, action: 'receive', quantity: 1000000000 })).status, 409, 'adjustments must not exceed the batch quantity limit');

  assert.equal((await request('/api/settings', 'POST', { alertDays: 14 })).status, 200);
  assert.equal((await request('/api/settings', 'POST', { alertDays: 0 })).status, 400);

  const createMilk = await request('/api/batches', 'POST', { batchCode: 'MILK-ZERO', itemName: 'Milk', category: 'Dairy', quantity: 1, unit: 'L', receivedDate: today, expiryDate: addDaysISO(today, 4), supplier: 'Test Supplier', costPerUnit: 50 });
  assert.equal(createMilk.status, 201);
  const milkIssue = await request('/api/issue', 'POST', { itemName: 'Milk', unit: 'L', quantity: 1, policy: 'FEFO', issueDate: today });
  assert.equal(milkIssue.payload.fulfilled, 1);
  const milkId = createMilk.payload.batch.id;
  const editEmptyBatch = await request(`/api/batches/${encodeURIComponent(milkId)}`, 'PATCH', { supplier: 'Updated Supplier' });
  assert.equal(editEmptyBatch.status, 200, 'editing metadata should work after the remaining quantity reaches zero');
  assert.equal(editEmptyBatch.payload.batch.quantity, 0);
  assert.equal((await request(`/api/batches/${encodeURIComponent(milkId)}/archive`, 'POST', {})).status, 200);

  const createExpired = await request('/api/batches', 'POST', { batchCode: 'PANEER-OLD', itemName: 'Paneer', category: 'Dairy', quantity: 5, unit: 'kg', receivedDate: addDaysISO(today, -5), expiryDate: addDaysISO(today, -1), supplier: 'Test Supplier', costPerUnit: 200 });
  assert.equal(createExpired.status, 201);
  assert.equal((await request('/api/adjust', 'POST', { batchId: createExpired.payload.batch.id, action: 'receive', quantity: 1, notes: 'Must use a new batch' })).status, 409, 'expired batch stock must not be increased');
  assert.equal((await request('/api/adjust', 'POST', { batchId: createExpired.payload.batch.id, action: 'writeoff', quantity: 2, notes: 'Expired sample' })).status, 200);
  assert.equal((await request('/api/adjust', 'POST', { batchId: createExpired.payload.batch.id, action: 'writeoff', quantity: 9, notes: 'Too much' })).status, 409);

  const backup = await request('/api/backup');
  assert.equal(backup.status, 200);
  assert.equal(backup.payload.backupFormat, 'freshtrack-backup-v1');
  const restore = await request('/api/restore', 'POST', backup.payload);
  assert.equal(restore.status, 200);
  assert.ok(restore.payload.restored.movements > 0);
  const badRestore = await request('/api/restore', 'POST', { ...backup.payload, batches: [{ ...backup.payload.batches[0], quantity: -1 }] });
  assert.equal(badRestore.status, 400, 'negative quantities in a backup must be rejected');
  const invalidMovementRestore = await request('/api/restore', 'POST', { ...backup.payload, movements: [{ ...backup.payload.movements[0], type: '<script>' }] });
  assert.equal(invalidMovementRestore.status, 400, 'unknown movement types in a backup must be rejected');
  const stateAfterRejectedRestore = await request('/api/state');
  assert.equal(stateAfterRejectedRestore.payload.batches.length, backup.payload.batches.length, 'invalid restores must not replace saved inventory');
  assert.equal(stateAfterRejectedRestore.payload.movements.length, backup.payload.movements.length, 'invalid restores must not replace saved history');
  assert.equal((await request('/api/restore', 'POST', { ...backup.payload, backupFormat: 'other-format' })).status, 400, 'unrecognized backup formats must be rejected');

  const codeReuse = await request('/api/batches', 'POST', { batchCode: 'REUSE-CODE', itemName: 'Beans', quantity: 1, unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 10) });
  assert.equal(codeReuse.status, 201);
  assert.equal((await request('/api/issue', 'POST', { itemName: 'Beans', unit: 'kg', quantity: 1, policy: 'FEFO', issueDate: today })).status, 200);
  assert.equal((await request(`/api/batches/${encodeURIComponent(codeReuse.payload.batch.id)}/archive`, 'POST', {})).status, 200);
  const reusedCodeActive = await request('/api/batches', 'POST', { batchCode: 'REUSE-CODE', itemName: 'Beans', quantity: 2, unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 12) });
  assert.equal(reusedCodeActive.status, 201);
  const backupWithArchivedReuse = await request('/api/backup');
  assert.equal((await request('/api/restore', 'POST', backupWithArchivedReuse.payload)).status, 200, 'valid backups may contain the same code on an archived and a current batch');
  const badReferenceRestore = await request('/api/restore', 'POST', { ...backupWithArchivedReuse.payload, movements: [{ ...backupWithArchivedReuse.payload.movements[0], batchId: 'missing-batch-id' }] });
  assert.equal(badReferenceRestore.status, 400, 'backup movements must not reference nonexistent batches');

  // Semantically damaged JSON must not be accepted as a valid database or overwrite the last good snapshot.
  const knownGoodSnapshotResponse = await request('/api/backup/previous');
  assert.equal(knownGoodSnapshotResponse.status, 200);
  const knownGoodSnapshot = knownGoodSnapshotResponse.payload;
  const storedDbFile = path.join(tempDir, 'inventory.json');
  const semanticallyBadDb = JSON.parse(await fs.readFile(storedDbFile, 'utf8'));
  semanticallyBadDb.batches[0].quantity = -77;
  await fs.writeFile(storedDbFile, JSON.stringify(semanticallyBadDb), 'utf8');
  assert.equal((await request('/api/state')).status, 500, 'semantically invalid stored quantities must not be served as current inventory');
  const snapshotAfterDamage = await request('/api/backup/previous');
  assert.equal(snapshotAfterDamage.status, 200);
  assert.deepEqual(snapshotAfterDamage.payload, knownGoodSnapshot, 'a semantically damaged database must not overwrite the known-good snapshot');
  assert.equal((await request('/api/restore', 'POST', knownGoodSnapshot)).status, 200, 'the last good snapshot should repair a semantically damaged data file');
  assert.equal((await request('/api/state')).status, 200);

  // Restoration should also recover a damaged on-disk JSON file, not require reading it first.
  await fs.writeFile(path.join(tempDir, 'inventory.json'), '{ broken json', 'utf8');
  const recoverCorruptStore = await request('/api/restore', 'POST', backupWithArchivedReuse.payload);
  assert.equal(recoverCorruptStore.status, 200, 'valid backup must be able to repair a corrupted inventory file');
  const recoveredState = await request('/api/state');
  assert.equal(recoveredState.status, 200);
  assert.ok(recoveredState.payload.batches.some((b) => b.batchCode === 'REUSE-CODE' && !b.archived));

  const html = await request('/');
  assert.equal(html.status, 200);
  assert.match(html.payload, /FreshTrack/);
  const css = await request('/styles.css');
  assert.match(css.response.headers.get('content-type'), /text\/css/);
  assert.match(css.payload, /--forest/);
  const head = await fetch(`${baseUrl}/app.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  const traversal = await request('/%2e%2e/server.js');
  assert.equal(traversal.status, 404, 'path traversal must not expose server-side files');

  const nullBodyRoutes = [
    ['/api/batches', 'POST'], ['/api/import', 'POST'], ['/api/issue', 'POST'],
    ['/api/adjust', 'POST'], ['/api/settings', 'POST'], ['/api/restore', 'POST'],
    [`/api/batches/${encodeURIComponent(createTea.payload.batch.id)}`, 'PATCH'],
  ];
  for (const [route, method] of nullBodyRoutes) {
    const malformed = await fetch(`${baseUrl}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: 'null' });
    assert.equal(malformed.status, 400, `${method} ${route} should reject a JSON null body as a client error`);
  }

  const badOrigin = await fetch(`${baseUrl}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://malicious.example' }, body: JSON.stringify({ alertDays: 7 }) });
  assert.equal(badOrigin.status, 403);

  const tooLarge = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertDays: 7, oversized: 'x'.repeat(10 * 1024 * 1024) }),
  });
  assert.equal(tooLarge.status, 413, 'request bodies larger than 10 MiB must be rejected with HTTP 413');
});


test('saved stock and movement history survive a server process restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freshtrack-restart-'));
  let processRef;
  const launch = async () => {
    processRef = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', FRESHTRACK_DATA_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Restart test server failed to start: ${output}`)), 7000);
      processRef.stdout.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/FreshTrack Inventory running at http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      processRef.stderr.on('data', (chunk) => { output += chunk.toString(); });
      processRef.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    return `http://127.0.0.1:${port}`;
  };
  const stop = async () => {
    if (processRef && processRef.exitCode === null) {
      const proc = processRef;
      proc.kill('SIGTERM');
      await new Promise((resolve) => proc.once('exit', resolve));
    }
  };
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });

  let url = await launch();
  const today = todayISO();
  const first = await fetch(`${url}/api/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchCode: 'PERSIST-1', itemName: 'Oats', quantity: 8, unit: 'kg', receivedDate: today, expiryDate: addDaysISO(today, 30) }) });
  assert.equal(first.status, 201);
  const previousSnapshotResponse = await fetch(`${url}/api/backup/previous`);
  assert.equal(previousSnapshotResponse.status, 200);
  const previousSnapshot = await previousSnapshotResponse.json();
  assert.equal(previousSnapshot.backupFormat, 'freshtrack-backup-v1');
  assert.equal(previousSnapshot.batches.some((b) => b.batchCode === 'PERSIST-1'), false, 'the automatic snapshot should preserve the state from before the latest mutation');
  await stop();

  url = await launch();
  const saved = await fetch(`${url}/api/state`);
  assert.equal(saved.status, 200);
  const data = await saved.json();
  assert.equal(data.batches.find((b) => b.batchCode === 'PERSIST-1').quantity, 8);
  assert.ok(data.movements.some((m) => m.type === 'RECEIVE' && m.batchCode === 'PERSIST-1'));
});
 
test('local inventory server refuses non-loopback network binding', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freshtrack-bind-guard-'));
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, HOST: '0.0.0.0', PORT: '0', FRESHTRACK_DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
  t.after(async () => {
    if (proc.exitCode === null) { proc.kill('SIGTERM'); await new Promise((resolve) => proc.once('exit', resolve)); }
    await fs.rm(dir, { recursive: true, force: true });
  });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Bind-guard server did not exit promptly.')); }, 5000);
    proc.once('error', (error) => { clearTimeout(timer); reject(error); });
    proc.once('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
  assert.notEqual(exitCode, 0, 'a public-interface bind must fail closed');
  assert.match(output, /Refusing to bind to non-loopback host: 0\.0\.0\.0/);
  assert.equal(await fs.access(path.join(dir, 'inventory.json')).then(() => true, () => false), false, 'rejected startup must not create an inventory database');
});


test('missing primary inventory preserves and can restore an existing automatic backup', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freshtrack-missing-primary-'));
  const now = new Date().toISOString();
  const today = todayISO();
  const backup = {
    version: 1,
    settings: { alertDays: 7 },
    batches: [{
      id: 'recovery-batch-001',
      batchCode: 'RECOVERY-RICE-001',
      itemName: 'Rice',
      category: 'Grains',
      quantity: 12,
      unit: 'kg',
      receivedDate: today,
      expiryDate: addDaysISO(today, 30),
      supplier: 'Recovery test',
      costPerUnit: 25,
      notes: 'must survive missing-primary recovery',
      archived: false,
      createdAt: now,
      updatedAt: now,
    }],
    movements: [],
    createdAt: now,
    updatedAt: now,
    backupFormat: 'freshtrack-backup-v1',
    exportedAt: now,
  };
  await fs.writeFile(path.join(dir, 'inventory.json.bak'), JSON.stringify(backup, null, 2) + '\n', 'utf8');
  await startServer(dir);
  t.after(async () => {
    if (child && child.exitCode === null) {
      const running = child;
      running.kill('SIGTERM');
      await new Promise((resolve) => running.once('exit', resolve));
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  assert.equal((await request('/api/health')).status, 200, 'the local server must stay available for recovery');
  const missingState = await request('/api/state');
  assert.equal(missingState.status, 409, 'missing primary plus available backup must fail closed');
  assert.match(missingState.payload.error, /automatic recovery snapshot exists/i);
  assert.equal(await fs.access(path.join(dir, 'inventory.json')).then(() => true, () => false), false, 'the server must not create an empty primary over the recoverable state');

  const previous = await request('/api/backup/previous');
  assert.equal(previous.status, 200);
  assert.equal(previous.payload.backupFormat, 'freshtrack-backup-v1');
  assert.equal(previous.payload.batches[0].batchCode, 'RECOVERY-RICE-001');

  const restored = await request('/api/restore', 'POST', previous.payload);
  assert.equal(restored.status, 200, 'the automatic snapshot must be restorable without a primary file');
  const recoveredState = await request('/api/state');
  assert.equal(recoveredState.status, 200);
  assert.equal(recoveredState.payload.batches[0].quantity, 12);
  assert.equal(recoveredState.payload.batches[0].batchCode, 'RECOVERY-RICE-001');
});
