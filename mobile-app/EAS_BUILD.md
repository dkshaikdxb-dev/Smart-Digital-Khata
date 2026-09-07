# EAS Build — Smart Digital Khata mobile apps

This one Expo codebase produces **two branded Android apps**, selected at build time by
the `APP_FLAVOR` env var (wired per profile in `eas.json`):

| Flavor     | App name                | Android package                     | What it is                                   |
| ---------- | ----------------------- | ----------------------------------- | -------------------------------------------- |
| `owner`    | Smart Khata — Shop      | `com.smartdigitalkhata.owner`       | The existing native shop-owner app           |
| `consumer` | Smart Khata — Customer  | `com.smartdigitalkhata.consumer`    | A thin WebView shell of the consumer PWA     |

The consumer app just loads the already-live PWA at `https://khata.dadashaik.com/c`.
Android is the first target; iOS is left configured but deferred (see the bottom).

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

## iOS (deferred)

iOS bundle identifiers are configured (`com.smartdigitalkhata.owner` /
`com.smartdigitalkhata.consumer`), but iOS builds need an Apple Developer account plus
provisioning credentials and are out of scope for now. When ready:
`eas build -p ios --profile owner-production` (and the consumer equivalents), after
`eas credentials` sets up the Apple signing.
