# Pigeon Post backend

The backend is implemented for **Supabase Auth + PostgreSQL + Realtime + Cron**. **Deployed on 2026-09-24** to project `hrcwhzgznzlxbrhocmoi` (schema version 2). The workspace is linked and `.env.local` is configured for live mode. The public API probe, migration history, RLS/grants, Realtime publication, and a successful Cron run have been verified. Without public connection settings, the app continues to show the original, separate demo. No fictional profiles are uploaded. For Android/iOS setup and a two-device checklist, start with [TESTING.md](TESTING.md).

## Current hosted status

- All four migrations are applied. Public application tables have RLS enabled; reward answers and billing allowances are in the unexposed private schema. The four messaging Realtime tables are published.
- The once-per-minute delivery worker is active and has completed successfully. No test users, fake profiles, or mail were seeded.
- Email signup and confirmation are enabled, anonymous sign-in is disabled, and the remote minimum password length matches the local setting of 8.
- **Email setup is still required:** this Free project uses Supabase's restricted default sender. The dashboard disables template customization until custom SMTP is configured (or an eligible plan is selected). The recovery-code template is therefore not installed yet, and the app's code-based password recovery is not ready to use. Configure SMTP and then paste `supabase/templates/recovery.html` into Reset Password.
- The remote Site URL is still `http://localhost:3000`. Set your own reachable confirmation landing URL before inviting testers; no hosted frontend URL has been supplied. A default confirmation link verifies the email before redirecting, after which the user can return to the app and sign in.
- Real-account signup/email delivery, two-device chat/Realtime, and device behavior have not been exercised yet.

Verify the installed database with `npm run backend:check` and `npx supabase db query --linked --file supabase/deployment-audit.sql`.

## Connect a new hosted project

1. Create or choose a **dedicated development project** in [Supabase](https://supabase.com/dashboard). Select a region close to the initial audience. Existing applications may already have tables named `profiles` or `messages`; do not apply this schema over an unrelated application.
2. In your own terminal, authenticate and link the project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REFERENCE
   npx supabase db push --dry-run
   npx supabase db push
   ```

   Keep the database password and access token in the CLI's secure prompt/environment. Do not paste them into chat, the mobile code, or an `EXPO_PUBLIC_` variable. Do not reset a hosted database to install these migrations.

3. For an **empty new project**, `npm run backend:sql` generates `supabase/setup.sql`: a single transaction with an empty-schema guard and migration-history records. Do not run it on the already deployed project. Alternatively, run these files in order in the project's SQL Editor: `supabase/migrations/202609240001_core.sql`, `supabase/migrations/202609240002_delivery_cron_and_realtime.sql`, then `supabase/migrations/202609240003_account_tools.sql`. The CLI is preferred because it records migration history. If using the SQL Editor, execute each migration as a transaction and reconcile the CLI migration history before later CLI deployments.
4. In **Authentication**, enable email/password signup and **Confirm email**. Set a minimum password length of 8. Configure the Site URL to a reachable confirmation landing page. For this desktop preview, use `http://127.0.0.1:8082`; production and physical phones need a reachable hosted URL. The user confirms the email and then returns to the app to sign in; the app does not rely on extracting a session from the confirmation URL.
5. Configure custom SMTP first if your plan does not allow editing templates with the default sender. Set Authentication → Email Templates → Reset Password to the contents of `supabase/templates/recovery.html`. The app uses an emailed code (`{{ .Token }}`) for recovery on both phones. Supabase's development email sender has restrictions; configure your own SMTP provider before inviting general beta users. Review email delivery in the project's Auth logs.
6. Copy the project URL and **publishable key** from project API settings:

   ```sh
   cp .env.example .env.local
   ```

   Fill `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Leave `EXPO_PUBLIC_APP_MODE=live`. The project URL and publishable/legacy anon key are public client settings. Never use a secret or service-role key. The build preflight refuses them.
7. Run the connectivity probe, then restart Expo (environment variables are compiled into the app):

   ```sh
   npm run backend:check
   npm start
   ```

   To refresh the existing static browser preview, run `npm run export` and reload its tab. No cloud hosting or app-store build is performed by export.
8. Run `supabase/verify-deployment.sql` in the SQL Editor. Verify the Cron job is active, its first run succeeds, RLS is enabled, and the four realtime tables are published. The public connectivity probe alone does not verify Auth configuration, SMTP, cron execution, or realtime.

## Local Supabase option

The CLI is installed as a development dependency and `supabase/config.toml` is initialized. A Docker-compatible runtime is required for the full local Supabase stack; none was available during setup.

```sh
npm run backend:start
npx supabase status
```

Use the local API URL and anon/publishable key in `.env.local`. For Android emulators, the host is `10.0.2.2` instead of `127.0.0.1`. The local config enables email confirmation; read messages in the local email test UI. Local dates/cron behavior still come from PostgreSQL, not the phone. No seed file inserts fake accounts.

`npm run test:backend` runs the **actual core SQL migration** in an isolated embedded PostgreSQL engine (PGlite), with representative Supabase auth roles and `auth.uid()`. This does not require Docker. It validates the core and account-tools migrations, RPC behavior, privileges, and RLS; it is not a running Supabase service and does not test GoTrue, SMTP, PostgREST, Realtime, the `pg_cron` extension, or concurrent multi-connection scheduling.

## Database and permissions

| Data | Storage / access |
| --- | --- |
| Login and email | Supabase Auth; no password is stored in app tables |
| Public profile | `profiles`; own profile and eligible, unblocked peers only |
| Birthdate | `private.birthdays`; no client table access; `my_account()` returns only the caller's date |
| Postage | `wallets` and append-only `points_ledger`; client reads own rows, server functions alone debit |
| Letters | `letters`; sender and current eligible recipient after delivery only |
| Route history | `private.delivery_attempts`; inaccessible to clients |
| Conversations/messages | Participants only, after acceptance, while still eligible and unblocked |
| Reports | Reporter can read their own reports; reviewed using the administrative backend |
| Blocks | Owner can read their block list; interaction checks enforce blocks in both directions |
| Arrival/acceptance events | `notifications`; owner only; device push delivery is not yet implemented |

There are no client table insert/update/delete permissions. All writes use a narrow RPC allowlist with a pinned empty `search_path`. Service credentials are not needed in the app. Keep `private` out of the exposed API schemas.

The application RPCs are `create_profile`, `update_profile`, `my_account`, `discover`, `send_letter`, `decide_letter`, `send_message`, `block_explorer`, `report_explorer`, `unblock_explorer`, `message_history`, `delete_account`, and `mark_notifications_read`. `review_report` is restricted to trusted service operators. `backend_status` returns schema version 2. `process_deliveries` is restricted to the service role/database scheduler. `backend_status` is a public, data-free connection probe.

## Rules implemented on the server

- Ages 16–17 and 18+ are separate, with eligibility recomputed on reads and writes. Turning 18 closes access to former teen conversations. Birthdays are immutable through the client API. **This is enforcement against stored, self-declared birthdays, not verified age assurance.**
- New profiles get 120 points exactly once. Each letter costs 10 points. Five active journeys and ten new letters per rolling 24 hours are permitted; recipient inboxes are capped at 30 pending letters.
- Pigeons take 15 minutes; postmen take one hour. The once-per-minute worker can add up to a minute of dispatch latency under normal load. Delivery continues when the app is closed.
- Recipients have 24 hours to decide. Country letters reroute only within their country. Direct letters never reroute. Three attempts maximum, seven-day total expiry. There is no postage refund on an expired journey in this version.
- Acceptance locks the letter, creates or reuses the pair's conversation, and inserts the initial letter exactly once.
- Wallet locks and client-generated UUIDs make send retries idempotent. Reusing an ID for different content is rejected. Message sends are limited to 30 per minute per account.
- Blocks close mail and revoke conversation reads/writes in both directions. Unblocking removes only the caller’s block and does not reopen a conversation: a new letter must be accepted. Reports can be submitted separately and viewed in Passport. Trusted operators can use `review_report` to resolve a report and optionally suspend its subject; there is no staffed moderation console or automatic moderation in this code.
- The live UI refreshes through Postgres Changes, on foregrounding, and every 30 seconds as a fallback. Mailboxes/discovery currently load up to 100 entries; chat supports loading earlier messages. Larger discovery/mailbox pagination is a later improvement.
- Mini-games remain local and award no server points. Translation remains explicitly on demand through MyMemory, with its disclosure in the UI. Neither is automatically uploaded to the database.

## Real-account acceptance test

Use test accounts you control. Confirm both emails, then create eligible profiles in the same age group. Create an additional account in the other age group.

1. Verify discovery only returns peers in the same group and never sends birthdates.
2. Send a targeted letter; verify exactly one 10-point debit. Retry the same request ID and confirm no additional debit.
3. Verify the recipient cannot read the letter or open a conversation before its server arrival. Wait for the 15-minute flight and the scheduler; do not expose a client “skip timer” control in live mode.
4. Accept the letter. Verify both accounts can read the conversation and exchange realtime messages; an unrelated account cannot read or write it.
5. Block one account. Verify neither side can continue chatting or send another targeted letter.
6. Check the Cron run logs and pending reports. Configure actual moderation and device push handling before public release.

Password recovery, confirmation resend, passport editing, in-app notifications, report status, unblocking, and permanent self-account deletion are connected to the live UI. Verified age assurance, avatar uploads, device push notifications, administrative moderation screens, and production email delivery remain follow-up work. The schema/client foundation is intended for a private development environment until those release requirements are completed.


## Account deletion and moderation

`delete_account('DELETE')` can only delete the authenticated caller. It works before onboarding and for suspended accounts. It deletes their Auth row and cascades through their profile, private birthday, wallet, letters, shared conversations/messages, blocks, reports, and notifications. The UI requires an explicit typed confirmation and clears its local session. Backups and email-provider records are outside this database operation; define the corresponding retention policy before release. If Storage uploads are added later, extend deletion to remove owned objects first.

Review reports in the SQL Editor (trusted operator access only):

```sql
select id, reporter_id, reported_id, reason, status, created_at
from public.reports where status = 'pending' order by created_at;
-- Substitute a reviewed report's ID. true also suspends the reported account.
select public.review_report('REPORT_UUID', 'resolved', true);
```

A suspended account loses interaction access but can still sign out or delete itself. No client may call the review RPC. Client history uses `(created_at, id)` pagination so messages sharing a timestamp are not skipped. Report retries with identical content within 24 hours are deduplicated.

## Rewards and billing update — September 25

Migration `202609250001_rewards_and_premium.sql` is deployed. It adds server-owned daily draws, courier passes, private riddle answers, retry-safe scoring, premium memberships, and once-per-paid-period allowances. New public tables have owner-only RLS; riddle solutions and allowance records live in the unexposed private schema. Existing send RPC arguments are unchanged; courier passes are consumed before points. Premium limits are enforced by SQL.

The `sync-premium` and `revenuecat-webhook` Edge Functions are deployed. Both return 401 to unauthorized requests. RevenueCat/store credentials and products are not configured, so real purchases are not yet enabled or end-to-end tested. See PAYMENTS.md. The existing public schema probe remains version 2; migration history now contains four entries.
