# Pigeon Post

A React Native + Expo prototype for thoughtful global friendships. One codebase targets Android and iOS; the web build provides a convenient visual preview.

## Run

Use Node.js 22.18 or newer (Node 24 recommended).

```sh
npm install
npm start
```

Open with a compatible Expo development client / Expo Go, or use `npm run ios` (requires an installed iOS simulator) or `npm run android` (requires an Android emulator/device). `npm run web` opens the browser preview.

```sh
npm run typecheck
npm test
npm run test:backend
npm run export
```

For the complete phone setup, installable builds, and two-account test checklist, see [TESTING.md](TESTING.md). `eas.json` includes preview APK, registered-iPhone, and iOS Simulator build profiles.

## Backend and database

Supabase Auth, PostgreSQL migrations, transactional APIs, row-level security, scheduled delivery, and a live-account UI are implemented. **The hosted project `hrcwhzgznzlxbrhocmoi` is connected and schema version 2 is deployed.** Database permissions, Realtime publication, and a successful delivery Cron run have been verified. Custom SMTP/recovery-template setup and real-account testing remain; see [BACKEND.md](BACKEND.md). Without those settings the app opens the separate demo mode described below. Demo data is never uploaded.

Run `npm run backend:check` after connecting. `npm run test:backend` tests the real core SQL migration in embedded PostgreSQL; it does not replace hosted Auth, Realtime, or Cron integration checks.

## Try the prototype

1. Select **Write your first letter** and create a demo passport with a name, date of birth in YYYY-MM-DD format, and at least three interests.
2. Choose a pigeon (30-second demo flight) or postman (60-second demo walk), and write at least 20 characters. Each letter costs 10 of the initial 120 points.
3. Open the sent letter to see its countdown. **Preview arrival now** skips the wait. Simulate accepting or passing to exercise both recipient outcomes.
4. In **Mailbox → Received**, keep a sample letter to open a chat, or pass it along.
5. Type messages in **Chats**, collect country stamps in **Passport**, and reload to check device persistence.

## Scope and limitations

In demo mode, this is a local prototype with optional online text translation. All demo people are fictional. Profiles, letters, chat messages, blocked users, and reports are stored only on this device using AsyncStorage. Chat delivery is simulated. Text is sent to MyMemory only when the user taps Translate; no moderator receives the demo reports. Demo mode does not use account authentication or the database. Live mode uses Supabase accounts and server access rules. The date of birth input demonstrates the cohort rules; it is not age verification.

The minimum age is 16. Matching, incoming letters, acceptance, and chat access separate ages 16–17 from 18+. All current experiences are friendship-only. Existing teen conversations become inaccessible when either participant turns 18. Production transition policy and retention should be finalized before launch.

Demo delivery processing runs while the app is open and resumes when it returns to the foreground. An unanswered outgoing demo letter reroutes after two minutes at a recipient. Country-targeted letters only reroute within that country; directly addressed letters never reroute and end if declined or unanswered. An empty or unavailable destination fails without charging points. A journey has a maximum of three recipients and expires after 24 hours. These are configurable product defaults for demonstration; dependable background delivery requires a server worker. Passing an incoming demo letter removes it from this inbox; another recipient's device is not simulated.

The rewards screen previews future 10/60-pigeon bundles; no purchases or earned reward economy are implemented. The current prototype caps active outgoing journeys at five and limits recipients to the small fictional demo pool.

## Before a real beta

- Complete SMTP/recovery-template setup and verify Auth and two-device Realtime/delivery with real test accounts against the deployed project. Add private avatar storage if required.
- Exercise the implemented server enforcement of age cohorts, consent, blocks, rate limits, and access control in the hosted environment.
- Design age assurance and the transition at age 18. If dating is added, keep it opt-in and adult-only.
- Verify the implemented delivery worker, acceptance transactions, idempotency, and server-owned points under concurrent load. Configure and test native push delivery using [COMMUNICATIONS.md](COMMUNICATIONS.md).
- Operate the implemented service-only report review/suspension tools and account deletion flow. Finalize privacy settings, retention policies, and operational monitoring.
- Replace starter app icons; finalize name, branding, delivery timing, rewards, and app-store metadata.
- Test on physical Android and iOS devices, including screen readers, large text, keyboard behavior, offline recovery, and push permissions.

The prototype deliberately needs no credentials. Do not put service-role keys in mobile app code.

## Structure

- `App.tsx`: mode selection and the original demo UI.
- `src/backend/`: Supabase client, API adapters, real account signup/recovery, editable profiles, letters, chat, reports, blocks, notifications, and account deletion UI.
- `supabase/migrations/`: database tables, RLS, transactional RPCs, Cron, and Realtime configuration.
- `tests/backend/database.test.mjs`: core migration and access-rule checks using PostgreSQL.
- `src/domain/model.ts`: profiles, age cohorts, matching, delivery transitions, points, chat, and blocks.
- `src/components/Artwork.tsx`: original vector courier, map, and icons, rendered natively.
- `src/theme.ts`: shared visual tokens.
- `src/screens/ExploreScreen.tsx`: animated discovery home, country selection, explorer cards, and conversation starters.
- `src/screens/GamesScreen.tsx` and `src/domain/games.ts`: Stamp Match and a solo tic-tac-toe opponent, with persisted personal scores.
- `src/components/DestinationPicker.tsx`: Anywhere / Country / Explorer letter targeting.
- `src/components/TranslationPanel.tsx` and `src/services/translation.ts`: on-demand translation, cancellation, caching, UTF-8 segmentation, and service error handling.
- `tests/model.test.mjs`: behavioral checks for age boundaries, delivery, rerouting, expiry, and messaging access.

Live account mutations already use authenticated server RPCs. Auth/recovery and account settings have separate screens/components. Before production, complete the deployment and release checks in BACKEND.md and TESTING.md.

## Discovery, translation, and games

- **Explore** now has country cards, fictional explorers filtered to the user's age cohort, surprise destinations, an animated courier (respects reduced motion), conversation starters, and shortcuts to games and translation.
- Compose a letter to **Anywhere**, **A country**, or **An explorer**. Search the demo country list or eligible names. Only seven demo countries and their fictional profiles are currently included. A selected country with no eligible explorer shows an empty state; the app never silently chooses a different country.
- Use **Translate** under a chat message, on a received letter, or from the home page. Choose both source and target languages. English, Hindi, Spanish, French, Japanese, Portuguese, Korean, and Finnish are available. There is no automatic language detection.
- Translation calls the public [MyMemory read endpoint](https://mymemory.translated.net/doc/spec.php) over HTTPS, only after the Translate action. It does not contribute text using the service's write endpoint. It sends only the selected/edited text and language pair, not profile data or the whole conversation. A disclosure is displayed in the translation panel. Results are cached in memory; original messages are preserved.
- [MyMemory's anonymous daily quota](https://mymemory.translated.net/doc/usagelimits.php) applies. Requests are split below the 500-byte per-segment limit, with a 20-second overall timeout. Quota, network, and service failures show an error and allow retry. For a production beta, use a reviewed translation provider behind the authenticated backend with appropriate privacy controls and quotas.
- **Play** offers Stamp Match (six pairs) and Three in a row against Pip, a local bot. A completed round updates persisted local stats; matching records the fewest moves. No online multiplayer or automatic opponent chat is implied.

## Daily rewards and Pigeon Plus

The home screen now focuses on writing a letter, the mailbox, a daily gift, and expandable discovery. Signed-in accounts can claim a random daily courier pass, 10 points, or a riddle token. Riddles award 20 points for a correct answer. Reward claims and postage are enforced in Supabase.

Pigeon Plus purchase/restore integration and verified server entitlements are implemented; store configuration is still required. See [PAYMENTS.md](PAYMENTS.md) for product, RevenueCat, secrets, and native-build setup. Expo Go can preview these screens but cannot run store checkout.

## Store release and adaptive screens

Follow [PUBLISHING.md](PUBLISHING.md) for EAS signing, production configuration, Play testing and TestFlight/App Review. See [FOLDABLE_TESTING.md](FOLDABLE_TESTING.md) for the adaptive layout changes, verified window sizes and remaining native foldable/iPad checks.

## Vercel web deployment

Use `npm run build` to export the website. The root `vercel.json` publishes `dist` as an Expo single-page app. See [VERCEL.md](VERCEL.md) for dashboard settings, environment variables and troubleshooting a domain that downloads a file instead of opening the app.

## Messaging, attachments and calls

[COMMUNICATIONS.md](COMMUNICATIONS.md) documents typing/read receipts, private file sharing, Premium voice/video calls, native notification setup and Android/iOS back navigation, including the remaining provider credentials and native-device tests.
