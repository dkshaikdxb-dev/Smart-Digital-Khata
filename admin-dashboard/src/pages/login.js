import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';

export default function Login() {
  const router = useRouter();
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
      router.push(r.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form onSubmit={submit} className="card" style={{ width: 360 }}>
        <h2>Sign in</h2>
        <p className="muted">Smart Digital Khata — shop &amp; platform sign-in</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <button disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <div className="muted">
            New here? <a href="/register">Create an account</a>
          </div>
        </div>
      </form>
    </div>
  );
}
