#!/usr/bin/env python3
"""Import the current public FreshTrack UI into this repository's integration branch."""
from __future__ import annotations
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://freshtrack-inventory.vercel.app"
ASSETS = {
    "index.html": ORIGIN + "/",
    "app.js": ORIGIN + "/app-live.js",
    "styles.css": ORIGIN + "/styles-live.css",
    "config.js": ORIGIN + "/config.js",
}

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "FreshTrack-Source-Import/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("Source fetch failed with HTTP " + str(response.status))
        data = response.read()
    if not data:
        raise RuntimeError("Source fetch returned an empty file.")
    return data.decode("utf-8")

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(label + ": expected one source marker, found " + str(count))
    return source.replace(old, new, 1)

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")

def change_line(docs: dict[str, str], path: str, needle: str, replacement: str) -> None:
    source = docs.get(path)
    if source is None:
        source = (ROOT / path).read_text(encoding="utf-8")
    lines = source.splitlines()
    found = [i for i, line in enumerate(lines) if needle in line]
    if len(found) != 1:
        raise RuntimeError(path + ": expected one matching line for " + repr(needle) + ", found " + str(len(found)))
    lines[found[0]] = replacement
    docs[path] = "\n".join(lines) + "\n"

def main() -> None:
    data = {name: fetch(url) for name, url in ASSETS.items()}
    html, app, css, config = data["index.html"], data["app.js"], data["styles.css"], data["config.js"]
    if "FreshTrack" not in html or 'id="authForm"' not in html:
        raise RuntimeError("Remote site is not the expected FreshTrack login UI.")
    if "FRESHTRACK_CONFIG" not in config or "publishableKey" not in config:
        raise RuntimeError("Expected public Supabase configuration not found.")
    if re.search(r"service[_-]?role[_-]?key\s*:\s*['\"]", config, re.I):
        raise RuntimeError("Refusing to import a service-role key into client-side config.")

    html = replace_once(html, 'href="/styles-live.css"', 'href="/styles.css"', "CSS asset path")
    html = replace_once(html, 'src="/app-live.js"', 'src="/app.js"', "JS asset path")
    button = """<button id="googleSignIn" class="btn google-signin" type="button" aria-label="Continue with Google">
  <svg aria-hidden="true" viewBox="0 0 48 48" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.66 5.94c4.47-4.13 7.11-10.21 7.11-17.59Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.97-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.86l-7.67-5.94c-2.13 1.43-4.86 2.28-8.23 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48Z"/></svg>
  <span>Continue with Google</span>
</button>
<div class="auth-divider" aria-hidden="true"><span>or continue with email</span></div>
"""
    html = replace_once(html, '<form id="authForm">', button + '<form id="authForm">', "Google button insertion")
    oauth = """$('googleSignIn').addEventListener('click',()=>{
 if(!base||!key){msg('authMsg','Google sign-in is unavailable because the cloud configuration is missing.',true);return}
 const authorize=new URL(base+'/auth/v1/authorize');
 authorize.searchParams.set('provider','google');
 authorize.searchParams.set('redirect_to',new URL(location.pathname,location.origin).toString());
 location.assign(authorize.toString());
});
"""
    app = replace_once(app, "$('authForm').addEventListener('submit',async e=>{", oauth + "$('authForm').addEventListener('submit',async e=>{", "Google OAuth handler")
    css += """
/* Google identity entry for the existing FreshTrack sign-in card. */
.google-signin{width:100%;display:flex;align-items:center;justify-content:center;gap:11px;background:#fff!important;color:#26352d!important;border:1px solid #d8e1da!important;margin:12px 0 15px;font-weight:700;min-height:46px;box-shadow:0 1px 2px rgba(20,42,32,.05)}
.google-signin:hover{background:#f8faf8!important;border-color:#b8c7bd!important}
.google-signin svg{width:18px;height:18px;flex:0 0 18px}
.google-signin:focus-visible{outline:3px solid rgba(66,133,244,.25);outline-offset:2px}
.auth-divider{display:flex;align-items:center;gap:12px;margin:0 0 14px;color:#87938b;font-size:11px}
.auth-divider:before,.auth-divider:after{content:"";height:1px;background:#e4eae5;flex:1}
"""
    package = """{
  "name": "freshtrack-inventory",
  "version": "1.0.0",
  "private": true,
  "description": "FreshTrack Inventory cloud application for expiry-aware FEFO/FIFO stock management.",
  "scripts": { "build": "node build.js", "test": "node --test tests/*.test.js" },
  "engines": { "node": ">=18" }
}
"""
    build = """'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const output = path.join(root, 'public');
const sources = ['index.html', 'app.js', 'styles.css', 'config.js'];
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of sources) {
  const source = path.join(root, name);
  if (!fs.statSync(source).isFile()) throw new Error('Required FreshTrack asset missing: ' + name);
  fs.copyFileSync(source, path.join(output, name));
}
console.log('FreshTrack static build complete: ' + sources.length + ' assets copied to public/.');
"""
    vercel = """{
  "outputDirectory": "public",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Cache-Control", "value": "no-cache, must-revalidate" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://lnpkoldlxcjypfgnqzix.supabase.co; form-action 'self'; base-uri 'self'; frame-ancestors 'none'"
        }
      ]
    }
  ]
}
"""
    app_readme = """# FreshTrack Inventory — cloud UI source

This folder preserves the existing FreshTrack Inventory experience: dashboard, inventory, expiry watch, FEFO/FIFO issue, movements, reporting, exports, and backup. The UI uses the existing Supabase account/session and inventory setup. The C11 engine, local JSON app, and cloud account store are separate systems and do not automatically synchronize.

The sign-in card includes Continue with Google and keeps email/password auth. Supabase reported Google enabled and the authorization endpoint redirected to Google's OAuth screen; full interactive sign-in has not been automated. Keep the existing FreshTrack hostname in the Supabase Auth redirect allow-list through the release cutover.

No payment gateway or paid-plan enforcement existed in the previous FreshTrack deployment. A real checkout requires a selected gateway, prices, server-side credentials, signature/webhook verification, and persistent entitlements. Do not claim a checkout works before those are built and tested. See PAYMENTS_READINESS.md.
"""
    payments = """# FreshTrack payment integration readiness

Status: no live payment gateway is connected. The previous FreshTrack app did not contain a checkout SDK, server-side order endpoint, webhook verifier, or subscription entitlement enforcement. Do not show a successful payment state before a real sandbox flow has been tested.

Before implementing checkout, decide the gateway, price/currency, billing cadence, and plan entitlements. Create orders server-side using secrets stored only in Vercel Environment Variables; verify checkout and webhook signatures server-side; persist transaction and subscription state in Supabase with owner-scoped RLS; and add idempotency, duplicate-webhook handling, cancellation/refunds, and sandbox tests.

Never put payment secrets in config.js or browser JavaScript, and never trust a client-submitted paid flag.
"""
    tests = r"""'use strict';
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
"""
    checklist = """# FreshTrack consolidation — release checklist

Prepared state:
- Canonical repo: Pappu246/expiry-aware-food-inventory-prioritization.
- Integration branch: freshtrack/unified-ui-google-auth.
- Intended Vercel root: freshtrack-app; build: npm run build; output: public.
- Production deployment and domain aliases are not changed by the source-import workflow.
- The old freshtrack-inventory Vercel project stays available as a rollback option.
- Supabase Google provider was confirmed enabled and its authorize endpoint returned a redirect to Google. Automated interactive sign-in is not complete.
- Payment processing is not implemented; gateway, prices, credentials, server-side verification, and entitlements remain to be built.

Cutover:
1. Wait for C11 CI, FreshTrack contract tests/build, and archive validation to pass on this branch.
2. Merge the integration branch only at the planned release time.
3. Confirm the target Vercel build is READY for the merged commit.
4. Smoke-test assets, Google authentication, inventory read/add/issue, expiry alerts, movements, and export/backup flows.
5. Transfer freshtrack-inventory.vercel.app only after smoke tests pass and confirm it remains on the Supabase Auth redirect allow-list.
6. Keep the old Vercel project until the new domain and sign-in are verified. Do not delete or rename it early.
7. Add payments only after merchant setup and pricing exist. Never fake checkout success.

Rollback: if the consolidated release fails, restore the hostname to the previous FreshTrack deployment and diagnose before retrying.
"""

    docs: dict[str, str] = {}
    def change_line(path: str, needle: str, replacement: str) -> None:
        source = docs.get(path)
        if source is None:
            source = (ROOT / path).read_text(encoding="utf-8")
        lines = source.splitlines()
        found = [i for i, line in enumerate(lines) if needle in line]
        if len(found) != 1:
            raise RuntimeError(path + ": expected one line containing " + repr(needle) + ", found " + str(len(found)))
        lines[found[0]] = replacement
        docs[path] = "\n".join(lines) + "\n"

    change_line("README.md", "# Expiry-Aware Food Inventory Prioritization Engine",
                "# FreshTrack Inventory — Expiry-Aware Food Inventory Prioritization Engine")
    change_line("README.md", "- **Hosted showcase (production):**",
                "- **Current production URL (not yet migrated):** https://expiry-aware-food-inventory-priorit.vercel.app/ — this still serves the static C11 demo. The consolidated FreshTrack UI source is being prepared under freshtrack-app/; production cutover is deferred.")
    change_line("README.md", "- **Website source (local Node.js application):**",
                "- **Website source (local Node.js application):** website/\n- **Full FreshTrack cloud UI source:** freshtrack-app/ — the prior account-based UI, Supabase config, and Continue with Google entry point. This branch is not deployed to production yet.")
    change_line("README.md", "The source code, showcase, tests, benchmark outputs, guides and submission ZIP",
                "The core C11 engine, local apps, benchmark outputs, guides and submission ZIP remain in this repository. This integration branch adds the existing FreshTrack cloud UI source under freshtrack-app/. The production alias remains unchanged until this source passes CI and release smoke checks.")
    change_line("README.md", "- Client-only showcase demo;",
                "- Account-based FreshTrack cloud UI with Supabase authentication and inventory workflows; this branch adds the Google OAuth button. A payment gateway is not wired yet.\n- Client-only C11 showcase demo;")

    change_line("CI_VERIFICATION.md", "The active workflow does **not** configure",
                "The active workflow does **not** configure a Clang/PowerShell job or a Node.js version matrix. Older notes are historical and should not be presented as active steps. The local JSON inventory website is a single-user app; the static C11 showcase is a separate demo. Successful source CI does not itself verify public HTTP reachability.")
    ci_doc = docs["CI_VERIFICATION.md"]
    if ci_doc.count("## Benchmark snapshot") != 1:
        raise RuntimeError("CI verification benchmark section changed")
    docs["CI_VERIFICATION.md"] = ci_doc.replace("## Benchmark snapshot",
        "## FreshTrack cloud UI consolidation\n\nThe integration branch adds the existing FreshTrack Inventory account UI under freshtrack-app/, a static build, and five Node.js contract tests. It includes Continue with Google and retains email/password authentication and existing cloud inventory workflows. Supabase publicly reported Google enabled and its authorize endpoint redirected to Google's OAuth screen; this is not a completed interactive sign-in smoke test.\n\nNo payment gateway or paid-plan enforcement existed in the previous app. Real checkout requires a chosen provider, price/cadence, server-side credentials, signature/webhook verification, and persisted entitlements. Production hostname cutover is deferred until the consolidated deployment is ready and smoke-tested.\n\n## Benchmark snapshot", 1)

    change_line("PACKAGE_README.md", "**Language:**",
                "**Language:** C11 for the DSA engine; local-first Node.js website and account-based FreshTrack cloud UI")
    change_line("PACKAGE_README.md", "A6_Rubric_Alignment.md,",
                "- A6_Rubric_Alignment.md, CI_VERIFICATION.md, START_HERE.md, DEMO_GUIDE.md, C11 source, local website, the FreshTrack cloud UI in freshtrack-app/, tests, build scripts and benchmark protocol.")
    change_line("PACKAGE_README.md", "The optional website is a separate local-first Node.js application.",
                "The optional website remains a separate local-first Node.js app with its own local JSON store. The account-based FreshTrack app under freshtrack-app/ preserves the deployed UI and Supabase-backed inventory workspace and adds a Google OAuth entry point. It does not synchronize with the C11 app/local website. A real payment gateway is not implemented or represented as working.")

    start_path = ROOT / "START_HERE.md"
    start_text = docs.get("START_HERE.md", start_path.read_text(encoding="utf-8"))
    old_heading = "## Primary application: FreshTrack website"
    if start_text.count(old_heading) != 1:
        raise RuntimeError("START_HERE local website heading changed")
    start_notice = ("## Cloud FreshTrack UI source (not yet deployed)\n\n"
        "Account-based FreshTrack source is in freshtrack-app/; it includes Google sign-in and Supabase-backed inventory workflows. This integration branch is not yet the production website. The old freshtrack-inventory.vercel.app project/domain is kept intact until the consolidated build is deployed and sign-in is smoke-tested. Payment processing is not wired yet; see freshtrack-app/PAYMENTS_READINESS.md.\n\n"
        "## Local application: FreshTrack website")
    docs["START_HERE.md"] = start_text.replace(old_heading, start_notice, 1)
    change_line("DEMO_GUIDE.md", "Use **VS Code + its integrated PowerShell terminal**",
                "Use VS Code and its integrated PowerShell terminal for the main C11 DSA demonstration. The repo also contains the local-first website and cloud-authenticated FreshTrack UI source under freshtrack-app/. Lead with the C engine and measured DSA experiments; neither website's sort-based allocator backs the C benchmark. The cloud UI migration is staged separately and is not production-released by this branch.")

    change_line(".github/workflows/ci.yml", 'branches: [main, dev,',
                'branches: [main, dev, "audit/**", "c11-full-inventory-app-2026-10-11", "freshtrack/**"]')
    ci_text = docs[".github/workflows/ci.yml"]
    old_step = "      - name: Website tests\n        run: |\n          cd website\n          node --test tests/*.test.js\n"
    if ci_text.count(old_step) != 1:
        raise RuntimeError("C11 CI website test step changed")
    docs[".github/workflows/ci.yml"] = ci_text.replace(old_step, old_step +
        "      - name: FreshTrack cloud UI contract tests and static build\n"
        "        run: |\n"
        "          cd freshtrack-app\n"
        "          node --check app.js\n"
        "          node --check build.js\n"
        "          npm test\n"
        "          npm run build\n"
        "          node --check public/app.js\n", 1)
    change_line(".github/workflows/refresh-submission-archive.yml",
                "      - c11-full-inventory-app-2026-10-11",
                '      - c11-full-inventory-app-2026-10-11\n      - "freshtrack/**"')
    arch_path = "scripts/refresh_submission_archive.py"
    arch_text = docs.get(arch_path, (ROOT / arch_path).read_text(encoding="utf-8"))
    old_core = '    "website/tests/server.integration.test.js",\n    "Makefile",'
    if arch_text.count(old_core) != 1:
        raise RuntimeError("Archive file-verification list changed")
    docs[arch_path] = arch_text.replace(old_core,
        '    "website/tests/server.integration.test.js",\n'
        '    "freshtrack-app/index.html",\n'
        '    "freshtrack-app/app.js",\n'
        '    "freshtrack-app/styles.css",\n'
        '    "freshtrack-app/config.js",\n'
        '    "freshtrack-app/package.json",\n'
        '    "freshtrack-app/build.js",\n'
        '    "freshtrack-app/vercel.json",\n'
        '    "freshtrack-app/.gitignore",\n'
        '    "freshtrack-app/README.md",\n'
        '    "freshtrack-app/PAYMENTS_READINESS.md",\n'
        '    "freshtrack-app/tests/auth-ui.contract.test.js",\n'
        '    "FRESHTRACK_RELEASE_CHECKLIST.md",\n'
        '    "Makefile",', 1)

    for path, content in docs.items():
        write(path, content)
    write("freshtrack-app/index.html", html)
    write("freshtrack-app/app.js", app)
    write("freshtrack-app/styles.css", css)
    write("freshtrack-app/config.js", config)
    write("freshtrack-app/package.json", package)
    write("freshtrack-app/build.js", build)
    write("freshtrack-app/vercel.json", vercel)
    write("freshtrack-app/.gitignore", "/public/\n")
    write("freshtrack-app/README.md", app_readme)
    write("freshtrack-app/PAYMENTS_READINESS.md", payments)
    write("freshtrack-app/tests/auth-ui.contract.test.js", tests)
    write("FRESHTRACK_RELEASE_CHECKLIST.md", checklist)
    print("Imported FreshTrack UI source; added Google OAuth entry; updated CI, archive checks, and release docs.")
    print("No production deployment or domain transfer was performed.")

if __name__ == "__main__":
    main()
