import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerShell, { money, useCustomerGuard } from '../../../components/CustomerShell';
import { customerFetch } from '../../../lib/customerApi';
import { useLang } from '../../../lib/i18n';
import { stepsForOrder, currentStepIndex } from '../../../lib/orderStatus';
import { etaState, formatClock } from '../../../lib/orderEta';
// The shop's reduction, rendered from the SAME audit rows the owner sees
// (batch C) — the customer must never just find a smaller number.
import { editLineText } from '../../../lib/orderEdit';

const LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function OrderDetail() {
  const guardReady = useCustomerGuard();
  const { t, lang } = useLang();
  const ostatusLabel = (s) => { const v = t(`ostatus.${s}`); return v === `ostatus.${s}` ? (LABELS[s] || s) : v; };
  const fulLabel = (s) => { const v = t(`ful.${s}`); return v === `ful.${s}` ? s : v; };
  const pstatusLabel = (s) => { const v = t(`pstatus.${s}`); return v === `pstatus.${s}` ? s : v; };
  // Customer-friendly payment line: Paid / Pay online / Cash on pickup|delivery / On khata.
  const payLabel = (o) => {
    if (!o) return '';
    if (o.payment_status === 'paid') return t('pay.paid');
    if (o.payment_mode === 'prepaid') return t('pay.payOnline');
    if (o.payment_mode === 'cash') return o.fulfillment_type === 'delivery' ? t('pay.cashOnDelivery') : t('pay.cashOnPickup');
    if (o.payment_mode === 'credit') return t('pay.onKhata');
    return pstatusLabel(o.payment_status);
  };
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    try {
      const r = await customerFetch(`/api/my/orders/${id}`);
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!guardReady || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardReady, id]);

  async function cancelOrder() {
    if (!window.confirm(t('ord.cancelConfirm'))) return;
    setCancelling(true);
    setError('');
    try {
      const r = await customerFetch(`/api/my/orders/${id}/cancel`, { method: 'POST' });
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (!guardReady) return null;

  const cancellable = order && order.status === 'pending';
  const isCancelled = order && order.status === 'cancelled';
  // Pickup orders omit out_for_delivery; delivery orders include it. Reached
  // stages are derived by rank from the current status (no per-status timestamps).
  const steps = order ? stepsForOrder(order.fulfillment_type) : [];
  const currentIdx = order ? currentStepIndex(order.status, steps) : -1;
  // The shop's ready-time promise (batch B), derived from promised_at against
  // this device's own clock — the API never computes "late" for us.
  const promiseState = order ? etaState(order) : 'none';
  const promisedTime = order ? formatClock(order.promised_at, lang) : '';
  // THE SHOP REDUCED THIS ORDER (batch C). `edits` is the line-by-line audit;
  // `original_subtotal` is what the order started at, so "was X, now Y" is
  // always available and the smaller number is never unexplained.
  const edits = (order && order.edits) || [];
  const nowTotal = order ? Number(order.total != null ? order.total : order.subtotal) : 0;
  // The exact value of goods taken off, straight from the audit rows.
  const goodsRemoved = edits.reduce((s, e) => s + Math.abs(Number(e.amount_delta)), 0);
  // The exact paise the khata moved by, from the API (0 for a cash order).
  const adjusted = order ? Number(order.adjusted_total || 0) : 0;

  // What happened to the money, in the customer's own terms. Prepaid says
  // plainly that the difference is CREDIT AT THE SHOP — there is no refund
  // pipeline, and pretending otherwise would leave someone waiting for money
  // that is never coming. Every figure here is an EXACT one the API sent, never
  // a total this page derived and might get wrong.
  function editMoneyText(o) {
    if (!o) return '';
    if (o.payment_mode === 'credit' && adjusted > 0) return t('coedit.credit', { amount: money(adjusted) });
    if (o.payment_mode === 'prepaid' && adjusted > 0) return t('coedit.prepaid', { amount: money(adjusted) });
    if (o.payment_mode === 'cash' && goodsRemoved > 0) return t('coedit.cash', { now: money(nowTotal), amount: money(goodsRemoved) });
    return '';
  }

  return (
    <CustomerShell title={t('ord.order')} back="/c/orders">
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingOrder')}</div>}

      {order && (
        <>
          <div className="card">
            <div className="cpwa-row-between">
              <strong>{order.shop_name || t('c.shop')}</strong>
              <span className={`badge ${isCancelled ? 'cpwa-badge-danger' : order.status === 'completed' ? 'cpwa-badge-ok' : 'cpwa-badge-warn'}`}>
                {ostatusLabel(order.status)}
              </span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>{new Date(order.created_at).toLocaleString()}</div>
            <div className="cpwa-shopcard-meta" style={{ marginTop: 8 }}>
              <span className="badge">{fulLabel(order.fulfillment_type)}</span>
              <span className="badge">{order.payment_mode === 'prepaid' ? t('c.prepaid') : t('c.credit')}</span>
              <span className={`badge ${order.payment_status === 'paid' ? 'cpwa-badge-ok' : ''}`}>{t('c.paymentColon')} {payLabel(order)}</span>
            </div>
            {/* The promise, first thing a shopper looks for. A passed promise is
                deliberately gentle — "taking a little longer", with the time it
                was expected by, rather than an alarming "late". */}
            {promiseState === 'promised' && (
              <div className="cpwa-eta cpwa-eta-big">{t('eta.readyBy', { time: promisedTime })}</div>
            )}
            {promiseState === 'late' && (
              <div className="cpwa-eta cpwa-eta-big cpwa-eta-soft">
                {t('eta.takingLonger')}
                <div className="muted" style={{ fontWeight: 400, marginTop: 2 }}>{t('eta.takingLongerHelp', { time: promisedTime })}</div>
              </div>
            )}
            {/* THE SHOP REDUCED THIS ORDER (batch C). Put high, right under the
                status — a customer scanning the screen must meet the
                explanation before they meet the smaller number further down. */}
            {edits.length > 0 && (
              <div className="cpwa-eta cpwa-eta-soft" style={{ marginTop: 12 }}>
                <div>{t('coedit.title')}</div>
                <div className="muted" style={{ fontWeight: 400, marginTop: 4 }}>
                  {t('coedit.intro', { shop: order.shop_name || t('c.shop') })}
                </div>
                <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, fontWeight: 400 }}>
                  {edits.map((e) => (
                    <li key={e.id} className="muted">
                      {editLineText(t, e, { removed: 'coedit.removed', reduced: 'coedit.reduced' })}
                    </li>
                  ))}
                </ul>
                {/* Every figure here is one the API actually STORED: the items
                    total the order started at, and the total it comes to now.
                    No old grand total is invented by adding today's delivery fee
                    onto yesterday's subtotal snapshot — the delivery fee has its
                    own line in the totals card below, where it changed. */}
                {order.original_subtotal != null && (
                  <div className="muted" style={{ fontWeight: 400, marginTop: 6 }}>
                    {t('coedit.wasSubtotal', { was: money(order.original_subtotal) })}
                  </div>
                )}
                <div className="muted" style={{ fontWeight: 400, marginTop: 2 }}>
                  {t('coedit.nowTotal', { now: money(nowTotal) })}
                </div>
                {editMoneyText(order) && (
                  <div className="muted" style={{ fontWeight: 400, marginTop: 4 }}>{editMoneyText(order)}</div>
                )}
              </div>
            )}
            {order.address && <div className="muted" style={{ marginTop: 8 }}>{t('c.deliverTo')} {order.address}</div>}
            {order.note && <div className="muted" style={{ marginTop: 4 }}>{t('c.noteColon')} {order.note}</div>}
          </div>

          <div className="card">
            <div className="cpwa-label">{t('common.status')}</div>
            {isCancelled ? (
              <div className="cpwa-timeline">
                <div className="cpwa-tl-step done cancelled">
                  <span className="cpwa-tl-dot" />
                  <span>{ostatusLabel('cancelled')}</span>
                </div>
                <div className="muted" style={{ marginTop: 8 }}>{t('ostatus.cancelledNote')}</div>
              </div>
            ) : (
              <div className="cpwa-timeline">
                {steps.map((s, i) => (
                  <div key={s} className={`cpwa-tl-step ${i <= currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                    <span className="cpwa-tl-dot" />
                    <span>{ostatusLabel(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="cpwa-label">{t('common.items')}</div>
            {(order.items || []).map((it) => (
              <div key={it.id || it.product_id} className="cpwa-cart-line">
                <div className="cpwa-cart-line-info">
                  <div>{it.name}</div>
                  <div className="muted">{money(it.unit_price)} × {it.quantity}</div>
                </div>
                <div className="cpwa-cart-line-total">{money(it.line_total != null ? it.line_total : it.unit_price * it.quantity)}</div>
              </div>
            ))}
            <div className="cpwa-row-between cpwa-subtotal">
              <span>{t('common.subtotal')}</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {order.delivery_fee != null && order.fulfillment_type === 'delivery' && (
              <div className="cpwa-row-between" style={{ marginTop: 8 }}>
                <span>{t('c.deliveryFee')}</span>
                <span>{Number(order.delivery_fee) === 0 ? t('c.freeDelivery') : money(order.delivery_fee)}</span>
              </div>
            )}
            <div className="cpwa-row-between cpwa-total">
              <strong>{t('c.total')}</strong>
              <strong>{money(order.total != null ? order.total : order.subtotal)}</strong>
            </div>
          </div>

          {cancellable && (
            <button type="button" className="cpwa-btn-danger" onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? t('c.cancelling') : t('ord.cancelOrder')}
            </button>
          )}
        </>
      )}
    </CustomerShell>
  );
}
