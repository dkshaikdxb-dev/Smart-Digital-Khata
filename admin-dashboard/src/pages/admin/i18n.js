import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import {
  LANGS,
  isRtl,
  getAllKeys,
  staticValue,
  getOverrideValue,
  loadOverrides,
} from '../../lib/i18n';

// English is the reference; only the 6 regional languages are editable.
const EDITABLE = LANGS.filter((l) => l.code !== 'en');

export default function AdminI18n() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState('hi');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  // Bumped after every save/revert to re-read the freshly loaded overrides.
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    // Make sure the review UI sees the current live overrides.
    loadOverrides().finally(() => setReady(true));
  }, [router]);

  const keys = useMemo(() => getAllKeys(), []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return keys.filter((key) => {
      if (q) {
        const en = staticValue('en', key).toLowerCase();
        const cur = (getOverrideValue(lang, key) || staticValue(lang, key)).toLowerCase();
        if (!key.toLowerCase().includes(q) && !en.includes(q) && !cur.includes(q)) return false;
      }
      if (onlyMissing) {
        const sv = staticValue(lang, key);
        const missing = !sv || sv === staticValue('en', key);
        if (!missing) return false;
      }
      return true;
    });
    // rev is a dependency so the list re-derives after a save changes overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, lang, search, onlyMissing, rev]);

  if (!ready) return <Shell><div className="card">Loading…</div></Shell>;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← Platform</button>
      <h1>Translations</h1>
      <p className="muted">Correct any UI string per language. Saved corrections go live across the app within about a minute — no code deploy. English is the reference and is not edited.</p>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label className="muted">Language</label>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {EDITABLE.map((l) => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
        </select>
        <input
          placeholder="Search keys or text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Only missing / untranslated
        </label>
        <span className="badge">{rows.length} key{rows.length === 1 ? '' : 's'}</span>
      </div>

      {rows.length === 0 && <div className="card muted">No keys match.</div>}

      {rows.map((key) => (
        <Row key={`${lang}:${key}`} lang={lang} k={key} onChanged={() => setRev((n) => n + 1)} />
      ))}
    </Shell>
  );
}

function Row({ lang, k, onChanged }) {
  const rtl = isRtl(lang);
  const override = getOverrideValue(lang, k);
  const builtin = staticValue(lang, k);
  const [value, setValue] = useState(override || builtin);
  const [state, setState] = useState(''); // '', 'saving', 'saved', 'error'
  const [err, setErr] = useState('');

  const hasOverride = !!override;

  async function patch(val) {
    setState('saving'); setErr('');
    try {
      await apiFetch('/api/admin/i18n', {
        method: 'PATCH',
        body: JSON.stringify({ lang, key: k, value: val }),
      });
      // Re-pull overrides so the change is live app-wide, then refresh the list.
      await loadOverrides();
      setState('saved');
      onChanged();
    } catch (e) {
      setState('error');
      setErr(e.message || 'Save failed');
    }
  }

  async function revert() {
    await patch(''); // empty value deletes the override → reverts to built-in
    setValue(staticValue(lang, k));
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ fontSize: 13 }}>{k}</code>
        {hasOverride && <span className="badge" style={{ background: 'var(--accent)', color: '#000' }}>override</span>}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>EN: {staticValue('en', k)}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={value}
          dir={rtl ? 'rtl' : 'ltr'}
          onChange={(e) => { setValue(e.target.value); if (state) setState(''); }}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button onClick={() => patch(value)} disabled={state === 'saving'}>Save</button>
        <button className="secondary" onClick={revert} disabled={state === 'saving' || !hasOverride}>Revert</button>
        {state === 'saved' && <span style={{ color: 'var(--accent)' }}>✓ Saved</span>}
        {state === 'error' && <span style={{ color: 'var(--danger)' }}>✕ {err}</span>}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
