# Pigeon Plus: store setup and testing

The purchase/restore UI, RevenueCat SDK, server verification, and webhook handlers are implemented. Checkout stays disabled until your store accounts, products, public SDK keys, and legal URLs are configured. No purchase has been made or verified against a real store yet.

## The initial product

Create **one monthly subscription**, without a free trial for the first test:

- Suggested store product ID: `pigeon_plus_monthly`. Android also needs a monthly, auto-renewing base plan.
- RevenueCat entitlement: **`pigeon_plus`**.
- RevenueCat current/default offering: add this product as the **Monthly** (`$rc_monthly`) package.
- Choose the actual monthly price in each store. The app reads the localized price from the store; no price is hardcoded.
- Benefits: **100 points per paid monthly period**, **10 active letters**, **20 sends per rolling 24 hours**. Free accounts keep 5 active letters and 10 sends per 24 hours. Free daily rewards and riddle payouts are available to everyone.

Only monthly products are supported by this first integration. Do not attach annual, lifetime, or consumable products to this entitlement. Do not enable trials/offers until their price and renewal disclosures have been added to the custom purchase screen. Unused points remain after cancellation; there is no clawback of already spent or granted postage. Delivery speed and safety rules remain the same.

## 1. Set up the store and RevenueCat

1. Create your Google Play Console app with package **`com.romanparwez.pigeonpost`**, and create the subscription/base plan. Configure your payments profile and required app information. For iOS, use the same bundle ID in App Store Connect and complete Apple's subscription agreements.
2. Create a RevenueCat project and connect the Google Play app using its required Play service-account credentials. Connect the Apple app when ready. Follow [RevenueCat's store setup](https://www.revenuecat.com/docs/welcome/set-up-revenuecat).
3. Import the monthly products, attach them to `pigeon_plus`, and make the Monthly package available in the current offering.
4. In RevenueCat's restore behavior, select **Keep with original App User ID**. Purchases belong to a Pigeon Post account identified by its Supabase UUID, not to an anonymous device. Do not enable transfers for this version: monthly allowance accounting is per Pigeon Post account. Restoring must use the same Pigeon Post account that originally purchased.
5. Copy the **public platform SDK keys** (`goog_…`, `appl_…`) into `.env.local`, and add the same variables to the EAS environment used for your build:

```dotenv
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_your_public_key
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_your_public_key
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms
EXPO_PUBLIC_PRIVACY_URL=https://your-domain.example/privacy
```

Use real, published pages you own. Do not use placeholder legal links. Checkout deliberately remains disabled without HTTPS legal URLs. Before opening the store purchase sheet, the app also checks that server billing verification is reachable and configured.

## 2. Configure server-only secrets

In **Supabase Dashboard → Edge Functions → Secrets**, set:

| Secret | Value |
| --- | --- |
| `REVENUECAT_SECRET_KEY` | RevenueCat secret API key with read access to subscribers (v1 API); never an `EXPO_PUBLIC_` variable |
| `REVENUECAT_MONTHLY_PRODUCTS` | Comma-separated **exact product identifiers** returned by RevenueCat for the allowed monthly products; include Android's base-plan suffix if RevenueCat uses it |
| `REVENUECAT_WEBHOOK_SECRET` | A unique random secret of at least 32 bytes, generated in your password manager |
| `ALLOW_SANDBOX_PURCHASES` | `true` in this development Supabase project for store sandbox tests; omit or set `false` for production |

Do not send these secrets in chat or commit them. Supabase provides its URL and service-role key to deployed functions automatically.

Both functions are deployed to this Supabase project. Redeploy changes with:

```sh
npx supabase functions deploy sync-premium revenuecat-webhook --use-api
```

Create a RevenueCat webhook targeting:

```text
https://hrcwhzgznzlxbrhocmoi.supabase.co/functions/v1/revenuecat-webhook
```

Set its Authorization header to `Bearer YOUR_REVENUECAT_WEBHOOK_SECRET`. Send all events, including renewals, expirations, cancellations, refunds, and transfers. Send RevenueCat's TEST event and expect HTTP 200. A missing/wrong authorization secret must return 401.

`verify_jwt = false` is intentional for both functions: `sync-premium` verifies the caller's Supabase JWT using Auth and derives the UUID itself; the webhook verifies its separate authorization secret. Neither trusts entitlement claims from the app. Both fetch current subscription state from RevenueCat. Only a service-role RPC can grant access or points. Duplicate verification of the same monthly purchase period cannot grant 100 points twice. Out-of-order verification requests cannot overwrite a newer stored result.

## 3. Build and test Android

Expo Go does **not** process real store purchases. [RevenueCat requires a development build for native checkout](https://www.revenuecat.com/docs/getting-started/installation/expo).

```sh
# Configure EAS once if it is not linked yet.
npx eas-cli@latest login
npx eas-cli@latest init

# Build an APK containing the native purchase SDK.
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build:run --platform android --latest
npm run start:dev -- --android
```

Alternatively, use `npm run native:android` with a complete local Android build toolchain. Keep `npm run android` for Expo Go UI/reward tests; it explicitly uses `--go`.

For actual Google Play sandbox checkout, upload a signed build to an internal testing track, activate the subscription/base plan in the tester's country, add the tester in Play Console **License testing** and the track's tester list, and accept the test invitation. Use a Play-enabled emulator signed into that tester's Google account. Install from the test track for the most representative test. Follow [Google Play's billing test instructions](https://developer.android.com/google/play/billing/test). A debug APK alone does not replace the Play product/tester setup.

Test with sandbox payment methods:

1. Sign in to a real Pigeon Post test account and finish its passport. Open Pigeon Plus from Home or Passport.
2. Confirm the correct localized monthly price, then purchase using the store's test payment method.
3. Confirm Plus becomes active and 100 points are added once. Free-to-premium active/send limits should change server-side.
4. Tap Restore repeatedly and restart the app. The allowance must not repeat. A second Pigeon Post account must not inherit the purchase (Keep with original App User ID).
5. Test cancelled checkout, pending payment, failed verification/retry, renewal, billing grace period, expiry, and refund. Monitor Edge Function logs and RevenueCat webhook delivery; retry failures.
6. Verify production rejects sandbox entitlements, and never use a real payment method as a substitute for setting up license testers.

For iOS, configure App Store Connect products and sandbox testers, then build a development app on a registered iPhone. Use TestFlight/sandbox to validate purchase, restore, renewal, and refund. A successful JavaScript export is not evidence that store checkout works.

## Rewards already available without billing

One daily claim per account per UTC day: 25% pigeon delivery, 25% postman delivery, 25% 10 points, 25% riddle token. Server-side locks and unique keys prevent re-rolls or duplicate credits. Courier passes cover one matching delivery automatically; failed sends don't spend a pass. A token opens a riddle lasting seven days, with three distinct guesses. A correct answer earns 20 points once. Riddle answers are held in the private database schema.

## Premium voice and video calls

The caller must have a verified active Pigeon Plus membership; a connected recipient may answer for free. Configure LiveKit and native push as described in [COMMUNICATIONS.md](COMMUNICATIONS.md). Calls are foreground-only, require an accepted letter connection, and use the same blocking/age-circle rules. Do not advertise calling as available until LiveKit, the cleanup worker and two-device tests are complete.
