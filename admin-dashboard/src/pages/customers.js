import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import Balance from '../components/Balance';
import ListState from '../components/ListState';
import { apiFetch } from '../lib/api';
import { useListLoad } from '../lib/useListLoad';
import { friendlyError, logForSupport } from '../lib/errorText';
import { money } from '../lib/money';
import { useLang } from '../lib/i18n';

export default function Customers() {
  const router = useRouter();
  const { t, lang } = useLang();
  // Render ledger names in the owner's active language (raw name kept for
  // edit/search); English stays as-is, so only ask for name_local when localized.
  const localized = lang && lang !== 'en';
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', credit_limit: 0 });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // The search box is read at load time but must not re-run the query on every
  // keystroke, so it is held in a ref rather than being a hook dependency.
  const searchRef = useRef(search);
  searchRef.current = search;

  const list = useListLoad(async ({ load }) => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    const qs = `?search=${encodeURIComponent(searchRef.current)}${localized ? `&lang=${encodeURIComponent(lang)}` : ''}`;
    const r = await load(`/api/customers${qs}`);
    setItems(r.items || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, localized]);

  // Write paths keep their own inline banner — a failed "add customer" must not
  // blank the list that loaded fine — but the copy is authored, never err.message.
  function showFailure(err) {
    logForSupport(err, 'customers');
    setError(friendlyError(t, err));
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ ...form, credit_limit: Math.round(Number(form.credit_limit) * 100) }),
      });
      setForm({ name: '', phone: '', credit_limit: 0 });
      await list.reload();
    } catch (err) { showFailure(err); }
  }

  async function toggleNotifications(c) {
    setError('');
    try {
      await apiFetch(`/api/customers/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notifications_enabled: !(c.notifications_enabled !== false) }),
      });
      await list.reload();
    } catch (err) { showFailure(err); }
  }

  async function shareKhata(c) {
    setError('');
    try {
      const r = await apiFetch(`/api/customers/${c.id}/share-link`, { method: 'POST', body: JSON.stringify({ send: true }) });
      window.prompt(r.sent ? t('customers.khataLinkSent') : t('customers.khataLinkCopy'), r.link);
    } catch (err) { showFailure(err); }
  }

  async function remindAll() {
    setError(''); setMsg('');
    if (!window.confirm(t('customers.remindAllConfirm'))) return;
    try {
      const r = await apiFetch('/api/notifications/broadcast', { method: 'POST', body: JSON.stringify({ mode: 'outstanding' }) });
      setMsg(t('customers.remindersSent', { n: r.sent, s: r.sent === 1 ? '' : 's' }));
    } catch (err) { showFailure(err); }
  }

  const open = (c) => router.push(`/customers/${c.id}`);

  const columns = [
    { key: 'name', label: t('common.name'), render: (c) => <strong>{c.name_local || c.name}</strong> },
    { key: 'phone', label: t('common.phone') },
    { key: 'credit_limit', label: t('common.creditLimit'), render: (c) => (Number(c.credit_limit) > 0 ? money(c.credit_limit) : '—') },
    { key: 'balance', label: t('common.balance'), render: (c) => <Balance paise={c.balance} /> },
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
              onKeyDown={(e) => { if (e.key === 'Enter') list.reload(); }} style={{ flex: 1, minWidth: 180 }} />
            <button className="secondary" onClick={() => list.reload()}>{t('common.search')}</button>
            <button onClick={remindAll} title={t('customers.remindAllTitle')}>{t('customers.remindAll')}</button>
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          {/* Loading, failed and genuinely-empty are three different answers.
              Only the third of them may say "No customers yet". */}
          <ListState state={list}>
            <DataTable columns={columns} rows={items} onRowClick={open} empty={t('customers.empty')} />
          </ListState>
        </div>
      </div>
    </div>
  );
}
