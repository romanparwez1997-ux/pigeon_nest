# Publish Pigeon Post to Android and iOS

Prepared September 25, 2026. This repository has store build profiles; no store submission has been made. Developer accounts, production email, public policy pages, and RevenueCat/store products still need setup before a public launch.

## 1. Create your accounts and app records

- Create an [Expo account](https://expo.dev/signup).
- Enroll in [Google Play Console](https://support.google.com/googleplay/android-developer/answer/6112435): US$25 one-time registration fee; complete the identity/device verification requested for your account.
- Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/): US$99/year, or local pricing where available.
- Create Pigeon Post in Play Console and App Store Connect. Both native identifiers are currently **`com.romanparwez.pigeonpost`**. Confirm ownership and your intended identifier before the first upload; changing it later means a different app.
- iPad support is enabled. Prepare and test iPad layouts and screenshots alongside iPhone screenshots.

## 2. Link EAS and configure production

Run from the project directory:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
```

Select/create your own Expo project. `init` adds its real project ID to the app configuration. Commit that configuration before building. Do not copy another project's ID.

In the Expo dashboard → project → Environment variables, create the following in **production** (and separately in **preview** for testing):

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Your intended Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | That project's public publishable key |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat Android public SDK key, beginning `goog_` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat iOS public SDK key, beginning `appl_` |
| `EXPO_PUBLIC_TERMS_URL` | Published HTTPS terms page |
| `EXPO_PUBLIC_PRIVACY_URL` | Published HTTPS privacy page |

The build profiles already set `EXPO_PUBLIC_APP_MODE=live`. The ignored `.env.local` file is not a reliable source for cloud builds. Public variables are included in the app; Supabase service-role keys and RevenueCat secret keys belong only in the backend. Follow [PAYMENTS.md](PAYMENTS.md) for products, webhook, entitlement, server secrets and sandbox testing.

`eas.json` now provides:

- `development`: native development client with preview environment.
- `preview`: installable Android APK; internal iOS distribution requires registered devices.
- `simulator`: iOS Simulator build; cannot go to TestFlight/App Store.
- `production`: store distribution, Android AAB, production environment, automatically incremented remote native build numbers. The user-facing version is still `expo.version` in `app.json`; increment it for subsequent releases.
- `submit.production`: Android internal **draft**; iOS App Store Connect upload. No automatic public rollout.

For an existing store app, initialize EAS's remote build number above your last uploaded version using `npx eas-cli@latest build:version:set`. See [Expo version management](https://docs.expo.dev/build-reference/app-versions/).

## 3. Finish launch prerequisites

- Configure Supabase custom SMTP and confirmation/recovery templates in [BACKEND.md](BACKEND.md). Test fresh signup, confirmation, password reset, sign-out/sign-in and deletion using external email accounts. The default email service is not sufficient for a public signup launch.
- Complete [PAYMENTS.md](PAYMENTS.md), including purchase, restore, cancellation, expiry and account-switch tests through real native store builds. Complete store paid-app agreements, tax/banking details and subscription metadata. Expo Go cannot validate real billing.
- Publish real privacy, terms, support contact and a working web account-deletion request page. The app already includes deletion in account settings; Google also requires a [web deletion request route](https://support.google.com/googleplay/android-developer/answer/13327111). Include locally stored drafts and translation processing in the privacy review.
- Complete Play Data safety and Apple App Privacy from actual behavior and SDKs: accounts, private date of birth, country/interests, letters/chats, reports, purchase identifiers, and text sent for translation. Check SDK privacy manifests and export-compliance questions against the final native binary; do not assume a blanket answer.
- Prepare moderation coverage, published community rules and support. Test report/block and report handling. This app permits ages 16–17 in a separate circle; choose store audience/age ratings accurately. Review [Apple's user-generated-content rules](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) and [Google's social-app child-safety standards](https://support.google.com/googleplay/android-developer/answer/14747720). Pen-pal matching and stranger messaging need careful review; having report buttons alone does not guarantee approval.
- Prepare final icons, screenshots of the real app, description, support/privacy URLs and review instructions. Supply working review accounts and explain that accepting a letter opens chat and delivery takes time. Do not advertise features that are not implemented, such as push notifications or online multiplayer.
- Run [TESTING.md](TESTING.md) and [FOLDABLE_TESTING.md](FOLDABLE_TESTING.md). Test native release builds on real Android and iPhone devices, including poor network conditions.

## 4. Build store binaries

```sh
npm ci
npm run check
npm run export
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

EAS prompts for signing setup: Android upload keystore, Apple team/distribution certificate/provisioning. Keep signing credentials backed up securely. These cloud builds can incur costs depending on your Expo plan. Wait for each build to succeed and inspect its logs and artifact.

For native Android emulator testing before submission:

```sh
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build:run --platform android
npm run start:dev
```

Choose the matching development build when prompted. A native rebuild is needed for the orientation/resizing config plugin and purchase SDK; Fast Refresh alone does not apply manifest changes. Use a Play-installed internal build and license tester for billing validation.

## 5. Android: internal test → closed test → public release

Configure Google Play API submission credentials in EAS (or upload the AAB manually in Play Console). Follow [Expo's Android submission guide](https://docs.expo.dev/submit/android/); keep the Google service-account JSON outside this repository.

```sh
npx eas-cli@latest submit --platform android --profile production
```

Select the successful **production** AAB, not a development/preview build. This profile creates an internal **draft**. Open Play Console, review it, finish its setup tasks, add testers and roll out the internal test explicitly. Then install from the tester opt-in link and test the downloaded build.

For personal developer accounts created after November 13, 2023, Google requires at least **12 testers continuously opted into a closed test for 14 days**, followed by an application for production access. Internal testing alone does not fulfill this. See [Google's current testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465).

Once eligible, complete the listing, audience/content rating, Data safety, app access instructions and policy declarations; promote your tested release to production and submit for review. Check Play Console's current target API and native-library/device compatibility checks on the built AAB rather than assuming a successful JS export proves store compatibility.

## 6. iOS: TestFlight → App Review

```sh
npx eas-cli@latest submit --platform ios --profile production
```

Select the successful production iOS build. Supply the real numeric App Store Connect app ID if prompted; you can save it as `submit.production.ios.ascAppId` in `eas.json` afterward. Configure Apple submission credentials through EAS's secure prompts.

After Apple processes the upload, open App Store Connect → TestFlight and test it. External TestFlight testing can require beta review. Finish subscription metadata and submit the first subscription with the app as directed by App Store Connect. Complete screenshots, age rating, privacy/support URLs, App Privacy, review account and export-compliance questions, select the tested build, then submit for App Review. Choose manual release if you want to control launch timing.

EAS submission uploads binaries; it does not complete screenshots or store descriptions. An iOS upload becomes a TestFlight build, not an automatic public release. [Expo submission overview](https://docs.expo.dev/deploy/submit-to-app-stores/)
