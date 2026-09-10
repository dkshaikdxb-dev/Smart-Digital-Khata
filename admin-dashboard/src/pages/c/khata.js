import { useEffect, useState } from 'react';
import CustomerShell, { useCustomerGuard } from '../../components/CustomerShell';
import DataSaverToggle from '../../components/DataSaverToggle';
import { customerFetch } from '../../lib/customerApi';
import { useLang } from '../../lib/i18n';
import { useSpeech } from '../../lib/useSpeech';

// Indian-grouped rupee from integer paise (spec: Intl.NumberFormat('en-IN')).
// A whole-rupee advance/due reads without paise; otherwise 2 decimals.
const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
function inr(paise) {
  const rs = Number(paise || 0) / 100;
  return `₹${INR.format(rs)}`;
}

// My khata: cross-shop balances with a per-shop pay control. Positive balance =
// the customer owes the shop; NEGATIVE = the shop owes the customer = an ADVANCE
// (a single-merchant pre-pay, batch WALLET1) shown as a credit, never a debt.
// When pre-pay is enabled the customer can enter an amount ABOVE the due to
// pre-load an advance; the extra settles to THIS shop's own Razorpay.
export default function Khata() {
  const ready = useCustomerGuard();
  const { t } = useLang();
  const { ttsSupported, speak } = useSpeech();

  function sayBalance(s) {
    const rs = Number(s.balance) / 100;
    const amount = Number.isInteger(rs) ? String(rs) : rs.toFixed(2);
    speak(t('voice.balanceSay', { name: s.shop_name, amount, rupees: t('voice.rupees') }));
  }
  const [total, setTotal] = useState(0);
  const [shops, setShops] = useState([]);
  const [prepay, setPrepay] = useState({ enabled: false, max_advance_paise: 0 });
  const [amounts, setAmounts] = useState({}); // shop_id -> entered rupee string
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState('');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await customerFetch('/api/my/khata');
        setTotal(Number(r.total_outstanding || 0));
        setShops(r.shops || []);
        if (r.prepay) setPrepay({ enabled: !!r.prepay.enabled, max_advance_paise: Number(r.prepay.max_advance_paise || 0) });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  // The largest amount (paise) the customer may pay a shop right now: clear the due
  // (floored at 0) plus the advance cap. Mirrors the backend pay-guard.
  function maxPayable(s) {
    const due = Math.max(Number(s.balance), 0);
    return prepay.enabled ? due + prepay.max_advance_paise : due;
  }

  // Paise the customer intends to pay: the entered rupee amount when pre-pay is on
  // and a value is typed, else the plain outstanding due.
  function amountPaise(s) {
    const due = Math.max(Number(s.balance), 0);
    if (!prepay.enabled) return due;
    const raw = amounts[s.shop_id];
    if (raw == null || raw === '') return due;
    const paise = Math.round(Number(raw) * 100);
    return Number.isFinite(paise) && paise > 0 ? paise : 0;
  }

  async function pay(shop) {
    setError('');
    const amount = amountPaise(shop);
    if (!(amount > 0)) { setError(t('c.enterAmount')); return; }
    if (amount > maxPayable(shop)) { setError(t('c.prepayTooMuch', { amt: inr(maxPayable(shop)) })); return; }
    setPaying(shop.shop_id);
    try {
      const r = await customerFetch('/api/my/pay', {
        method: 'POST',
        body: JSON.stringify({ shop_id: shop.shop_id, amount }),
      });
      const link = r.link || r.pay_link;
      if (link) {
        window.location.href = link;
        return;
      }
      throw new Error(t('c.payStartFailed'));
    } catch (err) {
      setError(err.message);
      setPaying('');
    }
  }

  if (!ready) return null;

  return (
    <CustomerShell title={t('c.myKhata')}>
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingKhata')}</div>}

      {!loading && !error && (
        <div className="card cpwa-hero">
          <div className="muted">{t('common.totalOutstanding')}</div>
          <div className="kpi" style={{ color: total > 0 ? 'var(--danger)' : 'var(--accent)' }}>{inr(total)}</div>
        </div>
      )}

      {!loading && !error && shops.length === 0 && (
        <div className="card muted">{t('c.noKhata')}</div>
      )}

      {shops.map((s) => {
        const bal = Number(s.balance);
        const owes = bal > 0;
        const inAdvance = bal < 0;
        // Balance line reads by MEANING: an advance is a credit, never a "-₹" debt.
        const balanceLine = inAdvance
          ? t('c.advanceLabel', { amt: inr(-bal) })
          : owes
            ? t('c.youOwe', { amt: inr(bal) })
            : t('c.settledLabel');
        const amount = amountPaise(s);
        // Extra beyond the due (floored at 0) becomes an advance.
        const advanceAdd = Math.max(amount - Math.max(bal, 0), 0);
        return (
          <div key={s.shop_id} className="card">
            <div className="cpwa-row-between">
              <div>
                <div className="cpwa-shopcard-name">{s.shop_name}</div>
                <div className="muted" style={inAdvance ? { color: 'var(--accent)' } : undefined}>
                  {balanceLine}
                  {s.credit_limit != null && Number(s.credit_limit) > 0 ? t('c.limitSuffix', { amt: inr(s.credit_limit) }) : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {ttsSupported && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => sayBalance(s)}
                    aria-label={t('voice.speak')}
                    title={t('voice.speak')}
                  >
                    🔊
                  </button>
                )}
                {!prepay.enabled && (
                  <button type="button" onClick={() => pay(s)} disabled={!owes || paying === s.shop_id}>
                    {paying === s.shop_id ? t('c.opening') : t('c.pay')}
                  </button>
                )}
              </div>
            </div>

            {prepay.enabled && (
              // Add money / Pre-pay: enter any amount up to the due + advance cap.
              // The extra beyond the due pre-loads an advance at THIS shop.
              <div className="cpwa-prepay" style={{ marginTop: 10 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>
                  {t('c.addMoney')}
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="decimal"
                    aria-label={t('c.addMoney')}
                    placeholder={owes ? String(Math.round(Math.max(bal, 0) / 100)) : ''}
                    value={amounts[s.shop_id] ?? ''}
                    onChange={(e) => setAmounts((m) => ({ ...m, [s.shop_id]: e.target.value }))}
                    style={{ flex: '1 1 120px', minWidth: 100 }}
                  />
                  <button type="button" onClick={() => pay(s)} disabled={!(amount > 0) || paying === s.shop_id}>
                    {paying === s.shop_id ? t('c.opening') : t('c.pay')}
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {owes && advanceAdd > 0
                    ? t('c.prepayHelper', { due: inr(Math.max(bal, 0)) })
                    : advanceAdd > 0
                      ? t('c.prepayHelperNoDue', { amt: inr(advanceAdd) })
                      : t('c.prepayMaxHint', { amt: inr(prepay.max_advance_paise) })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!loading && (
        <div className="card">
          <DataSaverToggle variant="cpwa" />
        </div>
      )}
    </CustomerShell>
  );
}
