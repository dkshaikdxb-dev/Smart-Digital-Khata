import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, sizes } from '../theme';
import { Button } from '../components';
import { useT } from '../i18n';

// Opens the Razorpay hosted Payment Link returned by POST /my/pay (and the
// prepaid-order pay_link). When the checkout redirects back to the server's
// callback URL (/api/payments/orders/:id/return), the payment is done — we pop
// back so the khata/order screen refreshes on focus. A manual Done button is the
// fallback if the user finishes or abandons without an auto-detected redirect.
function isReturnUrl(url) {
  if (!url) return false;
  // The callback_url the backend sets ends in /return; also treat common
  // Razorpay terminal states as completion so we never trap the user.
  return /\/return(\b|\/|\?|$)/.test(url) || /payment_(link_)?(status|id)=/.test(url);
}

export default function PayWebView({ route, navigation }) {
  const { t } = useT();
  const { url } = route.params;
  const [loading, setLoading] = useState(true);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <Text style={styles.barText} numberOfLines={1}>🔒 {t('pay.secure')}</Text>
        <Button title={t('pay.done')} variant="secondary" onPress={finish} style={styles.doneBtn} />
      </View>
      <WebView
        source={{ uri: url }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav) => {
          if (isReturnUrl(nav.url)) finish();
        }}
        onShouldStartLoadWithRequest={(req) => {
          if (isReturnUrl(req.url)) { finish(); return false; }
          // Razorpay checkout can emit UPI / app deep links (upi://, tez://,
          // phonepe://, intent://) the WebView can't load. Hand any non-http(s)
          // scheme to the OS so the UPI app opens, and don't load it here.
          const scheme = String(req.url || '').split(':')[0].toLowerCase();
          if (scheme && scheme !== 'http' && scheme !== 'https') {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          return true;
        }}
        style={styles.web}
      />
      {loading ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sizes.pad,
    paddingVertical: 10,
    backgroundColor: colors.card,
    gap: 12,
  },
  barText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  doneBtn: { paddingHorizontal: 20, minHeight: 40 },
  web: { flex: 1, backgroundColor: '#ffffff' },
  overlay: {
    position: 'absolute',
    left: 0, right: 0, top: 56, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
