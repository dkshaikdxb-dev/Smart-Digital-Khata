import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function Families() {
  const router = useRouter();
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', credit_limit: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await apiFetch('/api/families');
    setItems(r.items || r.families || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await apiFetch('/api/families', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          credit_limit: form.credit_limit ? Math.round(Number(form.credit_limit) * 100) : 0,
        }),
      });
      setForm({ name: '', credit_limit: '' });
      await load();
      setMsg(t('fam.created'));
    } catch (err) { setError(err.message); }
  }

  const open = (f) => router.push(`/families/${f.id}`);

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((f) => (f.name || '').toLowerCase().includes(q)) : items;

  const columns = [
    { key: 'name', label: t('fam.family'), render: (f) => <strong>{f.name}</strong> },
    { key: 'member_count', label: t('common.members'), render: (f) => Number(f.member_count || 0) },
    { key: 'combined_balance', label: t('fam.combinedOutstanding'), render: (f) => (
      <span style={{ color: Number(f.combined_balance) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt(f.combined_balance)}</span>
    ) },
    { key: 'credit_limit', label: t('common.limit'), render: (f) => (Number(f.credit_limit) > 0 ? fmt(f.credit_limit) : '—') },
    { key: 'actions', label: t('common.actions'), align: 'right', render: (f) => (
      <span className="row-actions">
        <button className="secondary" onClick={(e) => { e.stopPropagation(); open(f); }}>{t('common.open')}</button>
      </span>
    ) },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.families')}</h1>

        <div className="card">
          <h3>{t('fam.create')}</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10 }}>
            <input placeholder={t('fam.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder={t('fam.creditLimitPlaceholder')} type="number" min="0" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            <button>{t('common.create')}</button>
          </form>
          <div className="muted" style={{ marginTop: 8 }}>{t('fam.addHint')}</div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder={t('fam.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={filtered} onRowClick={open} empty={t('fam.empty')} />
        </div>
      </div>
    </div>
  );
}
