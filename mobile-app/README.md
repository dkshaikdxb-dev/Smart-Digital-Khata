# Smart Digital Khata — Mobile App

Expo (React Native) app for shop owners. Native owner app at Phase-2 parity with
the web owner dashboard.

## Screens & navigation

After login the app shows a **bottom-tab navigator** (owner role only — an
`admin` login gets a short "use the web admin console" notice). Each tab wraps
its own native-stack for detail screens:

- **Home** — Dashboard (today + outstanding KPIs, quick actions) → Add transaction
- **Orders** — order list with status filter → Order detail (items, totals,
  address/note, status-advance + cancel buttons)
- **Catalog** — product list; add product, per-item active toggle and delete
- **Customers** — customer list/search → Customer detail (balance, credit limit,
  transactions, record payment/purchase) → Add transaction
- **More** — a menu → Families → Family detail (combined outstanding, members
  with add-picker/remove, combined statement, WhatsApp reminder); Insights
  (analytics overview with 7/30/90-day selector + aging breakdown); Settings
  (shop basics, per-shop Razorpay payments with test connection, discovery
  listing, and logout)

Money is integer paise everywhere; the auth token lives in Expo SecureStore
(`skhata_token`). The API base URL comes from `app.json` → `expo.extra.apiUrl`.

## Follow-ups (not done here)

- **Expo SDK 51 → current bump before store submission.** This branch
  deliberately stays on Expo SDK 51 / React Native 0.74; an SDK upgrade can't be
  device-tested in this environment and should be a separate, verified change.
- **On-device / EAS verification still required.** The JS bundle builds cleanly
  (`expo export`), but native gestures, the bottom-tab bar, keyboard behavior,
  and iOS-only `Alert.prompt` (used for inline catalog price edits) have not been
  run on a device or emulator.
- **CSV report export is not implemented on native.** Use the web dashboard for
  CSV downloads; the Insights screen links to it in a footnote.

## Quick start

```bash
npm install
npx expo start
```

Scan the QR with Expo Go (Android/iOS) while your phone is on the same Wi-Fi as your computer.

## Point the app at your backend

The app reads the API URL from `app.json` → `expo.extra.apiUrl`.

- For local dev on an **Android emulator**, `http://10.0.2.2:4000` is correct.
- For a **real phone** on the same Wi-Fi, replace it with your computer's LAN IP, e.g. `http://192.168.1.20:4000`.
- For **production**, replace it with your domain: `https://api.yourdomain.com`.

## Production build (APK / AAB / iOS)

Install the EAS CLI and log in once:

```bash
npm install -g eas-cli
eas login
```

Then:

```bash
# Android (APK for sideloading)
npx eas build -p android --profile preview

# Android (AAB for Play Store)
npx eas build -p android --profile production

# iOS (requires an Apple Developer account)
npx eas build -p ios --profile production
```

EAS builds in the cloud and gives you a download link when done — no Mac required for Android.

Simple legacy command (if you don't want EAS):

```bash
npx expo build
```
