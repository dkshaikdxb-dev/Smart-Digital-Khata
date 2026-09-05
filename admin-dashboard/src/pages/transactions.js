import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { enqueue, newClientRequestId } from '../lib/outbox';
import { useLang } from '../lib/i18n';

export default function Transactions() {
  const router = useRouter();
  const { t } = useLang();
  const txnLabel = (v) => { const s = t(`txn.${v}`); return s === `txn.${v}` ? v : s; };
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customer_id: '', type: 'purchase', amount: '', note: '' });
  const [request, setRequest] = useState({ customer_id: '', amount: '', note: '' });
  const [filter, setFilter] = useState({ customer_id: '', type: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  async function load() {
    const qs = new URLSearchParams();
    if (filter.customer_id) qs.set('customer_id', filter.customer_id);
    if (filter.type) qs.set('type', filter.type);
    const [tx, c] = await Promise.all([
      apiFetch(`/api/transactions?${qs.toString()}`),
      apiFetch('/api/customers'),
    ]);
    setItems(tx.items);
    setCustomers(c.items);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError(''); setSavedMsg('');
    // Stable idempotency id, reused whether sent now or queued for later replay.
    const client_request_id = newClientRequestId();
    const body = {
      customer_id: form.customer_id,
      type: form.type,
      amount: Math.round(Number(form.amount) * 100),
      method: form.type === 'purchase' ? 'credit' : form.type,
      note: form.note || null,
      client_request_id,
    };
    try {
      await apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
      setForm({ customer_id: form.customer_id, type: 'purchase', amount: '', note: '' });
      await load();
    } catch (err) {
      // Queue only offline/network failures; a real HTTP error (4xx) is shown.
      const offline = typeof err.status !== 'number'
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (!offline) { setError(err.message); return; }
      try {
        await enqueue({ url: '/api/transactions', method: 'POST', body, kind: 'transaction' });
        // Optimistically prepend the entry to the visible history.
        setItems((prev) => [{
          id: `pending-${client_request_id}`,
          created_at: new Date().toISOString(),
          type: body.type,
          method: body.method,
          amount: body.amount,
          note: body.note,
          pending: true,
        }, ...prev]);
        setForm({ customer_id: form.customer_id, type: 'purchase', amount: '', note: '' });
        setSavedMsg(t('off.savedWillSync'));
      } catch (qerr) { setError(qerr.message); }
    }
  }

  async function requestPayment(e) {
    e.preventDefault();
    setError(''); setInfo('');
    try {
      const order = await apiFetch('/api/payments/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: request.customer_id,
          amount: Math.round(Number(request.amount) * 100),
          note: request.note || null,
        }),
      });
      const shared = await apiFetch(`/api/payments/orders/${order.order.id}/share`, { method: 'POST' });
      setInfo(t('tx.paymentLinkSent', { link: shared.link }));
      setRequest({ customer_id: request.customer_id, amount: '', note: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.transactions')}</h1>

        <div className="card">
          <h3>{t('tx.record')}</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 10 }}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
              <option value="">{t('tx.selectCustomer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="purchase">{t('type.purchase')}</option>
              <option value="cash">{t('type.cashPayment')}</option>
              <option value="upi">{t('type.upiPayment')}</option>
            </select>
            <input type="number" placeholder={t('common.amountRs')} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <input placeholder={t('common.noteOptional')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button>{t('common.save')}</button>
          </form>
          {savedMsg && <div className="muted" style={{ marginTop: 8 }}>{savedMsg}</div>}
        </div>

        <div className="card">
          <h3>{t('tx.requestPayment')}</h3>
          <p className="muted">{t('tx.requestPaymentDesc')}</p>
          <form onSubmit={requestPayment} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 10 }}>
            <select value={request.customer_id} onChange={(e) => setRequest({ ...request, customer_id: e.target.value })} required>
              <option value="">{t('tx.selectCustomer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
            <input type="number" placeholder={t('common.amountRs')} value={request.amount} onChange={(e) => setRequest({ ...request, amount: e.target.value })} required />
            <input placeholder={t('tx.notePlaceholderJuly')} value={request.note} onChange={(e) => setRequest({ ...request, note: e.target.value })} />
            <button>{t('tx.sendLink')}</button>
          </form>
          {info && <div className="muted" style={{ marginTop: 8 }}>{info}</div>}
          {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </div>

        <div className="card">
          <h3>{t('tx.history')}</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={filter.customer_id} onChange={(e) => setFilter({ ...filter, customer_id: e.target.value })} style={{ flex: 1, minWidth: 160 }}>
              <option value="">{t('filter.allCustomers')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t('filter.allTypes')}</option>
              <option value="purchase">{t('type.purchase')}</option>
              <option value="cash">{t('type.cash')}</option>
              <option value="upi">{t('type.upi')}</option>
            </select>
            <button className="secondary" onClick={() => load()}>{t('common.apply')}</button>
          </div>
          <DataTable
            empty={t('tx.historyEmpty')}
            columns={[
              { key: 'created_at', label: t('common.when'), render: (row) => new Date(row.created_at).toLocaleString() },
              { key: 'type', label: t('common.type'), render: (row) => <span className="badge">{txnLabel(row.type)}</span> },
              { key: 'method', label: t('common.method'), render: (row) => txnLabel(row.method) },
              { key: 'amount', label: t('common.amount'), align: 'right', render: (row) => (
                <span style={{ color: row.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                  {row.type === 'purchase' ? '+' : '−'}{fmt(row.amount)}
                </span>
              ) },
              { key: 'note', label: t('common.note'), render: (row) => row.note || '' },
            ]}
            rows={items}
          />
        </div>
      </div>
    </div>
  );
}
