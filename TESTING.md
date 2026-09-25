# Test Pigeon Post on Android and iOS

The app uses Expo SDK 57. Start with a hosted **development** Supabase project so both phones can reach the same backend. You can preview the demo without a backend, but demo letters do not travel between devices.

## Current project

Project `hrcwhzgznzlxbrhocmoi` is already linked, all four migrations are deployed, and `.env.local` contains the live public connection settings. **Skip the link/deploy/copy steps below for this workspace.** Start with `npm run backend:check` and `npm start -- --clear`.

Before general email signup/recovery testing, configure custom SMTP in the Supabase dashboard. The Free project's default sender restricts recipients and does not allow custom templates; the app's recovery-code template has not yet been installed. The Site URL also remains the default `http://localhost:3000` until a reachable app landing URL is supplied. See BACKEND.md for the verified deployment status.

## 1. Connect a new backend once

Use Node 24, then run from this folder:

```sh
npm install
cp .env.example .env.local
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REFERENCE
npm run backend:plan
npm run backend:deploy
```

Fill `.env.local` with the project's URL and **publishable key**, keeping `EXPO_PUBLIC_APP_MODE=live`. Do not use a service-role/secret key. Explicit live mode now stops with a configuration error if these values are missing.

In the Supabase dashboard:

1. Enable email/password login, email confirmation, and a minimum password length of 8.
2. Configure SMTP for the test email addresses you will use. The default sender is restricted; use the Auth logs to diagnose failures.
3. Set a reachable Site URL for the confirmation landing page. Confirm the email link, then return to the app and sign in. Sign-in does not depend on the landing page extracting a session.
4. After configuring SMTP (required to customize templates on this Free project), in Authentication → Email Templates → Reset Password, paste `supabase/templates/recovery.html`. It uses `{{ .Token }}` so users enter a code in the app instead of opening a deep link. This dashboard step is required for hosted recovery; migrations do not install email templates. Local Supabase loads this template from `config.toml`.
5. Execute `supabase/verify-deployment.sql` in the SQL Editor. Expect schema version **2**, the four realtime tables, and an active delivery Cron job. Check the job's successful run after a minute.

```sh
npm run backend:check
npm run check
npm start -- --clear
```

`backend:check` checks the public API/schema; `check` runs TypeScript and local automated tests. Neither alone verifies email, Realtime, or Cron.

## 2. Start on physical phones

Install an **SDK 57 compatible Expo Go** from [Expo's download/setup page](https://expo.dev/go). Connect the computer and phones to the same Wi-Fi. Run `npm start -- --clear`:

- **Android:** open Expo Go and scan the terminal QR code.
- **iPhone:** scan the QR code with Camera and open it in Expo Go.

If the installed Expo Go cannot run SDK 57, use the compatible download offered by Expo or the standalone preview builds below. Do not change the app's SDK just to silence a version mismatch.

If the QR connection fails, try `npm start -- --tunnel` (Expo may ask to install its tunnel dependency). The tunnel carries the Expo development server; it does **not** expose a local Supabase server. Use hosted Supabase for this path.

You should see **LIVE ACCOUNTS** and a sign-in screen. Seeing fictional explorers means demo mode is active: check the environment and restart Expo. Public environment values are embedded at build time, so reinstall/rebuild standalone apps after changing them.

See [Expo: start developing](https://docs.expo.dev/get-started/start-developing/) and [Expo Go version compatibility](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## 3. Simulators and native local builds

| Target | Install/setup | Start |
| --- | --- | --- |
| Android emulator | Android Studio, SDK/platform tools, an Android Virtual Device; start the AVD | `npm run android` |
| iOS Simulator (Mac) | Full Xcode, launch it once, install an iOS runtime, select Xcode in Settings → Locations → Command Line Tools | `npm run ios` |
| Local Android native app | Android toolchain above and Java required by Expo/RN | `npm run native:android` |
| Local iOS native app | Full Xcode and CocoaPods | `npm run native:ios` |

The `android`/`ios` scripts open Expo Go. The `native:*` scripts generate native projects and compile this app locally; native projects are gitignored. For a connected device, append `-- --device` to a native command and follow the signing/device prompts. These local debug builds use Metro.

### Android emulator on this Apple Silicon Mac

1. Open Android Studio and complete its **Standard** setup wizard. Review and accept the Android SDK license when prompted, then let the SDK and emulator downloads finish.
2. From the welcome screen, open **More Actions → Virtual Device Manager** (or **Tools → Device Manager** inside a project). Create a Pixel virtual device using an **ARM64 / arm64-v8a** Android system image. Android 16 / API 36 is a suitable starting point.
3. Press the virtual device's **Play** button and wait for the Android home screen.
4. In this project's terminal, run `npm run android`. Expo installs/opens the compatible Expo Go client and loads Pigeon Post. If `npm start` is already running, press **a** in that terminal instead.
5. Expect the **LIVE ACCOUNTS** sign-in screen. Sign in with a confirmed test account, or finish the SMTP setup described above before testing general signup and password recovery.

Expo normally finds the SDK at `~/Library/Android/sdk`. If it cannot, run these in the same terminal before `npm run android` (add them to `~/.zshrc` only if you want them to persist):

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
adb devices
```

Keep the hosted Supabase URL in `.env.local`; the emulator reaches it over HTTPS. You do not need Docker, a local database, an EAS build, or a Google Play login for this Expo Go test. See [Expo's Android emulator setup](https://docs.expo.dev/workflow/android-studio-emulator/).

**Verified on September 25:** the `Pixel_10` ARM64 emulator boots, Expo Go is installed, and Pigeon Post renders its **LIVE ACCOUNTS** sign-in screen. Android Studio is installed at `/Applications/Android Studio.app`, with the SDK in `~/Library/Android/sdk`. Authentication and the two-account flow still need testing.

If Expo says **“No development build (com.romanparwez.pigeonpost) … is installed”**, the server is targeting a custom development build. Stop that project's Expo server with Ctrl+C, then run:

```sh
npm run android
```

The Android script explicitly selects Expo Go with `--go`, even with `expo-dev-client` installed. It uses LAN networking by default; if localhost stalls on a Mac with an IPv6-only listener, restart in this default mode. Keep Metro running while testing. If you press **s**, Expo switches launch targets; press it again to return to Expo Go. See [Expo CLI launch targets](https://docs.expo.dev/more/expo-cli/#launch-target).

`xcode-select -p` still points to `/Library/Developer/CommandLineTools`; full Xcode is needed for iOS Simulator. Follow [Expo's environment setup](https://docs.expo.dev/get-started/set-up-your-environment/) for your target.

## 4. Installable builds without Expo Go

`eas.json` includes `preview` (Android APK / registered iPhone) and `simulator` (iOS Simulator). These bundle the app and do not require Metro. The starter native ID is `com.romanparwez.pigeonpost`; change it in `app.json` before building if you already own another ID.

```sh
npx eas-cli@latest login
npx eas-cli@latest init
```

In the linked Expo project's **Environment variables**, choose the **preview** environment and add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as plaintext/public build variables. `.env.local` is gitignored and is not a substitute for configuring the cloud build environment. `EXPO_PUBLIC_APP_MODE=live` is already set by the build profile. The post-install check stops cloud builds with missing configuration.

```sh
# Android: install the APK from the finished build's link.
npx eas-cli@latest build --platform android --profile preview

# iPhone: register this phone before building; follow Apple signing prompts.
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview

# iOS Simulator on a Mac: no physical-device signing required.
npx eas-cli@latest build --platform ios --profile simulator
npx eas-cli@latest build:run --platform ios --latest
```

iPhone internal distribution uses registered devices and a paid Apple Developer account. An Android APK cannot be installed on an iPhone; an iOS Simulator build cannot be installed on one either. See [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/) and [iOS Simulator builds](https://docs.expo.dev/build-reference/simulators/). No cloud builds, signing, or store submissions have been performed by this implementation.

## 5. Test the real two-device flow

Use two confirmed test accounts you control, one on each phone, with eligible birthdays in the same age group. Create a third account in the other group to check isolation. A new database has no seeded explorers, so account A's discovery remains empty until account B finishes its passport.

1. Sign up, confirm email, sign in, and create passports with three interests. Each new account starts with 120 points. Restart each app to check session persistence.
2. Edit name, country, interests, bio, and languages in Passport. Refresh the other device to see the public changes. Birthdates stay private and immutable.
3. A sends a direct pigeon letter to B. A's balance becomes 110. B must not see its body or a chat before arrival.
4. Wait **15 minutes plus up to one Cron interval**. Close and reopen either app during the wait. B should receive the letter and an in-app notification. There is no live skip-delivery button.
5. B accepts it. Both phones should show the conversation. Send messages both ways; check automatic updates, foreground refresh, and recovery after losing network. Mark Passport notifications read and verify the other account's read state is unaffected.
6. Submit a report without blocking. Check its status in Passport. Then block the peer: both sides lose chat access. Unblock from Passport; chat stays closed until another letter is accepted. If both sides blocked, both must unblock to interact again.
7. Sign out and choose Forgot password. Request a code, enter the code from the recovery email, set matching new passwords, and sign in again. Also test an incorrect/expired code, resend confirmation, and a wrong password.
8. On a disposable test account, type DELETE in Passport and delete it. Confirm login fails afterward and shared conversation data is gone. Test deletion before onboarding too. Deletion is permanent, so keep these accounts separate from any real user data.
9. Verify the third account cannot discover or target peers across the 16–17 / adult boundary. Run the SQL verification again and inspect Auth/Cron logs for failures.

No operating-system push alert is expected while the app is closed: notifications here are in-app database events. Background delivery still runs on the server.

## Optional authenticated API smoke check

After creating a test passport, create a gitignored `.env.test.local`:

```dotenv
BACKEND_TEST_EMAIL=your-confirmed-test-address@example.com
BACKEND_TEST_PASSWORD=your-test-password
```

```sh
npm run backend:smoke
```

This signs in to check the actual Auth/PostgREST connection, schema version, anonymous denial, private discovery, the caller's wallet, notifications, and accessible chat history. It signs out its own session afterward and does not create/delete application data. It does not test delivery or realtime; use the two-device flow for those.

## Local Supabase instead of hosted

Install a Docker-compatible runtime and run `npm run backend:start`. The CLI applies all migrations and starts Auth, PostgREST, Realtime, Cron, and the email test service. Use `npx supabase status` for public connection settings; do not copy service keys into Expo variables.

| Client | Local API URL |
| --- | --- |
| iOS Simulator / web on this Mac | `http://127.0.0.1:54321` |
| Android Studio emulator | `http://10.0.2.2:54321` |
| Physical phone on same Wi-Fi | `http://YOUR_COMPUTER_LAN_IP:54321` |

The shared configuration validator allows HTTP on private LAN IPs for development. The phone must be able to reach the Docker-published API port, and native network policy/firewall settings must permit it. For simultaneous phone testing or installable preview builds, hosted HTTPS Supabase is simpler. For local confirmation/recovery, read the test email inbox on the computer at `http://127.0.0.1:54324`. Do not run a database reset against a hosted project.

## What remains before public release

This is a backend for private account testing. Hosted end-to-end verification, concurrency/load testing, staffed moderation, age assurance, device push delivery, production SMTP, and release/privacy work remain. Avatar uploads are not implemented. Store purchase integration is prepared, but billing setup and store sandbox verification remain. Automated PostgreSQL tests validate the SQL/RLS behavior but cannot validate Supabase's Auth service, Realtime, `pg_cron`, or physical device behavior.

## Daily gifts, riddles, and premium testing

Open the daily gift card on Home (or tap the points balance). Claim a gift, reopen it, and refresh: the result and wallet must not duplicate. Send a letter with a matching courier pass and verify the pass is spent instead of points. A failed send must preserve the pass. With a riddle token, open a puzzle, try a wrong answer twice (one guess consumed), then a correct one (20 points once). There is one gift per UTC day, three distinct riddle guesses, and a seven-day puzzle expiry.

Pigeon Plus is available from Home or Passport. Checkout is intentionally disabled in Expo Go and until store keys and legal URLs exist. Follow [PAYMENTS.md](PAYMENTS.md) for real native/sandbox testing. No real purchase has been performed.
