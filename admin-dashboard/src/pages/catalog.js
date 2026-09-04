import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const emptyForm = { name: '', price: '', unit: '', description: '', image_url: '' };

export default function Catalog() {
  const router = useRouter();
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [edit, setEdit] = useState(null); // product being edited (id + fields)
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await apiFetch('/api/products');
    setItems(r.items || r.products || []);
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
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          price: Math.round(Number(form.price) * 100),
          unit: form.unit || null,
          description: form.description || null,
          image_url: form.image_url || null,
        }),
      });
      setForm(emptyForm);
      await load();
      setMsg(t('cat.added'));
    } catch (err) { setError(err.message); }
  }

  function startEdit(p) {
    setError(''); setMsg('');
    setEdit({
      id: p.id,
      name: p.name || '',
      price: (Number(p.price || 0) / 100).toString(),
      unit: p.unit || '',
      description: p.description || '',
      image_url: p.image_url || '',
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/products/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name,
          price: Math.round(Number(edit.price) * 100),
          unit: edit.unit || null,
          description: edit.description || null,
          image_url: edit.image_url || null,
        }),
      });
      setEdit(null);
      await load();
      setMsg(t('cat.updated'));
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(p) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !(p.is_active !== false) }),
      });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function remove(p) {
    if (!window.confirm(t('cat.deleteConfirm', { name: p.name }))) return;
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
      if (edit && edit.id === p.id) setEdit(null);
      await load();
    } catch (err) { setError(err.message); }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.unit || '').toLowerCase().includes(q))
    : items;

  const columns = [
    { key: 'name', label: t('common.product'), render: (p) => <strong>{p.name}</strong> },
    { key: 'price', label: t('common.price'), render: (p) => fmt(p.price) },
    { key: 'unit', label: t('common.unit'), render: (p) => p.unit || '—' },
    {
      key: 'is_active', label: t('common.status'), render: (p) => (
        <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}
          title={p.is_active !== false ? t('cat.activeTitle') : t('cat.hiddenTitle')}>
          {p.is_active !== false ? t('cat.active') : t('cat.hidden')}
        </button>
      ),
    },
    {
      key: 'actions', label: t('common.actions'), align: 'right', render: (p) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); startEdit(p); }}>{t('common.edit')}</button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); remove(p); }}>{t('common.delete')}</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.catalog')}</h1>

        <div className="card">
          <h3>{t('cat.addProduct')}</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
            <input placeholder={t('common.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder={t('cat.priceRs')} type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            <input placeholder={t('cat.unitPlaceholder')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <button>{t('common.add')}</button>
          </form>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <input placeholder={t('cat.descOptional')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder={t('cat.imageOptional')} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </div>
        </div>

        {edit && (
          <div className="card">
            <h3>{t('cat.editProduct')}</h3>
            <form onSubmit={saveEdit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
              <input placeholder={t('common.name')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              <input placeholder={t('cat.priceRs')} type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} required />
              <input placeholder={t('common.unit')} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
              <button>{t('common.save')}</button>
            </form>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input placeholder={t('cat.desc')} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              <input placeholder={t('cat.image')} value={edit.image_url} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder={t('cat.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={filtered} empty={t('cat.empty')} />
        </div>
      </div>
    </div>
  );
}
