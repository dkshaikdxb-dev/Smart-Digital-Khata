import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';

import { establishAccent, refreshAccentForNextStart, DEFAULT_ACCENT } from './src/bootAccent';

// THE BOOT GATE.
//
// This file imports NO screen, NO navigator, NO language provider and NO api
// client, and that is not tidiness — it is the whole mechanism.
//
// The consumer app has 77 references to the accent family. 6 are deliberately
// frozen (colors.positive — money and good-state greens read against red), and
// the platform colour reaches the other 71. Of those, 59 live inside a
// module-level StyleSheet.create, which React Native evaluates when the module
// is imported. A static `import` is hoisted and runs before any code in this
// file, so a tree imported at the top would bake the shipped green before the
// boot gate ever ran, and a colour applied afterwards would repaint the 12
// inline references and leave the other 59 — a half-themed screen, which reads
// as broken in a way that an unthemed one does not.
//
// So the tree is require()d, inside the effect, AFTER establishAccent() has
// written the colour into the theme objects. scripts/mobile-theme-boot.test.mjs
// asserts both halves of that: that this file has no eager import of either
// tree, and that the mutate-then-require order actually produces a themed
// stylesheet.
//
// The server is asked afterwards, and its answer is stored for the NEXT start
// rather than applied now — for the same reason. A festive window is scheduled
// days ahead; one launch of latency is not a cost, and a shopper on 2G waiting
// on a decoration would be.

function BootSplash({ accent }) {
  // The same navy every screen sits on, so the gate is invisible between the
  // splash image and the first screen. It shows the shipped colour for the one
  // frame before the cache is read, and the cached one after.
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={accent} />
    </View>
  );
}

export default function App() {
  const [Root, setRoot] = useState(null);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1–2. Cached colour into both theme objects. Never throws; falls back to
      //      the shipped green.
      const chosen = await establishAccent();
      if (!alive) return;
      setAccent(chosen.accent);

      // 3. Only now. `require` and not `import`, deliberately — see above. The
      //    api client is required here too, so the consumer flavor never loads
      //    the owner's service module and vice versa.
      const flavor = Constants.expoConfig?.extra?.flavor || 'owner';
      /* eslint-disable global-require */
      const mod = flavor === 'consumer'
        ? require('./src/consumer/ConsumerApp')
        : require('./src/OwnerApp');
      const apiMod = flavor === 'consumer'
        ? require('./src/consumer/consumerApi')
        : require('./src/services/api');
      /* eslint-enable global-require */

      // The updater form: React treats a bare function value as a state
      // initializer and would CALL the component instead of storing it.
      setRoot(() => mod.default);

      // 4. Ask the server, store for next launch. Fire and forget by contract:
      //    it resolves to what it did and never rejects, and it does NOT
      //    repaint — the stylesheets above are already baked.
      refreshAccentForNextStart(apiMod.default);
    })();
    return () => { alive = false; };
  }, []);

  if (!Root) return <BootSplash accent={accent} />;
  return <Root />;
}
