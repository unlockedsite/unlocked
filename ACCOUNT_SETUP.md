# Unlocked accounts — deployment requirements

The website currently supports **local player profiles** (nickname, emoji or uploaded avatar, banner, badges, settings, activity and JSON backup). These are stored in the visitor's browser and **are not authenticated accounts**. Do not label them as signed-in users.

## To enable real Google sign-in and cross-device sync

1. Choose an authentication provider such as Firebase Authentication (Google provider) or another standards-compliant OAuth/OIDC provider. The operator must create and own the project.
2. Register `unlockedsite.github.io` as an authorized sign-in domain and configure the Google OAuth consent screen as required by the provider.
3. Configure a secure database (e.g. Firestore) with per-user authorization rules. Users must only be able to read/write their own profiles and saved data.
4. Implement a real sign-in / sign-out UI and validate the provider's authenticated identity on every server-side write. Do not trust an email, username, or user ID supplied by the browser.
5. Restrict avatar and banner uploads to safe formats, sizes and storage paths; add moderation/reporting and rate limits if profiles become public.
6. Publish a privacy notice, retention policy, and account-deletion flow. If children may use the site, review age-related legal obligations before collecting account data.
7. Only then enable cloud syncing and account badges. Do not issue verified, staff, or premium badges from client-side local storage.

**Never put private OAuth client secrets, service account credentials, or database admin keys in GitHub Pages.** Public client configuration may be committed only when the provider explicitly treats it as public, with domain restrictions and database rules in place.

A GitHub Pages-only static site cannot securely implement a complete multi-user account system without external identity and storage infrastructure.
