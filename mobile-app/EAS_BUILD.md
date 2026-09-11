# EAS Build — Smart Digital Khata mobile apps

This one Expo codebase produces **two branded Android apps**, selected at build time by
the `APP_FLAVOR` env var (wired per profile in `eas.json`):

| Flavor     | App name                | Android package                     | What it is                                   |
| ---------- | ----------------------- | ----------------------------------- | -------------------------------------------- |
| `owner`    | Smart Khata — Shop      | `com.smartdigitalkhata.owner`       | The existing native shop-owner app           |
| `consumer` | Smart Khata — Customer  | `com.smartdigitalkhata.consumer`    | The native consumer app (khata, pay, discover, orders) |

The consumer app is a native experience (OTP login, khata + pay, shop discovery,
cart/orders, account) in 8 Indian languages, hitting the live API.
Android is the first target; iOS is left configured but deferred (see the bottom).

## Build via GitHub Actions (recommended — no local setup)

The `.github/workflows/eas-build.yml` workflow builds an installable **APK** on
Expo's servers, on demand. **Play Store publishing is not set up yet** — this
produces sideloadable APKs only (no AAB, no `eas submit`, no Google Play account
needed).

One-time:
1. Create an Expo access token → https://expo.dev/settings/access-tokens
2. Repo → Settings → Secrets and variables → Actions → add secret **`EXPO_TOKEN`**
   (paste the token). Never commit it.
3. The owning Expo account is pinned in `app.config.js` (the `owner` field, default
   `dkshaikdxb`; override per build with the `EAS_OWNER` env var). Owner and consumer
   are **separate EAS projects** (different slugs), so each has its own project id.
   The first build of a flavor creates its project and prints the id (also shown as a
   run annotation); add it as an Actions **variable** — **`EAS_PROJECT_ID_OWNER`** for
   the owner app, **`EAS_PROJECT_ID_CONSUMER`** for the consumer app — so later builds
   link non-interactively and skip the create step.

Then: Actions tab → **EAS Build (Android APK)** → Run workflow → pick `consumer` or
`owner`. The installable `.apk` URL appears in the run log (and on expo.dev → Builds).

## Prerequisites

1. Install the EAS CLI: `npm i -g eas-cli`
2. An [Expo account](https://expo.dev) (free tier is fine).
3. Sign in: `eas login`
4. Install JS deps once: `cd mobile-app && npm ci`

## One-time project setup

Run once, from `mobile-app/`:

```bash
eas init
```

This creates the EAS project on your Expo account and wires up the project id.
The config reads the id from the `EAS_PROJECT_ID` env var (`app.config.js` →
`extra.eas.projectId`); EAS injects it during a build, so you normally do not need to
set it by hand. If you want it explicit, copy the id `eas init` prints and export it, or
set it in the build environment. **No project id is hardcoded in the repo.**

## Build commands

All builds are Android. Run from `mobile-app/`.

Shop Owner app:

```bash
# Installable APK for internal testing / sideloading
eas build -p android --profile owner-preview

# AAB (app-bundle) for the Google Play Store
eas build -p android --profile owner-production
```

Consumer app:

```bash
# Installable APK for internal testing / sideloading
eas build -p android --profile consumer-preview

# AAB (app-bundle) for the Google Play Store
eas build -p android --profile consumer-production
```

Each `*-preview` profile is `distribution: internal` and produces an APK you can install
directly on a device. Each `*-production` profile produces an AAB for Play and uses
`autoIncrement` for the version code. The flavor is set by the profile's `env.APP_FLAVOR`
— you do not pass it manually.

> The consumer app uses `react-native-webview`, a native module. It runs in EAS builds and
> in a custom dev client, but **not** in plain Expo Go — build a dev client
> (`eas build --profile development`) if you need to iterate locally.

> **OS-native voice (`expo-speech-recognition` + `expo-speech`).** The consumer
> voice search and the owner "Ask" use the device's built-in speech engines (iOS
> `SFSpeechRecognizer`, Android `SpeechRecognizer`) for recognition and
> `expo-speech` for read-aloud — free, no accounts, no credentials. These are
> **native modules**, so adding them needs **ONE EAS rebuild of both flavors**
> (owner + consumer); they do **not** run in plain Expo Go. The config plugin adds
> the Android `RECORD_AUDIO` permission plus `<queries>` visibility for the Google
> speech service, and the iOS `NSMicrophoneUsageDescription` +
> `NSSpeechRecognitionUsageDescription` usage strings. After the rebuild, voice-UX
> JS changes ship **OTA** like any other JS-shell change (no further rebuild). The
> hook (`src/lib/useNativeVoice.js`) guards every native call, so a build that
> somehow lacks the module simply hides the mic instead of crashing. Recognition
> is wired for en/hi/ta/te/kn/ml/ur; bn/gu/mr are honestly "not yet".

## Overriding the URLs

The API base URL and the consumer PWA URL default to production. Override per build by
setting env vars (either in the build environment or per profile under `env` in `eas.json`):

- `EXPO_PUBLIC_API_URL` — owner app API base (default `https://khata.dadashaik.com`)
- `EXPO_PUBLIC_CONSUMER_URL` — consumer PWA URL (default `https://khata.dadashaik.com/c`)

Example (staging URLs for one build):

```bash
EXPO_PUBLIC_CONSUMER_URL=https://staging.example.com/c \
  eas build -p android --profile consumer-preview
```

## Signing keystore

On the **first** Android build for each app, EAS generates and securely stores an upload
keystore for you (managed credentials) — nothing to commit, nothing to keep locally. The
two apps have different package ids, so they get independent keystores. To inspect or
manage them later: `eas credentials`.

## App icons

Both flavors currently share `assets/icon.png` / `assets/adaptive-icon.png`. To give each
app a distinct icon, drop in:

- `assets/icon-owner.png` and/or `assets/icon-consumer.png`
- `assets/adaptive-icon-owner.png` and/or `assets/adaptive-icon-consumer.png`

`app.config.js` uses the flavor-specific file when it exists and falls back to the shared
one otherwise — no code change needed. The adaptive-icon background color is already
per-flavor (`#22c55e` owner, `#1C7A45` consumer).

## WebView feature bridge (no rebuild for web features)

Rich, fast-evolving features (voice, Khata Credits & referral, Boost/promote, branded
store, delivery champions, share poster, consumer pre-pay) are **not** re-coded natively.
`src/screens/FeatureWebView.js` renders the live web app inside an auth-bridged WebView,
so a new **web deploy** appears in the installed apps with **no app rebuild**.

- **Auth bridge:** it reads the flavor's JWT from `SecureStore` and seeds it into the
  page's `localStorage` before any script runs (owner → `skhata_token` + `skhata_role`,
  consumer → `ckhata_token`), so the web app is signed in as the same user. Nothing is
  injected when there is no token.
- **Native capabilities enabled:** camera + microphone (`onPermissionRequest` grants the
  requested resources; inline/fullscreen media, no user-gesture gate), geolocation
  (`geolocationEnabled`), file uploads (`<input type=file>` + file access), and downloads
  (`onFileDownload` on iOS; on Android, direct asset/`?download` URLs are handed to the
  system browser / DownloadManager). External links open in the system browser.
- **Owner "More" entries:** `/account` (Khata Credits & referral), `/promote` (Boost +
  branded store), `/delivery` (delivery champions), `/dashboard` (share poster).
- **Consumer entry:** Account → "Pay in advance" opens `/c/khata` (single-merchant
  pre-pay / advance) bridged with the consumer token.

Native permissions are declared in `app.config.js` (`android.permissions` +
`ios.infoPlist` usage strings) and are shared by both flavors. **Adding a native
capability, permission, SDK bump, or native dependency still needs a fresh EAS build**;
everything else ships via the web deploy or an OTA JS update.

## EAS Update (OTA) — ship JS-shell changes with no rebuild

`expo-updates` is configured in `app.config.js`:

- `runtimeVersion: { policy: 'sdkVersion' }` — every build on this Expo SDK accepts these
  updates. Bumping the SDK (or any native change) requires a new build, as expected.
- `updates: { enabled: true, fallbackToCacheTimeout: 0, url }` — the `url` is left for
  `eas update:configure` to fill (or the `EAS_UPDATE_URL` / `EAS_PROJECT_ID` env vars).
  **No project id or update URL is hardcoded** — owner and consumer are separate EAS
  projects, each with its own id/URL.
- Per-profile channels are set in `eas.json` (`preview`, `production`).

**One-time setup** (run once per flavor/project, from `mobile-app/`):

```bash
# 1. Create/link the EAS project (prints the project id):
APP_FLAVOR=owner    eas init          # then again with APP_FLAVOR=consumer
# 2. Wire expo-updates (sets the update URL = https://u.expo.dev/<projectId>
#    and the channels). Because app.config.js is a *dynamic* config, if the CLI
#    can't write the URL it prints it — set it via the env var instead:
APP_FLAVOR=owner    eas update:configure
APP_FLAVOR=consumer eas update:configure
#    (or export per build: EAS_PROJECT_ID=<id>  →  url becomes https://u.expo.dev/<id>)
# 3. Rebuild once so the installed app embeds expo-updates + the channel:
eas build -p android --profile owner-preview     # and consumer-preview
```

**Shipping an OTA update afterwards** (JS-only shell changes — new WebView entry, tweaked
native screen, bug fix; NOT new native perms/deps):

```bash
APP_FLAVOR=owner    eas update --branch production --message "…"
APP_FLAVOR=consumer eas update --branch production --message "…"
```

> Match `--branch` to the channel the installed build was made with (`eas.json`): the
> `*-preview` profiles use channel `preview`, the `*-production` profiles use channel
> `production`. The sideloaded test APKs are `preview`, so push those to `--branch preview`.

Installed apps pick it up on next launch. Web-only feature changes need **no** update at
all — they arrive the moment the web app is deployed, because the WebView loads it live.

### OTA via GitHub Actions (one-click, no local setup)

The `.github/workflows/eas-update.yml` workflow does the `eas update` for you on GitHub's
runners (same `EXPO_TOKEN` secret + `EAS_PROJECT_ID_*` variables as the build workflow).
Actions tab → **EAS Update (OTA)** → Run workflow → pick the `flavor`, the `branch`
(`preview` / `production` — match the installed build's channel), and an update message.
Use this for JS-shell changes only; anything native (new permission/dependency/SDK bump)
still needs a fresh build via **EAS Build (Android APK)**.

## On-device QA checklist (run on the APK, per flavor)

The WebView permission/auth/download paths can't be unit-tested — verify on a real device:

- **Auth bridge:** open a "More" web feature (owner) / "Pay in advance" (consumer) — the
  web page should load already **signed in as the same user** (no login screen).
- **Voice mic prompt:** trigger a voice feature — Android should show the mic permission
  prompt once, then record; audio plays without a tap.
- **Image Studio camera + gallery:** open a photo/camera feature — the camera opens and
  `<input type=file>` shows the gallery/file chooser; a picked image uploads.
- **Voice search (consumer, Shops):** in en/hi, tap the 🎤 in the search bar — the OS mic
  prompt shows once, "Listening…" appears, and a spoken shop/city name fills the query and
  runs the search. Deny the permission → an honest hint (auto-clears); switch to bn/gu/mr →
  the mic is replaced by "not available in this language yet"; airplane mode → network hint.
- **Owner Ask (Home):** tap 🎤 **Ask**, say e.g. "aaj ki collection" / "kitna baaki hai" /
  a customer name — a one-line answer shows AND is read aloud; an unmatched question gives
  the friendly fallback; a silent/empty attempt speaks "please try again" (never crashes).
  Confirm en + hi answers; ta/te/kn/ml/ur recognize but answer in English (expected).
- **Location:** open the nearby-shops / location picker — the location prompt appears and
  the map/picker gets a fix.
- **Share / download:** use the share poster / image export — the PNG saves or opens in
  the browser (does not dead-end). See the caveat below for blob-based downloads.
- **Back button & offline:** Android hardware back steps through web history; airplane
  mode shows the retry screen, then recovers on Retry.

> **Download caveat:** server-served file URLs (e.g. `…/poster.png`, `?download=`) are
> handed to the system on Android and to `onFileDownload` on iOS. **Client-generated
> `blob:` / `data:` downloads** (a canvas the web app turns into a file in JS) are the
> weak spot — RN-WebView 13.x does not fire `onFileDownload` for those on Android. If the
> share poster is built client-side as a blob, prefer the web app's "Share" (Web Share
> API / WhatsApp deep link) path, or have the web serve the poster from a URL. Confirm the
> actual poster download path on-device.

## iOS (deferred)

iOS bundle identifiers are configured (`com.smartdigitalkhata.owner` /
`com.smartdigitalkhata.consumer`), but iOS builds need an Apple Developer account plus
provisioning credentials and are out of scope for now. When ready:
`eas build -p ios --profile owner-production` (and the consumer equivalents), after
`eas credentials` sets up the Apple signing.
