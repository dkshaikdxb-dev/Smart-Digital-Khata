import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch, apiPost } from '../lib/api';
import { useLang } from '../lib/i18n';

// Owner "Boost my shop" (batch PROMO-BUY) — the shopkeeper spends earned Khata
// Credits to buy a MODERATED promo advertising their own store to nearby shoppers.
// It reads /api/promos/config (live pricing + the shop's spendable balance), lets
// the owner pick a number of days with a live cost, and POSTs /api/promos/mine;
// the placement starts "pending review" and only serves after an admin approves.
// Below the form it lists the shop's placements with status pills + view/tap counts.
//
// Money is integer paise → ₹ with Indian grouping, always framed as Khata Credits
// (never cash). SSR-safe (fetch only in the effect), non-fatal on error, with
// loading + empty states. The Submit is disabled when the feature is off or the
// balance is short.
const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rupees = (paise) => `₹${nf.format((Number(paise) || 0) / 100)}`;

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// Map a campaign status to a status-pill descriptor (label key + color token).
function pill(t, status) {
  switch (status) {
    case 'pending_review': return { label: t('promo.stPending'), bg: '#fef3c7', ink: '#92400e' };
    case 'active': return { label: t('promo.stActive'), bg: '#dcfce7', ink: '#166534' };
    case 'rejected': return { label: t('promo.stRejected'), bg: '#fee2e2', ink: '#991b1b' };
    case 'paused': return { label: t('promo.stPaused'), bg: '#e5e7eb', ink: '#374151' };
    default: return { label: t('promo.stDraft'), bg: '#e5e7eb', ink: '#374151' };
  }
}

export default function Promote() {
  const router = useRouter();
  const { t } = useLang();

  const [cfg, setCfg] = useState(null); // { enabled, credits_per_day_paise, max_days, balance_paise }
  const [placements, setPlacements] = useState([]);
  const [days, setDays] = useState(7);
  const [offerText, setOfferText] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [c, mine] = await Promise.all([
      apiFetch('/api/promos/config'),
      apiFetch('/api/promos/mine'),
    ]);
    setCfg(c);
    setPlacements(mine.promos || []);
    // Clamp the initial day pick into the allowed range.
    setDays((d) => Math.min(Math.max(1, d), Math.max(1, c.max_days || 1)));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    const role = window.localStorage.getItem('skhata_role');
    if (role === 'admin') { router.replace('/admin'); return; }
    if (role === 'distributor') { router.replace('/distributor'); return; }
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perDay = cfg ? Number(cfg.credits_per_day_paise) || 0 : 0;
  const balance = cfg ? Number(cfg.balance_paise) || 0 : 0;
  const maxDays = cfg ? Math.max(1, Number(cfg.max_days) || 1) : 1;
  const enabled = !!(cfg && cfg.enabled);
  const cost = useMemo(() => days * perDay, [days, perDay]);
  const short = enabled && cost > balance;

  async function submit(e) {
    e.preventDefault();
    if (!enabled || short || busy) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await apiPost('/api/promos/mine', {
        days,
        offer_text: offerText.trim() || undefined,
        subtitle: subtitle.trim() || undefined,
      });
      setMsg(t('promo.submitted'));
      setOfferText(''); setSubtitle('');
      await load();
    } catch (err) {
      if (err && err.status === 402) setError(t('promo.lowBalance'));
      else setError(err.message || t('promo.errGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Nav />
      <div className="container" style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
        <h1 style={{ marginBottom: 4 }}>🏪 {t('promo.title')}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{t('promo.subtitle')}</p>

        {loading ? (
          <div className="card">{t('promo.loading')}</div>
        ) : (
          <>
            {/* Balance */}
            <div className="card" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted">{t('promo.balanceLabel')}</span>
              <strong style={{ fontSize: 22 }}>{rupees(balance)}</strong>
            </div>

            {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
            {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

            {!enabled ? (
              <div className="card">{t('promo.disabledNote')}</div>
            ) : (
              <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="muted">{t('promo.days')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="range" min={1} max={maxDays} step={1}
                      value={days} onChange={(e) => setDays(Number(e.target.value))}
                      style={{ flex: 1 }} aria-label={t('promo.days')}
                    />
                    <input
                      type="number" min={1} max={maxDays} value={days}
                      onChange={(e) => setDays(Math.min(maxDays, Math.max(1, Number(e.target.value) || 1)))}
                      style={{ width: 72 }}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{t('promo.perDay', { amount: rupees(perDay) })}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span className="muted">{t('promo.costLabel')}</span>
                  <strong style={{ fontSize: 20, color: short ? 'var(--danger)' : 'inherit' }}>{rupees(cost)}</strong>
                </div>

                <label>
                  <span className="muted">{t('promo.offerText')}</span>
                  <input value={offerText} onChange={(e) => setOfferText(e.target.value)} maxLength={60} placeholder={t('promo.offerPlaceholder')} />
                </label>
                <label>
                  <span className="muted">{t('promo.subtitleField')}</span>
                  <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} placeholder={t('promo.subtitlePlaceholder')} />
                </label>

                {short && <div className="muted" style={{ color: 'var(--danger)' }}>{t('promo.lowBalance')}</div>}

                <button type="submit" disabled={busy || short}>
                  {busy ? t('promo.submitting') : t('promo.submit', { amount: rupees(cost) })}
                </button>
                <div className="muted" style={{ fontSize: 12 }}>{t('promo.refundNote')}</div>
              </form>
            )}

            {/* My placements */}
            <h2 style={{ marginTop: 24 }}>{t('promo.myPlacements')}</h2>
            {placements.length === 0 ? (
              <div className="card muted">{t('promo.empty')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {placements.map((p) => {
                  const pl = pill(t, p.status);
                  return (
                    <div key={p.id} className="card" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{p.offer_text || t('promo.title')}</strong>
                        <span style={{ background: pl.bg, color: pl.ink, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                          {pl.label}
                        </span>
                      </div>
                      {p.subtitle && <div className="muted" style={{ fontSize: 13 }}>{p.subtitle}</div>}
                      <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span>{t('promo.window')}: {fmtDate(p.starts_at)} – {fmtDate(p.ends_at)}</span>
                        <span>{t('promo.spent')}: {rupees(p.credits_spent_paise)}</span>
                        <span>{t('promo.impr')}: {p.impressions}</span>
                        <span>{t('promo.clicks')}: {p.clicks}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
