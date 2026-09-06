import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import DistNav from '../../../components/DistNav';
import { apiFetch } from '../../../lib/api';
import { useLang } from '../../../lib/i18n';
import { PO_PIPELINE, PO_TERMINAL, poStepIndex, poNextStatus, poCanCancel } from '../../../lib/orderStatus';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
// Paise → an editable rupee string (0 renders as empty so the field starts blank).
const rupeeStr = (p) => (Number(p) > 0 ? String(Number(p) / 100) : '');
// A rupee string → integer paise.
const toPaise = (rupee) => Math.round(Number(rupee) * 100);

function guard(router) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return false; }
  const role = window.localStorage.getItem('skhata_role');
  if (role === 'admin') { router.replace('/admin'); return false; }
  if (role !== 'distributor') { router.replace('/dashboard'); return false; }
  return true;
}

export default function DistributorOrderDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [prices, setPrices] = useState({}); // { [itemId]: rupees string }
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/distributor/orders/${id}`);
    const o = r.order || r;
    setOrder(o);
    const draft = {};
    (o.items || []).forEach((it) => { draft[it.id] = rupeeStr(it.unit_price_paise); });
    setPrices(draft);
  }, [id]);

  useEffect(() => {
    if (!guard(router)) return;
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  const items = (order && order.items) || [];
  const editable = order && (order.status === 'placed' || order.status === 'confirmed');

  // Live subtotal preview from the current price drafts (integer paise).
  const liveSubtotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const raw = prices[it.id];
      const paise = raw != null && raw !== '' ? toPaise(raw) : Number(it.unit_price_paise || 0);
      return sum + (Number.isFinite(paise) ? paise * Number(it.qty) : 0);
    }, 0);
  }, [items, prices]);

  function itemPatch() {
    // Every item that has a numeric price draft → { id, unit_price_paise }.
    return items
      .map((it) => {
        const raw = prices[it.id];
        if (raw == null || raw === '') return null;
        const paise = toPaise(raw);
        if (!Number.isFinite(paise) || paise < 0) return null;
        return { id: it.id, unit_price_paise: paise };
      })
      .filter(Boolean);
  }

  function allPriced() {
    return items.length > 0 && items.every((it) => {
      const raw = prices[it.id];
      return raw != null && raw !== '' && Number.isFinite(toPaise(raw)) && toPaise(raw) > 0;
    });
  }

  async function patch(body, successMsg) {
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/distributor/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      if (successMsg) setMsg(successMsg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePrices() {
    const patchItems = itemPatch();
    if (patchItems.length === 0) { setError(t('dist.priceFirst')); return; }
    await patch({ items: patchItems }, t('dist.pricesSaved'));
  }

  async function confirm() {
    if (!allPriced()) { setError(t('dist.priceFirst')); return; }
    await patch({ status: 'confirmed', items: itemPatch() }, t('dist.confirmed'));
  }

  async function dispatch() {
    await patch({ status: 'dispatched' }, t('dist.dispatched'));
  }

  async function deliver() {
    await patch({ status: 'delivered' }, t('dist.delivered'));
  }

  async function cancel() {
    if (!window.confirm(t('dist.cancelConfirm'))) return;
    await patch({ status: 'cancelled' });
  }

  if (error && !order) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!order) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  const cancelled = order.status === 'cancelled';
  const currentIdx = poStepIndex(order.status);
  const next = poNextStatus(order.status);

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/distributor')} style={{ marginBottom: 12 }}>← {t('dist.orderBack')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{order.shop_name}</h2>
            <div className="muted">{t('dist.shop')}</div>
            <div className="muted">{new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi">{fmt(editable ? liveSubtotal : order.subtotal_paise)}</div>
            <span className="badge" style={{ color: cancelled ? 'var(--danger)' : (order.status === 'delivered' ? 'var(--accent)' : 'var(--text)') }}>
              {t(`postatus.${order.status}`)}
            </span>
          </div>
        </div>

        {!cancelled && (
          <div className="ord-stepper" style={{ marginTop: 16 }}>
            {PO_PIPELINE.map((s, i) => (
              <span key={s} className={`ord-stepper-node ${i < currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                {t(`postatus.${s}`)}
              </span>
            ))}
          </div>
        )}

        {order.note && <div style={{ marginTop: 12 }}><span className="muted">{t('common.note')}: </span>{order.note}</div>}

        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          {editable && <button className="secondary" onClick={savePrices} disabled={busy}>{t('dist.savePrices')}</button>}
          {next === 'confirmed' && <button onClick={confirm} disabled={busy}>{t('dist.confirm')}</button>}
          {next === 'dispatched' && <button onClick={dispatch} disabled={busy}>{t('dist.dispatch')}</button>}
          {next === 'delivered' && <button onClick={deliver} disabled={busy}>{t('dist.deliver')}</button>}
          {poCanCancel(order.status) && <button className="secondary" onClick={cancel} disabled={busy}>{t('dist.cancel')}</button>}
        </div>
        {next === 'delivered' && <div className="muted" style={{ marginTop: 10 }}>{t('dist.deliverHint')}</div>}
        {PO_TERMINAL.has(order.status) && <div className="muted" style={{ marginTop: 10 }}>{t('dist.terminal', { s: t(`postatus.${order.status}`) })}</div>}
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>{t('dist.setPrices')}</h3>
        {editable && <p className="muted" style={{ marginTop: 0 }}>{t('dist.pricesHint')}</p>}
        <table>
          <thead>
            <tr>
              <th>{t('sup.itemName')}</th>
              <th style={{ textAlign: 'right' }}>{t('sup.qty')}</th>
              <th style={{ textAlign: 'right' }}>{t('dist.unitPriceRs')}</th>
              <th style={{ textAlign: 'right' }}>{t('dist.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const raw = prices[it.id];
              const paise = raw != null && raw !== '' ? toPaise(raw) : Number(it.unit_price_paise || 0);
              const lineTotal = Number.isFinite(paise) ? paise * Number(it.qty) : 0;
              return (
                <tr key={it.id}>
                  <td>
                    <strong>{it.name}</strong>
                    {[it.brand, it.pack, it.unit].filter(Boolean).length ? <div className="muted">{[it.brand, it.pack, it.unit].filter(Boolean).join(' · ')}</div> : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>{it.qty}</td>
                  <td style={{ textAlign: 'right' }}>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={{ width: 110, textAlign: 'right', display: 'inline-block' }}
                        aria-label={`${t('dist.unitPriceRs')} — ${it.name}`}
                        value={raw != null ? raw : ''}
                        onChange={(e) => setPrices((d) => ({ ...d, [it.id]: e.target.value }))}
                      />
                    ) : (
                      Number(it.unit_price_paise) > 0 ? fmt(it.unit_price_paise) : '—'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{lineTotal > 0 ? fmt(lineTotal) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontWeight: 700 }}>
          <span style={{ marginRight: 12 }} className="muted">{t('common.subtotal')}</span>
          <span>{fmt(editable ? liveSubtotal : order.subtotal_paise)}</span>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><DistNav /><div className="container">{children}</div></div>);
}
