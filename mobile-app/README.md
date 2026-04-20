# Smart Digital Khata — Mobile App

Expo (React Native) app for shop owners.

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
