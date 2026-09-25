# Foldable and resizable-window testing

## Implemented

- `app.json`: default orientation (portrait and landscape), iPad support and multitasking allowed.
- `plugins/withAdaptiveAndroid.js`: resizable Android activity; preserves native configuration handling for orientation, screen size, smallest width and screen layout changes; keyboard uses resize behavior. Rebuild the native app to apply this.
- Live layout uses the current window dimensions and safe areas. At available width ≥840 dp, safe-area height ≥500 × font scale dp and font scale <1.6, bottom tabs become a left navigation rail. Smaller windows and larger text retain bottom tabs. Screen components remain in the same React tree across this change.
- Main content has a readable maximum width; chat content/composer are capped at 780 dp. Home illustration responds to the measured content width and font scale, including when a rail reduces available space.
- Games allow cards and controls to wrap/shrink. Board cells fit three columns within the available width.
- Dialogs support landscape, respect safe areas and scroll within available height. Forms and chat support keyboard avoidance/resizing.
- Live unfinished letters persist locally per signed-in account: body, destination and courier. Saves are ordered, validated on restore and cleared from the UI after a successful send; deleting an account removes its local draft. They are device-local, not synced between devices. Ordinary window resizing also preserves current page and in-memory game state; a full process restart does not restore an in-progress game or unsent chat message.

This is adaptive-window support. There is **no Jetpack WindowManager folding-feature bridge** yet: the app does not detect a separating physical hinge or arrange special book/tabletop panes. Do not advertise hinge-aware or tabletop-optimized support until that is implemented and tested. Current centered dialogs may cross a separating hinge on dual-screen hardware.

## Verified on September 25, 2026

- TypeScript passes; 23 application tests and 27 backend tests pass, including draft validation, account separation, ordered deletion and recovery after storage errors.
- Android, iOS and web JavaScript exports succeed. Exports do not establish native build/store acceptance.
- Expo config introspection confirms Android `resizeableActivity=true`, `screenOrientation=unspecified`, `adjustResize`, and the size/orientation configChanges. iOS/iPad orientations include portrait and landscape; `UIRequiresFullScreen=false`.
- Signed-in Android Expo Go home visually checked at 320 dp and approximately 900 dp widths by temporarily resizing the existing Pixel emulator. Narrow home and games views fit; expanded view shows the left rail. A tab-width regression found during shrinking was fixed by explicitly constraining the navigation width and flex sizing. This exercises window adaptation, not a physical hinge or the app's rebuilt native manifest.
- Expo Go resizing recreated its host activity during checks, returning to Explore; native page/game continuity must be checked after rebuilding with this project’s manifest.
- Native iOS device, iPad multitasking, real fold/unfold, process-death draft restoration and store billing tests remain required.

## Test on a foldable Android emulator

1. Android Studio → Device Manager → Create Virtual Device. Choose an available foldable profile (for example Pixel Fold), with an ARM64 system image on this Mac. A resizable emulator is also useful for window tests; use a foldable profile for actual fold controls.
2. Install a fresh **native development build** using the commands in [PUBLISHING.md](PUBLISHING.md). Open it with `npm run start:dev`. Expo Go alone does not verify the app's orientation/resizing plugin or real billing.
3. Use emulator fold/unfold controls and rotate both ways. Enable multi-window/split-screen and drag its divider while the app is visible. Test widths around 320, 600, 839, 840 and 1000 dp. Also test a short landscape window and large system font sizes.
4. Repeat the flows below on a real foldable if available, and on a normal phone. Verify the release build too.

| Flow | Pass criteria |
| --- | --- |
| Home, Mailbox, Passport | No clipped text, overlap, inaccessible controls or unwanted horizontal scrolling; content scrolls fully |
| Navigation across 840 dp | Same selected page before/after resize; five destinations remain reachable |
| Compose | Type a letter, select destination/courier, fold/unfold and rotate with keyboard open; text and selections remain; close/send buttons reachable |
| Draft after restart | Use a test account, type without sending, wait for save, force-stop/reopen; reopen compose and verify exact content/choices |
| Account isolation | Sign out of A and into B; B must never see A's draft; sign back into A to restore it |
| Chat | Keyboard, long message and rotate/resize; input and Send remain visible, no clipped conversation |
| Games | Start each game; resize mid-round without reset; all squares/stamps tappable |
| Rewards and Plus | Open dialogs, rotate, increase text size and scroll; terms, restore, purchase and close remain accessible |
| Safe areas | Landscape camera cutout, gesture navigation and three-button navigation do not obscure controls |
| Hinge/tabletop | Record any content under a separating hinge; requires native posture integration before declaring support |

On iOS, repeat compact/landscape tests on iPhone and split-window resizing on iPad. The supported iPad target needs its own store screenshot and device validation pass.

## Reproduce width-only Android checks

Use only a development emulator. Record `adb shell wm size` and `adb shell wm density` first. On the existing emulator at density 420:

```sh
adb shell wm size 840x1800
# 320 dp width: inspect home, forms and games
adb shell wm size 2362x1800
# about 900 dp width: inspect navigation rail and readable content
adb shell wm size reset
```

If an override existed before testing, restore that value instead of resetting. These commands do not simulate a hinge, and the original emulator dimensions must be restored afterward.

Reference: [Android adaptive orientation and resizability](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability), [adaptive app quality guidance](https://developer.android.com/docs/quality-guidelines/adaptive-app-quality).
