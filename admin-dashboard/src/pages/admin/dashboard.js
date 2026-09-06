import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Admin "Khata Control Room" (Phase E, Batch L). One page that fetches the
// aggregated, permission-filtered /api/admin/dashboard payload and lays it out
// across DOMAIN TABS — Overview · Marketing · Growth · Finance · Research ·
// Investor. The server returns `domains` listing exactly the tabs the caller's
// admin sub-role may see (a tab the caller can't see is simply absent), the flat
// `sections` each tab reads from, and `insights` each tagged with a domain.
//
// Overview shows every permitted insight (as before); each domain tab shows the
// insights tagged with its own domain. Charts stay LITE — inline SVG
// sparklines/donuts + CSS bars. No chart library.

// Money helpers: server sends integer paise; the UI shows grouped rupees.
const rupees = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');
const pct = (v) => (v == null ? '—' : `${v}%`);

// Colour bands for a collection / health percentage.
function pctColor(p) {
  if (p == null) return 'var(--muted)';
  if (p < 60) return 'var(--danger)';
  if (p < 80) return '#eab308';
  return 'var(--accent)';
}

const SEV_COLOR = { urgent: 'var(--danger)', warn: '#eab308', info: 'var(--accent)' };

// Fixed tab order. Only those present in data.domains are rendered.
const TAB_ORDER = ['overview', 'marketing', 'growth', 'finance', 'research', 'investor'];

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
function Donut({ pct: p, color, label }) {
  const r = 34; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, p || 0));
  return (
    <svg viewBox="0 0 88 88" width="96" height="96" role="img">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#0b1220" strokeWidth="10" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 44 44)"
      />
      <text x="44" y="42" textAnchor="middle" fill="var(--text)" fontSize="16" fontWeight="700">{Math.round(v)}%</text>
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
  const { ready, has } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    apiFetch('/api/admin/dashboard').then(setData).catch((e) => setError(e.message));
    // Restore the previously selected tab from the URL hash (deep-link friendly).
    const h = (window.location.hash || '').replace('#', '');
    if (TAB_ORDER.includes(h)) setTab(h);
  }, [router]);

  const s = data ? data.sections : {};
  const domains = (data && data.domains) || {};
  const tabs = TAB_ORDER.filter((k) => domains[k]);

  // If the remembered tab isn't available for this role, fall back to the first.
  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (k) => {
    setTab(k);
    if (typeof window !== 'undefined') {
      try { window.history.replaceState(null, '', `#${k}`); } catch { /* ignore */ }
    }
  };

  // Prefer an i18n insight string; fall back to the server's English text when a
  // key isn't translated (translate() returns the raw key on a miss).
  const insightText = (ins, field) => {
    const key = `insight.${ins.id}.${field}`;
    const v = t(key, ins.vars || {});
    return v === key ? ins[field] : v;
  };

  // A translated label with a graceful fallback to the raw value when unmapped.
  const lbl = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  // Insights for a tab: Overview shows everything permitted; a domain tab shows
  // only insights tagged with its domain. Belt-and-braces: hide any insight whose
  // perm the caller lacks (the server already filtered, this is a second gate).
  const insightsFor = (k) => {
    const all = (data && data.insights) || [];
    const permitted = all.filter((i) => (!ready || has(i.perm)));
    return k === 'overview' ? permitted : permitted.filter((i) => i.domain === k);
  };

  function InsightCards({ list }) {
    if (!list.length) return null;
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('dash.insightsTitle')}</h3>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {list.map((ins) => (
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
      </div>
    );
  }

  // ---- Reused section blocks -------------------------------------------------

  const NetworkCard = () => s.network && (
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
  );

  const LanguagesCard = () => s.languages && (
    <div className="card">
      <h3>{t('dash.lang.title')}</h3>
      <div className="grid">
        <Tile label={t('dash.lang.active')} value={num(s.languages.active_count)} color="var(--accent)" />
        <Tile label={t('dash.lang.staged')} value={num(s.languages.staged_count)} sub={t('dash.lang.stagedNote')} color={s.languages.staged_count ? '#eab308' : undefined} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {s.languages.active.map((l) => (
          <span key={l.code} className="badge" title={l.english_name} style={{ background: l.audit_status === 'audited' ? 'rgba(34,197,94,0.2)' : '#334155', color: l.audit_status === 'audited' ? 'var(--accent)' : 'var(--text)' }} dir={l.rtl ? 'rtl' : 'ltr'}>
            {l.label} · {lbl(`dash.audit.${l.audit_status}`, l.audit_status)}
          </span>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 10 }}>{t('dash.lang.posture')}</div>
    </div>
  );

  // ---- Per-tab renderers -----------------------------------------------------

  function OverviewTab() {
    return (
      <>
        <InsightCards list={insightsFor('overview')} />
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
        <NetworkCard />
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
    );
  }

  function MarketingTab() {
    const m = s.marketing;
    const typeLabel = (ty) => lbl(`ref.type.${ty}`, ty);
    return (
      <>
        <InsightCards list={insightsFor('marketing')} />
        {m && (
          <div className="card">
            <h3>{t('dash.mkt.title')}</h3>
            <div className="grid">
              <Tile label={t('dash.mkt.listed')} value={num(m.listed_shops)} sub={t('dash.mkt.listedShareNote', { pct: m.listed_share_pct, n: num(m.total_shops) })} />
            </div>
            {m.source_channel_mix.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.acq.sourceMix')}</div>
                <Bars items={m.source_channel_mix} labelKey="channel" valueKey="c" color="#38bdf8" />
              </div>
            )}
            {m.signups_by_owner_type.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.mkt.signupsByType')}</div>
                <Bars items={m.signups_by_owner_type.map((r) => ({ ...r, l: typeLabel(r.referred_type) }))} labelKey="l" valueKey="c" color="#a78bfa" />
              </div>
            )}
            {m.top_referrers.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.acq.topReferrers')}</div>
                <table>
                  <thead><tr><th>{t('dash.acq.colWho')}</th><th>{t('dash.acq.colType')}</th><th style={{ textAlign: 'end' }}>{t('dash.acq.colCount')}</th></tr></thead>
                  <tbody>
                    {m.top_referrers.map((r) => (
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
        {s.geography && s.geography.top_cities.length > 0 && (
          <div className="card">
            <h3>{t('dash.geo.title')}</h3>
            <Bars items={s.geography.top_cities} labelKey="city" valueKey="c" color="#a78bfa" />
          </div>
        )}
        <LanguagesCard />
      </>
    );
  }

  function GrowthTab() {
    const g = s.growth;
    const wow = g && g.wow;
    const wowColor = wow && wow.pct != null ? (wow.pct >= 0 ? 'var(--accent)' : 'var(--danger)') : undefined;
    const wowText = wow && wow.pct != null
      ? t(wow.pct >= 0 ? 'dash.growth.wowUp' : 'dash.growth.wowDown', { pct: Math.abs(wow.pct) })
      : t('dash.growth.wowNone');
    return (
      <>
        <InsightCards list={insightsFor('growth')} />
        {g && (
          <div className="card">
            <h3>{t('dash.growth.title')}</h3>
            <Sparkline
              series={[
                { points: g.weekly.map((w) => w.shops) },
                { points: g.weekly.map((w) => w.consumers) },
              ]}
              colors={['var(--accent)', '#38bdf8']}
            />
            <div className="muted" style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span><span style={{ color: 'var(--accent)' }}>●</span> {t('dash.growth.shops')}</span>
              <span><span style={{ color: '#38bdf8' }}>●</span> {t('dash.growth.consumers')}</span>
              <span>{t('dash.growth.window')}</span>
              <span style={wowColor ? { color: wowColor } : undefined}>{t('dash.growth.wowLabel')}: {wowText}</span>
            </div>
            <div className="grid" style={{ marginTop: 12 }}>
              <Tile label={t('dash.growth.withProduct')} value={num(g.activation.shops_with_product)} sub={t('dash.growth.ofN', { n: num(g.activation.total_shops) })} />
              <Tile label={t('dash.growth.withTx')} value={num(g.activation.shops_with_transaction)} sub={t('dash.growth.ofN', { n: num(g.activation.total_shops) })} />
              <Tile label={t('dash.growth.withOrder')} value={num(g.activation.shops_with_order)} sub={t('dash.growth.ofN', { n: num(g.activation.total_shops) })} />
              <Tile label={t('dash.growth.neverActivated')} value={num(g.activation.never_activated)} color={g.activation.never_activated ? '#eab308' : undefined} />
            </div>
            {/* Activation funnel as descending CSS bars. */}
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>{t('dash.growth.funnel')}</div>
              <Bars
                items={[
                  { l: t('dash.growth.registered'), v: g.activation.total_shops },
                  { l: t('dash.growth.withProduct'), v: g.activation.shops_with_product },
                  { l: t('dash.growth.withTx'), v: g.activation.shops_with_transaction },
                  { l: t('dash.growth.withOrder'), v: g.activation.shops_with_order },
                ]}
                labelKey="l" valueKey="v" color="var(--accent)"
              />
            </div>
          </div>
        )}
        {s.overview && (
          <div className="grid">
            <Tile label={t('dash.kpi.activeShops30')} value={num(s.overview.active_shops_30d)} color="var(--accent)" />
            <Tile label={t('dash.kpi.consumers')} value={num(s.overview.total_consumers)} sub={t('dash.kpi.neverOrdered', { n: num(s.overview.consumers_never_ordered) })} />
          </div>
        )}
      </>
    );
  }

  function FinanceTab() {
    const r = s.revenue; const f = s.finance;
    return (
      <>
        <InsightCards list={insightsFor('finance')} />
        {r && (
          <div className="card">
            <h3>{t('dash.revenue.title')}</h3>
            <div className="grid">
              <Tile label={t('dash.revenue.mrr')} value={rupees(r.mrr_paise)} color="var(--accent)" />
              {f && <Tile label={t('dash.fin.arpu')} value={rupees(f.arpu_paise)} sub={t('dash.fin.payingShops', { n: num(f.paying_shops) })} />}
              {f && <Tile label={t('dash.fin.runRate')} value={rupees(f.run_rate_paise)} sub={t('dash.fin.runRateNote')} />}
              <Tile label={t('dash.revenue.free')} value={num(r.plan_counts.free)} />
              <Tile label={t('dash.revenue.pro')} value={num(r.plan_counts.pro)} sub={rupees(r.plan_price_paise.pro)} />
              <Tile label={t('dash.revenue.family')} value={num(r.plan_counts.family)} sub={rupees(r.plan_price_paise.family)} />
              <Tile label={t('dash.revenue.upsell')} value={num(r.upsell_candidates)} sub={t('dash.revenue.upsellNote', { amt: rupees(r.upsell_gmv_threshold_paise) })} color={r.upsell_candidates ? '#eab308' : undefined} />
            </div>
          </div>
        )}
        {f && f.collection_trend && (
          <div className="card">
            <h3>{t('dash.fin.collectionTrend')}</h3>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <Donut pct={f.collection_trend.current_pct} color={pctColor(f.collection_trend.current_pct)} label={t('dash.fin.thisPeriod')} />
              </div>
              <div className="grid" style={{ flex: 1 }}>
                <Tile label={t('dash.fin.thisPeriod')} value={pct(f.collection_trend.current_pct)} />
                <Tile label={t('dash.fin.priorPeriod')} value={pct(f.collection_trend.prior_pct)} />
                <Tile
                  label={t('dash.fin.delta')}
                  value={f.collection_trend.delta == null ? '—' : `${f.collection_trend.delta > 0 ? '+' : ''}${f.collection_trend.delta}`}
                  color={f.collection_trend.delta == null ? undefined : (f.collection_trend.delta >= 0 ? 'var(--accent)' : 'var(--danger)')}
                />
              </div>
            </div>
          </div>
        )}
        <NetworkCard />
        {s.commerce && (
          <div className="card">
            <h3>{t('dash.commerce.title')}</h3>
            <div className="grid">
              <Tile label={t('dash.commerce.gmv30')} value={rupees(s.commerce.gmv_30d_paise)} color="var(--accent)" />
              <Tile label={t('dash.commerce.credit')} value={num(s.commerce.payment_mode_counts.credit)} />
              <Tile label={t('dash.commerce.prepaid')} value={num(s.commerce.payment_mode_counts.prepaid)} />
              <Tile label={t('dash.commerce.cash')} value={num(s.commerce.payment_mode_counts.cash)} />
            </div>
          </div>
        )}
      </>
    );
  }

  function ResearchTab() {
    const rs = s.research;
    const dow = (d) => lbl(`dash.dow.${d}`, String(d));
    return (
      <>
        <InsightCards list={insightsFor('research')} />
        {rs && (
          <div className="card">
            <h3>{t('dash.res.catalogue')}</h3>
            <div className="grid">
              <Tile label={t('dash.res.shopsWithProducts')} value={num(rs.catalogue.shops_with_products)} />
              <Tile label={t('dash.res.usingBase')} value={num(rs.catalogue.shops_using_base)} sub={t('dash.res.baseLinked', { n: num(rs.catalogue.base_linked_products) })} />
              <Tile label={t('dash.res.custom')} value={num(rs.catalogue.custom_products)} />
              <Tile label={t('dash.res.loose')} value={num(rs.catalogue.loose_products)} sub={t('dash.res.unit', { n: num(rs.catalogue.unit_products) })} />
            </div>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.res.topCategories')}</div>
                {rs.top_categories.length ? <Bars items={rs.top_categories} labelKey="category" valueKey="c" color="#38bdf8" /> : <div className="muted">{t('dash.res.noData')}</div>}
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.res.topSubcategories')}</div>
                {rs.top_subcategories.length ? <Bars items={rs.top_subcategories} labelKey="subcategory" valueKey="c" color="#a78bfa" /> : <div className="muted">{t('dash.res.noData')}</div>}
              </div>
            </div>
          </div>
        )}
        {s.commerce && (
          <div className="card">
            <h3>{t('dash.res.orderPatterns')}</h3>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.commerce.byFulfillment')}</div>
                <Bars items={s.commerce.orders_by_fulfillment.map((r) => ({ ...r, l: lbl(`dash.fulfillment.${r.fulfillment_type}`, r.fulfillment_type) }))} labelKey="l" valueKey="c" color="var(--accent)" />
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.res.byPayment')}</div>
                <Bars
                  items={[
                    { l: t('dash.commerce.credit'), c: s.commerce.payment_mode_counts.credit },
                    { l: t('dash.commerce.prepaid'), c: s.commerce.payment_mode_counts.prepaid },
                    { l: t('dash.commerce.cash'), c: s.commerce.payment_mode_counts.cash },
                  ]}
                  labelKey="l" valueKey="c" color="#f472b6"
                />
              </div>
            </div>
            {rs && rs.orders_by_weekday.some((d) => d.c > 0) && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('dash.res.byWeekday')}</div>
                <Bars items={rs.orders_by_weekday.map((d) => ({ ...d, l: dow(d.dow) }))} labelKey="l" valueKey="c" color="#38bdf8" />
              </div>
            )}
          </div>
        )}
        <LanguagesCard />
      </>
    );
  }

  function InvestorTab() {
    const iv = s.investor;
    if (!iv) return null;
    const growthColor = iv.growth_rate_pct == null ? undefined : (iv.growth_rate_pct >= 0 ? 'var(--accent)' : 'var(--danger)');
    return (
      <>
        <InsightCards list={insightsFor('investor')} />
        <div className="card">
          <h3>{t('dash.inv.title')}</h3>
          <div className="muted" style={{ marginBottom: 12 }}>{t('dash.inv.subtitle')}</div>
          <div className="grid">
            <Tile label={t('dash.inv.activeShops')} value={num(iv.active_shops_30d)} sub={t('dash.inv.ofShops', { n: num(iv.total_shops) })} color="var(--accent)" />
            <Tile label={t('dash.inv.consumers')} value={num(iv.total_consumers)} />
            <Tile label={t('dash.inv.gmv30')} value={rupees(iv.gmv_30d_paise)} color="var(--accent)" />
            <Tile label={t('dash.inv.gmvAll')} value={rupees(iv.gmv_all_time_paise)} />
            <Tile label={t('dash.inv.mrr')} value={rupees(iv.mrr_paise)} color="var(--accent)" />
            <Tile label={t('dash.inv.runRate')} value={rupees(iv.run_rate_paise)} />
            <Tile label={t('dash.inv.growth')} value={iv.growth_rate_pct == null ? '—' : `${iv.growth_rate_pct > 0 ? '+' : ''}${iv.growth_rate_pct}%`} sub={t('dash.inv.growthNote')} color={growthColor} />
            <Tile label={t('dash.inv.collection')} value={pct(iv.collection_rate_pct)} color={pctColor(iv.collection_rate_pct)} />
            <Tile label={t('dash.inv.outstanding')} value={rupees(iv.outstanding_total_paise)} />
            <Tile label={t('dash.inv.referralPct')} value={pct(iv.referral_driven_pct)} sub={t('dash.inv.referralNote', { n: num(iv.referral_driven_signups) })} />
          </div>
        </div>
      </>
    );
  }

  const TAB_RENDER = {
    overview: OverviewTab,
    marketing: MarketingTab,
    growth: GrowthTab,
    finance: FinanceTab,
    research: ResearchTab,
    investor: InvestorTab,
  };
  const ActiveTab = TAB_RENDER[tabs.includes(tab) ? tab : (tabs[0] || 'overview')];

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
            {/* ---- Domain tab bar ---- */}
            <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 16px' }}>
              {tabs.map((k) => {
                const active = k === (tabs.includes(tab) ? tab : tabs[0]);
                return (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectTab(k)}
                    className={active ? undefined : 'secondary'}
                    style={{
                      borderRadius: 999,
                      padding: '6px 16px',
                      ...(active ? { background: 'var(--accent)', color: '#000', fontWeight: 700 } : {}),
                    }}
                  >
                    {t(`dash.tab.${k}`)}
                  </button>
                );
              })}
            </div>

            {ActiveTab && <ActiveTab />}
          </>
        )}
      </div>
    </div>
  );
}
