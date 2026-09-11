import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { usePermissions } from '../../lib/adminPerms';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Campaigns desk (batch ADS3) — the marketing role's geo-targeted promo manager.
// Guarded by admin + ads:view; create/edit/pause/delete are hidden without
// ads:manage. A create/edit builder (left) with a live consumer-slide preview
// (right), plus a "Running campaigns" matrix table below. English-first admin
// chrome — no consumer i18n keys are touched here; the consumer slider that
// actually renders these campaigns is a later batch.

// The four promo styles (A offer, B product, C featured shop, D festival). The
// Default/Seasonal tag is a UI hint only — the real seasonal window is the
// is_seasonal flag + dates in the schedule section.
const STYLES = [
  { value: 'offer', letter: 'A', label: 'Offer', tag: 'Default', glyph: '🏷️' },
  { value: 'product', letter: 'B', label: 'Product', tag: 'Seasonal', glyph: '📦' },
  { value: 'shop', letter: 'C', label: 'Featured shop', tag: 'Default', glyph: '🏪' },
  { value: 'festival', letter: 'D', label: 'Festival', tag: 'Seasonal', glyph: '🎉' },
];
const STYLE_BY_VALUE = Object.fromEntries(STYLES.map((s) => [s.value, s]));

// Local accent per style for the self-contained preview (does NOT use the
// consumer app tokens — a small standalone swatch so the marketer sees the gist).
const STYLE_THEME = {
  offer: { from: '#fde68a', to: '#f59e0b', ink: '#7c2d12' },
  product: { from: '#bae6fd', to: '#0ea5e9', ink: '#0c4a6e' },
  shop: { from: '#bbf7d0', to: '#22c55e', ink: '#14532d' },
  festival: { from: '#fbcfe8', to: '#db2777', ink: '#831843' },
};

// Languages a marketer may override the base creative for (base = default /
// fallback). Kept local so this admin page never imports the consumer c.* dict.
const OVERRIDE_LANGS = [
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'ur', name: 'اردو' },
  { code: 'en', name: 'English' },
];

const LINK_TYPES = ['none', 'shop', 'product', 'brand', 'url'];
const STATUSES = ['draft', 'active', 'paused'];

const EMPTY = {
  id: null,
  style: 'offer',
  title: '',
  offer_text: '',
  subtitle: '',
  glyph: '',
  image_url: '',
  advertiser: '',
  link_type: 'none',
  link_shop_id: '',
  link_product_id: '',
  link_url: '',
  is_seasonal: false,
  starts_at: '',
  ends_at: '',
  priority: 0,
  status: 'draft',
  i18n: {},
  // targeting (assembled into targets[] on save)
  everywhere: false,
  towns: [],
  villages: [],
  pincodes: [],
};

const cell = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid #334155' };

// A TIMESTAMPTZ from the API → the YYYY-MM-DD a <input type="date"> wants.
function toDateInput(iso) {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return ''; }
}
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch (e) { return iso; }
}

// Click-through rate as a 1-dp percentage label; "—" when there are no
// impressions. Computed client-side from the fields the list already returns.
function ctrLabel(impressions, clicks) {
  const i = Number(impressions) || 0;
  const c = Number(clicks) || 0;
  if (i === 0) return '—';
  return `${(Math.round((c / i) * 1000) / 10).toFixed(1)}%`;
}

// Derive the display state pill: pending review; rejected; paused; scheduled
// (active but not started yet); ended (active but past ends_at); live; or the raw
// draft. The two review states (pending_review/rejected) belong to shop self-serve
// promos and must render as themselves, never fall through to the "Live" default.
function derivedState(c) {
  const now = Date.now();
  if (c.status === 'pending_review') return { label: 'Pending review', bg: '#78350f', fg: '#fde68a' };
  if (c.status === 'rejected') return { label: 'Rejected', bg: '#7f1d1d', fg: '#fecaca' };
  if (c.status === 'paused') return { label: 'Paused', bg: '#7f1d1d', fg: '#fecaca' };
  if (c.status === 'draft') return { label: 'Draft', bg: '#334155', fg: '#cbd5e1' };
  // active
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: 'Scheduled', bg: '#78350f', fg: '#fde68a' };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: 'Ended', bg: '#334155', fg: '#cbd5e1' };
  return { label: 'Live', bg: '#14532d', fg: '#bbf7d0' };
}

// Split a campaign's targets[] back into the builder's per-kind lists.
function targetsToForm(targets) {
  const out = { everywhere: false, towns: [], villages: [], pincodes: [] };
  for (const t of targets || []) {
    if (t.geo_type === 'all') { out.everywhere = true; continue; }
    if (t.geo_type === 'town') out.towns.push(t.geo_value);
    else if (t.geo_type === 'village') out.villages.push(t.geo_value);
    else if (t.geo_type === 'pincode') out.pincodes.push(t.geo_value);
  }
  return out;
}

// Assemble the builder's targeting state into the API's targets[]. Everywhere
// wins — it collapses to a single {geo_type:'all'} row.
function formToTargets(f) {
  if (f.everywhere) return [{ geo_type: 'all' }];
  const out = [];
  for (const v of f.towns) out.push({ geo_type: 'town', geo_value: v });
  for (const v of f.villages) out.push({ geo_type: 'village', geo_value: v });
  for (const v of f.pincodes) out.push({ geo_type: 'pincode', geo_value: v });
  return out;
}

export default function AdminAds() {
  const router = useRouter();
  const { ready, has } = usePermissions();
  const canView = has('ads:view');
  const canManage = has('ads:manage');

  const [items, setItems] = useState([]);
  const [pending, setPending] = useState([]); // self-serve shop promos awaiting moderation
  const [modBusy, setModBusy] = useState(null); // id currently being approved/rejected
  const [geo, setGeo] = useState({ towns: [], villages: [], pincodes: [] });
  const [shops, setShops] = useState(null); // null = picker unavailable (no shops:view), else [] list
  const [filters, setFilters] = useState({ status: '', style: '', geo: '' });
  const [form, setForm] = useState(EMPTY);
  const [overrideLang, setOverrideLang] = useState('hi');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);

  const setF = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.style) qs.set('style', filters.style);
      if (filters.geo) qs.set('geo', filters.geo);
      const list = await apiFetch(`/api/admin/ads${qs.toString() ? `?${qs}` : ''}`);
      setItems(list.items || []);
    } catch (e) { setError(e.message); }
  }, [filters]);

  // One-time context load: geo-options for the target pickers, and a best-effort
  // shop list for the shop link picker. A marketing-only admin lacks shops:view,
  // so /api/admin/shops 403s — we fall back to a plain shop-id input then.
  const loadContext = useCallback(async () => {
    try {
      const g = await apiFetch('/api/admin/ads/geo-options');
      setGeo({ towns: g.towns || [], villages: g.villages || [], pincodes: g.pincodes || [] });
    } catch (e) { /* geo pickers just show free-type inputs */ }
    try {
      const s = await apiFetch('/api/admin/shops');
      setShops(s.items || []);
    } catch (e) { setShops(null); }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    loadContext();
  }, [loadContext, router]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // Shop self-serve promo moderation queue (batch PROMO-BUY). Only a manager may
  // see/act on it (ads:manage), so it stays empty for a view-only marketing admin.
  const loadPending = useCallback(async () => {
    if (!canManage) return;
    try {
      const r = await apiFetch('/api/admin/promos/pending');
      setPending(r.items || []);
    } catch (e) { /* non-fatal — the queue just stays empty */ }
  }, [canManage]);

  useEffect(() => { if (canManage) loadPending(); }, [canManage, loadPending]);

  // Approve → the promo goes active and starts serving. Reject → it is declined
  // and the shop's Khata Credits are refunded (idempotently, server-side).
  async function moderate(id, action, note, isFree) {
    if (!canManage || modBusy) return;
    setModBusy(id); setError(''); setMsg('');
    try {
      // review_note is the canonical field; it is captured on both approve and
      // reject and shown back to the owner on their placement.
      const body = note ? { review_note: note } : {};
      await apiFetch(`/api/admin/promos/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      const rejectMsg = isFree ? 'Promo rejected.' : 'Promo rejected — credits refunded.';
      setMsg(action === 'approve' ? 'Promo approved — now live.' : rejectMsg);
      await Promise.all([loadPending(), load()]);
    } catch (e) { setError(e.message); }
    finally { setModBusy(null); }
  }

  function resetForm() {
    setForm(EMPTY);
    setError(''); setMsg('');
  }

  // Load a campaign into the builder for editing.
  function startEdit(c) {
    if (!canManage) return;
    setForm({
      id: c.id,
      style: c.style,
      title: c.title || '',
      offer_text: c.offer_text || '',
      subtitle: c.subtitle || '',
      glyph: c.glyph || '',
      image_url: c.image_url || '',
      advertiser: c.advertiser || '',
      link_type: c.link_type || 'none',
      link_shop_id: c.link_shop_id || '',
      link_product_id: c.link_product_id || '',
      link_url: c.link_url || '',
      is_seasonal: !!c.is_seasonal,
      starts_at: toDateInput(c.starts_at),
      ends_at: toDateInput(c.ends_at),
      priority: c.priority || 0,
      status: c.status || 'draft',
      i18n: c.i18n && typeof c.i18n === 'object' ? c.i18n : {},
      ...targetsToForm(c.targets),
    });
    setError(''); setMsg('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Build the request body from the form. link_* are nulled unless the type uses
  // them (the API validates uuid/existence). Empty date/text → null.
  function buildPayload() {
    const lt = form.link_type;
    return {
      style: form.style,
      title: form.title.trim(),
      offer_text: form.offer_text || null,
      subtitle: form.subtitle || null,
      glyph: form.glyph || null,
      image_url: form.image_url || null,
      advertiser: form.advertiser || null,
      i18n: pruneI18n(form.i18n),
      link_type: lt,
      link_shop_id: lt === 'shop' ? (form.link_shop_id.trim() || null) : null,
      link_product_id: lt === 'product' ? (form.link_product_id.trim() || null) : null,
      link_url: (lt === 'brand' || lt === 'url') ? (form.link_url || null) : null,
      is_seasonal: !!form.is_seasonal,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      priority: Number(form.priority) || 0,
      status: form.status,
      targets: formToTargets(form),
    };
  }

  async function save(e) {
    e.preventDefault();
    setError(''); setMsg('');
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setBusy(true);
    try {
      const payload = buildPayload();
      if (form.id) {
        await apiFetch(`/api/admin/ads/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Campaign updated.');
      } else {
        await apiFetch('/api/admin/ads', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Campaign created.');
      }
      resetForm();
      await load();
    } catch (e2) {
      // The API returns { error, details? } — surface both (link/shop validation).
      const details = e2.body && Array.isArray(e2.body.details) ? ` — ${e2.body.details.join('; ')}` : '';
      setError(`${e2.message}${details}`);
    } finally { setBusy(false); }
  }

  async function toggleStatus(c) {
    if (!canManage) return;
    setError(''); setMsg('');
    const next = c.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/api/admin/ads/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function remove(c) {
    if (!canManage) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete campaign "${c.title}"? This cannot be undone.`)) return;
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/ads/${c.id}`, { method: 'DELETE' });
      if (form.id === c.id) resetForm();
      await load();
    } catch (e) { setError(e.message); }
  }

  // Download the campaigns CSV. Mirrors the authed-download pattern used by
  // DownloadList / the statement buttons: the endpoint needs the Authorization
  // header, so a plain <a href> can't carry the bearer token — we fetch the CSV
  // as a blob with the token and trigger a client-side download. No token in a URL.
  async function downloadCsv() {
    setError('');
    try {
      setDlBusy(true);
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('skhata_token') : null;
      const res = await fetch(`${API}/api/admin/ads/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'campaigns.csv';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setDlBusy(false);
    }
  }

  // Shop self-serve promos are moderated ONLY through the "Shop requests" queue
  // above — never through the generic builder, which would let an admin flip their
  // status out of the review states or otherwise corrupt a paid/free placement. So
  // the editable "Running campaigns" matrix shows admin-authored campaigns only.
  const manageable = useMemo(() => items.filter((c) => !c.self_serve), [items]);

  const summary = useMemo(() => {
    const s = { total: items.length, active: 0, paused: 0, draft: 0, impressions: 0, clicks: 0 };
    for (const c of items) {
      if (c.status === 'active') s.active += 1;
      else if (c.status === 'paused') s.paused += 1;
      else if (c.status === 'draft') s.draft += 1;
      s.impressions += Number(c.impressions) || 0;
      s.clicks += Number(c.clicks) || 0;
    }
    return s;
  }, [items]);

  if (!ready) return (<Shell><div className="card">Loading…</div></Shell>);
  if (!canView) {
    return (
      <Shell>
        <h1>Campaigns</h1>
        <div className="card">You do not have access to the campaign manager. Ask a super admin for the <code>marketing</code> role.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← Platform</button>
      <h1>Campaigns <span className="badge">Marketing</span></h1>
      <p className="muted">Geo-targeted promo cards shown to shoppers by town, village or pincode. Money is display text only (e.g. ₹20 छूट).</p>

      {/* Summary tiles */}
      <div className="grid">
        <Tile label="Campaigns" value={summary.total} />
        <Tile label="Live / active" value={summary.active} />
        <Tile label="Paused" value={summary.paused} />
        <Tile label="Draft" value={summary.draft} />
        <Tile label="Impressions" value={summary.impressions} />
        <Tile label="Clicks" value={summary.clicks} />
        <Tile label="CTR" value={ctrLabel(summary.impressions, summary.clicks)} />
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {/* Builder + live preview */}
      {canManage ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)' }} className="ads-builder">
          <form className="card" onSubmit={save} style={{ display: 'grid', gap: 16 }}>
            <h3 style={{ margin: 0 }}>{form.id ? 'Edit campaign' : 'New campaign'}</h3>

            {/* Style picker */}
            <div>
              <label className="muted">Style</label>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {STYLES.map((s) => {
                  const on = form.style === s.value;
                  return (
                    <button
                      type="button"
                      key={s.value}
                      onClick={() => setF({ style: s.value })}
                      className={on ? '' : 'secondary'}
                      style={{ display: 'grid', gap: 2, textAlign: 'left', padding: '10px 12px', outline: on ? '2px solid var(--accent)' : 'none' }}
                    >
                      <span style={{ fontSize: 18 }}>{s.glyph} <strong>{s.letter}</strong></span>
                      <span>{s.label}</span>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{s.tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Creative */}
            <fieldset style={fieldset}>
              <legend style={legend}>Creative</legend>
              <Field label="Title"><input value={form.title} onChange={(e) => setF({ title: e.target.value })} maxLength={200} required /></Field>
              <Field label="Offer text (display, e.g. ₹20 छूट)"><input value={form.offer_text} onChange={(e) => setF({ offer_text: e.target.value })} maxLength={200} /></Field>
              <Field label="Subtitle"><input value={form.subtitle} onChange={(e) => setF({ subtitle: e.target.value })} maxLength={300} /></Field>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Field label="Glyph (emoji)" style={{ maxWidth: 120 }}><input value={form.glyph} onChange={(e) => setF({ glyph: e.target.value })} maxLength={40} placeholder={STYLE_BY_VALUE[form.style].glyph} /></Field>
                <Field label="Advertiser" style={{ flex: 1, minWidth: 160 }}><input value={form.advertiser} onChange={(e) => setF({ advertiser: e.target.value })} maxLength={200} /></Field>
              </div>
              <Field label="Image URL (optional)"><input value={form.image_url} onChange={(e) => setF({ image_url: e.target.value })} maxLength={2000} placeholder="https://…" /></Field>
            </fieldset>

            {/* Link / destination */}
            <fieldset style={fieldset}>
              <legend style={legend}>Destination</legend>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Link type" style={{ maxWidth: 160 }}>
                  <select value={form.link_type} onChange={(e) => setF({ link_type: e.target.value })}>
                    {LINK_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                {form.link_type === 'shop' && (
                  <Field label="Shop" style={{ flex: 1, minWidth: 200 }}>
                    {shops ? (
                      <select value={form.link_shop_id} onChange={(e) => setF({ link_shop_id: e.target.value })}>
                        <option value="">Select a shop…</option>
                        {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <input value={form.link_shop_id} onChange={(e) => setF({ link_shop_id: e.target.value })} placeholder="Shop UUID" />
                    )}
                  </Field>
                )}
                {form.link_type === 'product' && (
                  <Field label="Product ID (UUID)" style={{ flex: 1, minWidth: 200 }}>
                    <input value={form.link_product_id} onChange={(e) => setF({ link_product_id: e.target.value })} placeholder="Product UUID" />
                  </Field>
                )}
                {(form.link_type === 'brand' || form.link_type === 'url') && (
                  <Field label="Link URL" style={{ flex: 1, minWidth: 200 }}>
                    <input value={form.link_url} onChange={(e) => setF({ link_url: e.target.value })} maxLength={2000} placeholder="https://…" />
                  </Field>
                )}
              </div>
            </fieldset>

            {/* Per-language overrides */}
            <fieldset style={fieldset}>
              <legend style={legend}>Per-language overrides (optional)</legend>
              <p className="muted" style={{ marginTop: 0 }}>Base fields above are the default/fallback. Fill any language below to override.</p>
              <Field label="Language">
                <select value={overrideLang} onChange={(e) => setOverrideLang(e.target.value)} style={{ maxWidth: 200 }}>
                  {OVERRIDE_LANGS.map((l) => {
                    const o = (form.i18n || {})[l.code] || {};
                    const filled = o.title || o.offer_text || o.subtitle;
                    return <option key={l.code} value={l.code}>{l.name} ({l.code}){filled ? ' •' : ''}</option>;
                  })}
                </select>
              </Field>
              <OverrideInputs
                lang={overrideLang}
                value={(form.i18n || {})[overrideLang] || {}}
                onChange={(patch) => setF({ i18n: { ...(form.i18n || {}), [overrideLang]: { ...((form.i18n || {})[overrideLang] || {}), ...patch } } })}
              />
            </fieldset>

            {/* Targeting */}
            <fieldset style={fieldset}>
              <legend style={legend}>Ranging / targeting</legend>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', width: 'auto' }}>
                <input type="checkbox" checked={form.everywhere} onChange={(e) => setF({ everywhere: e.target.checked })} style={{ width: 'auto' }} />
                <span>Everywhere (district-wide)</span>
              </label>
              {!form.everywhere && (
                <>
                  <ChipMulti label="Towns" options={geo.towns} values={form.towns} onChange={(v) => setF({ towns: v })} placeholder="Add a town…" />
                  <ChipMulti label="Villages" options={geo.villages} values={form.villages} onChange={(v) => setF({ villages: v })} placeholder="Add a village…" />
                  <ChipMulti label="Pincodes" options={geo.pincodes} values={form.pincodes} onChange={(v) => setF({ pincodes: v })} placeholder="Add a pincode…" />
                  <p className="muted" style={{ margin: 0 }}>You can type a value that is not in the list (rural data is sparse). No targets = campaign matches nowhere.</p>
                </>
              )}
            </fieldset>

            {/* Schedule & priority */}
            <fieldset style={fieldset}>
              <legend style={legend}>Schedule & priority</legend>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', width: 'auto' }}>
                <input type="checkbox" checked={form.is_seasonal} onChange={(e) => setF({ is_seasonal: e.target.checked })} style={{ width: 'auto' }} />
                <span>Seasonal window</span>
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Field label="Starts" style={{ flex: 1, minWidth: 140 }}><input type="date" value={form.starts_at} onChange={(e) => setF({ starts_at: e.target.value })} /></Field>
                <Field label="Ends" style={{ flex: 1, minWidth: 140 }}><input type="date" value={form.ends_at} onChange={(e) => setF({ ends_at: e.target.value })} /></Field>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Field label="Priority (higher shows first)" style={{ flex: 1, minWidth: 140 }}><input type="number" min={0} value={form.priority} onChange={(e) => setF({ priority: e.target.value })} /></Field>
                <Field label="Status" style={{ flex: 1, minWidth: 140 }}>
                  <select value={form.status} onChange={(e) => setF({ status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            </fieldset>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={busy}>{busy ? 'Saving…' : (form.id ? 'Save changes' : 'Create campaign')}</button>
              <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>

          {/* Live preview */}
          <div>
            <div style={{ position: 'sticky', top: 76 }}>
              <div className="muted" style={{ marginBottom: 8 }}>Live preview</div>
              <SlidePreview form={form} />
            </div>
          </div>
        </div>
      ) : (
        <div className="card muted">You can view campaigns but not create or edit them (needs <code>ads:manage</code>).</div>
      )}

      {/* Filters */}
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Status" style={{ maxWidth: 160 }}>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Style" style={{ maxWidth: 180 }}>
          <select value={filters.style} onChange={(e) => setFilters({ ...filters, style: e.target.value })}>
            <option value="">All</option>
            {STYLES.map((s) => <option key={s.value} value={s.value}>{s.letter} · {s.label}</option>)}
          </select>
        </Field>
        <Field label="Geo value" style={{ maxWidth: 200 }}>
          <input value={filters.geo} onChange={(e) => setFilters({ ...filters, geo: e.target.value })} placeholder="town / village / pincode" />
        </Field>
        <button className="secondary" onClick={load}>Refresh</button>
      </div>

      {/* Shop self-serve promo moderation queue (batch PROMO-BUY). Shops buy a
          promo with Khata Credits; it waits here at pending_review until a manager
          approves it (→ live) or rejects it (→ refunded). Manager-only. */}
      {canManage && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Shop requests <span className="badge">{pending.length}</span></h3>
            <button type="button" className="secondary" onClick={loadPending}>Refresh</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Shops that spent Khata Credits to boost themselves. Approve to go live, or reject (credits are refunded).</p>
          {pending.length === 0 ? (
            <div className="muted">No shop promo requests awaiting review.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>Creative</th>
                    <th>Targets</th>
                    <th>Window</th>
                    <th>Paid</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <PendingRow key={p.id} p={p} busy={modBusy === p.id} onModerate={moderate} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Matrix table */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Running campaigns</h3>
          <button type="button" className="secondary" disabled={dlBusy} onClick={downloadCsv}>
            {dlBusy ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>CTR reflects the impression/click beacons (no per-viewer dedup) — treat as directional. Shop self-serve promos are managed in the Shop requests queue above, not here.</p>
        {manageable.length === 0 ? (
          <div className="muted">No campaigns yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Style</th>
                  <th>Ranging</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th>Impr. / clicks / CTR</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {manageable.map((c) => (
                  <CampaignRow
                    key={c.id} c={c} canManage={canManage}
                    onEdit={startEdit} onToggle={toggleStatus} onDelete={remove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

function CampaignRow({ c, canManage, onEdit, onToggle, onDelete }) {
  const style = STYLE_BY_VALUE[c.style] || { letter: '?', label: c.style, glyph: '' };
  const st = derivedState(c);
  return (
    <tr style={canManage ? { cursor: 'pointer' } : undefined} onClick={canManage ? () => onEdit(c) : undefined}>
      <td style={cell}>
        <div style={{ fontWeight: 600 }}>{style.glyph} {c.title}</div>
        {c.advertiser && <div className="muted" style={{ fontSize: 12 }}>{c.advertiser}</div>}
      </td>
      <td style={cell}><span className="badge">{style.letter} · {style.label}</span></td>
      <td style={cell}><GeoChips targets={c.targets} /></td>
      <td style={cell}>
        <div style={{ fontSize: 13 }}>{c.starts_at || c.ends_at ? `${fmtDate(c.starts_at) || '…'} → ${fmtDate(c.ends_at) || '…'}` : 'Always'}</div>
        {c.is_seasonal && <span className="badge" style={{ background: '#78350f', color: '#fde68a' }}>seasonal</span>}
      </td>
      <td style={cell}><span className="badge" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
      <td style={cell}>
        <div>{Number(c.impressions) || 0} / {Number(c.clicks) || 0}</div>
        <div className="muted" style={{ fontSize: 12 }}>{ctrLabel(c.impressions, c.clicks)}</div>
      </td>
      {canManage && (
        <td style={cell} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="secondary" onClick={() => onEdit(c)}>Edit</button>
            {c.status === 'active'
              ? <button className="secondary" onClick={() => onToggle(c)}>Pause</button>
              : <button onClick={() => onToggle(c)}>{c.status === 'paused' ? 'Resume' : 'Activate'}</button>}
            <button className="secondary" style={{ color: 'var(--danger)' }} onClick={() => onDelete(c)}>Delete</button>
          </div>
        </td>
      )}
    </tr>
  );
}

// Compact geo summary for a table cell: an "Everywhere" pill, or up to a few
// value chips per kind with a "+N" overflow.
function GeoChips({ targets }) {
  const list = targets || [];
  if (list.some((t) => t.geo_type === 'all')) {
    return <span className="badge" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>Everywhere</span>;
  }
  if (list.length === 0) return <span className="muted">—</span>;
  const shown = list.slice(0, 4);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240 }}>
      {shown.map((t, i) => (
        <span key={i} className="badge" title={t.geo_type}>{t.geo_type[0].toUpperCase()}·{t.geo_value}</span>
      ))}
      {list.length > shown.length && <span className="badge">+{list.length - shown.length}</span>}
    </div>
  );
}

// One row in the shop self-serve moderation queue. Approve → live; Reject captures
// an optional note (shown to the owner) and, for a PAID promo, refunds the shop's
// credits server-side. A FREE request (is_free) paid nothing, so its reject refunds
// nothing — the row makes that explicit with a "Free" pill.
function PendingRow({ p, busy, onModerate }) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const isFree = !!p.is_free || (Number(p.credits_spent_paise) || 0) === 0;
  const paid = `₹${((Number(p.credits_spent_paise) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const win = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
  const doReject = () => onModerate(p.id, 'reject', note.trim() || undefined, isFree);
  return (
    <tr>
      <td style={cell}>
        <div style={{ fontWeight: 600 }}>{p.shop_name || p.advertiser || '—'}</div>
        {p.shop_city && <div className="muted" style={{ fontSize: 12 }}>{p.shop_city}</div>}
      </td>
      <td style={cell}>
        <div>{p.glyph} {p.offer_text || <span className="muted">No offer line</span>}</div>
        {p.subtitle && <div className="muted" style={{ fontSize: 12 }}>{p.subtitle}</div>}
      </td>
      <td style={cell}><GeoChips targets={p.targets} /></td>
      <td style={cell}>{win(p.starts_at)} – {win(p.ends_at)}</td>
      <td style={cell}>
        {isFree
          ? <span className="badge" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>Free</span>
          : paid}
      </td>
      <td style={cell}>
        {rejecting ? (
          <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
            <input
              value={note}
              placeholder={isFree ? 'Reason (optional)' : 'Reason (optional) — credits are refunded'}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              aria-label="Rejection reason"
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="secondary" style={{ color: 'var(--danger)' }} disabled={busy} onClick={doReject}>
                {busy ? '…' : 'Confirm reject'}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setRejecting(false); setNote(''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={() => onModerate(p.id, 'approve', undefined, isFree)}>
              {busy ? '…' : 'Approve'}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function OverrideInputs({ lang, value, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Field label={`Title (${lang})`}><input value={value.title || ''} onChange={(e) => onChange({ title: e.target.value })} maxLength={200} /></Field>
      <Field label={`Offer text (${lang})`}><input value={value.offer_text || ''} onChange={(e) => onChange({ offer_text: e.target.value })} maxLength={200} /></Field>
      <Field label={`Subtitle (${lang})`}><input value={value.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} maxLength={300} /></Field>
    </div>
  );
}

// Multi-value chip control: a datalist-backed input (free-typing allowed) + Add,
// with removable chips below.
function ChipMulti({ label, options, values, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const listId = `dl-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <label className="muted">{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          list={listId}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <datalist id={listId}>{(options || []).map((o) => <option key={o} value={o} />)}</datalist>
        <button type="button" className="secondary" onClick={add}>Add</button>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {values.map((v) => (
            <span key={v} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} style={{ background: 'transparent', color: 'inherit', padding: 0, fontWeight: 700, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Self-contained consumer-slide preview (local light styles — no consumer app
// tokens). Always shows the "प्रचार / Sponsored" tag.
function SlidePreview({ form }) {
  const theme = STYLE_THEME[form.style] || STYLE_THEME.offer;
  const glyph = form.glyph || STYLE_BY_VALUE[form.style].glyph;
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden', color: theme.ink,
      background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
      padding: 18, minHeight: 190, position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{ position: 'absolute', top: 10, insetInlineEnd: 10, background: 'rgba(255,255,255,0.7)', color: '#111', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
        प्रचार / Sponsored
      </div>
      {form.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.image_url} alt="" style={{ width: '100%', height: 84, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ) : (
        <div style={{ fontSize: 44, lineHeight: 1 }}>{glyph}</div>
      )}
      <div>
        {form.offer_text && <div style={{ fontWeight: 800, fontSize: 22 }}>{form.offer_text}</div>}
        <div style={{ fontWeight: 700, fontSize: 17 }}>{form.title || 'Campaign title'}</div>
        {form.subtitle && <div style={{ fontSize: 13, opacity: 0.85 }}>{form.subtitle}</div>}
        {form.advertiser && <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>{form.advertiser}</div>}
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (<div className="card"><div className="muted">{label}</div><div className="kpi">{value}</div></div>);
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label className="muted" style={{ display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// Drop empty override blocks/fields so the i18n object stays lean.
function pruneI18n(i18n) {
  const out = {};
  for (const [lang, o] of Object.entries(i18n || {})) {
    const block = {};
    for (const k of ['title', 'offer_text', 'subtitle']) {
      if (o && o[k] && String(o[k]).trim()) block[k] = String(o[k]).trim();
    }
    if (Object.keys(block).length) out[lang] = block;
  }
  return out;
}

const fieldset = { border: '1px solid #334155', borderRadius: 10, padding: 14, display: 'grid', gap: 10, margin: 0 };
const legend = { padding: '0 6px', fontWeight: 700, fontSize: 14 };

function Shell({ children }) {
  return (
    <div>
      <Nav />
      <div className="container">{children}</div>
      <style jsx>{`
        @media (max-width: 720px) {
          :global(.ads-builder) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
