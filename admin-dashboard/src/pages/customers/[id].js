import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import { apiFetch } from '../../lib/api';
import { enqueue, newClientRequestId } from '../../lib/outbox';
import { useLang } from '../../lib/i18n';
import { useSpeech, extractFirstNumber } from '../../lib/useSpeech';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function CustomerDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { sttSupported, ttsSupported, listening, listen, speak } = useSpeech();
  const { id } = router.query;
  const txnLabel = (v) => { const s = t(`txn.${v}`); return s === `txn.${v}` ? v : s; };
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(null);
  const [tx, setTx] = useState({ type: 'purchase', amount: '', note: '' });

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/customers/${id}/ledger`);
    setData(r);
    setEdit({
      name: r.customer.name,
      phone: r.customer.phone,
      credit_limit: (Number(r.customer.credit_limit) / 100).toString(),
    });
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!data) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  const c = data.customer;

  async function recordTx(e) {
    e.preventDefault(); setMsg(''); setError('');
    // Generate the idempotency id up front so the SAME id is used whether the
    // write goes through now or is queued and replayed later.
    const client_request_id = newClientRequestId();
    const body = {
      customer_id: id,
      type: tx.type,
      amount: Math.round(Number(tx.amount) * 100),
      method: tx.type === 'purchase' ? 'credit' : tx.type,
      note: tx.note || null,
      client_request_id,
    };
    try {
      await apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
      setTx({ type: 'purchase', amount: '', note: '' });
      await load();
      setMsg(t('common.saved'));
    } catch (err) {
      // A rejected fetch (offline) carries no status; an HTTP error does. Queue
      // only offline/network failures — a real 4xx (e.g. credit limit) is shown.
      const offline = typeof err.status !== 'number'
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (!offline) { setError(err.message); return; }
      try {
        await enqueue({ url: '/api/transactions', method: 'POST', body, kind: 'transaction', label: c.name });
        // Optimistically reflect the entry so the ledger updates immediately.
        setData((d) => (d ? {
          ...d,
          customer: { ...d.customer, balance: Number(d.customer.balance) + (body.type === 'purchase' ? body.amount : -body.amount) },
          transactions: [{
            id: `pending-${client_request_id}`,
            created_at: new Date().toISOString(),
            type: body.type,
            method: body.method,
            amount: body.amount,
            note: body.note,
            pending: true,
          }, ...d.transactions],
        } : d));
        setTx({ type: 'purchase', amount: '', note: '' });
        setMsg(t('off.savedWillSync'));
      } catch (qerr) { setError(qerr.message); }
    }
  }

  async function saveEdit(e) {
    e.preventDefault(); setMsg(''); setError('');
    try {
      await apiFetch(`/api/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name,
          phone: edit.phone,
          credit_limit: Math.round(Number(edit.credit_limit) * 100),
        }),
      });
      await load();
      setMsg(t('cust.updated'));
    } catch (err) { setError(err.message); }
  }

  async function remind() {
    setMsg(''); setError('');
    try {
      await apiFetch(`/api/notifications/remind/${id}`, { method: 'POST' });
      setMsg(t('cust.reminderSent'));
    } catch (err) { setError(err.message); }
  }

  async function share() {
    setMsg(''); setError('');
    try {
      const r = await apiFetch(`/api/customers/${id}/share-link`, { method: 'POST', body: JSON.stringify({ send: true }) });
      window.prompt(r.sent ? t('customers.khataLinkSent') : t('customers.khataLinkShort'), r.link);
    } catch (err) { setError(err.message); }
  }

  async function downloadStatement() {
    setMsg(''); setError('');
    try {
      const token = window.localStorage.getItem('skhata_token');
      const res = await fetch(`${API}/api/reports/customer/${id}/statement.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `statement-${id}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  }

  async function archive() {
    if (!window.confirm(t('cust.archiveConfirm', { name: c.name }))) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
      router.push('/customers');
    } catch (err) { setError(err.message); }
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/customers')} style={{ marginBottom: 12 }}>← {t('nav.customers')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{c.name}</h2>
            <div className="muted">{c.phone}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">{t('common.outstanding')}</div>
            <div className="kpi" style={{ color: Number(c.balance) > 0 ? 'var(--danger)' : 'var(--accent)' }}>{fmt(c.balance)}</div>
            <div className="muted">{t('common.limit')} {Number(c.credit_limit) > 0 ? fmt(c.credit_limit) : t('common.none')}</div>
            {ttsSupported && (
              <button
                type="button"
                className="secondary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  const rs = Number(c.balance) / 100;
                  const amount = Number.isInteger(rs) ? String(rs) : rs.toFixed(2);
                  speak(t('voice.balanceSay', { name: c.name, amount, rupees: t('voice.rupees') }));
                }}
                aria-label={t('voice.speak')}
                title={t('voice.speak')}
              >
                🔊 {t('voice.speak')}
              </button>
            )}
          </div>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
          <button onClick={remind} disabled={Number(c.balance) <= 0}>{t('cust.sendReminder')}</button>
          <button className="secondary" onClick={share}>{t('cust.shareKhata')}</button>
          <button className="secondary" onClick={downloadStatement}>{t('cust.downloadStatement')}</button>
          <button className="secondary" onClick={archive}>{t('common.archive')}</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>{t('tx.record')}</h3>
        <form onSubmit={recordTx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10 }}>
          <select value={tx.type} onChange={(e) => setTx({ ...tx, type: e.target.value })}>
            <option value="purchase">{t('type.purchase')}</option>
            <option value="cash">{t('type.cashPayment')}</option>
            <option value="upi">{t('type.upiPayment')}</option>
          </select>
          <span style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <input type="number" placeholder={t('common.amountRs')} value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} required style={{ flex: 1, minWidth: 0 }} />
            {sttSupported && (
              <button
                type="button"
                className={`secondary${listening ? ' listening' : ''}`}
                onClick={() => listen((txt) => {
                  const n = extractFirstNumber(txt);
                  if (n != null) setTx((prev) => ({ ...prev, amount: String(n) }));
                })}
                aria-label={t('voice.listen')}
                title={listening ? t('voice.listening') : t('voice.listen')}
              >
                🎤
              </button>
            )}
          </span>
          <input placeholder={t('common.noteOptional')} value={tx.note} onChange={(e) => setTx({ ...tx, note: e.target.value })} />
          <button>{t('common.save')}</button>
        </form>
      </div>

      <div className="card">
        <h3>{t('cust.ledger')}</h3>
        <DataTable
          empty={t('tx.empty')}
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
          rows={data.transactions}
        />
      </div>

      <div className="card">
        <h3>{t('cust.editCustomer')}</h3>
        <form onSubmit={saveEdit} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10 }}>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
          <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required />
          <input type="number" value={edit.credit_limit} onChange={(e) => setEdit({ ...edit, credit_limit: e.target.value })} placeholder={t('cust.limitRs')} />
          <button>{t('common.save')}</button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
