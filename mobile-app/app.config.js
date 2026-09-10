// Dynamic Expo config. The build flavor is selected by the APP_FLAVOR env var
// (set per profile in eas.json). Two Android apps are produced from this one
// codebase: the Shop Owner native app and the native Consumer app.
const fs = require('fs');
const path = require('path');

const FLAVORS = {
  owner: {
    name: 'Smart Khata — Shop',
    slug: 'smart-khata-owner',
    scheme: 'skhataowner',
    androidPackage: 'com.smartdigitalkhata.owner',
    iosBundleIdentifier: 'com.smartdigitalkhata.owner',
    adaptiveIconBackgroundColor: '#22c55e',
  },
  consumer: {
    name: 'Smart Khata — Customer',
    slug: 'smart-khata-consumer',
    scheme: 'skhataconsumer',
    androidPackage: 'com.smartdigitalkhata.consumer',
    iosBundleIdentifier: 'com.smartdigitalkhata.consumer',
    adaptiveIconBackgroundColor: '#1C7A45',
  },
};

// Return the first asset that actually exists on disk, falling back to shared.
function pickAsset(flavor, kind, shared) {
  const candidate = `./assets/${kind}-${flavor}.png`;
  if (fs.existsSync(path.join(__dirname, candidate))) return candidate;
  return shared;
}

module.exports = ({ config }) => {
  const requested = process.env.APP_FLAVOR || 'owner';
  const flavor = FLAVORS[requested] ? requested : 'owner';
  const f = FLAVORS[flavor];

  const icon = pickAsset(flavor, 'icon', './assets/icon.png');
  const foregroundImage = pickAsset(flavor, 'adaptive-icon', './assets/adaptive-icon.png');

  return {
    ...config,
    // Expo account that owns both projects. Set explicitly so EAS can resolve
    // the account non-interactively in CI (the token may see multiple accounts).
    // Override with EAS_OWNER if the project is ever moved to another account.
    owner: process.env.EAS_OWNER || 'dkshaikdxb',
    name: f.name,
    slug: f.slug,
    scheme: f.scheme,
    version: '1.0.0',
    orientation: 'portrait',
    icon,
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    assetBundlePatterns: ['**/*'],
    // OTA JS-shell updates via EAS Update (expo-updates). `runtimeVersion` gates
    // which builds an update is compatible with; the sdkVersion policy means any
    // build on this Expo SDK accepts these updates (bump the SDK -> new native
    // build required, as expected). The update URL is left to `eas update:configure`
    // (or the EAS_UPDATE_URL / EAS_PROJECT_ID env vars) so NO fake id/URL is
    // committed — owner & consumer are separate EAS projects with their own ids.
    runtimeVersion: { policy: 'sdkVersion' },
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
      url:
        process.env.EAS_UPDATE_URL ||
        (process.env.EAS_PROJECT_ID
          ? `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`
          : undefined),
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: f.iosBundleIdentifier,
      // Honest usage strings for the WebView-bridged web features. Camera/mic for
      // voice + Image Studio; location for the nearby-shops picker; photo library
      // for uploads and saving the share poster.
      infoPlist: {
        NSCameraUsageDescription: 'Used to add shop & product photos.',
        NSMicrophoneUsageDescription: 'Used for voice commands.',
        NSLocationWhenInUseUsageDescription: 'Used to show nearby shops.',
        NSPhotoLibraryUsageDescription: 'Used to upload shop & product photos.',
        NSPhotoLibraryAddUsageDescription: 'Used to save your shop poster & image exports.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage,
        backgroundColor: f.adaptiveIconBackgroundColor,
      },
      package: f.androidPackage,
      // Native permissions the WebView features need: camera + mic (voice, Image
      // Studio), fine/coarse location (location picker), audio settings (voice
      // playback). Storage only for the pre-Android-13 download path (share poster
      // / image export); ignored on API 33+ which uses scoped media access.
      permissions: [
        'CAMERA',
        'RECORD_AUDIO',
        'MODIFY_AUDIO_SETTINGS',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
      ],
    },
    extra: {
      flavor,
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://khata.dadashaik.com',
      consumerUrl: process.env.EXPO_PUBLIC_CONSUMER_URL || 'https://khata.dadashaik.com/c',
      eas: {
        projectId: process.env.EAS_PROJECT_ID || undefined,
      },
    },
  };
};
