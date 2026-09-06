import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Staff() {
  const router = useRouter();
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '', email: '' });
  const [error, setError] = useState('');

  async function load() {
    const r = await apiFetch('/api/staff');
    setItems(r.items || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    const role = window.localStorage.getItem('skhata_role');
    if (role === 'admin') { router.replace('/admin'); return; }
    if (role === 'distributor') { router.replace('/distributor'); return; }
    // Owner-only: staff (and any non-owner) cannot manage staff.
    if (role !== 'owner') { router.replace('/dashboard'); return; }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    if ((form.password || '').length < 6) { setError(t('staff.password')); return; }
    try {
      const body = { name: form.name, phone: form.phone, password: form.password };
      if (form.email.trim()) body.email = form.email.trim();
      await apiFetch('/api/staff', { method: 'POST', body: JSON.stringify(body) });
      setForm({ name: '', phone: '', password: '', email: '' });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function resetPassword(s) {
    setError('');
    const pw = window.prompt(t('staff.newPasswordPrompt'));
    if (pw == null) return;
    if (pw.length < 6) { setError(t('staff.password')); return; }
    try {
      await apiFetch(`/api/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ password: pw }) });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(s) {
    setError('');
    try {
      await apiFetch(`/api/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !s.is_active }) });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function remove(s) {
    setError('');
    if (!window.confirm(t('common.remove') + ' — ' + (s.name || ''))) return;
    try {
      await apiFetch(`/api/staff/${s.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err.message); }
  }

  const columns = [
    { key: 'name', label: t('staff.name'), render: (s) => <strong>{s.name}</strong> },
    { key: 'phone', label: t('staff.phone') },
    { key: 'email', label: t('staff.emailOptional'), render: (s) => s.email || '—' },
    {
      key: 'status', label: t('common.status'), render: (s) => (
        <span className="badge" style={{ color: s.is_active ? 'var(--accent)' : 'var(--muted)' }}>
          {s.is_active ? t('staff.active') : t('staff.disabled')}
        </span>
      ),
    },
    {
      key: 'actions', label: t('common.actions'), align: 'right', render: (s) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); resetPassword(s); }}>{t('staff.resetPassword')}</button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleActive(s); }}>
            {s.is_active ? t('staff.disable') : t('staff.enable')}
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); remove(s); }}>{t('staff.remove')}</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('staff.title')}</h1>
        <p className="muted">{t('staff.helper')}</p>

        <div className="card">
          <h3>{t('staff.addStaff')}</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr auto', gap: 10 }}>
            <input placeholder={t('staff.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder={t('staff.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            <input placeholder={t('staff.password')} type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <input placeholder={t('staff.emailOptional')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <button>{t('common.add')}</button>
          </form>
        </div>

        <div className="card">
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={items} empty={t('staff.empty')} />
        </div>
      </div>
    </div>
  );
}
