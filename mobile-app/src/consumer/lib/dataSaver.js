import { useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

// Per-device "Data saver" flag for the consumer app, persisted in
// expo-secure-store (same store the language choice uses). When ON, screens
// skip optional image weight — e.g. the storefront carousel shows only the
// first photo and never fetches the rest — which matters on metered / weak
// rural connections. Default OFF.
//
// A module-level cache + subscriber list means every mounted useDataSaver()
// re-renders when the flag changes from anywhere (the Account toggle), and the
// stored value is read from disk only once per app session. Nothing here ever
// throws: storage failures fall back to the in-memory value.

const KEY = 'skhata_consumer_datasaver';

let cached = false;
let loaded = false;
let loading = null;
const subscribers = new Set();

function notify() {
  subscribers.forEach((fn) => {
    try { fn(cached); } catch (e) { /* a subscriber must never break the others */ }
  });
}

// Reads the persisted value once; later calls return the same promise.
function loadStored() {
  if (loaded) return Promise.resolve(cached);
  if (loading) return loading;
  loading = (async () => {
    try {
      const v = await SecureStore.getItemAsync(KEY);
      // Only adopt the stored value if nothing changed it while we were reading.
      if (!loaded) cached = v === '1';
    } catch (e) { /* keep the default */ }
    loaded = true;
    loading = null;
    notify();
    return cached;
  })();
  return loading;
}

// Synchronous: the cached value (false until the first read completes).
export function getDataSaver() {
  return cached;
}

// Updates the cache and every subscriber immediately, then AWAITS the write so
// the choice is durably flushed before the caller moves on (a fire-and-forget
// write can be lost if the app is closed right after toggling).
export async function setDataSaver(on) {
  cached = !!on;
  loaded = true;
  notify();
  try {
    await SecureStore.setItemAsync(KEY, cached ? '1' : '0');
  } catch (e) { /* storage unavailable — the toggle just won't persist */ }
}

export function subscribeDataSaver(fn) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

// Hook: { dataSaver, setDataSaver }. Loads the stored value on first use and
// re-renders whenever the flag changes anywhere in the app.
export function useDataSaver() {
  const [dataSaver, setState] = useState(cached);

  useEffect(() => {
    const unsubscribe = subscribeDataSaver((v) => setState(v));
    loadStored();
    // The cache may have changed between the initial render and subscribing.
    setState(cached);
    return unsubscribe;
  }, []);

  const set = useCallback((v) => setDataSaver(v), []);

  return { dataSaver, setDataSaver: set };
}
