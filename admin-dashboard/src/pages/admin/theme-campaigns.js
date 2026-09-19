import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';
import { contrastReport } from '../../lib/contrast';
import { toLocalInput, fromLocalInput, windowState } from '../../lib/themeWindow';

// Festive theme windows desk (batch THEME1). A window OVERRIDES the standing
// accent set in Admin → Settings → Appearance while it is active and now sits
// inside its dates — Diwali, Eid, Pongal, a sale weekend. Reads need
// revenue:view; create/edit/activate/pause/delete need settings:manage, the
// same split the referral campaigns beside it use.
//
// TWO THINGS THIS PAGE DELIBERATELY DOES NOT WORK OUT FOR ITSELF.
//
// Whether a window is live: the server sends is_live, computed by the same NOW()
// the resolver uses. Re-deriving it here from the dates would put a second copy
// of that rule in a browser whose clock is its own, and the two would disagree
// on exactly the day somebody cares.
//
// Which window wins: the banner at the top asks /api/public/config — the very
// endpoint the apps ask — and shows the answer it gets. So the operator reads
// the colour the phones are painting, not this page's guess at it.
//
// Contrast is measured here only to warn while somebody is typing; every row
// carries the server's own report, and nothing is ever refused for it.

const STATUSES = ['draft', 'active', 'paused', 'ended'];

function fmtWhen(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

const EMPTY = {
  id: null,
  name: '',
  accent: '#22c55e',
  status: 'draft',
  priority: 0,
  starts_at: '',
  ends_at: '',
};

const cell = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' };

// The state pill. windowState() owns the rule; this only names it.
const STATE_LABEL = {
  live: 'tc.stateLive', draft: 'tc.stateDraft', paused: 'tc.statePaused',
  ended: 'tc.stateEnded', scheduled: 'tc.stateScheduled',
};

function Swatch({ hex }) {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, borderRadius: 4,
      background: hex, border: '1px solid var(--border)', verticalAlign: '-3px', marginInlineEnd: 6,
    }} />
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}

export default function AdminThemeCampaigns() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const canWrite = has('settings:manage');

  const [items, setItems] = useState([]);
  const [painting, setPainting] = useState(null);   // what /public/config answers right now
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/theme/campaigns');
      setItems((r && r.items) || []);
    } catch (e) { setError(e.message); }
    try {
      const c = await apiFetch('/api/public/config');
      setPainting((c && c.theme) || null);
    } catch { /* the banner is informative; the desk still works without it */ }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    load();
  }, [load, router]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function resetForm() { setForm(EMPTY); setEditing(false); setError(''); setMsg(''); }

  function editCampaign(c) {
    setError(''); setMsg('');
    setForm({
      id: c.id,
      name: c.name || '',
      accent: c.accent || '#22c55e',
      status: c.status || 'draft',
      priority: Number(c.priority) || 0,
      starts_at: toLocalInput(c.starts_at),
      ends_at: toLocalInput(c.ends_at),
    });
    setEditing(true);
    if (typeof document !== 'undefined') {
      const el = document.getElementById('tc-builder');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // The payload. Only the two things that would be saved as nonsense are caught
  // here — a missing name and a colour that is not one — plus a window that ends
  // before it starts, which the server also refuses. Poor contrast is NOT caught:
  // it warns above and saves.
  function buildPayload() {
    const name = form.name.trim();
    if (!name) throw new Error(t('tc.errName'));
    const report = contrastReport(form.accent);
    if (!report) throw new Error(t('tc.errAccent'));
    const starts_at = fromLocalInput(form.starts_at);
    const ends_at = fromLocalInput(form.ends_at);
    if (starts_at && ends_at && new Date(ends_at) < new Date(starts_at)) throw new Error(t('tc.errDates'));
    return {
      name,
      accent: report.accent,
      status: form.status,
      priority: Number(form.priority) || 0,
      starts_at,
      ends_at,
    };
  }

  async function save(e) {
    e.preventDefault();
    setError(''); setMsg('');
    let payload;
    try { payload = buildPayload(); } catch (ve) { setError(ve.message); return; }
    try {
      if (editing && form.id) {
        await apiFetch(`/api/admin/theme/campaigns/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg(t('tc.saved'));
      } else {
        await apiFetch('/api/admin/theme/campaigns', { method: 'POST', body: JSON.stringify(payload) });
        setMsg(t('tc.created'));
      }
      resetForm();
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function setStatus(c, status) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/theme/campaigns/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function remove(c) {
    setError(''); setMsg('');
    if (typeof window !== 'undefined' && !window.confirm(t('tc.deleteConfirm'))) return;
    try {
      await apiFetch(`/api/admin/theme/campaigns/${c.id}`, { method: 'DELETE' });
      if (editing && form.id === c.id) resetForm();
      await load();
    } catch (e2) { setError(e2.message); }
  }

  if (!ready) return (<Shell><div className="card">{t('common.loading')}</div></Shell>);

  if (!has('revenue:view')) {
    return (
      <Shell>
        <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
        <div className="card">{t('tc.noAccess')}</div>
      </Shell>
    );
  }

  const live = contrastReport(form.accent);
  const swatch = live ? live.accent : '#22c55e';
  const liveCount = items.filter((c) => c.is_live).length;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin/settings#appearance')} style={{ marginBottom: 12 }}>← {t('tc.backToAppearance')}</button>
      <h1>{t('tc.title')}</h1>
      <p className="muted">{t('tc.subtitle')}</p>

      {/* The answer, from the endpoint the phones ask. Not a re-derivation. */}
      {painting && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Swatch hex={painting.accent} />
          <strong>{t('tc.nowPainting')}</strong>
          <code>{painting.accent}</code>
          <span className="muted">
            {painting.source === 'campaign'
              ? t('tc.viaWindow', { name: painting.campaign })
              : t('tc.viaStanding')}
          </span>
        </div>
      )}

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {canWrite && (
        <form id="tc-builder" className="card" onSubmit={save}>
          <h3 style={{ marginTop: 0 }}>{editing ? t('tc.editTitle') : t('tc.createTitle')}</h3>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <label>{t('tc.name')}
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required placeholder={t('tc.namePlaceholder')} />
            </label>
            <label>{t('tc.accent')}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={form.accent} onChange={(e) => set('accent', e.target.value)} placeholder="#ff8800" style={{ flex: 1 }} />
                <input aria-label={t('tc.pick')} type="color" value={swatch}
                  onChange={(e) => set('accent', e.target.value)}
                  style={{ width: 52, height: 40, padding: 0, border: 'none', background: 'none' }} />
              </div>
            </label>
            <label>{t('tc.status')}
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`tc.st.${s}`)}</option>)}
              </select>
            </label>
            <label>{t('tc.priority')}
              <input type="number" step="1" min="0" value={form.priority} onChange={(e) => set('priority', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
            <label>{t('tc.startsAt')}
              <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
            </label>
            <label>{t('tc.endsAt')}
              <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t('tc.windowNote')}</p>

          {/* The two places the accent actually lands, drawn rather than described. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <span style={{ background: swatch, color: '#052e16', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 15 }}>
              {t('tc.previewButton')}
            </span>
            <span style={{ background: '#0f172a', color: swatch, borderRadius: 10, padding: '10px 18px', fontSize: 15 }}>
              {t('tc.previewText')}
            </span>
          </div>

          {!live && form.accent !== '' && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{t('tc.notAColour')}</p>
          )}
          {live && (
            <div style={{ fontSize: 13, display: 'grid', gap: 4, marginTop: 8 }}>
              <div className="muted">
                {t('tc.onAccent')}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{live.on_accent.ratio}:1</b>{' '}{live.on_accent.passes_aa ? '✓' : '⚠'}
                {'  ·  '}
                {t('tc.onAppBg')}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{live.on_app_bg.ratio}:1</b>{' '}{live.on_app_bg.passes_aa_large ? '✓' : '⚠'}
              </div>
              {live.warnings.map((w) => (<div key={w} style={{ color: 'var(--warn, #f59e0b)' }}>⚠ {w}</div>))}
              {live.warnings.length > 0 && <div className="muted">{t('tc.stillSaves')}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit">{editing ? t('tc.saveBtn') : t('tc.createBtn')}</button>
            {editing && <button type="button" className="secondary" onClick={resetForm}>{t('tc.cancel')}</button>}
          </div>
        </form>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {t('tc.listTitle')} <span className="muted" style={{ fontWeight: 400 }}>({liveCount} {t('tc.liveSuffix')})</span>
        </h3>
        {items.length === 0 ? (
          <p className="muted">{t('tc.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colName')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colState')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colWindow')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colAccent')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colContrast')}</th>
                  {canWrite && <th style={{ ...cell, textAlign: 'start' }}>{t('tc.colActions')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td style={cell}>
                      <div><strong>{c.name}</strong></div>
                      <div className="muted" style={{ fontSize: 12 }}>{t('tc.priority')}: {c.priority}</div>
                    </td>
                    <td style={cell}><span className="badge">{t(STATE_LABEL[windowState(c)])}</span></td>
                    <td style={cell}>
                      {c.starts_at || c.ends_at
                        ? `${fmtWhen(c.starts_at) || '…'} → ${fmtWhen(c.ends_at) || '…'}`
                        : t('tc.always')}
                    </td>
                    <td style={cell}><Swatch hex={c.accent} /><code>{c.accent}</code></td>
                    <td style={cell}>
                      {c.contrast ? (
                        <div style={{ fontSize: 12 }}>
                          <div className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {c.contrast.on_accent.ratio}:1 · {c.contrast.on_app_bg.ratio}:1
                          </div>
                          {c.contrast.warnings.length > 0 && <div style={{ color: 'var(--warn, #f59e0b)' }}>⚠</div>}
                        </div>
                      ) : '—'}
                    </td>
                    {canWrite && (
                      <td style={cell}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="secondary" onClick={() => editCampaign(c)}>{t('tc.edit')}</button>
                          {c.status !== 'active' && <button className="secondary" onClick={() => setStatus(c, 'active')}>{t('tc.activate')}</button>}
                          {c.status === 'active' && <button className="secondary" onClick={() => setStatus(c, 'paused')}>{t('tc.pause')}</button>}
                          {c.status !== 'ended' && <button className="secondary" onClick={() => setStatus(c, 'ended')}>{t('tc.end')}</button>}
                          <button className="secondary" onClick={() => remove(c)} style={{ color: 'var(--danger)' }}>{t('tc.delete')}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t('tc.resolutionNote')}</p>
      </div>
    </Shell>
  );
}
