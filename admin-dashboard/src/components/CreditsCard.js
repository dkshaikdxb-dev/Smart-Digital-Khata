import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

// Khata Credits card (Batch R4) — the shopkeeper-facing view of the shop's
// closed-loop loyalty/discount credit (NEVER cash, never withdrawable). Shows the
// balance, what the code has earned so far (settled + any still-accruing) with a
// small by-source breakdown, and a short recent-activity ledger. It reads the R3
// owner/staff endpoints (/api/referral/wallet + /api/referral/earnings) and is
// rendered alongside ReferralCard on the owner account page only — a consumer has
// no shop wallet on these endpoints, so it is not placed on the consumer page.
//
// Money is integer paise → ₹ with Indian grouping. SSR-safe (fetch only in the
// effect), non-fatal on error (a failed fetch shows a small note; the referral
// card next to it still shows the code/link), and degrades to an empty state
// (all balances 0 until enrolment is enabled).
const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rupees = (paise) => `₹${nf.format((Number(paise) || 0) / 100)}`;

// The by_role roles worth surfacing to the shopkeeper, in display order.
const SOURCE_ROLES = ['referrer', 'chain_l1', 'chain_l2', 'referee', 'mitra', 'influencer'];

// A friendly label for a ledger row's `kind`. redeem_* → "Spent on …"; anything
// unknown falls back to a neutral "Adjustment" so a new backend kind never breaks.
function kindLabel(t, kind) {
  const known = new Set([
    'reward_settled', 'redeem_enrolment', 'redeem_subscription', 'redeem_promo',
    'redeem_whatsapp', 'redeem_premium', 'sponsor_shop', 'reversal',
  ]);
  if (known.has(kind)) return t(`credits.kind.${kind}`);
  return t('credits.kind.other');
}

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

export default function CreditsCard() {
  const { t } = useLang();
  const [wallet, setWallet] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Fetch both; tolerate either failing on its own (earnings can 500 without
    // the wallet, and vice versa) — the card shows whatever it did get.
    Promise.allSettled([apiFetch('/api/referral/wallet'), apiFetch('/api/referral/earnings')])
      .then(([w, e]) => {
        if (!alive) return;
        if (w.status === 'fulfilled') setWallet(w.value);
        if (e.status === 'fulfilled') setEarnings(e.value);
        if (w.status !== 'fulfilled' && e.status !== 'fulfilled') {
          setError((w.reason && w.reason.message) || t('credits.loadError'));
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [t]);

  if (loading) return (<div className="card">{t('common.loading')}</div>);
  if (error) return (<div className="card"><h3 style={{ marginTop: 0 }}>{t('credits.title')}</h3><div className="muted">{error}</div></div>);

  const balancePaise = wallet && wallet.balance_paise != null
    ? Number(wallet.balance_paise)
    : (earnings ? Number(earnings.wallet_balance_paise) || 0 : 0);
  const settledPaise = earnings ? Number(earnings.settled_paise) || 0 : 0;
  const accruedPaise = earnings ? Number(earnings.accrued_paise) || 0 : 0;
  const byRole = (earnings && earnings.by_role) || {};
  const ledger = (wallet && Array.isArray(wallet.ledger)) ? wallet.ledger : [];

  const sourceRows = SOURCE_ROLES
    .map((role) => ({ role, amount: Number(byRole[role]) || 0 }))
    .filter((r) => r.amount > 0);

  const isEmpty = balancePaise === 0 && settledPaise === 0 && accruedPaise === 0 && ledger.length === 0;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{t('credits.title')}</h3>

      <label className="muted">{t('credits.balanceLabel')}</label>
      <div><strong style={{ fontSize: 28, color: 'var(--accent)' }}>{rupees(balancePaise)}</strong></div>
      <p className="muted" style={{ marginTop: 4 }}>{t('credits.spendNote')}</p>

      {isEmpty ? (
        <div className="muted" style={{ marginTop: 8 }}>{t('credits.empty')}</div>
      ) : (
        <>
          <div style={{ height: 8 }} />
          <label className="muted">{t('credits.earnedTitle')}</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 20 }}>{rupees(settledPaise)}</strong>
            {accruedPaise > 0 && (
              <span className="muted">{t('credits.pending', { amt: rupees(accruedPaise) })}</span>
            )}
          </div>

          {sourceRows.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label className="muted">{t('credits.bySource')}</label>
              <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                {sourceRows.map((r) => (
                  <li key={r.role}>
                    <span className="muted">{t(`credits.src.${r.role}`)}</span>
                    {' · '}
                    <strong>{rupees(r.amount)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ledger.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label className="muted">{t('credits.recentTitle')}</label>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                <tbody>
                  {ledger.slice(0, 10).map((row, idx) => {
                    const credit = row.direction === 'credit';
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                        <td style={{ padding: '6px 8px' }}>{kindLabel(t, row.kind)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'end', whiteSpace: 'nowrap', color: credit ? 'var(--accent)' : 'var(--muted, #888)' }}>
                          {credit ? '+' : '−'}{rupees(row.amount_paise)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'end', whiteSpace: 'nowrap' }} className="muted">{fmtDate(row.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
