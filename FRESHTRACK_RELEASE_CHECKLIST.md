# FreshTrack consolidation — release and rollback status

## Completed

- Canonical GitHub repository: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization
- Merged PR: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/pull/2
- Latest Git-connected production source at final verification: `573873915df09393acc44d067469fd9ebb78aa99` (archive-only update after the merged UI commit)
- Vercel production deployment for that source: `dpl_4CmD4upk9otLcNptp8Sj1NLV1ZG4` — READY
- Vercel root: `freshtrack-app`; build command: `npm run build`; output: `public`
- Main URL: https://expiry-aware-food-inventory-priorit.vercel.app/
- FreshTrack URL: https://freshtrack-inventory.vercel.app/
- Both hostnames are assigned to the same deployment and both serve the FreshTrack UI.
- The old Vercel project is renamed `freshtrack-inventory-legacy` and its prior deployment remains available for rollback.
- Full CI: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38250133282 — success.
- Archive validation: https://github.com/Pappu246/expiry-aware-food-inventory-prioritization/actions/runs/38250132643 — success.
- Production HTTP smoke: both homepages and `/app.js`, `/styles.css`, `/config.js` returned HTTP 200. Content Security Policy and standard security headers were present.
- UI contract tests: 11/11; password show/hide toggle added; axe accessibility audit: 0 violations across sign-in mobile, dashboard desktop and dashboard mobile. Automated dashboard data used mocked inventory only.
- Supabase reports Google enabled. On both hostnames, the authorization preflight returned HTTP 302 to `accounts.google.com/o/oauth2/v2/auth`.

## Remaining verification caveats

- A real user's interactive Google consent and callback, plus read/add/issue against the real signed-in account, have not been completed in the automated environment.
- The initial Vercel Git build failed when the project root was inconsistent. The root is now `freshtrack-app`, the build command is `npm run build`, and the Git-connected deployment for the latest `main` commit completed successfully.
- The FreshTrack hostname's alias now routes to the new deployment. Vercel still reports its project-domain registration under the renamed legacy project; adding it to the active project returned `duplicate-team-registration`. Do not delete the legacy project. If Vercel project-domain ownership must be fully rehomed in the dashboard, move the domain registration after checking the live alias still points to the current deployment.

## Rollback

The previous FreshTrack deployment ID is `dpl_DE1dAMa9wheLFTsbGgZ3ryTVGAA3`. If the new app fails, assign `freshtrack-inventory.vercel.app` back to that deployment. The prior static C11 production deployment was `dpl_HaMqySaJ44iE6xwN3CVBK4jLt5PH`; use it only when intentionally restoring the showcase rather than FreshTrack.
