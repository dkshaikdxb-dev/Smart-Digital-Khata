import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Login() {
  const router = useRouter();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      window.localStorage.setItem('skhata_token', r.token);
      window.localStorage.setItem('skhata_role', r.user.role);
      router.push(r.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form onSubmit={submit} className="card" style={{ width: 360 }}>
        <h2>{t('log.signIn')}</h2>
        <p className="muted">{t('log.tagline')}</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <input type="text" placeholder={t('login.identifierPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder={t('log.password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="muted">{t('login.staffHint')}</div>
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <button disabled={loading}>{loading ? t('log.signingIn') : t('log.signIn')}</button>
          <div className="muted">
            {t('log.newHere')}<a href="/register">{t('log.createAccount')}</a>
          </div>
        </div>
      </form>
    </div>
  );
}
