# Prototype verification

Verified on September 24, 2026.

- TypeScript strict check: passed.
- Domain behavior: 8 tests passed, covering birthday boundaries and invalid dates, teen/adult separation, courier delays and points, acceptance idempotency, rerouting limits, unattended delivery and expiry, blocking, and turning 18.
- Expo production export: Android, iOS, and web bundles generated successfully. This is JavaScript bundling, not a signed native build or app-store submission.
- Browser walkthrough: under-16 date rejected; a fictional 17-year-old passport created; only teen sample letters shown; a postman letter sent; arrival previewed; recipient passed and courier rerouted to another teen; recipient accepted; chat opened and a message was saved.
- Reload: profile, deducted points, country connection, and letters persisted.
- Visual checks: desktop layout at the browser's default size and mobile layout at 390 × 844; chat input, bottom navigation, home illustration, and text rendered correctly.
- Browser console: no errors or warnings reported during the checked flow.

Not verified on physical phones or an iOS/Android simulator. The installed Xcode command-line environment does not currently expose `simctl`. These initial checks covered demo mode only. See the backend update below for the later database implementation; physical-device validation remains outstanding.

## Discovery, translation, and games update

- 15 automated tests pass, including the original eight and new checks for country-constrained rerouting, direct-letter expiry without rerouting, blocked/underage destinations, game outcomes, UTF-8 translation segmentation, caching, cancellation, and quota errors.
- TypeScript strict check and Android/iOS/web production exports pass.
- Real browser translation: the synthetic text “Hello! It’s lovely to meet you.” returned “नमस्ते! आपसे मिलकर बहुत अच्छा लगा।” from MyMemory. Original text remained visible and unchanged.
- Tic-tac-toe: played a complete round; the bot blocked a threatened row, won, disabled finished squares, and recorded one completed round.
- Stamp Match: tested mismatches turning over again, matched all six pairs, observed the completion state, and recorded the 12-move personal best and second completed round.
- Country discovery: Finland showed only the two eligible Finnish teen demo explorers. Sending from the country card preserved Finland in the composer and delivered the outgoing demo letter to Noor in Finland.
- Direct delivery remains subject to acceptance; no chat is opened merely by selecting an explorer.

Mini-games are local solo experiences. Translation requires internet and is subject to the external service's availability and quota. No new physical-device validation was possible.

## Backend and database update

- TypeScript strict check passes for both demo and live-account code.
- Core and account-tools migrations execute successfully in PGlite (embedded PostgreSQL), using Supabase-compatible auth roles and an `auth.uid()` fixture. Eighteen behavioral cases pass (19 tests including the parent test). These cover private birthdays/wallets, denied writes/worker calls, under-16 rejection, one welcome credit, idempotent postage/messages, delivery privacy, consent, cohort restrictions, rerouting, blocks, age transitions, notifications, anonymous denial, profile editing, report deduplication/privacy, unblocking with renewed consent, timestamp-tied history pagination, service-only moderation/suspension, and account deletion cascades before/after onboarding and while suspended.
- All 17 domain, game, translation, and configuration tests pass.
- Android, iOS, and web production exports pass with the backend client included. No live credentials were bundled; the default preview remains in demo mode.
- The Supabase CLI and local project configuration are installed. Migrations, public connection preflight/probe, and deployment verification SQL are prepared.

**At the earlier local-only checkpoint:** no hosted project was connected. See the hosted deployment update below for current evidence. Real email signup/confirmation, authenticated PostgREST application flows, Realtime subscriptions, multi-connection contention, and two-device interaction still require end-to-end testing. SQL tests do not stand in for those services. Follow the real-account acceptance flow in BACKEND.md after deployment.

## Account tools and device testing update

- `npm run check`: TypeScript, 17 application/configuration tests, and 19 PostgreSQL tests pass.
- `npm run export`: Android and iOS Hermes bundles plus web output succeed. This is a JavaScript export, not a native signed build or device run.
- `npx expo install --check`: installed packages match the SDK 57 bundled dependency map. Networking was disabled for this check, so registry/version endpoint validation was unavailable.
- `npx expo config --type public`: resolves the native bundle/package IDs, app scheme, and SDK 57.
- At the earlier checkpoint, `backend:check` correctly reported an unconfigured backend. It now passes against the hosted deployment described below.
- Full Xcode, Android platform tools, and Docker are not configured on PATH. A browser UI check was attempted, but Computer Use reported no available browser. The new Auth and account-settings UI therefore still needs interactive device/browser validation.
- Added `backend:smoke` for a real confirmed test account once connection settings exist. It was not run against a service because none is configured.
- Added `TESTING.md`, recovery email template/configuration, and EAS preview/simulator profiles. No EAS account was linked, cloud build started, signing credentials created, or app-store submission performed.
- Device push, avatar uploads, production SMTP, staffed moderation, and verified age assurance remain outside this private-test implementation.


## Hosted deployment — 2026-09-24

**Later Android check (2026-09-25):** the `Pixel_10` ARM64 emulator successfully loaded Pigeon Post's LIVE ACCOUNTS sign-in screen in Expo Go. The earlier launch failure was caused by targeting an uninstalled development build; Expo Go was also absent. Installed Expo Go through Expo CLI and made `npm run android` explicitly select `--go`. `npm run android -- --localhost` bundled 911 modules successfully. This verifies native startup and rendering, not authenticated account flows. The screenshot is in gitignored `.expo/android-emulator-check.png`.

- Linked this workspace to Supabase project `hrcwhzgznzlxbrhocmoi`; public Expo settings are in gitignored `.env.local`. CLI credentials are not stored in the app.
- Preflight query found zero application tables and zero Auth users before setup.
- CLI dry run listed precisely the three local migrations; `supabase db push --yes` applied all three successfully. `supabase migration list --linked` confirms local/remote versions match.
- `npm run backend:check` succeeds through the live public PostgREST API and returns Pigeon Post schema version 2.
- Hosted `supabase/deployment-audit.sql` confirms RLS on all 11 tables, all four Realtime publications, an active once-per-minute delivery job, and a successful Cron run at 2026-09-24 16:56 UTC.
- Hosted grants deny anonymous sending and client wallet updates/worker/moderation, while allowing authenticated self-deletion and service-only worker/moderation.
- Confirmed email signup/confirmation enabled and anonymous sign-ins disabled in Auth settings. A filtered CLI configuration comparison confirms the remote minimum password length matches the local value of 8.
- The hosted database remains empty of users and profiles; no fictional/test data or emails were created.
- **Blocked by missing SMTP configuration:** the Free plan's default sender disables custom recovery email templates. The recovery-code template is not deployed. Site URL remains `http://localhost:3000`; supply the app's own landing URL before broader testing.
- Added a generated `supabase/setup.sql` fallback for empty projects. Two additional embedded-PostgreSQL tests verify migration-history installation, refusal to overwrite an existing app, and rollback on failure. All 21 backend test entries pass. These tests stub Cron; the hosted audit independently verified the real Cron execution.

## Home, rewards, and billing — 2026-09-25

- Simplified shared Home: one primary compose action, compact mailbox, expandable discovery; live accounts also get daily rewards and a quiet Plus entry.
- TypeScript, 20 app/parser tests, 27 backend test entries, and Android/iOS/web production exports pass. Deno checks both billing Edge Functions.
- Backend tests cover idempotent daily draws, owner isolation, pass consumption and failed-send rollback, private riddle answers, bounded guesses, one-time scoring, service-only entitlements, duplicate allowance protection, stale status updates, and free/Plus letter limits. These are embedded PostgreSQL tests, not multi-connection stress tests.
- Deployed the rewards/premium migration and both billing functions. Hosted read-only permissions audit verifies authenticated-only claims, service-only premium writes, and no client access to the private schema. Both HTTP endpoints reject unauthorized requests with 401.
- RevenueCat, store products/test accounts, SDK keys, server secrets, and legal URLs still need configuration. Real purchase/renewal/refund flows remain unverified. See PAYMENTS.md.

- Android visual check: rebooted the stalled emulator without clearing app data, then verified the simplified Home and rewards pouch under the existing signed-in account. Screenshots: `.expo/home-final.png` and `.expo/rewards-final.png`. The initial dialog check did not claim a gift; a subsequent emulator screenshot showed a collected riddle token (`.expo/home-claimed.png`). Removed the deprecated Supabase auth lock option after confirming the installed SDK coordinates refresh internally.

## Adaptive layouts and publishing preparation — September 25, 2026

- Added PUBLISHING.md, FOLDABLE_TESTING.md, production AAB profile, remote build-number incrementing and internal-draft Android submission profile.
- Native config introspection: resizable/unspecified-orientation Android activity with size-change handling and adjustResize; iPhone/iPad portrait/landscape orientations and multitasking enabled.
- TypeScript passed after final layout edits. All 23 application tests and 27 backend tests passed; new tests cover draft validation, account isolation, ordered writes/deletion and storage-error recovery. Android/iOS/web exports passed during this change.
- Android Expo Go: home visually checked at 320 dp and about 900 dp, plus games at 320 dp. Verified the expanded navigation rail and fixed bottom-tab clipping in the narrow games view. Restored emulator size to 1080×2424 at density 420 afterward.
- Resizing Expo Go can recreate its host activity and return to Explore. Its host manifest is not this project's generated native manifest; page/game continuity must be checked in a rebuilt native app. Draft persistence is unit-tested; process-death restoration still needs device verification.
- No native release binary built/submitted; no real billing, iOS device, physical hinge or tabletop validation performed in this pass.

## Communications — September 25, 2026

- TypeScript strict check, 24 application tests and 32 backend test entries pass. New coverage checks attachment signatures/limits, private typing/read activity, Premium-only initiation with free answering, expired/abandoned calls, service-only attachment publication, token ownership, push leases and blocking. PostgreSQL tests use PGlite; they do not simulate concurrent hosted clients.
- Deno type checks pass for chat-upload, call-session and communication-worker. Expo Doctor passes all 21 checks after updating Expo to 57.0.25.
- Final Android/iOS Hermes bundles and the web export pass. The web calling module is emitted as a separate lazy-loaded bundle. These exports are not native binary builds.
- Deployed all three communications migrations and the three Edge Functions to the linked Supabase project. Configured the worker secret and Vault dispatcher without storing secrets in source control. Hosted audit confirmed a private 10 MB storage bucket, Realtime publication entries, active scheduled jobs and successful scheduler runs. All three functions reject unauthenticated requests with HTTP 401.
- Android native configuration enables predictive back; iOS camera/microphone permission descriptions are present. The Android emulator renders the live-account sign-in screen in Expo Go without a startup error (`.expo/communications-start.png`). This does not verify native call modules, authenticated chat gestures or push delivery.
- LiveKit credentials, EAS project/signing configuration and FCM/APNs credentials remain required. No real two-device call, notification delivery, native gesture walkthrough or signed native build was completed. Follow the acceptance matrix in COMMUNICATIONS.md. Calls are foreground-only; browser background Web Push and system telephone UI are not implemented.

## Standalone Android APK — September 26, 2026

- Built `:app:assembleRelease` successfully for ARM64 and x86_64 using project-local Temurin Java 17. Android Studio's Java 25 failed at Prefab native configuration; Java 17 resolved it. The first build installed the required Android SDK/NDK/CMake tools.
- Testing APK: `.expo/builds/pigeon-post-1.0.0-preview.apk` (approximately 83 MB). Version 1.0.0, versionCode 1, package `com.romanparwez.pigeonpost`, minimum API 24, target API 36. APK Signature Scheme v2 verification passes. Uses the generated debug signing key for direct testing; this is not a Play Store release.
- Installed on `emulator-5554`, cold-launched successfully, and visually confirmed the live-account sign-in screen. Checked startup logs contained no ReactNativeJS/AndroidRuntime errors. Screenshot and build metadata are in `.expo/builds/`. The APK embeds its JavaScript bundle and runs without Metro or Expo Go.
- LiveKit server credentials were subsequently configured and accepted by its read-only room API (HTTP 200). Native calling modules are packaged, but authenticated two-account audio/video tests remain outstanding. RevenueCat/store setup and EAS/FCM/APNs configuration are still needed for purchases and native push.
