'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('FreshTrack page keeps core inventory UI and references local assets', () => {
  const html = read('index.html');
  assert.match(html, /<title>FreshTrack — Expiry-aware inventory<\/title>/);
  for (const marker of ['id="app"', 'id="inventoryRows"', 'id="alerts"', 'id="issueForm"', 'id="adjustForm"', 'id="googleSignIn"', 'Continue with Google', 'id="authForm"', 'src="/config.js"', 'src="/app.js"', 'href="/styles.css"']) assert.ok(html.includes(marker), marker);
});

test('Google button builds a Supabase Google authorization request', () => {
  const app = read('app.js');
  assert.match(app, /\$\('googleSignIn'\)\.addEventListener\('click'/);
  assert.match(app, /new URL\(base\+'\/auth\/v1\/authorize'\)/);
  assert.match(app, /searchParams\.set\('provider','google'\)/);
  assert.match(app, /searchParams\.set\('redirect_to'/);
  assert.match(app, /location\.assign\(authorize\.toString\(\)\)/);
});

test('existing OAuth callback retains token validation and error handling', () => {
  const app = read('app.js');
  assert.match(app, /fragment\.get\('access_token'\)/);
  assert.match(app, /fragment\.get\('refresh_token'\)/);
  assert.match(app, /await auth\('user',undefined,accessToken\)/);
  assert.match(app, /redirectError/);
  assert.match(app, /saveSession\(null\)/);
});

test('browser config is the public Supabase client config only', () => {
  const context = { window: {} };
  vm.runInNewContext(read('config.js'), context);
  const cfg = context.window.FRESHTRACK_CONFIG;
  assert.equal(cfg.mode, 'cloud');
  assert.match(cfg.supabaseUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  assert.equal(typeof cfg.publishableKey, 'string');
  assert.ok(cfg.publishableKey.length > 20);
  assert.doesNotMatch(cfg.publishableKey, /service.role|secret|razorpay|stripe/i);
});

test('build config copies four required source assets to public output', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.build, 'node build.js');
  for (const name of ['index.html', 'app.js', 'styles.css', 'config.js']) assert.ok(fs.statSync(path.join(root, name)).isFile());
  for (const name of ['index.html', 'app.js', 'styles.css', 'config.js']) assert.ok(read('build.js').includes(name));
  assert.equal(JSON.parse(read('vercel.json')).outputDirectory, 'public');
});


test('dashboard navigation is accessible and every quick link has a destination', () => {
  const html = read('index.html');
  const css = read('styles.css');
  assert.match(html, /class="skip-link" href="#maincontent"/);
  assert.match(html, /<nav class="quicknav" aria-label="Quick navigation">/);
  assert.match(html, /id="maincontent"/);
  const links = [...html.matchAll(/<a href="#([^"]+)">/g)].map((match) => match[1]);
  assert.ok(links.length >= 7, 'expected quick navigation for common inventory tasks');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const target of links) assert.ok(ids.has(target), 'missing quick navigation target: ' + target);
  assert.match(html, /id="clearFilters"/);
  assert.match(html, /aria-label="Search by item, batch ID, supplier, or category"/);
  assert.match(html, /aria-label="Filter inventory by status"/);
  assert.match(css, /\.skip-link:focus/);
  assert.match(css, /\.quicknav a:focus-visible/);
});

test('search and filter empty states explain how to recover', () => {
  const app = read('app.js');
  assert.match(app, /No batches match your search or filters\. Select Clear filters to see all stock\./);
  assert.match(app, /Your inventory is empty\. Start with Add stock above/);
  assert.match(app, /\$\('clearFilters'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('statusFilter'\)\.value='all'/);
  assert.match(app, /\$\('search'\)\.focus\(\)/);
});

test('mobile navigation and reduced-motion preferences are supported', () => {
  const css = read('styles.css');
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /:focus-visible/);
});

test('network and inventory-load errors remain visible and actionable', () => {
  const app = read('app.js');
  assert.match(app, /FreshTrack could not connect\. Check your internet connection and try again\./);
  assert.match(app, /You are signed in, but your inventory could not load\./);
  assert.match(app, /msg\('authMsg',friendlyError\(err\),true\)/);
});
