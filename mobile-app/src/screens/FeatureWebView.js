import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { WebView } from 'react-native-webview';

const BG = '#0f172a';

// The ONLY WebView resources we grant on an Android onPermissionRequest: camera
// (VIDEO_CAPTURE) and microphone (AUDIO_CAPTURE), for the voice / Image Studio
// features. Any other requested resource is denied.
const GRANTED_WEBVIEW_RESOURCES = new Set([
  'android.webkit.resource.VIDEO_CAPTURE',
  'android.webkit.resource.AUDIO_CAPTURE',
]);

const APP_URL =
  Constants.expoConfig?.extra?.apiUrl || 'https://khata.dadashaik.com';
const CONSUMER_URL =
  Constants.expoConfig?.extra?.consumerUrl || 'https://khata.dadashaik.com/c';
const FLAVOR = Constants.expoConfig?.extra?.flavor || 'owner';

// Which SecureStore key holds this flavor's JWT, and which localStorage keys the
// web app reads it back from. Owner web (lib/api.js) reads `skhata_token` +
// `skhata_role`; consumer web (lib/customerApi.js) reads `ckhata_token`. The two
// flavors deliberately use different keys so a device that somehow has both never
// crosses tokens.
const AUTH = {
  owner: { secureKey: 'skhata_token', webToken: 'skhata_token', webRole: 'skhata_role', role: 'owner' },
  consumer: { secureKey: 'skhata_consumer_token', webToken: 'ckhata_token', webRole: null, role: null },
};

// Restrict in-WebView navigation to the target origin (scheme + host), any path.
function originWhitelistFor(url) {
  try {
    const u = new URL(url);
    return [`${u.protocol}//${u.host}`, 'about:*'];
  } catch (e) {
    return ['*'];
  }
}

// The host we consider "internal" — links to any other host open in the system
// browser instead of hijacking the in-app WebView.
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return null;
  }
}

// Bare hostname (no port) of a configured base URL, for the payment/redirect
// allowlist below. Returns null when the URL cannot be parsed.
function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// Hosts that must keep loading INSIDE the WebView rather than being ejected to
// the system browser: a payment/checkout or OAuth return that lands on one of
// these mid-flow would otherwise dead-end (the gateway can't post back into a
// browser tab the WebView never opened). Kept deliberately small and specific:
//  - Razorpay checkout + API + short-link domains (the payment gateway in use).
//  - The app's own API + consumer web hosts (derived from the configured base
//    URLs), so a same-app redirect chain (e.g. /pay → API → /c return) stays in.
// Everything NOT on this list and NOT the initial target host still goes out to
// the system browser. Matched by hostname suffix, so `*.razorpay.com` is covered.
const PAYMENT_HOSTS = [
  'razorpay.com',
  'rzp.io',
  'checkout.razorpay.com',
  'api.razorpay.com',
  hostnameOf(APP_URL),
  hostnameOf(CONSUMER_URL),
].filter(Boolean);

// True when `host` equals an allowlisted host or is a sub-domain of one
// (host === h || host.endsWith('.' + h)). Case-insensitive; strips any port.
function isAllowlistedHost(host) {
  if (!host) return false;
  const h = String(host).split(':')[0].toLowerCase();
  return PAYMENT_HOSTS.some((allowed) => {
    const a = String(allowed).toLowerCase();
    return h === a || h.endsWith('.' + a);
  });
}

// Heuristic: a URL that points straight at a downloadable asset (e.g. the share
// poster PNG / an image export). Used on Android, where RN-WebView does not fire
// onFileDownload for such links — we hand them to the system so DownloadManager /
// the browser can save them instead of the request dead-ending in the WebView.
// NOTE: this only catches server-served file URLs; client-generated blob:/data:
// downloads are handled separately (see onFileDownload + the report's caveats).
function looksLikeDownload(url) {
  return /\.(png|jpe?g|gif|webp|pdf|csv|xlsx?|zip)(\?|$)/i.test(url || '') ||
    /[?&]download(=|&|$)/i.test(url || '');
}

// Build the injected bootstrap that signs the web app in as the same user by
// seeding localStorage BEFORE any page script runs. Token is JSON-encoded so it
// can never break out of the string. Returns a no-op (that still yields `true`
// for iOS) when there is no token — we never inject an empty/blank session.
function buildInjectedJS(token) {
  const cfg = AUTH[FLAVOR] || AUTH.owner;
  if (!token) return 'true;';
  const sets = [`window.localStorage.setItem(${JSON.stringify(cfg.webToken)}, ${JSON.stringify(token)});`];
  if (cfg.webRole && cfg.role) {
    sets.push(`window.localStorage.setItem(${JSON.stringify(cfg.webRole)}, ${JSON.stringify(cfg.role)});`);
  }
  return `(function(){try{${sets.join('')}}catch(e){}})(); true;`;
}

// A reusable, capability-complete WebView that loads a route of the live web app
// with the native user's session bridged in. Usable either as a navigation
// screen (params: { path, base, title }) or directly with the same props.
export default function FeatureWebView(props) {
  const params = (props.route && props.route.params) || {};
  const path = props.path != null ? props.path : (params.path || '');
  const base = props.base || params.base || APP_URL;
  const uri = `${String(base).replace(/\/+$/, '')}${path}`;

  const webRef = useRef(null);
  const canGoBackRef = useRef(false);
  const [ready, setReady] = useState(false); // token read complete
  const [injectedJS, setInjectedJS] = useState('true;');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Read the flavor's token from SecureStore, then build the bootstrap script.
  // We only render the WebView once this resolves so the token is present for
  // the very first content load (injectedJavaScriptBeforeContentLoaded).
  useEffect(() => {
    let alive = true;
    const cfg = AUTH[FLAVOR] || AUTH.owner;
    (async () => {
      let token = null;
      try {
        token = await SecureStore.getItemAsync(cfg.secureKey);
      } catch (e) {
        token = null;
      }
      if (!alive) return;
      setInjectedJS(buildInjectedJS(token));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  // Android hardware back: step back through web history when possible, else let
  // the OS pop the screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onBack = () => {
      if (canGoBackRef.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  const retry = useCallback(() => {
    setError(false);
    setLoading(true);
    setReady(false);
    setReloadKey((k) => k + 1);
  }, []);

  // Grant ONLY camera + microphone — the resources the voice / Image Studio
  // features legitimately need — and deny everything else the page might ask for
  // (e.g. MIDI, protected media, clipboard). Android only; guarded so a WebView
  // build without this event never crashes.
  const onPermissionRequest = useCallback((event) => {
    try {
      const e = event && event.nativeEvent ? event.nativeEvent : event;
      if (!e || typeof e.grant !== 'function') return;
      const requested = Array.isArray(e.resources) ? e.resources : [];
      const allowed = requested.filter((r) => GRANTED_WEBVIEW_RESOURCES.has(r));
      if (allowed.length > 0) {
        e.grant(allowed);
      } else if (typeof e.deny === 'function') {
        e.deny();
      }
    } catch (err) { /* ignore — fall back to the platform prompt */ }
  }, []);

  // iOS download hook: open the download URL in the system so Safari/Files can
  // save it (the WebView itself cannot present a save sheet).
  const onFileDownload = useCallback((event) => {
    try {
      const url = event && event.nativeEvent && event.nativeEvent.downloadUrl;
      if (url) Linking.openURL(url).catch(() => {});
    } catch (err) { /* ignore */ }
  }, []);

  const targetHost = hostOf(uri);

  // Keep in-origin navigation inside the WebView; push external links and
  // (on Android) downloadable asset URLs out to the system browser/downloader.
  const onShouldStartLoadWithRequest = useCallback((req) => {
    const url = req && req.url;
    if (!url || !/^https?:\/\//i.test(url)) return true; // about:, data:, blob:, etc.
    const h = hostOf(url);
    // A different-host URL normally opens in the system browser — EXCEPT known
    // payment/redirect hosts, which must stay in the WebView so an in-app
    // checkout / OAuth return can complete instead of dead-ending.
    if (targetHost && h && h !== targetHost && !isAllowlistedHost(h)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    if (Platform.OS === 'android' && looksLikeDownload(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return true;
  }, [targetHost]);

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Can't reach Smart Khata</Text>
          <Text style={styles.errorText}>
            Check your internet connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : ready ? (
        <WebView
          key={reloadKey}
          ref={webRef}
          source={{ uri }}
          originWhitelist={originWhitelistFor(uri)}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          // Camera + mic for voice / Image Studio; play without a user gesture.
          onPermissionRequest={onPermissionRequest}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          // Location picker.
          geolocationEnabled
          // File uploads (<input type=file>). Local file:// pages are NOT loaded
          // here (content is the remote web app), so the cross-origin file-URL
          // access flags (allowFileAccessFromFileURLs /
          // allowUniversalAccessFromFileURLs) are deliberately left OFF — they
          // would let any loaded file read other local files with no upside.
          allowFileAccess
          domStorageEnabled
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically
          // Downloads.
          onFileDownload={onFileDownload}
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={(navState) => {
            canGoBackRef.current = navState.canGoBack;
          }}
          style={styles.webview}
        />
      ) : null}
      {loading && !error ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  webview: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: BG,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  errorTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: { color: '#052e16', fontSize: 16, fontWeight: '600' },
});
