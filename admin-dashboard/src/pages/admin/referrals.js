import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Platform-admin referrals analytics (Phase D): onboarding-source mix, signups
// by type, top referrers, totals + accrued reward total, an offline
// influencer-code creator, and the reward-rule scaffolding (toggle + amount —
// accruals only, never a payout). Reads need revenue:view, writes settings:manage.
//
// REF-MVP layer: an activation funnel (captured → activated), a reward rule
// extended to three ₹ amounts (referrer / referee / Mitra bounty), and a Khata
// Mitra section — create a shareable Mitra code and a leaderboard of Mitras.
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;
// Compact ₹ with Indian grouping, used in the funnel/leaderboard bounty cells.
const rupeesIn = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
const pct = (num, den) => {
  const d = Number(den) || 0;
  if (d <= 0) return '0%';
  return `${Math.round((Number(num || 0) / d) * 100)}%`;
};

// A simple horizontal bar — no chart library needed.
function Bars({ items, labelKey, valueKey }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((it, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 130, textAlign: 'end' }} className="muted">{it[labelKey]}</div>
          <div style={{ flex: 1, background: 'var(--border, #eee)', borderRadius: 4 }}>
            <div style={{ width: `${(Number(it[valueKey]) / max) * 100}%`, minWidth: 2, background: 'var(--accent)', height: 16, borderRadius: 4 }} />
          </div>
          <div style={{ width: 40 }}>{it[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminReferrals() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const [ov, setOv] = useState(null);
  const [rule, setRule] = useState({ enabled: false, amount_paise: 0, referee_paise: 0, mitra_paise: 0 });
  const [ruleForm, setRuleForm] = useState({ enabled: false, referrer_rupees: '0', referee_rupees: '0', mitra_rupees: '0' });
  const [codeForm, setCodeForm] = useState({ label: '', owner_type: 'influencer' });
  const [newCode, setNewCode] = useState(null);
  const [mitraForm, setMitraForm] = useState({ name: '', territory: '' });
  const [newMitra, setNewMitra] = useState(null);
  const [mitraCopied, setMitraCopied] = useState(false);
  const [eco, setEco] = useState(null);
  // Config form for the influencer code just minted (id from the POST response —
  // the codes list carries no ids frontend-side, so config targets the fresh code).
  const [cfgForm, setCfgForm] = useState({ label: '', is_mitra: false, bounty_rupees: '', cap_rupees: '' });
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const canWrite = has('settings:manage');

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        apiFetch('/api/admin/referrals/overview'),
        apiFetch('/api/admin/referrals/reward-rule'),
      ]);
      setOv(o);
      setRule(r);
      setRuleForm({
        enabled: !!r.enabled,
        referrer_rupees: String((Number(r.amount_paise) || 0) / 100),
        referee_rupees: String((Number(r.referee_paise) || 0) / 100),
        mitra_rupees: String((Number(r.mitra_paise) || 0) / 100),
      });
    } catch (e) { setError(e.message); }
    // Economics is its own fetch so a 403 (no revenue:view) just hides the panel
    // rather than failing the page. Any error → leave eco null (panel not shown).
    try {
      const ec = await apiFetch('/api/admin/referral/economics');
      setEco(ec);
    } catch { setEco(null); }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    load();
  }, [load, router]);

  async function saveRule(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      const amount_paise = Math.round((parseFloat(ruleForm.referrer_rupees) || 0) * 100);
      const referee_paise = Math.round((parseFloat(ruleForm.referee_rupees) || 0) * 100);
      const mitra_paise = Math.round((parseFloat(ruleForm.mitra_rupees) || 0) * 100);
      const r = await apiFetch('/api/admin/referrals/reward-rule', {
        method: 'PATCH', body: JSON.stringify({ enabled: ruleForm.enabled, amount_paise, referee_paise, mitra_paise }),
      });
      setRule(r);
      setRuleForm({
        enabled: !!r.enabled,
        referrer_rupees: String((Number(r.amount_paise) || 0) / 100),
        referee_rupees: String((Number(r.referee_paise) || 0) / 100),
        mitra_rupees: String((Number(r.mitra_paise) || 0) / 100),
      });
      setMsg(t('ref.saved'));
    } catch (e2) { setError(e2.message); }
  }

  async function createCode(e) {
    e.preventDefault();
    setError(''); setMsg(''); setNewCode(null);
    try {
      const r = await apiFetch('/api/admin/referral-codes', {
        method: 'POST', body: JSON.stringify({ label: codeForm.label || null, owner_type: codeForm.owner_type }),
      });
      setNewCode(r.referral_code);
      // Seed the config form for the code we just minted (its id lets us PATCH it).
      setCfgForm({
        label: r.referral_code.label || '',
        is_mitra: !!r.referral_code.is_mitra,
        bounty_rupees: r.referral_code.flat_bounty_paise != null ? String(Number(r.referral_code.flat_bounty_paise) / 100) : '',
        cap_rupees: r.referral_code.budget_cap_paise != null ? String(Number(r.referral_code.budget_cap_paise) / 100) : '',
      });
      setCodeForm({ label: '', owner_type: 'influencer' });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  // Configure the freshly-minted code: label, mitra flag, influencer flat bounty
  // (₹ → paise) and an optional budget cap (blank = uncapped). Amounts validated
  // >= 0 client-side; the backend re-validates. PATCH /api/admin/referral/codes/:id.
  async function saveCodeConfig(e) {
    e.preventDefault();
    setError(''); setMsg('');
    if (!newCode || !newCode.id) return;
    const bountyStr = cfgForm.bounty_rupees.trim();
    const capStr = cfgForm.cap_rupees.trim();
    const bounty = bountyStr === '' ? null : Math.round((parseFloat(bountyStr) || 0) * 100);
    const cap = capStr === '' ? null : Math.round((parseFloat(capStr) || 0) * 100);
    if ((bounty != null && bounty < 0) || (cap != null && cap < 0)) { setError(t('credits.cfgInvalid')); return; }
    try {
      const r = await apiFetch(`/api/admin/referral/codes/${newCode.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: cfgForm.label || null,
          is_mitra: !!cfgForm.is_mitra,
          flat_bounty_paise: bounty,
          budget_cap_paise: cap,
        }),
      });
      const rc = (r && r.referral_code) || newCode;
      setNewCode(rc);
      setCfgForm({
        label: rc.label || '',
        is_mitra: !!rc.is_mitra,
        bounty_rupees: rc.flat_bounty_paise != null ? String(Number(rc.flat_bounty_paise) / 100) : '',
        cap_rupees: rc.budget_cap_paise != null ? String(Number(rc.budget_cap_paise) / 100) : '',
      });
      setMsg(t('credits.cfgSaved'));
      await load();
    } catch (e2) { setError(e2.message); }
  }

  // Manual drain: settle every currently-accrued reward into its Khata Credits
  // wallet. Used when referral_autosettle is off. POST /api/admin/referral/settle.
  async function doSettle() {
    setError(''); setMsg('');
    if (typeof window !== 'undefined' && !window.confirm(t('credits.settleConfirm'))) return;
    setSettling(true);
    try {
      const r = await apiFetch('/api/admin/referral/settle', { method: 'POST' });
      setMsg(t('credits.settleDone', { n: (r && r.settled) || 0 }));
      await load();
    } catch (e2) { setError(e2.message); }
    finally { setSettling(false); }
  }

  // Create a Khata Mitra: an 'other'-owned code (the allowed owner_type for an
  // external agent per createCodeSchema), then flag it is_mitra. The territory
  // note, if any, is folded into the label handed to the local agent.
  async function createMitra(e) {
    e.preventDefault();
    setError(''); setMsg(''); setNewMitra(null); setMitraCopied(false);
    try {
      const name = (mitraForm.name || '').trim();
      const territory = (mitraForm.territory || '').trim();
      const label = territory ? `${name || t('ref.mitraTitle')} — ${territory}` : (name || null);
      const created = await apiFetch('/api/admin/referral-codes', {
        method: 'POST', body: JSON.stringify({ label, owner_type: 'other' }),
      });
      const rc = created.referral_code;
      const flagged = await apiFetch(`/api/admin/referral-codes/${rc.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_mitra: true }),
      });
      setNewMitra((flagged && flagged.referral_code) || rc);
      setMitraForm({ name: '', territory: '' });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function copyMitra() {
    if (!newMitra || !newMitra.code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(newMitra.code);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = newMitra.code; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      setMitraCopied(true);
      setTimeout(() => setMitraCopied(false), 1800);
    } catch { /* clipboard blocked — the code is shown for manual copy */ }
  }

  if (!ready) return (<Shell><div className="card">{t('common.loading')}</div></Shell>);

  const funnel = (ov && ov.funnel) || { captured: 0, activated: 0 };
  const mitra = (ov && Array.isArray(ov.mitra)) ? ov.mitra : [];

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('ref.adminTitle')}</h1>
      <p className="muted">{t('ref.adminSubtitle')}</p>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {eco && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{t('credits.ecoTitle')}</h3>
            <span
              className="badge"
              style={{
                background: eco.zero_burn_ok ? 'var(--accent)' : 'var(--danger)',
                color: '#fff', padding: '2px 10px', borderRadius: 999, fontWeight: 700,
              }}
            >
              {eco.zero_burn_ok ? t('credits.zeroBurnOk') : t('credits.zeroBurnBad')}
            </span>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>{t('credits.ecoSubtitle')}</p>
          <div className="grid">
            <div className="card"><div className="muted">{t('credits.ecoPaidEnrolments')}</div><div className="kpi">{Number(eco.total_paid_enrolments) || 0}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoGrossFees')}</div><div className="kpi">{rupeesIn(eco.gross_fees_paise)}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoPool')}</div><div className="kpi">{rupeesIn(eco.referral_pool_collected_paise)}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoChainPaid')}</div><div className="kpi">{rupeesIn(eco.chain_paid_paise)}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoInfluencerSpend')}</div><div className="kpi">{rupeesIn(eco.influencer_spend_paise)}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoInfraRetained')}</div><div className="kpi" style={{ color: 'var(--accent)' }}>{rupeesIn(eco.infra_retained_paise)}</div></div>
            <div className="card"><div className="muted">{t('credits.ecoWalletLiability')}</div><div className="kpi">{rupeesIn(eco.wallet_liability_paise)}</div></div>
          </div>
        </div>
      )}

      <div className="grid">
        <div className="card"><div className="muted">{t('ref.totalReferrals')}</div><div className="kpi">{ov ? ov.totals.total_referrals : '—'}</div></div>
        <div className="card"><div className="muted">{t('ref.accruedTotal')}</div><div className="kpi" style={{ color: 'var(--accent)' }}>{ov ? rupees(ov.reward.accrued_total_paise) : '—'}</div><div className="muted">{ov ? t('ref.accruedCount', { n: ov.reward.accrued_count }) : ''}</div></div>
      </div>

      <div className="card">
        <h3>{t('ref.funnelTitle')}</h3>
        <div className="grid">
          <div className="card"><div className="muted">{t('ref.funnelCaptured')}</div><div className="kpi">{ov ? funnel.captured : '—'}</div></div>
          <div className="card"><div className="muted">{t('ref.funnelActivated')}</div><div className="kpi" style={{ color: 'var(--accent)' }}>{ov ? funnel.activated : '—'}</div></div>
          <div className="card"><div className="muted">{t('ref.funnelRate')}</div><div className="kpi">{ov ? pct(funnel.activated, funnel.captured) : '—'}</div></div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{t('ref.funnelNote')}</div>
      </div>

      <div className="card">
        <h3>{t('ref.sourceMix')}</h3>
        {ov && ov.source_channel_mix.length > 0
          ? <Bars items={ov.source_channel_mix} labelKey="channel" valueKey="c" />
          : <div className="muted">{t('ref.noData')}</div>}
      </div>

      <div className="card">
        <h3>{t('ref.byType')}</h3>
        {ov && ov.signups_by_type.length > 0
          ? <Bars items={ov.signups_by_type.map((x) => ({ ...x, label: t(`ref.type.${x.referred_type}`) }))} labelKey="label" valueKey="c" />
          : <div className="muted">{t('ref.noData')}</div>}
      </div>

      <div className="card">
        <h3>{t('ref.topReferrers')}</h3>
        {ov && ov.top_referrers.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}>
              <th style={cell}>{t('ref.colCode')}</th>
              <th style={cell}>{t('ref.colWho')}</th>
              <th style={cell}>{t('ref.colType')}</th>
              <th style={cell}>{t('ref.colCount')}</th>
            </tr></thead>
            <tbody>
              {ov.top_referrers.map((r) => (
                <tr key={r.code} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={cell}><code>{r.code}</code></td>
                  <td style={cell}>{r.label || '—'}</td>
                  <td style={cell}><span className="badge">{r.owner_type}</span></td>
                  <td style={cell}>{r.referred_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="muted">{t('ref.noData')}</div>}
      </div>

      <div className="card">
        <h3>{t('ref.mitraTitle')}</h3>
        {canWrite && (
          <>
            <p className="muted">{t('ref.mitraCreateSubtitle')}</p>
            <form onSubmit={createMitra} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="muted">{t('ref.mitraName')}</label>
                <input value={mitraForm.name} onChange={(e) => setMitraForm({ ...mitraForm, name: e.target.value })} placeholder={t('ref.mitraNamePlaceholder')} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="muted">{t('ref.mitraTerritory')}</label>
                <input value={mitraForm.territory} onChange={(e) => setMitraForm({ ...mitraForm, territory: e.target.value })} placeholder={t('ref.mitraTerritoryPlaceholder')} />
              </div>
              <button type="submit">{t('ref.mitraCreate')}</button>
            </form>
            {newMitra && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{t('ref.mitraCreated')}</span>
                <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{newMitra.code}</code>
                <button type="button" className="secondary" onClick={copyMitra}>{mitraCopied ? t('ref.copied') : t('ref.mitraCopy')}</button>
              </div>
            )}
            <div style={{ height: 16 }} />
          </>
        )}
        <h4 style={{ margin: '4px 0 8px' }}>{t('ref.mitraLeaderboard')}</h4>
        {mitra.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}>
              <th style={cell}>{t('ref.colCode')}</th>
              <th style={cell}>{t('ref.mitraColName')}</th>
              <th style={cell}>{t('ref.mitraColOnboarded')}</th>
              <th style={cell}>{t('ref.mitraColActivated')}</th>
              <th style={cell}>{t('ref.mitraColRate')}</th>
              <th style={cell}>{t('ref.mitraColBounty')}</th>
            </tr></thead>
            <tbody>
              {mitra.map((m) => (
                <tr key={m.code} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={cell}><code>{m.code}</code></td>
                  <td style={cell}>{m.label || '—'}</td>
                  <td style={cell}>{Number(m.onboarded) || 0}</td>
                  <td style={cell}>{Number(m.activated) || 0}</td>
                  <td style={cell}>{pct(m.activated, m.onboarded)}</td>
                  <td style={cell}>{rupeesIn(m.bounty_accrued_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="muted">{t('ref.mitraEmpty')}</div>}
      </div>

      {canWrite && (
        <div className="card">
          <h3>{t('ref.createCodeTitle')}</h3>
          <p className="muted">{t('ref.createCodeSubtitle')}</p>
          <form onSubmit={createCode} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="muted">{t('ref.label')}</label>
              <input value={codeForm.label} onChange={(e) => setCodeForm({ ...codeForm, label: e.target.value })} placeholder={t('ref.labelPlaceholder')} />
            </div>
            <div>
              <label className="muted">{t('ref.ownerType')}</label>
              <select value={codeForm.owner_type} onChange={(e) => setCodeForm({ ...codeForm, owner_type: e.target.value })}>
                <option value="influencer">{t('ref.influencer')}</option>
                <option value="other">{t('ref.other')}</option>
              </select>
            </div>
            <button type="submit">{t('ref.create')}</button>
          </form>
          {newCode && (
            <div style={{ marginTop: 10 }}>
              {t('ref.created')} <code style={{ fontSize: 18, fontWeight: 700 }}>{newCode.code}</code>
            </div>
          )}

          {newCode && newCode.id && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border, #eee)', paddingTop: 12 }}>
              <h4 style={{ margin: '0 0 4px' }}>{t('credits.cfgTitle')}</h4>
              <p className="muted" style={{ marginTop: 0 }}>{t('credits.cfgForCode')} <code>{newCode.code}</code> — {t('credits.cfgSubtitle')}</p>
              <form onSubmit={saveCodeConfig} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="muted">{t('credits.cfgLabel')}</label>
                  <input value={cfgForm.label} onChange={(e) => setCfgForm({ ...cfgForm, label: e.target.value })} placeholder={t('ref.labelPlaceholder')} />
                </div>
                <div>
                  <label className="muted">{t('credits.cfgFlatBounty')}</label>
                  <input type="number" min="0" step="0.01" value={cfgForm.bounty_rupees} onChange={(e) => setCfgForm({ ...cfgForm, bounty_rupees: e.target.value })} style={{ width: 150 }} />
                </div>
                <div>
                  <label className="muted">{t('credits.cfgBudgetCap')}</label>
                  <input type="number" min="0" step="0.01" value={cfgForm.cap_rupees} onChange={(e) => setCfgForm({ ...cfgForm, cap_rupees: e.target.value })} style={{ width: 150 }} placeholder={t('credits.cfgUncapped')} />
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={cfgForm.is_mitra} onChange={(e) => setCfgForm({ ...cfgForm, is_mitra: e.target.checked })} />
                  {t('credits.cfgMitra')}
                </label>
                <button type="submit">{t('credits.cfgSave')}</button>
              </form>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <div className="card">
          <h3>{t('credits.settleTitle')}</h3>
          <p className="muted">{t('credits.settleSubtitle')}</p>
          <button type="button" onClick={doSettle} disabled={settling}>
            {settling ? t('common.loading') : t('credits.settleBtn')}
          </button>
        </div>
      )}

      {canWrite && (
        <div className="card">
          <h3>{t('ref.rewardRule')}</h3>
          <p className="muted">{t('ref.rewardRuleNote')}</p>
          <form onSubmit={saveRule} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={ruleForm.enabled} onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })} />
              {t('ref.rewardEnabled')}
            </label>
            <div>
              <label className="muted">{t('ref.rewardReferrer')}</label>
              <input type="number" min="0" step="0.01" value={ruleForm.referrer_rupees} onChange={(e) => setRuleForm({ ...ruleForm, referrer_rupees: e.target.value })} style={{ width: 140 }} />
            </div>
            <div>
              <label className="muted">{t('ref.rewardReferee')}</label>
              <input type="number" min="0" step="0.01" value={ruleForm.referee_rupees} onChange={(e) => setRuleForm({ ...ruleForm, referee_rupees: e.target.value })} style={{ width: 140 }} />
            </div>
            <div>
              <label className="muted">{t('ref.rewardMitra')}</label>
              <input type="number" min="0" step="0.01" value={ruleForm.mitra_rupees} onChange={(e) => setRuleForm({ ...ruleForm, mitra_rupees: e.target.value })} style={{ width: 140 }} />
            </div>
            <button type="submit">{t('ref.saveRule')}</button>
          </form>
          <div className="muted" style={{ marginTop: 8 }}>
            {t('ref.currentRule')}: {rule.enabled ? t('ref.on') : t('ref.off')} · {t('ref.rewardReferrer')} {rupees(rule.amount_paise)} · {t('ref.rewardReferee')} {rupees(rule.referee_paise)} · {t('ref.rewardMitra')} {rupees(rule.mitra_paise)}
          </div>
        </div>
      )}
    </Shell>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
