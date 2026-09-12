import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';
import { nextStatus } from '../lib/orderStatus';
import { chipLabel, etaState, formatClock, DEFAULT_CHIPS } from '../lib/orderEta';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

const STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
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

export default function Orders() {
  const router = useRouter();
  const { t, lang } = useLang();
  // Show customer names in the owner's active language. English needs no
  // customer_name_local, so only ask when localized.
  const localized = lang && lang !== 'en';
  const enumLabel = (ns, s) => { const v = t(`${ns}.${s}`); return v === `${ns}.${s}` ? label(s) : v; };
  const advanceLabel = (s) => { const v = t(`ord.advance.${s}`); return v === `ord.advance.${s}` ? t('ord.mark', { s: enumLabel('status', s) }) : v; };
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  // ONE-TAP ACCEPT (batch B). The chips come from the platform config, so an
  // admin can change the vocabulary without shipping this page; DEFAULT_CHIPS
  // stands in until the config lands (and if it never does).
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  // The one pending row whose chips are open. A row at a time: the point is one
  // tap, not a screen full of buttons.
  const [openAccept, setOpenAccept] = useState(null);

  async function load(s) {
    const st = s === undefined ? status : s;
    const parts = [];
    if (st && st !== 'all') parts.push(`status=${encodeURIComponent(st)}`);
    if (localized) parts.push(`lang=${encodeURIComponent(lang)}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    const r = await apiFetch(`/api/orders${qs}`);
    setItems(r.items || r.orders || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    load(status).catch((e) => setError(e.message));
    // Live ready-time chips. A failure here is not worth an error banner: the
    // built-in defaults are perfectly usable, so accepting keeps working.
    apiFetch('/api/orders/eta-config')
      .then((r) => { if (Array.isArray(r.chips) && r.chips.length) setChips(r.chips); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  function pick(s) {
    setStatus(s);
    setError('');
    load(s).catch((e) => setError(e.message));
  }

  const open = (o) => router.push(`/orders/${o.id}`);

  // One-tap advance from the list, without opening the order. Calls the same
  // PATCH /orders/:id/status the backend already validates; reloads on 200.
  async function advance(o, e) {
    if (e) e.stopPropagation();
    const next = nextStatus(o);
    if (!next) return;
    setBusyId(o.id);
    setError('');
    try {
      await apiFetch(`/api/orders/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  }

  // ONE-TAP ACCEPT (batch B). Tapping a chip ACCEPTS the order and makes the
  // ready-time promise in the SAME request — there is no second confirm step and
  // nothing to type. `minutes` null is the honest "accept without a time".
  async function accept(o, minutes, e) {
    if (e) e.stopPropagation();
    setBusyId(o.id);
    setError('');
    try {
      const body = minutes == null ? { status: 'accepted' } : { status: 'accepted', eta_minutes: minutes };
      await apiFetch(`/api/orders/${o.id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      setOpenAccept(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  }

  const columns = [
    { key: 'created_at', label: t('common.when'), render: (o) => new Date(o.created_at).toLocaleString() },
    { key: 'customer', label: t('common.customer'), render: (o) => (
      <><strong>{o.customer_name_local || o.customer_name || '—'}</strong>{o.customer_phone ? <div className="muted">{o.customer_phone}</div> : null}</>
    ) },
    { key: 'fulfillment_type', label: t('ord.fulfillment'), render: (o) => <span className="badge">{enumLabel('ful', o.fulfillment_type)}</span> },
    { key: 'payment_mode', label: t('ord.payment'), render: (o) => (
      <><span className="badge">{enumLabel('pmode', o.payment_mode)}</span>{' '}
        <span className="badge" style={{ color: payColor(o.payment_status) }}>{enumLabel('pstatus', o.payment_status)}</span></>
    ) },
    { key: 'subtotal', label: t('common.total'), align: 'right', render: (o) => fmt(o.subtotal) },
    { key: 'status', label: t('common.status'), render: (o) => {
      // The promise the owner made, right next to the status it belongs to. A
      // passed promise is flagged for the OWNER (they can still fix it with
      // "Need more time"); the customer is shown a far gentler line.
      const state = etaState(o);
      return (
        <>
          <span className="badge" style={{ color: statusColor(o.status) }}>{enumLabel('status', o.status)}</span>
          {state === 'promised' && (
            <div className="muted" style={{ marginTop: 4 }}>{t('eta.readyBy', { time: formatClock(o.promised_at, lang) })}</div>
          )}
          {state === 'late' && (
            <div style={{ marginTop: 4, color: 'var(--danger)' }}>{t('eta.late')}</div>
          )}
        </>
      );
    } },
    { key: 'advance', label: t('ord.advanceCol'), render: (o) => {
      // A PENDING order gets the accept control, not the generic "advance"
      // button: accepting is the one decision that carries a promise with it.
      if (o.status === 'pending') {
        if (openAccept !== o.id) {
          return (
            <button style={{ padding: '4px 10px', fontSize: 13 }} disabled={busyId === o.id}
              onClick={(e) => { e.stopPropagation(); setOpenAccept(o.id); }}>
              {t('eta.accept')}
            </button>
          );
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="muted" style={{ marginBottom: 6 }}>{t('eta.pickTime')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.map((m) => (
                <button key={m} style={{ padding: '6px 12px', fontSize: 13 }} disabled={busyId === o.id}
                  onClick={(e) => accept(o, m, e)}>
                  {chipLabel(t, m)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busyId === o.id}
                onClick={(e) => accept(o, null, e)}>
                {t('eta.noTime')}
              </button>
              <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={(e) => { e.stopPropagation(); setOpenAccept(null); }}>
                {t('eta.notNow')}
              </button>
            </div>
          </div>
        );
      }
      const next = nextStatus(o);
      if (!next) return <span className="muted">—</span>;
      return (
        <button className="secondary" style={{ padding: '4px 10px', fontSize: 13 }} disabled={busyId === o.id} onClick={(e) => advance(o, e)}>
          {advanceLabel(next)}
        </button>
      );
    } },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.orders')}</h1>

        <div className="card">
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button className={status === 'all' ? '' : 'secondary'} onClick={() => pick('all')}>{t('status.all')}</button>
            {STATUSES.map((s) => (
              <button key={s} className={status === s ? '' : 'secondary'} onClick={() => pick(s)}>{enumLabel('status', s)}</button>
            ))}
          </div>
          {error && <div style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
        </div>

        <div className="card">
          <DataTable columns={columns} rows={items} onRowClick={open} empty={t('ord.empty')} />
        </div>
      </div>
    </div>
  );
}
