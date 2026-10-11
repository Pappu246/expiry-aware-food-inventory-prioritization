'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'showcase', 'index.html'), 'utf8');

test('showcase has its title, core sections and interactive controls', () => {
  assert.match(html, /<title>Expiry-Aware Inventory \| C11 DSA Project<\/title>/);
  for (const id of ['approach', 'demo', 'deliverables', 'item', 'quantity', 'runDemo', 'batchRows', 'result']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'missing expected element: ' + id);
  }
  assert.match(html, /Min-Heap/);
  assert.match(html, /Hash Table/);
  assert.match(html, /FEFO/);
  assert.match(html, /FIFO/);
  assert.match(html, /github\.com\/Pappu246\/expiry-aware-food-inventory-prioritization/);
  assert.match(html, /does not store or transmit real inventory/);
});

test('showcase browser script parses without external dependencies', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'showcase should use one local inline script');
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'showcase must not need an external script host');
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket/, 'demo must not send or receive inventory data');
  assert.doesNotThrow(() => new vm.Script(blocks[0][1]), 'inline JavaScript syntax must compile');
});

test('all source and guide links in showcase point to the project repository', () => {
  const links = [...html.matchAll(/href="(https:\/\/github\.com\/Pappu246\/expiry-aware-food-inventory-prioritization[^"]*)"/g)].map(m => m[1]);
  assert.ok(links.length >= 8, 'expected source, docs and tests links');
  assert.ok(links.some(url => url.endsWith('/tree/main/src')));
  assert.ok(links.some(url => url.endsWith('/tree/main/tests')));
  assert.ok(links.some(url => url.endsWith('/blob/main/PROJECT_SPEC.md')));
});
