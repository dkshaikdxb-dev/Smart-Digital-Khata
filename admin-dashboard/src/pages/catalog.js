import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const emptyForm = { name: '', price: '', unit: '', description: '', image_url: '' };

export default function Catalog() {
  const router = useRouter();
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
      setMsg('Product added.');
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
      setMsg('Product updated.');
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
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
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
    { key: 'name', label: 'Product', render: (p) => <strong>{p.name}</strong> },
    { key: 'price', label: 'Price', render: (p) => fmt(p.price) },
    { key: 'unit', label: 'Unit', render: (p) => p.unit || '—' },
    {
      key: 'is_active', label: 'Status', render: (p) => (
        <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}
          title={p.is_active !== false ? 'Active — tap to hide from customers' : 'Hidden — tap to activate'}>
          {p.is_active !== false ? '✓ Active' : '✕ Hidden'}
        </button>
      ),
    },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (p) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); startEdit(p); }}>Edit</button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); remove(p); }}>Delete</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Catalog</h1>

        <div className="card">
          <h3>Add product</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Price ₹" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            <input placeholder="Unit (kg, pc…)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <button>Add</button>
          </form>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="Image URL (optional)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </div>
        </div>

        {edit && (
          <div className="card">
            <h3>Edit product</h3>
            <form onSubmit={saveEdit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
              <input placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              <input placeholder="Price ₹" type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} required />
              <input placeholder="Unit" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
              <button>Save</button>
            </form>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input placeholder="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              <input placeholder="Image URL" value={edit.image_url} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={filtered} empty="No products yet. Add your first above." />
        </div>
      </div>
    </div>
  );
}
