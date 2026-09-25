# Chat, files, calls and navigation

## What this change implements

- Live chat typing indicators expire after five seconds and stop on inactivity/backgrounding.
- Read receipts advance only for messages visibly rendered in the active chat. The server stores a monotonic cursor derived from an existing message, not the phone's clock.
- Attachments: JPG/JPEG, PNG, WebP, PDF and UTF-8 TXT, up to 10 MB per file and 100 MB uploaded per account per day. Uploads are authenticated and checked by size, extension and file signature on the server. Files are private; only members of the open, accepted conversation may request a 60-second download URL. Blocking revokes new downloads; an already-issued URL remains valid until expiry. Downloaded copies cannot be recalled. Signature checks are not antivirus scanning.
- Voice/video call invitations, accept/decline/end controls, microphone/camera controls and a two-person LiveKit room. Only the caller needs verified Pigeon Plus; the recipient can answer free. Calls require an existing accepted conversation and respect blocks, suspension and friendship circles. Invitations expire after 45 seconds. Active clients send a heartbeat every ten seconds; maintenance ends abandoned calls after a missed 45-second heartbeat window (plus scheduler latency). Calls expire at the earlier of two hours or the caller's premium expiry.
- Native push notification opt-in from Passport, device-token registration/removal, message/call jobs, Expo ticket/receipt processing, invalid-token cleanup and authenticated dispatch. Notifications contain generic text, not private message bodies.
- Chat detail uses a native navigation stack: iOS edge swipe-back and Android system back return to the conversation list. Android back also exits a selected game and returns other tabs to Explore before leaving the app. Dialog back requests close the dialog; leaving a call asks for confirmation. Android predictive-back support is enabled in native configuration; its OS animation needs a fresh build/device test.

## Current limits

LiveKit credentials and native push signing credentials must be configured before those services work. Expo Go cannot run the calling SDK or remote push. Use a new development/store build.

Calls are foreground-only in this release: leaving/backgrounding the app ends a call. Incoming calls use an app dialog or a normal push notification, not the operating system's telephone screen. CallKit/PushKit, Android Telecom/foreground calling services, background call continuation, screen sharing and recording are not implemented. Do not advertise those capabilities. Browser chat/calls/files work while open; browser background Web Push is not implemented.

The media token expires quickly, but that alone does not disconnect an established room. The scheduled worker deletes ended/revoked rooms; operate and monitor it before enabling calls. It also removes queued storage files after account/conversation deletion. Unavailable external services cause cleanup to retry. A network failure during upload or an Edge Function crash can leave an unpublished storage object; audit `chat-files` for paths without attachment metadata and remove stale objects via the Storage API, not direct SQL.

## 1. Configure LiveKit

1. Create a LiveKit Cloud project (or operate a production LiveKit server with TURN and HTTPS/WSS). Pick your region and review its usage costs.
2. In Supabase → Edge Functions → Secrets, add:

   ```dotenv
   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
   LIVEKIT_API_KEY=your_server_api_key
   LIVEKIT_API_SECRET=your_server_api_secret
   ```

   These are server settings. Do not add the API secret to `.env.local`, Vercel public variables, the mobile app, or chat. No public LiveKit token is hardcoded into the app.
3. Complete RevenueCat/store setup in [PAYMENTS.md](PAYMENTS.md). The existing server-verified `premium_memberships` table controls who can initiate calls. Do not simulate Premium by changing client flags.
4. Deploy the migrations and the `call-session` function. That endpoint authenticates the Supabase user, rechecks conversation membership, call state and the caller's entitlement before issuing a room-specific token.

Reference: [LiveKit Expo setup](https://docs.livekit.io/home/quickstarts/expo), [room-service deletion](https://docs.livekit.io/reference/other/roomservice-api/).

## 2. Configure native push

1. Link this repository to your Expo project with `npx eas-cli@latest init`. Keep its real `extra.eas.projectId` in app configuration.
2. Configure Android FCM v1 credentials and iOS APNs credentials through EAS. Follow [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/). Do not commit credential JSON/private keys.
3. If Expo enhanced push security is enabled, set its access token as Supabase secret `EXPO_ACCESS_TOKEN`.
4. Build/install a new native app. Sign in, open Passport and press **Enable message & call notifications**. The OS permission prompt only appears when requested. Sign-out unregisters this device from the current account.
5. Send a message from another connected account with the first device backgrounded. Tap the notification to open the authorized conversation. Test denied permissions, account switching and reinstall/token rotation too.

Message jobs are retried at most eight times; accepted tickets are checked later for Expo delivery receipts. An Expo ticket is not proof that a person received/read the notification. Notification delivery and OS scheduling are best effort. See [Expo delivery/receipt guidance](https://docs.expo.dev/push-notifications/sending-notifications/).

## 3. Backend installation and worker

```sh
npx supabase db push
npx supabase functions deploy chat-upload --use-api
npx supabase functions deploy call-session --use-api
npx supabase functions deploy communication-worker --use-api
```

The migrations create the private bucket, row-level permissions, realtime publications and scheduled maintenance. The worker authenticates with a separately generated `COMMUNICATION_WORKER_SECRET`; the client cannot dispatch it.

Run `node scripts/configure-communications-worker.mjs` after the CLI is authenticated and linked. It generates a strong secret locally, sets the Edge Function secret, stores the matching secret and endpoint in Supabase Vault and removes its temporary files. It does not print the secret. Run it again to rotate the worker secret. It uses the already-linked project; check `supabase/.temp/project-ref` first.

The dispatcher checks for work every ten seconds, and does not invoke the function when there is no work. Database-only call expiry/block maintenance also runs once a minute. Verify the two `pigeon-communication-*` jobs in `cron.job` and their latest `cron.job_run_details`, and inspect function failures before enabling real calls or push. Stale ended-call cleanup can accumulate until LiveKit is configured.

## 4. Rebuild and test

```sh
npm run check
npm run export
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
npm run start:dev
```

Rebuild after changing native plugins, camera/microphone permissions, push credentials, EAS project ID or the predictive-back flag. A Vercel redeploy only updates the website.

Use two test accounts with an accepted letter connection:

- Type, stop typing, switch chats and background the app; stale indicators must disappear. A stranger cannot subscribe to private chat activity.
- Keep a message offscreen/backgrounded, then scroll it into view; the sender should change from Sent to Read only when viewed. Test older history and equal-timestamp pagination.
- Upload each supported file, cancel the picker, try an oversized/mismatched file, and block the sender. Test download/share on both platforms and web. Check account deletion queues physical cleanup.
- Verify a free caller cannot start calls, including direct RPC attempts. A Premium caller can invite a free recipient. Test accept, decline, timeout, mic/camera permission denial, network interruption, mute/camera toggles, background/end and blocking during a call. Verify expired Premium denies new room tokens and maintenance terminates an active room.
- Test push after sign-out/account switching: the old account must not notify the new one. Check Expo receipts and removal of invalid tokens.
- Test Android button/gesture back, iOS edge swipe-back in chat, dialog back, and call end confirmation. Repeat on the narrow/unfolded layouts from [FOLDABLE_TESTING.md](FOLDABLE_TESTING.md).

Automated checks cover the access rules and byte validation. A two-device media/push test and native gesture validation are still required with your provider credentials.
