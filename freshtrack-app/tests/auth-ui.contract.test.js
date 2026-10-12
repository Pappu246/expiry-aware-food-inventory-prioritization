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
