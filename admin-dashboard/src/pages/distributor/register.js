import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const toList = (str) => String(str || '').split(',').map((s) => s.trim()).filter(Boolean);

export default function DistributorRegister() {
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState({
    business_name: '', name: '', email: '', phone: '', password: '',
    city: '', area: '', categories: '', brands: '', whatsapp: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = {
        business_name: form.business_name.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        password: form.password,
      };
      if (form.email.trim()) body.email = form.email.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.area.trim()) body.area = form.area.trim();
      if (toList(form.categories).length) body.categories = toList(form.categories);
      if (toList(form.brands).length) body.brands = toList(form.brands);
      if (form.whatsapp.trim()) body.whatsapp = form.whatsapp.trim();
      const r = await apiFetch('/api/distributors/register', { method: 'POST', body: JSON.stringify(body) });
      window.localStorage.setItem('skhata_token', r.token);
      // The register response carries { token, distributor } — the login role is
      // always 'distributor' for this endpoint.
      window.localStorage.setItem('skhata_role', 'distributor');
      router.push('/distributor');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: 420, maxWidth: '100%' }}>
        <h2>{t('dist.registerTitle')}</h2>
        <p className="muted">{t('dist.registerSubtitle')}</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <input placeholder={t('dist.businessName')} value={form.business_name} onChange={update('business_name')} required />
          <input placeholder={t('dist.yourName')} value={form.name} onChange={update('name')} required />
          <input placeholder={t('dist.phone')} value={form.phone} onChange={update('phone')} dir="ltr" required />
          <input type="email" placeholder={t('dist.email')} value={form.email} onChange={update('email')} />
          <input type="password" placeholder={t('dist.password')} value={form.password} onChange={update('password')} required />
          <input placeholder={t('dist.city')} value={form.city} onChange={update('city')} />
          <input placeholder={t('dist.area')} value={form.area} onChange={update('area')} />
          <input placeholder={`${t('dist.categories')} (${t('dist.listHint')})`} value={form.categories} onChange={update('categories')} />
          <input placeholder={`${t('dist.brands')} (${t('dist.listHint')})`} value={form.brands} onChange={update('brands')} />
          <input placeholder={t('dist.whatsapp')} value={form.whatsapp} onChange={update('whatsapp')} dir="ltr" />

          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <button disabled={loading}>{t('dist.create')}</button>
          <div className="muted">{t('dist.haveAccount')}<a href="/login">{t('log.signIn')}</a></div>
        </div>
      </form>
    </div>
  );
}
