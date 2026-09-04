import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

const ITEMS = [
  { route: 'Families', title: 'Families', subtitle: 'Group customers, shared credit & reminders' },
  { route: 'Insights', title: 'Insights', subtitle: 'Analytics overview & aging' },
  { route: 'Settings', title: 'Settings', subtitle: 'Shop, payments & discovery' },
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  row: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  title: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  chevron: { color: '#64748b', fontSize: 28, marginLeft: 8 },
});
