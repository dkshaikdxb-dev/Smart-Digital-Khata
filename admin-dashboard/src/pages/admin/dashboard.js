import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Admin "Khata Control Room" (Phase E). One page that fetches the aggregated,
// permission-filtered /api/admin/dashboard payload and renders it as prioritised
// actionable insights on top, then infographic sections below. Every section is
// shown only if the server included it (i.e., the caller's admin sub-role may
// see it), so no client-side permission logic is needed to hide data.
//
// Charts stay LITE — inline SVG sparklines/donuts + CSS bars. No chart library.

// Money helpers: server sends integer paise; the UI shows grouped rupees.
const rupees = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');

// Colour bands for a collection / health percentage.
function pctColor(pct) {
  if (pct == null) return 'var(--muted)';
  if (pct < 60) return 'var(--danger)';
  if (pct < 80) return '#eab308';
  return 'var(--accent)';
}

const SEV_COLOR = { urgent: 'var(--danger)', warn: '#eab308', info: 'var(--accent)' };

// A simple horizontal CSS bar list — reused by several sections.
function Bars({ items, labelKey, valueKey, color = 'var(--accent)', fmt }) {
  const rows = items || [];
  const max = Math.max(1, ...rows.map((i) => Number(i[valueKey]) || 0));
  if (!rows.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((it, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 140, textAlign: 'end', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="muted">{it[labelKey]}</div>
          <div style={{ flex: 1, background: '#0b1220', borderRadius: 4, minWidth: 40 }}>
            <div style={{ width: `${(Number(it[valueKey]) / max) * 100}%`, minWidth: 2, background: typeof color === 'function' ? color(it) : color, height: 16, borderRadius: 4 }} />
          </div>
          <div style={{ width: 74, textAlign: 'end' }}>{fmt ? fmt(it[valueKey]) : num(it[valueKey])}</div>
        </div>
      ))}
    </div>
  );
}

// Inline SVG dual sparkline for the 8-week growth series.
function Sparkline({ series, colors }) {
  const w = 320; const h = 60; const pad = 4;
  const n = series[0]?.points.length || 0;
  if (n < 2) return null;
  const all = series.flatMap((s) => s.points);
  const max = Math.max(1, ...all);
  const x = (i) => pad + (i * (w - 2 * pad)) / (n - 1);
  const y = (v) => h - pad - (v / max) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img">
      {series.map((s, si) => (
        <polyline
          key={si}
          fill="none"
          stroke={colors[si]}
          strokeWidth="2"
          points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
        />
      ))}
    </svg>
  );
}

// Inline SVG donut for a small part-of-whole (collection rate).
function Donut({ pct, color, label }) {
  const r = 34; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <svg viewBox="0 0 88 88" width="96" height="96" role="img">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#0b1220" strokeWidth="10" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 44 44)"
      />
      <text x="44" y="42" textAnchor="middle" fill="var(--text)" fontSize="16" fontWeight="700">{Math.round(p)}%</text>
      <text x="44" y="58" textAnchor="middle" fill="var(--muted)" fontSize="9">{label}</text>
    </svg>
  );
}

function Tile({ label, value, sub, color }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="kpi" style={color ? { color } : undefined}>{value}</div>
      {sub != null && <div className="muted">{sub}</div>}
    </div>
  );
}

export default function ControlRoom() {
  const router = useRouter();
  const { t } = useLang();
  const { ready } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    apiFetch('/api/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, [router]);

  const s = data ? data.sections : {};

  // Prefer an i18n insight string; fall back to the server's English text when a
  // key isn't translated (translate() returns the raw key on a miss).
  const insightText = (ins, field) => {
    const key = `insight.${ins.id}.${field}`;
    const v = t(key, ins.vars || {});
    return v === key ? ins[field] : v;
  };

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('dash.title')}</h1>
        <p className="muted">{t('dash.subtitle')}</p>
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
        {!data && !error && <div className="card">{t('common.loading')}</div>}

        {data && (
          <>
            {/* ---- Actionable insights ---- */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('dash.insightsTitle')}</h3>
              {data.insights.length === 0 ? (
                <div className="muted">{t('dash.insightsEmpty')}</div>
              ) : (
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {data.insights.map((ins) => (
                    <div key={ins.id} style={{ background: '#0b1220', borderRadius: 10, padding: '12px 14px', borderInlineStart: `4px solid ${SEV_COLOR[ins.severity] || 'var(--muted)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="badge" style={{ background: SEV_COLOR[ins.severity], color: '#000' }}>{t(`insight.sev.${ins.severity}`)}</span>
                        <strong style={{ fontSize: 15 }}>{insightText(ins, 'title')}</strong>
                      </div>
                      <div className="muted" style={{ marginBottom: 10 }}>{insightText(ins, 'detail')}</div>
                      <button className="secondary" onClick={() => router.push(ins.action_link)}>
                        {insightText(ins, 'action_label')} →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Overview KPIs ---- */}
            {s.overview && (
              <div className="grid">
                <Tile label={t('dash.kpi.shops')} value={num(s.overview.total_shops)} sub={t('dash.kpi.activeShops', { n: num(s.overview.active_shops_30d) })} />
                <Tile label={t('dash.kpi.listed')} value={num(s.overview.listed_shops)} sub={s.overview.suspended_shops ? t('dash.kpi.suspended', { n: num(s.overview.suspended_shops) }) : null} />
                <Tile label={t('dash.kpi.consumers')} value={num(s.overview.total_consumers)} sub={t('dash.kpi.neverOrdered', { n: num(s.overview.consumers_never_ordered) })} />
                <Tile label={t('dash.kpi.ledgerCustomers')} value={num(s.overview.total_ledger_customers)} />
                <Tile label={t('dash.kpi.transactions')} value={num(s.overview.total_transactions)} />
                <Tile label={t('dash.kpi.orders')} value={num(s.overview.total_orders)} />
              </div>
            )}

            {/* ---- Growth + activation ---- */}
            {s.growth && (
              <div className="card">
                <h3>{t('dash.growth.title')}</h3>
                <Sparkline
                  series={[
                    { points: s.growth.weekly.map((w) => w.shops) },
                    { points: s.growth.weekly.map((w) => w.consumers) },
                  ]}
                  colors={['var(--accent)', '#38bdf8']}
                />
                <div className="muted" style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                  <span><span style={{ color: 'var(--accent)' }}>●</span> {t('dash.growth.shops')}</span>
                  <span><span style={{ color: '#38bdf8' }}>●</span> {t('dash.growth.consumers')}</span>
                  <span>{t('dash.growth.window')}</span>
                </div>
                <div className="grid" style={{ marginTop: 12 }}>
                  <Tile label={t('dash.growth.withProduct')} value={num(s.growth.activation.shops_with_product)} sub={t('dash.growth.ofN', { n: num(s.growth.activation.total_shops) })} />
                  <Tile label={t('dash.growth.withTx')} value={num(s.growth.activation.shops_with_transaction)} sub={t('dash.growth.ofN', { n: num(s.growth.activation.total_shops) })} />
                  <Tile label={t('dash.growth.neverActivated')} value={num(s.growth.activation.never_activated)} color={s.growth.activation.never_activated ? '#eab308' : undefined} />
                </div>
              </div>
            )}

            {/* ---- Commerce + GMV ---- */}
            {s.commerce && (
              <div className="card">
                <h3>{t('dash.commerce.title')}</h3>
                <div className="grid">
                  <Tile label={t('dash.commerce.gmv30')} value={rupees(s.commerce.gmv_30d_paise)} color="var(--accent)" />
                  <Tile label={t('dash.commerce.credit')} value={num(s.commerce.payment_mode_counts.credit)} />
                  <Tile label={t('dash.commerce.prepaid')} value={num(s.commerce.payment_mode_counts.prepaid)} />
                  <Tile label={t('dash.commerce.cash')} value={num(s.commerce.payment_mode_counts.cash)} />
                </div>
                <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('dash.commerce.byStatus')}</div>
                    <Bars items={s.commerce.orders_by_status.map((r) => ({ ...r, l: t(`dash.orderStatus.${r.status}`) === `dash.orderStatus.${r.status}` ? r.status : t(`dash.orderStatus.${r.status}`) }))} labelKey="l" valueKey="c" color="#38bdf8" />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('dash.commerce.byFulfillment')}</div>
                    <Bars items={s.commerce.orders_by_fulfillment.map((r) => ({ ...r, l: t(`dash.fulfillment.${r.fulfillment_type}`) === `dash.fulfillment.${r.fulfillment_type}` ? r.fulfillment_type : t(`dash.fulfillment.${r.fulfillment_type}`) }))} labelKey="l" valueKey="c" color="var(--accent)" />
                  </div>
                </div>
              </div>
            )}

            {/* ---- Network health: outstanding + aging + collection ---- */}
            {s.network && (
              <div className="card">
                <h3>{t('dash.network.title')}</h3>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <div className="muted">{t('dash.network.outstanding')}</div>
                    <div className="kpi">{rupees(s.network.outstanding_total_paise)}</div>
                    <div style={{ marginTop: 10 }}>
                      <Bars
                        items={[
                          { l: t('dash.network.age0'), v: s.network.aging.b0_30_paise },
                          { l: t('dash.network.age30'), v: s.network.aging.b31_60_paise },
                          { l: t('dash.network.age60'), v: s.network.aging.b61_plus_paise },
                        ]}
                        labelKey="l" valueKey="v" fmt={rupees}
                        color={(it) => (it.l === t('dash.network.age60') ? 'var(--danger)' : it.l === t('dash.network.age30') ? '#eab308' : 'var(--accent)')}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <Donut pct={s.network.has_collection_data ? s.network.collection_rate_pct : null} color={pctColor(s.network.has_collection_data ? s.network.collection_rate_pct : null)} label={t('dash.network.collection')} />
                    <div className="muted" style={{ maxWidth: 140 }}>
                      {s.network.has_collection_data
                        ? t('dash.network.collectionNote', { paid: rupees(s.network.paid_30d_paise), purchased: rupees(s.network.purchased_30d_paise) })
                        : t('dash.network.noCollection')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---- Geography ---- */}
            {s.geography && s.geography.top_cities.length > 0 && (
              <div className="card">
                <h3>{t('dash.geo.title')}</h3>
                <Bars items={s.geography.top_cities} labelKey="city" valueKey="c" color="#a78bfa" />
              </div>
            )}

            {/* ---- Revenue (revenue:view) ---- */}
            {s.revenue && (
              <div className="card">
                <h3>{t('dash.revenue.title')}</h3>
                <div className="grid">
                  <Tile label={t('dash.revenue.mrr')} value={rupees(s.revenue.mrr_paise)} color="var(--accent)" />
                  <Tile label={t('dash.revenue.free')} value={num(s.revenue.plan_counts.free)} />
                  <Tile label={t('dash.revenue.pro')} value={num(s.revenue.plan_counts.pro)} sub={rupees(s.revenue.plan_price_paise.pro)} />
                  <Tile label={t('dash.revenue.family')} value={num(s.revenue.plan_counts.family)} sub={rupees(s.revenue.plan_price_paise.family)} />
                  <Tile label={t('dash.revenue.upsell')} value={num(s.revenue.upsell_candidates)} sub={t('dash.revenue.upsellNote', { amt: rupees(s.revenue.upsell_gmv_threshold_paise) })} color={s.revenue.upsell_candidates ? '#eab308' : undefined} />
                </div>
              </div>
            )}

            {/* ---- Acquisition / referrals (revenue:view) ---- */}
            {s.acquisition && (
              <div className="card">
                <h3>{t('dash.acq.title')}</h3>
                <div className="grid">
                  <Tile label={t('dash.acq.total')} value={num(s.acquisition.total_referrals)} />
                  <Tile label={t('dash.acq.accrued')} value={rupees(s.acquisition.accrued_total_paise)} color="var(--accent)" />
                </div>
                {s.acquisition.source_channel_mix.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('dash.acq.sourceMix')}</div>
                    <Bars items={s.acquisition.source_channel_mix} labelKey="channel" valueKey="c" color="#38bdf8" />
                  </div>
                )}
                {s.acquisition.top_referrers.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('dash.acq.topReferrers')}</div>
                    <table>
                      <thead><tr><th>{t('dash.acq.colWho')}</th><th>{t('dash.acq.colType')}</th><th style={{ textAlign: 'end' }}>{t('dash.acq.colCount')}</th></tr></thead>
                      <tbody>
                        {s.acquisition.top_referrers.map((r) => (
                          <tr key={r.code}>
                            <td>{r.label || r.code}</td>
                            <td><span className="badge">{r.owner_type}</span></td>
                            <td style={{ textAlign: 'end' }}>{num(r.referred_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ---- Languages registry posture ---- */}
            {s.languages && (
              <div className="card">
                <h3>{t('dash.lang.title')}</h3>
                <div className="grid">
                  <Tile label={t('dash.lang.active')} value={num(s.languages.active_count)} color="var(--accent)" />
                  <Tile label={t('dash.lang.staged')} value={num(s.languages.staged_count)} sub={t('dash.lang.stagedNote')} color={s.languages.staged_count ? '#eab308' : undefined} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {s.languages.active.map((l) => (
                    <span key={l.code} className="badge" title={l.english_name} style={{ background: l.audit_status === 'audited' ? 'rgba(34,197,94,0.2)' : '#334155', color: l.audit_status === 'audited' ? 'var(--accent)' : 'var(--text)' }} dir={l.rtl ? 'rtl' : 'ltr'}>
                      {l.label} · {t(`dash.audit.${l.audit_status}`) === `dash.audit.${l.audit_status}` ? l.audit_status : t(`dash.audit.${l.audit_status}`)}
                    </span>
                  ))}
                </div>
                <div className="muted" style={{ marginTop: 10 }}>{t('dash.lang.posture')}</div>
              </div>
            )}

            {/* ---- Trust / moderation (audit:view) ---- */}
            {s.trust && (
              <div className="card">
                <h3>{t('dash.trust.title')}</h3>
                <div className="grid">
                  <Tile label={t('dash.trust.blockedUsers')} value={num(s.trust.blocked_users)} color={s.trust.blocked_users ? 'var(--danger)' : undefined} />
                  <Tile label={t('dash.trust.blockedConsumers')} value={num(s.trust.blocked_consumers)} color={s.trust.blocked_consumers ? 'var(--danger)' : undefined} />
                  <Tile label={t('dash.trust.suspendedShops')} value={num(s.trust.suspended_shops)} color={s.trust.suspended_shops ? 'var(--danger)' : undefined} />
                  <Tile label={t('dash.trust.actions30')} value={num(s.trust.moderation_actions_30d)} />
                </div>
                {s.trust.actions_by_type.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('dash.trust.byType')}</div>
                    <Bars items={s.trust.actions_by_type} labelKey="action" valueKey="c" color="#f472b6" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
