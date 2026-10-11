'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'START_WEBSITE.bat'), 'utf8');
const stopLauncher = fs.readFileSync(path.join(root, 'STOP_WEBSITE.bat'), 'utf8');

test('website asset references and DOM IDs are consistent', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML element IDs must be unique');
  const idSet = new Set(ids);
  const staticSelectors = [...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)].map((match) => match[1]);
  const missing = [...new Set(staticSelectors.filter((id) => !idSet.has(id)))];
  assert.deepEqual(missing, [], 'all literal JavaScript ID selectors must exist in the HTML');
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/app\.js"/);
  assert.ok(css.includes('.expiry-preview'), 'expiry preview must have a visible style');
});

test('manual batch form exposes and updates a live expiry preview', () => {
  assert.match(html, /id="expiryPreview"/);
  assert.match(html, /id="downloadPreviousBackup"/);
  assert.match(js, /function updateExpiryPreview\(\)/);
  assert.match(js, /elements\.receivedDate\.addEventListener\('change', updateExpiryPreview\)/);
  assert.match(js, /elements\.expiryDate\.addEventListener\('change', updateExpiryPreview\)/);
  assert.match(js, /function expiryCountdownLabel\(date\)/);
  assert.match(js, /Expired \$\{Math\.abs\(days\)\}/);
});

test('website has no third-party runtime asset dependency', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(?:src|href)=["']https?:/i);
  assert.doesNotMatch(js, /https?:\/\//i);
});


test('refreshes expiry status when the local date changes while the tab is open', () => {
  assert.match(js, /setInterval\(async \(\) => \{/);
  assert.match(js, /if \(observed === lastObservedDate\) return;/);
  assert.match(js, /refresh\(\{ quiet: true \}\)/);
  assert.match(js, /if \(updated\) \{[\s\S]*lastObservedDate = observed;/);
});


test('Windows launcher checks Node.js compatibility and server health before opening the site', () => {
  assert.match(launcher, /process\.versions\.node\.split\('\.'\)\[0\]/);
  assert.match(launcher, /NODE_MAJOR% LSS 18/);
  assert.match(launcher, /FreshTrack Inventory/);
  assert.match(launcher, /did not become healthy/);
  assert.match(stopLauncher, /FreshTrack Inventory/);
  assert.match(stopLauncher, /No process was stopped/);
});

test('inventory load failures distinguish an unreachable server from data that needs recovery', () => {
  assert.match(js, /await api\('\/api\/health'\); serverReachable = true/);
  assert.match(js, /Server connected · inventory data needs recovery/);
  assert.match(js, /Inventory data could not be loaded/);
  assert.match(js, /Settings &amp; backup to restore the previous automatic snapshot/);
});
