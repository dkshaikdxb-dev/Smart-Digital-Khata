import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DistNav from '../../components/DistNav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

// Paise → editable rupee string; comma-joined string ⇄ trimmed array.
const rupeeStr = (p) => String(Number(p || 0) / 100);
const toList = (str) => String(str || '').split(',').map((s) => s.trim()).filter(Boolean);
const fromList = (arr) => (arr || []).join(', ');

function guard(router) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return false; }
  const role = window.localStorage.getItem('skhata_role');
  if (role === 'admin') { router.replace('/admin'); return false; }
  if (role !== 'distributor') { router.replace('/dashboard'); return false; }
  return true;
}

export default function DistributorAccount() {
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!guard(router)) return;
    apiFetch('/api/distributor/me')
      .then((r) => {
        const d = r.distributor;
        setForm({
          business_name: d.business_name || '',
          city: d.city || '',
          area: d.area || '',
          categories: fromList(d.categories),
          brands: fromList(d.brands),
          whatsapp: d.whatsapp || '',
          min_order: rupeeStr(d.min_order_paise),
          is_active: d.is_active !== false,
        });
      })
      .catch((e) => setError(e.message));
  }, [router]);

  async function save(e) {
    e.preventDefault();
    setMsg(''); setError('');
    setSaving(true);
    try {
      const body = {
        business_name: form.business_name,
        city: form.city || null,
        area: form.area || null,
        categories: toList(form.categories),
        brands: toList(form.brands),
        whatsapp: form.whatsapp || null,
        min_order_paise: Math.round(Number(form.min_order || 0) * 100),
        is_active: !!form.is_active,
      };
      const r = await apiFetch('/api/distributor/me', { method: 'PATCH', body: JSON.stringify(body) });
      const d = r.distributor;
      setForm({
        business_name: d.business_name || '',
        city: d.city || '',
        area: d.area || '',
        categories: fromList(d.categories),
        brands: fromList(d.brands),
        whatsapp: d.whatsapp || '',
        min_order: rupeeStr(d.min_order_paise),
        is_active: d.is_active !== false,
      });
      setMsg(t('common.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (<div><DistNav /><div className="container">{error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : t('common.loading')}</div></div>);
  }

  return (
    <div>
      <DistNav />
      <div className="container">
        <h1>{t('dist.accountTitle')}</h1>

        <form className="card" style={{ maxWidth: 520 }} onSubmit={save}>
          <p className="muted" style={{ marginTop: 0 }}>{t('dist.accountSubtitle')}</p>

          <label className="muted">{t('dist.businessName')}</label>
          <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.city')}</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.area')}</label>
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.categories')} <span className="muted">({t('dist.listHint')})</span></label>
          <input value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.brands')} <span className="muted">({t('dist.listHint')})</span></label>
          <input value={form.brands} onChange={(e) => setForm({ ...form, brands: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.whatsapp')}</label>
          <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} dir="ltr" />
          <div style={{ height: 12 }} />

          <label className="muted">{t('dist.minOrderRs')}</label>
          <input type="number" min="0" step="0.01" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} />
          <div style={{ height: 12 }} />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span>{t('dist.activeToggle')} — {form.is_active ? t('dist.activeOn') : t('dist.activeOff')}</span>
          </label>
          <div style={{ height: 16 }} />

          <button type="submit" disabled={saving}>{t('common.save')}</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
