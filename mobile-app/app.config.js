// Dynamic Expo config. The build flavor is selected by the APP_FLAVOR env var
// (set per profile in eas.json). Two Android apps are produced from this one
// codebase: the Shop Owner native app and the native Consumer app.
const fs = require('fs');
const path = require('path');

// THE UPDATE URL, AND WHY THIS THROWS.
//
// `updates.url` is what an installed app asks for a new bundle. If it is
// undefined the app never checks, ever — and it fails SILENTLY: the build
// succeeds, the APK installs, every `eas update` publishes green, and not one
// phone is served anything. That is exactly what happened here. Both installed
// builds shipped with no URL and ignored every update while every dashboard
// reported success.
//
// The cause is worth writing down because it is not obvious. EAS evaluates THIS
// FILE on the build worker, not on the machine that runs `eas build`. The
// worker's environment comes from the build profile's `env` block in eas.json
// and from nothing else, so an EAS_PROJECT_ID exported in CI is invisible here.
// The build profiles now carry the id explicitly; this guard makes sure that if
// anyone removes it, the build DIES rather than quietly producing an app that
// can never be updated.
//
// It throws only during a real EAS build. A local `expo start` has no project
// id and does not need one, because updates are irrelevant there.
function resolveUpdatesUrl() {
  const id = process.env.EAS_PROJECT_ID;
  const url = process.env.EAS_UPDATE_URL || (id ? `https://u.expo.dev/${id}` : undefined);
  if (!url && process.env.EAS_BUILD === 'true') {
    throw new Error(
      'No updates URL: EAS_PROJECT_ID is not set on the BUILD WORKER. It must live in the ' +
      "build profile's `env` block in eas.json — a value exported in CI does not reach this " +
      'file. Building without it produces an app that can never receive an update.'
    );
  }
  return url;
}

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
    // Native config plugins. expo-speech-recognition wires the OS-native ASR
    // engines (iOS SFSpeechRecognizer + Android SpeechRecognizer): it injects the
    // iOS NSMicrophoneUsageDescription + NSSpeechRecognitionUsageDescription usage
    // strings and, on Android, the RECORD_AUDIO permission plus <queries> package
    // visibility for the Google speech service. Adding this module needs ONE EAS
    // rebuild of both flavors (no Expo Go); voice-UX JS changes ship OTA after.
    plugins: [
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Used for voice search and commands.',
          speechRecognitionPermission: 'Used to search and run commands by voice.',
          androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
        },
      ],
    ],
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
      url: resolveUpdatesUrl(),
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: f.iosBundleIdentifier,
      // Honest usage strings for the WebView-bridged web features. Camera/mic for
      // voice + Image Studio; location for the nearby-shops picker; photo library
      // for uploads and saving the share poster.
      infoPlist: {
        NSCameraUsageDescription: 'Used to add shop & product photos.',
        // Mic + speech-recognition strings for OS-native voice (consumer search +
        // owner Ask). The expo-speech-recognition config plugin also injects these
        // two keys from its microphonePermission / speechRecognitionPermission
        // options; they are declared here as well so the built Info.plist always
        // carries both, whatever the plugin ordering.
        NSMicrophoneUsageDescription: 'Used for voice search and commands.',
        NSSpeechRecognitionUsageDescription: 'Used to search and run commands by voice.',
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
