import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function Customers() {
  const router = useRouter();
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', credit_limit: 0 });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}`);
    setItems(r.items);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ ...form, credit_limit: Math.round(Number(form.credit_limit) * 100) }),
      });
      setForm({ name: '', phone: '', credit_limit: 0 });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function toggleNotifications(c) {
    setError('');
    try {
      await apiFetch(`/api/customers/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notifications_enabled: !(c.notifications_enabled !== false) }),
      });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function shareKhata(c) {
    setError('');
    try {
      const r = await apiFetch(`/api/customers/${c.id}/share-link`, { method: 'POST', body: JSON.stringify({ send: true }) });
      window.prompt(r.sent ? t('customers.khataLinkSent') : t('customers.khataLinkCopy'), r.link);
    } catch (err) { setError(err.message); }
  }

  async function remindAll() {
    setError(''); setMsg('');
    if (!window.confirm(t('customers.remindAllConfirm'))) return;
    try {
      const r = await apiFetch('/api/notifications/broadcast', { method: 'POST', body: JSON.stringify({ mode: 'outstanding' }) });
      setMsg(t('customers.remindersSent', { n: r.sent, s: r.sent === 1 ? '' : 's' }));
    } catch (err) { setError(err.message); }
  }

  const open = (c) => router.push(`/customers/${c.id}`);

  const columns = [
    { key: 'name', label: t('common.name'), render: (c) => <strong>{c.name}</strong> },
    { key: 'phone', label: t('common.phone') },
    { key: 'credit_limit', label: t('common.creditLimit'), render: (c) => (Number(c.credit_limit) > 0 ? fmt(c.credit_limit) : '—') },
    { key: 'balance', label: t('common.balance'), render: (c) => <span style={{ color: Number(c.balance) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt(c.balance)}</span> },
    {
      key: 'alerts', label: t('customers.alerts'), render: (c) => (
        <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleNotifications(c); }}
          title={c.notifications_enabled !== false ? t('customers.alertOnTitle') : t('customers.alertOffTitle')}>
          {c.notifications_enabled !== false ? t('customers.alertOn') : t('customers.alertOff')}
        </button>
      ),
    },
    {
      key: 'actions', label: t('common.actions'), align: 'right', render: (c) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); open(c); }}>{t('common.open')}</button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); shareKhata(c); }}>{t('common.share')}</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.customers')}</h1>

        <div className="card">
          <h3>{t('customers.add')}</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10 }}>
            <input placeholder={t('common.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder={t('customers.phonePlaceholder')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            <input placeholder={t('customers.creditLimitPlaceholder')} type="number" min="0" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            <button>{t('common.add')}</button>
          </form>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder={t('customers.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }} style={{ flex: 1, minWidth: 180 }} />
            <button className="secondary" onClick={() => load()}>{t('common.search')}</button>
            <button onClick={remindAll} title={t('customers.remindAllTitle')}>{t('customers.remindAll')}</button>
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={items} onRowClick={open} empty={t('customers.empty')} />
        </div>
      </div>
    </div>
  );
}
