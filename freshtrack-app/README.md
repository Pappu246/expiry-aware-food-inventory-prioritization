# FreshTrack Inventory — cloud UI source

This folder preserves the existing FreshTrack Inventory experience: dashboard, inventory, expiry watch, FEFO/FIFO issue, movements, reporting, exports, and backup. The UI uses the existing Supabase account/session and inventory setup. The C11 engine, local JSON app, and cloud account store are separate systems and do not automatically synchronize.

The sign-in card includes Continue with Google, email/password authentication, and an accessible Show/Hide password toggle so users can check what they typed. Supabase reported Google enabled and the authorization endpoint redirected to Google's OAuth screen; full interactive sign-in has not been automated. Keep the existing FreshTrack hostname in the Supabase Auth redirect allow-list through the release cutover.

