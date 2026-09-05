import { useEffect, useRef, useState } from 'react';
import { apiPost } from './api';
import { countOutbox, flushOutbox, OUTBOX_EVENT } from './outbox';

// Tracks connectivity + the offline outbox and drains the queue when back
// online. Exposes { online, pending } for the offline banner / sync badge.
// Guards against overlapping flushes so a burst of events can't double-send.
export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const refreshCount = () => { countOutbox().then(setPending).catch(() => {}); };

    const flush = () => {
      if (flushing.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushing.current = true;
      flushOutbox(apiPost)
        .catch(() => {})
        .finally(() => { flushing.current = false; refreshCount(); });
    };

    setOnline(navigator.onLine !== false);
    refreshCount();
    if (navigator.onLine !== false) flush();

    const onOnline = () => { setOnline(true); flush(); };
    const onOffline = () => { setOnline(false); };
    const onOutbox = () => { refreshCount(); flush(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OUTBOX_EVENT, onOutbox);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OUTBOX_EVENT, onOutbox);
    };
  }, []);

  return { online, pending };
}
