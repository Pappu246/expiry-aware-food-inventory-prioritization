# FreshTrack consolidation — release checklist

Prepared state:
- Canonical repo: Pappu246/expiry-aware-food-inventory-prioritization.
- Integration branch: freshtrack/unified-ui-google-auth.
- Intended Vercel root: freshtrack-app; build: npm run build; output: public.
- Production deployment and domain aliases are not changed by the source-import workflow.
- The old freshtrack-inventory Vercel project stays available as a rollback option.
- Supabase Google provider was confirmed enabled and its authorize endpoint returned a redirect to Google. Automated interactive sign-in is not complete.

Cutover:
1. Wait for C11 CI, FreshTrack contract tests/build, and archive validation to pass on this branch.
2. Merge the integration branch only at the planned release time.
3. Confirm the target Vercel build is READY for the merged commit.
4. Smoke-test assets, Google authentication, inventory read/add/issue, expiry alerts, movements, and export/backup flows.
5. Transfer freshtrack-inventory.vercel.app only after smoke tests pass and confirm it remains on the Supabase Auth redirect allow-list.
6. Keep the old Vercel project until the new domain and sign-in are verified. Do not delete or rename it early.

Rollback: if the consolidated release fails, restore the hostname to the previous FreshTrack deployment and diagnose before retrying.
