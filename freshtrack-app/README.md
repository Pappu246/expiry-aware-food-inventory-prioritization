# FreshTrack Inventory — cloud UI source

This folder preserves the existing FreshTrack Inventory experience: dashboard, inventory, expiry watch, FEFO/FIFO issue, movements, reporting, exports, and backup. The UI uses the existing Supabase account/session and inventory setup. The C11 engine, local JSON app, and cloud account store are separate systems and do not automatically synchronize.

The sign-in card includes Continue with Google, email/password authentication, and an accessible Show/Hide password toggle so users can check what they typed. Supabase reported Google enabled and the authorization endpoint redirected to Google's OAuth screen; full interactive sign-in has not been automated. Keep the existing FreshTrack hostname in the Supabase Auth redirect allow-list through the release cutover.



## Easy, accessible user experience

- Hindi-first Easy Mode with large one-tap food choices (including rice → Grains), automatic batch ID and received date, and simpler stock-entry fields.
- Optional speech-to-text entry where the browser supports it, plus read-aloud instructions. The browser may ask permission for microphone use.
- Three-dot settings menu for device/System, Light and Dark themes; Hindi/English; larger text; Easy Mode and advanced controls. Preferences stay on the current device.
- A permanent account deletion action uses the protected Supabase `delete-account` Edge Function, requires a recent sign-in and an explicit typed `DELETE` confirmation, and never exposes the service-role key to the browser.
