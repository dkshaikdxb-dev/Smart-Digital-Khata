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
    ios: {
      supportsTablet: true,
      bundleIdentifier: f.iosBundleIdentifier,
    },
    android: {
      adaptiveIcon: {
        foregroundImage,
        backgroundColor: f.adaptiveIconBackgroundColor,
      },
      package: f.androidPackage,
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
