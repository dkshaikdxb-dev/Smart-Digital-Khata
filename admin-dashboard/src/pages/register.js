import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Register() {
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', shopName: '' });
  const [ref, setRef] = useState('');
  const [invited, setInvited] = useState(false); // whether ref arrived from the URL
  const [error, setError] = useState('');
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Capture ?ref= from the invite link (unobtrusive; never required).
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.ref;
    const code = Array.isArray(q) ? q[0] : q;
    if (code) { setRef(String(code)); setInvited(true); }
  }, [router.isReady, router.query.ref]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (ref && ref.trim()) body.ref = ref.trim();
      const r = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      window.localStorage.setItem('skhata_token', r.token);
      window.localStorage.setItem('skhata_role', r.user.role);
      router.push('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form onSubmit={submit} className="card" style={{ width: 400 }}>
        <h2>{t('reg.createAccount')}</h2>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <input placeholder={t('reg.yourName')} value={form.name} onChange={update('name')} required />
          <input placeholder={t('reg.shopName')} value={form.shopName} onChange={update('shopName')} required />
          <input type="email" placeholder={t('log.email')} value={form.email} onChange={update('email')} required />
          <input placeholder={t('reg.phonePlaceholder')} value={form.phone} onChange={update('phone')} required />
          <input type="password" placeholder={t('reg.passwordPlaceholder')} value={form.password} onChange={update('password')} required />

          {invited ? (
            <div className="muted" style={{ fontSize: 13 }}>
              {t('ref.invitedBy')} <strong>{ref}</strong>
            </div>
          ) : (
            <div>
              <label className="muted" style={{ fontSize: 13 }}>{t('ref.enterCode')} <span className="muted">({t('acc.optional')})</span></label>
              <input placeholder={t('ref.codePlaceholder')} value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" />
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <button>{t('reg.createAccount')}</button>
          <div className="muted">{t('reg.haveAccount')}<a href="/login">{t('log.signIn')}</a></div>
        </div>
      </form>
    </div>
  );
}
