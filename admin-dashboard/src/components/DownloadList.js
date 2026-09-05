import { useState } from 'react';
import { useLang } from '../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const isoDay = (d) => d.toISOString().slice(0, 10);
const defFrom = () => isoDay(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
const defTo = () => isoDay(new Date());

// Reusable "Downloads" card: a titled list of token-authenticated CSV exports.
// These endpoints require the Authorization header, so a plain <a href> can't
// carry the bearer token — we fetch the CSV as a blob with the token and trigger
// a client-side download via an object URL. This mirrors EXACTLY the statement
// download buttons already on customers/[id] and c/account (and insights.js).
//
// Props:
//   title, subtitle — heading + optional blurb (already translated strings).
//   tokenKey        — localStorage key for the bearer token ('skhata_token' for
//                     the owner/admin app, CUSTOMER_TOKEN_KEY for the consumer PWA).
//   items           — [{ key, label, filename, path, dated? }]. `path` is a string
//                     or a fn(range) => string; `dated: true` items get the shared
//                     from/to date range appended by their path fn.
export default function DownloadList({ title, subtitle, items = [], tokenKey = 'skhata_token' }) {
  const { t } = useLang();
  const [range, setRange] = useState({ from: defFrom(), to: defTo() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const hasDated = items.some((i) => i.dated);

  async function download(item) {
    setError('');
    if (item.dated && range.from > range.to) { setError(t('dl.rangeError')); return; }
    const path = typeof item.path === 'function' ? item.path(range) : item.path;
    try {
      setBusy(item.key);
      const token = window.localStorage.getItem(tokenKey);
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = item.filename || 'download.csv';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  if (!items.length) return null;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title || t('dl.title')}</h3>
      {subtitle && <p className="muted">{subtitle}</p>}

      {hasDated && (
        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>{t('dl.rangeNote')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="muted">{t('dl.from')}</label>
              <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="muted">{t('dl.to')}</label>
              <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="secondary"
            disabled={busy === item.key}
            onClick={() => download(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
    </div>
  );
}
