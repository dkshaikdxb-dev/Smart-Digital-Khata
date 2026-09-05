import { useEffect, useState } from 'react';

// Per-device "data saver" flag, persisted in localStorage. When ON, product
// images are not fetched at all (the emoji/placeholder tile is shown instead),
// saving bytes on weak/expensive rural connections. Changing it dispatches a
// window event so every mounted component (e.g. each ProductThumb) re-reads and
// updates live. All storage access is guarded for private-mode browsers.
const KEY = 'skhata_data_saver';
export const DATASAVER_EVENT = 'skhata-datasaver';

export function getDataSaver() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDataSaverValue(on) {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage blocked (private mode) — the toggle just won't persist */
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event(DATASAVER_EVENT));
    } catch {
      /* very old browsers */
    }
  }
}

// SSR-safe: the first render is always `false` on both server and client, so
// hydration never mismatches; the stored value is applied in the mount effect.
export function useDataSaver() {
  const [dataSaver, setState] = useState(false);
  useEffect(() => {
    setState(getDataSaver());
    const on = () => setState(getDataSaver());
    window.addEventListener(DATASAVER_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(DATASAVER_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);

  const setDataSaver = (v) => {
    setState(!!v);
    setDataSaverValue(!!v);
  };

  return { dataSaver, setDataSaver };
}
