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
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

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
  const [rule, setRule] = useState({ enabled: false, amount_paise: 0 });
  const [ruleForm, setRuleForm] = useState({ enabled: false, amount_rupees: '0' });
  const [codeForm, setCodeForm] = useState({ label: '', owner_type: 'influencer' });
  const [newCode, setNewCode] = useState(null);
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
      setRuleForm({ enabled: !!r.enabled, amount_rupees: String((Number(r.amount_paise) || 0) / 100) });
    } catch (e) { setError(e.message); }
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
      const amount_paise = Math.round((parseFloat(ruleForm.amount_rupees) || 0) * 100);
      const r = await apiFetch('/api/admin/referrals/reward-rule', {
        method: 'PATCH', body: JSON.stringify({ enabled: ruleForm.enabled, amount_paise }),
      });
      setRule(r);
      setRuleForm({ enabled: !!r.enabled, amount_rupees: String((Number(r.amount_paise) || 0) / 100) });
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
      setCodeForm({ label: '', owner_type: 'influencer' });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  if (!ready) return (<Shell><div className="card">{t('common.loading')}</div></Shell>);

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('ref.adminTitle')}</h1>
      <p className="muted">{t('ref.adminSubtitle')}</p>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="grid">
        <div className="card"><div className="muted">{t('ref.totalReferrals')}</div><div className="kpi">{ov ? ov.totals.total_referrals : '—'}</div></div>
        <div className="card"><div className="muted">{t('ref.accruedTotal')}</div><div className="kpi" style={{ color: 'var(--accent)' }}>{ov ? rupees(ov.reward.accrued_total_paise) : '—'}</div><div className="muted">{ov ? t('ref.accruedCount', { n: ov.reward.accrued_count }) : ''}</div></div>
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
              <label className="muted">{t('ref.rewardAmount')}</label>
              <input type="number" min="0" step="0.01" value={ruleForm.amount_rupees} onChange={(e) => setRuleForm({ ...ruleForm, amount_rupees: e.target.value })} style={{ width: 140 }} />
            </div>
            <button type="submit">{t('ref.saveRule')}</button>
          </form>
          <div className="muted" style={{ marginTop: 8 }}>
            {t('ref.currentRule')}: {rule.enabled ? t('ref.on') : t('ref.off')} · {rupees(rule.amount_paise)}
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
