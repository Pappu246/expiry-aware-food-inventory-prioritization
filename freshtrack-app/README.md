# FreshTrack Inventory — cloud UI source

This folder preserves the existing FreshTrack Inventory experience: dashboard, inventory, expiry watch, FEFO/FIFO issue, movements, reporting, exports, and backup. The UI uses the existing Supabase account/session and inventory setup. The C11 engine, local JSON app, and cloud account store are separate systems and do not automatically synchronize.

The sign-in card includes Continue with Google and keeps email/password auth. Supabase reported Google enabled and the authorization endpoint redirected to Google's OAuth screen; full interactive sign-in has not been automated. Keep the existing FreshTrack hostname in the Supabase Auth redirect allow-list through the release cutover.

No payment gateway or paid-plan enforcement existed in the previous FreshTrack deployment. A real checkout requires a selected gateway, prices, server-side credentials, signature/webhook verification, and persistent entitlements. Do not claim a checkout works before those are built and tested. See PAYMENTS_READINESS.md.
