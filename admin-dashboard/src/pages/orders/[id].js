import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { nextStatus, stepsForOrder, currentStepIndex } from '../../lib/orderStatus';
import { chipLabel, etaState, formatClock, DEFAULT_CHIPS } from '../../lib/orderEta';
// EDIT THE ORDER WHILE ACCEPTING (batch C). The draft/running-total helpers are
// shared with the consumer PWA's rendering of the same audit rows.
import {
  isEditable, draftFrom, decrement, removeLine, restoreLine, lineTotalFor,
  summarize, linesPayload, newRequestId, editLineText,
} from '../../lib/orderEdit';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');

const statusColor = (s) => {
  if (s === 'completed') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};
const payColor = (s) => {
  if (s === 'paid') return 'var(--accent)';
  if (s === 'failed') return 'var(--danger)';
  return 'var(--muted)';
};

const TERMINAL = ['completed', 'cancelled'];

export default function OrderDetail() {
  const router = useRouter();
  const { t, lang } = useLang();
  // Show the customer name in the owner's active language. English needs no
  // customer_name_local, so only ask when localized.
  const localized = lang && lang !== 'en';
  const enumLabel = (ns, s) => { const v = t(`${ns}.${s}`); return v === `${ns}.${s}` ? label(s) : v; };
  // Action label for advancing to the next stage, e.g. "Start preparing",
  // "Out for delivery", "Mark completed". Falls back to the generic "Mark {s}".
  const advanceLabel = (s) => { const v = t(`ord.advance.${s}`); return v === `ord.advance.${s}` ? t('ord.mark', { s: enumLabel('status', s) }) : v; };
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // ONE-TAP ACCEPT + "need more time" (batch B). The chips come from the
  // platform config; DEFAULT_CHIPS stands in until it lands (and if it never does).
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const [needMore, setNeedMore] = useState(false);
  // EDIT MODE (batch C). `draft` is a purely LOCAL map of order_item_id -> the
  // quantity the owner has tapped down to; nothing is sent until Confirm, so the
  // running total updates instantly on a 2G link. `reqId` is minted ONCE when
  // edit mode opens and reused for every retry of that confirm, so a dropped
  // response can never take the money off twice.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [reqId, setReqId] = useState('');
  const [justEdited, setJustEdited] = useState(false);

  const load = useCallback(async () => {
    const qs = localized ? `?lang=${encodeURIComponent(lang)}` : '';
    const r = await apiFetch(`/api/orders/${id}${qs}`);
    setOrder(r.order || r);
  }, [id, lang, localized]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    if (id) load().catch((e) => setError(e.message));
    // Live ready-time chips. A failure is not worth an error banner — the
    // built-in defaults are perfectly usable and accepting keeps working.
    apiFetch('/api/orders/eta-config')
      .then((r) => { if (Array.isArray(r.chips) && r.chips.length) setChips(r.chips); })
      .catch(() => {});
  }, [id, load, router]);

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!order) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  async function setStatus(status) {
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
      setMsg(t('ord.marked', { s: enumLabel('status', status) }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!window.confirm(t('ord.cancelConfirm'))) return;
    await setStatus('cancelled');
  }

  // ONE TAP: accept AND promise, in a single request. `minutes` null is the
  // honest "accept without a time" for an owner who genuinely cannot say.
  async function accept(minutes) {
    setError(''); setMsg(''); setBusy(true);
    try {
      const body = minutes == null ? { status: 'accepted' } : { status: 'accepted', eta_minutes: minutes };
      await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      setMsg(t('ord.marked', { s: enumLabel('status', 'accepted') }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // ---- EDIT MODE (batch C): reduce an order the shop cannot fully supply ----

  function startEdit() {
    setError(''); setMsg('');
    setDraft(draftFrom(order.items || []));
    setReqId(newRequestId());
    setEditing(true);
  }

  function stopEdit() {
    setEditing(false);
    setDraft({});
    setReqId('');
  }

  // Confirm the reduction. Only the lines that actually MOVED are sent, so a
  // retry after a timeout carries exactly the same body as the first attempt.
  async function confirmEdit() {
    const s = summarize(order.items || [], draft);
    if (!s.changed.length || s.empty) return;
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/orders/${id}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ lines: linesPayload(s.changed), client_request_id: reqId }),
      });
      stopEdit();
      await load();
      setMsg(t('oedit.saved'));
      // "Fix it and accept" is ONE continuous action: after reducing a still-
      // pending order the accept chips below are exactly where the owner's eye
      // already is, and this line says so out loud.
      setJustEdited(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // "NEED MORE TIME" — re-promise an order that is already accepted. Same three
  // chips, a different endpoint, and no second mode for the owner to learn.
  async function pushEta(minutes) {
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/orders/${id}/eta`, { method: 'PATCH', body: JSON.stringify({ eta_minutes: minutes }) });
      setNeedMore(false);
      await load();
      setMsg(t('eta.sent'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const terminal = TERMINAL.includes(order.status);
  const next = nextStatus(order);
  const promiseState = etaState(order);
  const promisedTime = formatClock(order.promised_at, lang);
  const steps = stepsForOrder(order.fulfillment_type);
  const currentIdx = currentStepIndex(order.status, steps);
  const items = order.items || [];
  // EDIT MODE (batch C). `sum` is the LIVE picture of the owner's taps: it
  // recomputes on every render, so the running total moves under the thumb with
  // no round trip. With edit mode closed the draft is empty and `sum` simply
  // describes the order as it stands.
  const editable = isEditable(order) && !terminal;
  const edits = order.edits || [];
  const sum = summarize(items, editing ? draft : {});
  // What the reduction does to the money, said in the owner's own terms BEFORE
  // they confirm. Deliberately phrased as an AMOUNT TAKEN OFF, never as a new
  // grand total: the delivery fee is recomputed server-side by the shop's own
  // free-delivery rule, and quoting a total here that the server might correct
  // would be worse than quoting none.
  function moneyNote(reduction) {
    if (!reduction) return '';
    const amount = fmt(reduction);
    if (order.payment_mode === 'credit') return t('oedit.moneyCredit', { amount });
    if (order.payment_mode === 'prepaid') return t('oedit.moneyPrepaid', { amount });
    return t('oedit.moneyCash', { amount });
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/orders')} style={{ marginBottom: 12 }}>← {t('nav.orders')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{order.customer_name_local || order.customer_name || t('ord.order')}</h2>
            {order.customer_phone && <div className="muted">{order.customer_phone}</div>}
            <div className="muted">{new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi">{fmt(order.subtotal)}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
              <span className="badge">{enumLabel('ful', order.fulfillment_type)}</span>
              <span className="badge">{enumLabel('pmode', order.payment_mode)}</span>
              <span className="badge" style={{ color: payColor(order.payment_status) }}>{enumLabel('pstatus', order.payment_status)}</span>
              <span className="badge" style={{ color: statusColor(order.status) }}>{enumLabel('status', order.status)}</span>
            </div>
          </div>
        </div>

        {!terminal && (
          <div className="ord-stepper" style={{ marginTop: 16 }}>
            {steps.map((s, i) => (
              <span key={s} className={`ord-stepper-node ${i < currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                {enumLabel('status', s)}
              </span>
            ))}
          </div>
        )}

        {/* ONE-TAP ACCEPT (batch B). A pending order shows the three coarse
            chips instead of a bare "Mark accepted": one tap both accepts the
            order and tells the customer when to come. "Accept without a time"
            stays, because an owner who cannot say should not be made to guess. */}
        {order.status === 'pending' && !terminal && (
          <div style={{ marginTop: 16 }}>
            {/* "Fix it and accept" is ONE continuous action (batch C): the
                reduction lands, and the accept chips are right here. */}
            {justEdited && <div className="muted" style={{ marginBottom: 8 }}>{t('oedit.thenAccept')}</div>}
            <div className="muted" style={{ marginBottom: 8 }}>{t('eta.pickTime')}</div>
            <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
              {chips.map((m) => (
                <button key={m} onClick={() => accept(m)} disabled={busy}>{chipLabel(t, m)}</button>
              ))}
              <button className="secondary" onClick={() => accept(null)} disabled={busy}>{t('eta.noTime')}</button>
            </div>
          </div>
        )}

        {/* Once accepted, the promise in words — and the way to move it. */}
        {order.status !== 'pending' && !terminal && (
          <div style={{ marginTop: 16 }}>
            <div className={promiseState === 'late' ? '' : 'muted'} style={promiseState === 'late' ? { color: 'var(--danger)' } : undefined}>
              {promiseState === 'none'
                ? t('eta.noPromise')
                : promiseState === 'late'
                  ? `${t('eta.late')} — ${t('eta.promisedBy', { time: promisedTime })}`
                  : t('eta.promisedBy', { time: promisedTime })}
            </div>
            {!needMore ? (
              <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                <button className="secondary" onClick={() => setNeedMore(true)} disabled={busy}>{t('eta.needMore')}</button>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ marginBottom: 8 }}>{t('eta.needMoreHelp')}</div>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  {chips.map((m) => (
                    <button key={m} onClick={() => pushEta(m)} disabled={busy}>{chipLabel(t, m)}</button>
                  ))}
                  <button className="secondary" onClick={() => setNeedMore(false)} disabled={busy}>{t('eta.notNow')}</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          {next && order.status !== 'pending' && (
            <button onClick={() => setStatus(next)} disabled={busy || terminal}>{advanceLabel(next)}</button>
          )}
          <button className="secondary" onClick={cancel} disabled={busy || terminal}>{t('ord.cancelOrder')}</button>
        </div>
        {terminal && <div className="muted" style={{ marginTop: 10 }}>{t('ord.terminal', { s: enumLabel('status', order.status) })}</div>}
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{editing ? t('oedit.title') : t('common.items')}</h3>
          {/* The way in. Only offered while the order can still be reduced —
              past 'accepted' the goods are being assembled and the API says 409. */}
          {editable && !editing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted">{t('oedit.start')}</span>
              <button className="secondary" onClick={startEdit} disabled={busy}>{t('oedit.startBtn')}</button>
            </div>
          )}
        </div>

        {editing ? (
          <>
            {/* It must be OBVIOUS that only removals are possible. This is the
                first thing in edit mode, before any control. */}
            <div className="muted" style={{ margin: '10px 0 14px' }}>{t('oedit.help')}</div>
            {items.map((it) => {
              const before = Number(it.quantity);
              const after = draft[it.id] != null ? Number(draft[it.id]) : before;
              const gone = after === 0;
              return (
                <div
                  key={it.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 12, flexWrap: 'wrap', padding: '10px 0',
                    borderBottom: '1px solid var(--border, #2a3446)', opacity: gone ? 0.55 : 1,
                  }}
                >
                  <div style={{ flex: '1 1 160px' }}>
                    <strong style={{ textDecoration: gone ? 'line-through' : 'none' }}>{it.name}</strong>
                    <div className="muted">
                      {fmt(it.unit_price)}
                      {gone ? ` — ${t('oedit.removedTag')}` : ` × ${after}`}
                      {after !== before && !gone ? ` (${t('oedit.was', { was: before })})` : ''}
                    </div>
                  </div>
                  <div className="row-actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {/* MINUS and REMOVE only. There is deliberately no plus. */}
                    <button
                      className="secondary"
                      onClick={() => setDraft(decrement(draft, it.id))}
                      disabled={busy || after === 0}
                      aria-label={`${t('oedit.remove')} ${it.name}`}
                    >
                      −
                    </button>
                    {gone ? (
                      <button className="secondary" onClick={() => setDraft(restoreLine(draft, items, it.id))} disabled={busy}>
                        {t('oedit.restore')}
                      </button>
                    ) : (
                      <button className="secondary" onClick={() => setDraft(removeLine(draft, it.id))} disabled={busy}>
                        {t('oedit.remove')}
                      </button>
                    )}
                    <span style={{ minWidth: 84, textAlign: 'right', fontWeight: 700 }}>{fmt(lineTotalFor(it, after))}</span>
                  </div>
                </div>
              );
            })}

            {/* The LIVE running total, and what it means for the money. */}
            <div style={{ marginTop: 14, fontWeight: 700 }}>
              {t('oedit.wasNow', { was: fmt(sum.wasSubtotal), now: fmt(sum.subtotal) })}
            </div>
            {sum.reduction > 0 && (
              <>
                <div className="muted" style={{ marginTop: 6 }}>{t('oedit.reducedBy', { amount: fmt(sum.reduction) })}</div>
                <div className="muted" style={{ marginTop: 4 }}>{moneyNote(sum.reduction)}</div>
                {order.fulfillment_type === 'delivery' && (
                  <div className="muted" style={{ marginTop: 4 }}>{t('oedit.feeMayChange')}</div>
                )}
              </>
            )}
            {sum.empty && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{t('oedit.cancelInstead')}</div>}
            {!sum.changed.length && <div className="muted" style={{ marginTop: 8 }}>{t('oedit.noChange')}</div>}

            <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
              <button onClick={confirmEdit} disabled={busy || !sum.changed.length || sum.empty}>
                {busy ? t('oedit.saving') : t('oedit.confirm')}
              </button>
              <button className="secondary" onClick={stopEdit} disabled={busy}>{t('oedit.keep')}</button>
            </div>
          </>
        ) : (
          <>
            <DataTable
              empty={t('ord.emptyItems')}
              columns={[
                { key: 'name', label: t('ord.item'), render: (it) => <strong>{it.name}</strong> },
                { key: 'unit_price', label: t('ord.unitPrice'), align: 'right', render: (it) => fmt(it.unit_price) },
                { key: 'quantity', label: t('common.qty'), align: 'right', render: (it) => it.quantity },
                { key: 'line_total', label: t('common.total'), align: 'right', render: (it) => fmt(it.line_total) },
              ]}
              rows={items}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontWeight: 700 }}>
              <span style={{ marginRight: 12 }} className="muted">{t('common.subtotal')}</span>
              <span>{fmt(order.subtotal)}</span>
            </div>
            {/* An order that HAS been reduced always shows what it was, so the
                smaller number is never the only thing on the screen. */}
            {order.original_subtotal != null && Number(order.original_subtotal) !== Number(order.subtotal) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }} className="muted">
                <span style={{ marginRight: 12 }}>{t('oedit.originalSubtotal')}</span>
                <span>{fmt(order.original_subtotal)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* THE AUDIT. Once an order has been reduced this card is always here, so
          the change is never silent — who, what and when, line by line. */}
      {edits.length > 0 && (
        <div className="card">
          <h3>{t('oedit.historyTitle')}</h3>
          {edits.map((e) => (
            <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #2a3446)' }}>
              <div>{editLineText(t, e)}</div>
              <div className="muted">
                {t('oedit.historyBy', {
                  who: e.edited_by_name || t('oedit.historyUnknownWho'),
                  when: new Date(e.created_at).toLocaleString(),
                })}
                {' · '}−{fmt(Math.abs(Number(e.amount_delta)))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(order.address || order.note) && (
        <div className="card">
          <h3>{enumLabel('ful', order.fulfillment_type)}</h3>
          {order.address && (<><div className="muted">{t('ord.address')}</div><div style={{ marginBottom: 10 }}>{order.address}</div></>)}
          {order.note && (<><div className="muted">{t('common.note')}</div><div>{order.note}</div></>)}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
