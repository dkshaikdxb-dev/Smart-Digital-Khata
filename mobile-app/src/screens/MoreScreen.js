import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useT } from '../i18n';
import { getRole } from '../services/api';

// Native screens. Titles/subtitles are i18n keys resolved at render time.
const ITEMS = [
  { route: 'Families', titleKey: 'title.families', subKey: 'more.familiesSub' },
  { route: 'Insights', titleKey: 'title.insights', subKey: 'more.insightsSub' },
  { route: 'Settings', titleKey: 'title.settings', subKey: 'more.settingsSub' },
];

// Web features rendered through the auth-bridged FeatureWebView. Each targets a
// live web route (confirmed against admin-dashboard/src/pages) so new web deploys
// show up here with no app rebuild. `path` is appended to the API base.
const WEB_ITEMS = [
  { key: 'credits', path: '/account', titleKey: 'more.credits', subKey: 'more.creditsSub' },
  { key: 'promote', path: '/promote', titleKey: 'more.promote', subKey: 'more.promoteSub' },
  { key: 'delivery', path: '/delivery', titleKey: 'more.delivery', subKey: 'more.deliverySub' },
  { key: 'poster', path: '/dashboard', titleKey: 'more.poster', subKey: 'more.posterSub' },
  // Three whole feature areas the web console has always had and the app could
  // not reach at all: an owner had to leave the app and find the site in a
  // browser to add a staff member, look at a supplier, or read the transaction
  // ledger. They go through the same auth-bridged FeatureWebView as the four
  // above, so there is no new native surface to maintain.
  //
  // No subKey: the one-line descriptions the other rows carry would have to be
  // newly written English, and would then read as English to the nine other
  // languages. The titles below are instead the strings the WEB console already
  // shows for these same pages, human-translated and already reviewed, so a
  // shopkeeper sees the same word in the app and on the site.
  // Owner-only. The web page redirects a non-owner away, and the API refuses
  // the calls regardless, so offering the row to a staff member would only send
  // them somewhere they bounce straight out of.
  { key: 'staff', path: '/staff', titleKey: 'more.staff', ownerOnly: true },
  { key: 'suppliers', path: '/suppliers', titleKey: 'more.suppliers' },
  { key: 'transactions', path: '/transactions', titleKey: 'more.transactions' },
];

export default function MoreScreen({ navigation }) {
  const { t } = useT();
  // The signed-in role, read once. Until it resolves nothing owner-only is
  // shown: a staff member must never see the row flash in and disappear, and an
  // owner waits one tick for a menu they were already opening.
  const [role, setRole] = useState(null);
  useEffect(() => {
    let alive = true;
    getRole().then((r) => { if (alive) setRole(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const webItems = WEB_ITEMS.filter((it) => !it.ownerOnly || role === 'owner');
  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      {ITEMS.map((it) => (
        <Pressable key={it.route} style={s.row} onPress={() => navigation.navigate(it.route)}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t(it.titleKey)}</Text>
            <Text style={s.muted}>{t(it.subKey)}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      ))}

      <Text style={s.section}>{t('more.moreFeatures')}</Text>
      {webItems.map((it) => (
        <Pressable
          key={it.key}
          style={s.row}
          onPress={() => navigation.navigate('FeatureWebView', { path: it.path, title: t(it.titleKey) })}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t(it.titleKey)}</Text>
            {it.subKey ? <Text style={s.muted}>{t(it.subKey)}</Text> : null}
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  row: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  section: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 10 },
  title: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  chevron: { color: '#64748b', fontSize: 28, marginLeft: 8 },
});
