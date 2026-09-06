import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import HelpFaq from '../components/HelpFaq';
import ReferralCard from '../components/ReferralCard';
import DownloadList from '../components/DownloadList';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

// "My Account" for the shop-side user (owner/staff/admin): a personal profile
// (name, email, phone, and OPTIONAL gender / date of birth) plus the Help & FAQ
// section. Shop settings stay on settings.js — this is the person, not the shop.
export default function Account() {
  const router = useRouter();
  const { t } = useLang();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    apiFetch('/api/me/profile')
      .then((r) => {
        setProfile(r.profile);
        setForm({
          name: r.profile.name || '',
          email: r.profile.email || '',
          phone: r.profile.phone || '',
          gender: r.profile.gender || '',
          date_of_birth: r.profile.date_of_birth ? String(r.profile.date_of_birth).slice(0, 10) : '',
        });
      })
      .catch((e) => setError(e.message || t('acc.loadError')));
  }, [router, t]);

  async function save(e) {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const body = {
        name: form.name,
        email: form.email || null,
        phone: form.phone,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
      };
      const r = await apiFetch('/api/me/profile', { method: 'PATCH', body: JSON.stringify(body) });
      setProfile(r.profile);
      setMsg(t('acc.saved'));
    } catch (err) { setError(err.message); }
  }

  if (!profile || !form) {
    return (<div><Nav /><div className="container">{error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : t('common.loading')}</div></div>);
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('acc.title')}</h1>

        <form className="card" style={{ maxWidth: 520 }} onSubmit={save}>
          <h3>{t('acc.profile')}</h3>
          <p className="muted">{t('acc.subtitle')}</p>

          <label className="muted">{t('acc.name')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div style={{ height: 12 }} />

          <label className="muted">{t('acc.email')} <span className="muted">({t('acc.optional')})</span></label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('acc.phone')}</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div style={{ height: 12 }} />

          <label className="muted">{t('acc.gender')} <span className="muted">({t('acc.optional')})</span></label>
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">{t('acc.genderUnset')}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{t(`acc.gender${g === 'prefer_not_to_say' ? 'PreferNot' : g.charAt(0).toUpperCase() + g.slice(1)}`)}</option>
            ))}
          </select>
          <div style={{ height: 12 }} />

          <label className="muted">{t('acc.dob')} <span className="muted">({t('acc.optional')})</span></label>
          <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <div style={{ height: 16 }} />

          <button type="submit">{t('acc.save')}</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </form>

        <div style={{ maxWidth: 520 }}>
          <DownloadList
            title={t('dl.title')}
            subtitle={t('dl.ownerSubtitle')}
            items={[
              { key: 'customers', label: t('dl.customers'), filename: 'customers.csv', path: '/api/reports/customers.csv' },
              { key: 'transactions', label: t('dl.transactions'), filename: 'transactions.csv', dated: true, path: (r) => `/api/reports/transactions.csv?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}` },
              { key: 'orders', label: t('dl.orders'), filename: 'orders.csv', dated: true, path: (r) => `/api/reports/orders.csv?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}` },
              { key: 'catalogue', label: t('dl.catalogue'), filename: 'catalogue.csv', path: '/api/reports/catalogue.csv' },
              { key: 'outstanding', label: t('dl.outstanding'), filename: 'khata-outstanding.csv', path: '/api/reports/khata-outstanding.csv' },
            ]}
          />
        </div>

        <div style={{ maxWidth: 520 }}>
          <ReferralCard fetcher={apiFetch} endpoint="/api/me/referral" />
        </div>

        <HelpFaq />
      </div>
    </div>
  );
}
