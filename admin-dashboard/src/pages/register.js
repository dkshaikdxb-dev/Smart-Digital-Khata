import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', shopName: '' });
  const [error, setError] = useState('');
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const r = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
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
        <h2>Create account</h2>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <input placeholder="Your name" value={form.name} onChange={update('name')} required />
          <input placeholder="Shop name" value={form.shopName} onChange={update('shopName')} required />
          <input type="email" placeholder="Email" value={form.email} onChange={update('email')} required />
          <input placeholder="Phone (e.g. +919876543210)" value={form.phone} onChange={update('phone')} required />
          <input type="password" placeholder="Password (8+ chars)" value={form.password} onChange={update('password')} required />
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <button>Create account</button>
          <div className="muted">Already have an account? <a href="/login">Sign in</a></div>
        </div>
      </form>
    </div>
  );
}
