import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Seasonal + geo referral campaigns desk (batch CAMP1). A campaign OVERRIDES the
// default referral reward for a window + place + audience, hard-capped by a
// PRE-FUNDED budget so it can never overspend (zero-burn against budget). Reads
// need revenue:view; create/edit/activate/pause/delete need settings:manage —
// the same referral-admin permissions as the reward rule + code management.
//
// English + Hindi chrome via t(); ₹ display with Intl.NumberFormat('en-IN').

const AUDIENCES = ['all', 'shop', 'mitra', 'influencer', 'consumer'];
const STATUSES = ['draft', 'active', 'paused', 'ended'];
const REWARD_TYPES = ['multiplier', 'flat_override'];

// ₹ with Indian grouping from integer paise.
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const rupees = (paise) => `₹${inr.format((Number(paise) || 0) / 100)}`;

function toDateInput(iso) {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return ''; }
}
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch (e) { return iso; }
}

const EMPTY = {
  id: null,
  name: '',
  status: 'draft',
  audience: 'all',
  reward_type: 'multiplier',
  x: '2',
  referrer_rupees: '',
  referee_rupees: '',
  mitra_rupees: '',
  budget_rupees: '',
  starts_at: '',
  ends_at: '',
  is_seasonal: false,
  priority: 0,
  everywhere: false,
  towns: '',
  villages: '',
  pincodes: '',
};

// A campaign's targets[] → the comma-joined builder fields.
function targetsToForm(targets) {
  const out = { everywhere: false, towns: [], villages: [], pincodes: [] };
  for (const t of targets || []) {
    if (t.geo_type === 'all') { out.everywhere = true; continue; }
    if (t.geo_type === 'town') out.towns.push(t.geo_value);
    else if (t.geo_type === 'village') out.villages.push(t.geo_value);
    else if (t.geo_type === 'pincode') out.pincodes.push(t.geo_value);
  }
  return {
    everywhere: out.everywhere,
    towns: out.towns.join(', '),
    villages: out.villages.join(', '),
    pincodes: out.pincodes.join(', '),
  };
}

// Split a comma/newline list into trimmed, de-duplicated non-empty tokens.
function tokens(s) {
  return Array.from(new Set(String(s || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)));
}

// Derive the display state pill from status + window.
function derivedState(c, t) {
  const now = Date.now();
  if (c.status === 'paused') return { label: t('rc.statePaused'), cls: 'paused' };
  if (c.status === 'ended') return { label: t('rc.stateEnded'), cls: 'ended' };
  if (c.status === 'draft') return { label: t('rc.stateDraft'), cls: 'draft' };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: t('rc.stateScheduled'), cls: 'sched' };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: t('rc.stateEnded'), cls: 'ended' };
  return { label: t('rc.stateLive'), cls: 'live' };
}

const cell = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid var(--border, #e5e7eb)' };

// A compact spend-vs-budget bar.
function SpendBar({ spent, budget }) {
  const b = Math.max(1, Number(budget) || 0);
  const s = Math.min(b, Number(spent) || 0);
  const pctNum = Math.round((s / b) * 100);
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ background: 'var(--border, #eee)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pctNum}%`, minWidth: s > 0 ? 2 : 0, background: pctNum >= 100 ? 'var(--danger, #dc2626)' : 'var(--accent)', height: 10 }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {rupees(spent)} / {rupees(budget)} ({pctNum}%)
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}

export default function AdminReferralCampaigns() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const canWrite = has('settings:manage');

  const [items, setItems] = useState([]);
  const [geo, setGeo] = useState({ towns: [], villages: [], pincodes: [] });
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/referral/campaigns');
      setItems((r && r.items) || []);
    } catch (e) { setError(e.message); }
    try {
      const g = await apiFetch('/api/admin/referral/campaigns-geo-options');
      setGeo({ towns: g.towns || [], villages: g.villages || [], pincodes: g.pincodes || [] });
    } catch { /* suggestions are optional */ }
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
    const rv = c.reward_value || {};
    const tf = targetsToForm(c.targets);
    setForm({
      id: c.id,
      name: c.name || '',
      status: c.status || 'draft',
      audience: c.audience || 'all',
      reward_type: c.reward_type || 'multiplier',
      x: rv.x != null ? String(rv.x) : '2',
      referrer_rupees: rv.referrer_paise != null ? String(Number(rv.referrer_paise) / 100) : '',
      referee_rupees: rv.referee_paise != null ? String(Number(rv.referee_paise) / 100) : '',
      mitra_rupees: rv.mitra_paise != null ? String(Number(rv.mitra_paise) / 100) : '',
      budget_rupees: c.budget_cap_paise != null ? String(Number(c.budget_cap_paise) / 100) : '',
      starts_at: toDateInput(c.starts_at),
      ends_at: toDateInput(c.ends_at),
      is_seasonal: !!c.is_seasonal,
      priority: Number(c.priority) || 0,
      everywhere: tf.everywhere,
      towns: tf.towns,
      villages: tf.villages,
      pincodes: tf.pincodes,
    });
    setEditing(true);
    if (typeof document !== 'undefined') {
      const el = document.getElementById('rc-builder');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Assemble the API payload from the builder form. Throws a friendly message on
  // an obvious client-side problem; the backend re-validates everything.
  function buildPayload() {
    const name = form.name.trim();
    if (!name) throw new Error(t('rc.errName'));

    const budget_cap_paise = Math.round((parseFloat(form.budget_rupees) || 0) * 100);
    if (!(budget_cap_paise > 0)) throw new Error(t('rc.errBudget'));

    let reward_value;
    if (form.reward_type === 'multiplier') {
      const x = parseFloat(form.x);
      if (!(x > 0) || x > 10) throw new Error(t('rc.errX'));
      reward_value = { x };
    } else {
      reward_value = {};
      const map = { referrer_rupees: 'referrer_paise', referee_rupees: 'referee_paise', mitra_rupees: 'mitra_paise' };
      let any = false;
      for (const [fk, pk] of Object.entries(map)) {
        const s = String(form[fk] || '').trim();
        if (s === '') continue;
        const v = Math.round((parseFloat(s) || 0) * 100);
        if (v < 0) throw new Error(t('rc.errFlat'));
        reward_value[pk] = v;
        if (v > 0) any = true;
      }
      if (!any) throw new Error(t('rc.errFlat'));
    }

    const targets = [];
    if (form.everywhere) {
      targets.push({ geo_type: 'all' });
    } else {
      for (const v of tokens(form.towns)) targets.push({ geo_type: 'town', geo_value: v });
      for (const v of tokens(form.villages)) targets.push({ geo_type: 'village', geo_value: v });
      for (const v of tokens(form.pincodes)) targets.push({ geo_type: 'pincode', geo_value: v });
    }
    if (targets.length === 0) throw new Error(t('rc.errTargets'));

    return {
      name,
      status: form.status,
      audience: form.audience,
      reward_type: form.reward_type,
      reward_value,
      budget_cap_paise,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_seasonal: !!form.is_seasonal,
      priority: Number(form.priority) || 0,
      targets,
    };
  }

  async function save(e) {
    e.preventDefault();
    setError(''); setMsg('');
    let payload;
    try { payload = buildPayload(); } catch (ve) { setError(ve.message); return; }
    try {
      if (editing && form.id) {
        await apiFetch(`/api/admin/referral/campaigns/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg(t('rc.saved'));
      } else {
        await apiFetch('/api/admin/referral/campaigns', { method: 'POST', body: JSON.stringify(payload) });
        setMsg(t('rc.created'));
      }
      resetForm();
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function setStatus(c, status) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/referral/campaigns/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function remove(c) {
    setError(''); setMsg('');
    if (typeof window !== 'undefined' && !window.confirm(t('rc.deleteConfirm'))) return;
    try {
      await apiFetch(`/api/admin/referral/campaigns/${c.id}`, { method: 'DELETE' });
      if (editing && form.id === c.id) resetForm();
      await load();
    } catch (e2) { setError(e2.message); }
  }

  const geoLabel = (c) => {
    const ts = c.targets || [];
    if (ts.some((x) => x.geo_type === 'all')) return t('rc.everywhere');
    return ts.map((x) => x.geo_value).filter(Boolean).join(', ') || '—';
  };
  const rewardLabel = (c) => {
    const rv = c.reward_value || {};
    if (c.reward_type === 'multiplier') return `${rv.x != null ? rv.x : '?'}×`;
    const parts = [];
    if (rv.referrer_paise != null) parts.push(`R ${rupees(rv.referrer_paise)}`);
    if (rv.referee_paise != null) parts.push(`E ${rupees(rv.referee_paise)}`);
    if (rv.mitra_paise != null) parts.push(`M ${rupees(rv.mitra_paise)}`);
    return parts.join(' · ') || '—';
  };

  const activeCount = useMemo(() => items.filter((c) => c.status === 'active').length, [items]);

  if (!ready) return (<Shell><div className="card">{t('common.loading')}</div></Shell>);

  if (!has('revenue:view')) {
    return (
      <Shell>
        <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
        <div className="card">{t('rc.noAccess')}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin/referrals')} style={{ marginBottom: 12 }}>← {t('ref.navReferrals')}</button>
      <h1>{t('rc.title')}</h1>
      <p className="muted">{t('rc.subtitle')}</p>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {canWrite && (
        <form id="rc-builder" className="card" onSubmit={save}>
          <h3 style={{ marginTop: 0 }}>{editing ? t('rc.editTitle') : t('rc.createTitle')}</h3>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label>{t('rc.name')}
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required />
            </label>
            <label>{t('rc.audience')}
              <select value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{t(`rc.aud.${a}`)}</option>)}
              </select>
            </label>
            <label>{t('rc.status')}
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`rc.st.${s}`)}</option>)}
              </select>
            </label>
            <label>{t('rc.rewardType')}
              <select value={form.reward_type} onChange={(e) => set('reward_type', e.target.value)}>
                {REWARD_TYPES.map((r) => <option key={r} value={r}>{t(`rc.rt.${r}`)}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
            {form.reward_type === 'multiplier' ? (
              <label>{t('rc.multiplier')}
                <input type="number" step="0.1" min="0.1" max="10" value={form.x} onChange={(e) => set('x', e.target.value)} />
              </label>
            ) : (
              <>
                <label>{t('rc.flatReferrer')}
                  <input type="number" step="0.01" min="0" value={form.referrer_rupees} onChange={(e) => set('referrer_rupees', e.target.value)} placeholder="0" />
                </label>
                <label>{t('rc.flatReferee')}
                  <input type="number" step="0.01" min="0" value={form.referee_rupees} onChange={(e) => set('referee_rupees', e.target.value)} placeholder="0" />
                </label>
                <label>{t('rc.flatMitra')}
                  <input type="number" step="0.01" min="0" value={form.mitra_rupees} onChange={(e) => set('mitra_rupees', e.target.value)} placeholder="0" />
                </label>
              </>
            )}
            <label>{t('rc.budget')}
              <input type="number" step="0.01" min="0.01" value={form.budget_rupees} onChange={(e) => set('budget_rupees', e.target.value)} required />
            </label>
            <label>{t('rc.priority')}
              <input type="number" step="1" min="0" value={form.priority} onChange={(e) => set('priority', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
            <label>{t('rc.startsAt')}
              <input type="date" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
            </label>
            <label>{t('rc.endsAt')}
              <input type="date" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={form.is_seasonal} onChange={(e) => set('is_seasonal', e.target.checked)} style={{ width: 'auto' }} />
              {t('rc.seasonal')}
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>{t('rc.targeting')}</strong>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={form.everywhere} onChange={(e) => set('everywhere', e.target.checked)} style={{ width: 'auto' }} />
              {t('rc.everywhere')}
            </label>
            {!form.everywhere && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 8 }}>
                <label>{t('rc.towns')}
                  <input value={form.towns} onChange={(e) => set('towns', e.target.value)} placeholder={t('rc.geoPlaceholder')} list="rc-towns" />
                  <datalist id="rc-towns">{geo.towns.map((x) => <option key={x} value={x} />)}</datalist>
                </label>
                <label>{t('rc.villages')}
                  <input value={form.villages} onChange={(e) => set('villages', e.target.value)} placeholder={t('rc.geoPlaceholder')} list="rc-villages" />
                  <datalist id="rc-villages">{geo.villages.map((x) => <option key={x} value={x} />)}</datalist>
                </label>
                <label>{t('rc.pincodes')}
                  <input value={form.pincodes} onChange={(e) => set('pincodes', e.target.value)} placeholder={t('rc.geoPlaceholder')} list="rc-pincodes" />
                  <datalist id="rc-pincodes">{geo.pincodes.map((x) => <option key={x} value={x} />)}</datalist>
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit">{editing ? t('rc.saveBtn') : t('rc.createBtn')}</button>
            {editing && <button type="button" className="secondary" onClick={resetForm}>{t('rc.cancel')}</button>}
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{t('rc.budgetNote')}</p>
        </form>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('rc.listTitle')} <span className="muted" style={{ fontWeight: 400 }}>({activeCount} {t('rc.activeSuffix')})</span></h3>
        {items.length === 0 ? (
          <p className="muted">{t('rc.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colName')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colState')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colWindow')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colGeo')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colAudience')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colReward')}</th>
                  <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colSpend')}</th>
                  {canWrite && <th style={{ ...cell, textAlign: 'start' }}>{t('rc.colActions')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const st = derivedState(c, t);
                  return (
                    <tr key={c.id}>
                      <td style={cell}>
                        <div><strong>{c.name}</strong></div>
                        {c.is_seasonal && <span className="badge" style={{ fontSize: 11 }}>{t('rc.seasonalTag')}</span>}
                        <div className="muted" style={{ fontSize: 12 }}>{t('rc.priority')}: {c.priority}</div>
                      </td>
                      <td style={cell}><span className="badge">{st.label}</span></td>
                      <td style={cell}>
                        {c.starts_at || c.ends_at
                          ? `${fmtDate(c.starts_at) || '…'} → ${fmtDate(c.ends_at) || '…'}`
                          : t('rc.always')}
                      </td>
                      <td style={cell}>{geoLabel(c)}</td>
                      <td style={cell}>{t(`rc.aud.${c.audience}`)}</td>
                      <td style={cell}>{rewardLabel(c)}</td>
                      <td style={cell}><SpendBar spent={c.spent_paise} budget={c.budget_cap_paise} /></td>
                      {canWrite && (
                        <td style={cell}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="secondary" onClick={() => editCampaign(c)}>{t('rc.edit')}</button>
                            {c.status !== 'active' && <button className="secondary" onClick={() => setStatus(c, 'active')}>{t('rc.activate')}</button>}
                            {c.status === 'active' && <button className="secondary" onClick={() => setStatus(c, 'paused')}>{t('rc.pause')}</button>}
                            {c.status !== 'ended' && <button className="secondary" onClick={() => setStatus(c, 'ended')}>{t('rc.end')}</button>}
                            <button className="secondary" onClick={() => remove(c)} style={{ color: 'var(--danger)' }}>{t('rc.delete')}</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
