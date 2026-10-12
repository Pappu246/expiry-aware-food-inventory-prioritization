# FreshTrack payment integration readiness

Status: no live payment gateway is connected. The previous FreshTrack app did not contain a checkout SDK, server-side order endpoint, webhook verifier, or subscription entitlement enforcement. Do not show a successful payment state before a real sandbox flow has been tested.

Before implementing checkout, decide the gateway, price/currency, billing cadence, and plan entitlements. Create orders server-side using secrets stored only in Vercel Environment Variables; verify checkout and webhook signatures server-side; persist transaction and subscription state in Supabase with owner-scoped RLS; and add idempotency, duplicate-webhook handling, cancellation/refunds, and sandbox tests.

Never put payment secrets in config.js or browser JavaScript, and never trust a client-submitted paid flag.
