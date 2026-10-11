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

 
test('showcase uses live calendar dates and never allocates expired demo stock', () => {
  const block = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  assert.doesNotMatch(block, /2026-10-11|2026-10-12|2026-10-13/, 'demo behavior must not depend on the date it was authored');
  const makeElement = (value = '') => ({ value, innerHTML: '', handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
  const elements = {
    item: makeElement('Rice'),
    quantity: makeElement('15'),
    batchRows: makeElement(),
    result: makeElement(),
    runDemo: makeElement(),
  };
  let selectedPolicy = 'FEFO';
  const radios = ['FEFO', 'FIFO'].map((value) => { const radio = makeElement(); radio.value = value; return radio; });
  const document = {
    getElementById(id) { assert.ok(elements[id], 'unexpected demo element: ' + id); return elements[id]; },
    querySelector(selector) {
      assert.equal(selector, 'input[name="policy"]:checked');
      return { get value() { return selectedPolicy; } };
    },
    querySelectorAll(selector) { assert.equal(selector, 'input[name="policy"]'); return radios; },
  };
  const fixedNow = Date.parse('2035-01-01T12:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(fixedNow); }
    static now() { return fixedNow; }
  }
  new vm.Script(block).runInNewContext({ document, Date: FixedDate, Intl });

  assert.match(elements.batchRows.innerHTML, /RICE-004/);
  assert.match(elements.batchRows.innerHTML, /expired/i);
  elements.runDemo.handlers.click();
  const fefo = elements.result.innerHTML;
  assert.ok(fefo.indexOf('RICE-002') >= 0 && fefo.indexOf('RICE-002') < fefo.indexOf('RICE-001'), 'FEFO should allocate earliest expiry first');
  assert.ok(fefo.indexOf('RICE-001') < fefo.indexOf('RICE-003'), 'FEFO should preserve expiry order');
  assert.doesNotMatch(fefo, /RICE-004/, 'expired stock must not be allocated by FEFO');

  selectedPolicy = 'FIFO';
  radios[1].handlers.change();
  const fifo = elements.result.innerHTML;
  assert.ok(fifo.indexOf('RICE-003') >= 0 && fifo.indexOf('RICE-003') < fifo.indexOf('RICE-001'), 'FIFO should allocate earliest receipt first');
  assert.ok(fifo.indexOf('RICE-001') < fifo.indexOf('RICE-002'), 'FIFO should preserve receipt-order priority');
  assert.doesNotMatch(fifo, /RICE-004/, 'expired stock must not be allocated by FIFO');
});
