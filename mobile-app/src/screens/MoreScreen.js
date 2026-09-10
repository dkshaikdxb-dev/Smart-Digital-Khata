import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

// Native screens.
const ITEMS = [
  { route: 'Families', title: 'Families', subtitle: 'Group customers, shared credit & reminders' },
  { route: 'Insights', title: 'Insights', subtitle: 'Analytics overview & aging' },
  { route: 'Settings', title: 'Settings', subtitle: 'Shop, payments & discovery' },
];

// Web features rendered through the auth-bridged FeatureWebView. Each targets a
// live web route (confirmed against admin-dashboard/src/pages) so new web deploys
// show up here with no app rebuild. `path` is appended to the API base.
const WEB_ITEMS = [
  { key: 'credits', path: '/account', title: 'Khata Credits & Referral', subtitle: 'Earn & spend credits, invite shops' },
  { key: 'promote', path: '/promote', title: 'Boost & Branded Store', subtitle: 'Promote your shop, premium storefront' },
  { key: 'delivery', path: '/delivery', title: 'Delivery Champions', subtitle: 'Assign deliveries & share status links' },
  { key: 'poster', path: '/dashboard', title: 'Share Poster', subtitle: 'Shareable shop poster for WhatsApp/IG/FB' },
];

export default function MoreScreen({ navigation }) {
  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      {ITEMS.map((it) => (
        <Pressable key={it.route} style={s.row} onPress={() => navigation.navigate(it.route)}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{it.title}</Text>
            <Text style={s.muted}>{it.subtitle}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      ))}

      <Text style={s.section}>More features</Text>
      {WEB_ITEMS.map((it) => (
        <Pressable
          key={it.key}
          style={s.row}
          onPress={() => navigation.navigate('FeatureWebView', { path: it.path, title: it.title })}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{it.title}</Text>
            <Text style={s.muted}>{it.subtitle}</Text>
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
