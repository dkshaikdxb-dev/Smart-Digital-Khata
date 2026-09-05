import { useLang } from '../lib/i18n';
import { useOfflineSync } from '../lib/useOfflineSync';

// Thin app-wide bar: shows when offline, and a pending-sync count when writes
// are queued. Rendered once in _app.js so it covers owner and customer surfaces.
export default function OfflineBanner() {
  const { t } = useLang();
  const { online, pending } = useOfflineSync();

  if (online && pending === 0) return null;

  let text;
  if (!online) {
    text = pending > 0 ? `${t('off.offline')} — ${t('off.pending', { n: pending })}` : t('off.offline');
  } else {
    text = t('off.pending', { n: pending });
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
        color: online ? '#000' : '#fff',
        background: online ? 'var(--accent)' : 'var(--danger)',
      }}
    >
      {text}
    </div>
  );
}
