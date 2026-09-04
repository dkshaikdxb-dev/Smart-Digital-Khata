import { useState } from 'react';
import { useRouter } from 'next/router';
import CustomerShell from '../../components/CustomerShell';
import { publicFetch, setCustomerToken, getCustomerToken } from '../../lib/customerApi';

// WhatsApp OTP login. Step 1: enter phone → request-otp (dev_code shown in
// non-production). Step 2: enter the 6-digit code → verify-otp → store token.
export default function CustomerLogin() {
  const router = useRouter();
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Where to go after login (cart preserves its intent via ?next=).
  const next = typeof router.query.next === 'string' ? router.query.next : '/c/shops';

  async function requestOtp(e) {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await publicFetch('/api/customer-auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim() }),
      });
      setDevCode(r && r.dev_code ? String(r.dev_code) : '');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await publicFetch('/api/customer-auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      if (!r || !r.token) throw new Error('Login failed, please try again');
      setCustomerToken(r.token, phone.trim());
      router.replace(next.startsWith('/c') ? next : '/c/shops');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // If already logged in, bounce straight through.
  if (typeof window !== 'undefined' && getCustomerToken()) {
    router.replace(next.startsWith('/c') ? next : '/c/shops');
  }

  return (
    <CustomerShell title="Sign in" tabs={false}>
      <div className="card cpwa-hero">
        <div className="cpwa-hero-ico">🛍️</div>
        <h2>Smart Digital Khata</h2>
        <p className="muted">Log in with your WhatsApp number to order from nearby shops and view your khata.</p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={requestOtp} className="card">
          <label className="cpwa-label" htmlFor="phone">Mobile number</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <p className="muted" style={{ marginTop: 8 }}>We&rsquo;ll send a 6-digit code over WhatsApp.</p>
          {error && <div className="cpwa-error">{error}</div>}
          <button disabled={loading} style={{ width: '100%', marginTop: 12 }}>
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="card">
          <label className="cpwa-label" htmlFor="code">Enter the code sent to {phone}</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
          {devCode && (
            <div className="cpwa-devhint">
              Dev code: <strong>{devCode}</strong> (shown only in non-production)
            </div>
          )}
          {error && <div className="cpwa-error">{error}</div>}
          <button disabled={loading || code.length !== 6} style={{ width: '100%', marginTop: 12 }}>
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
          <div className="cpwa-row-between" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>
              Change number
            </button>
            <button type="button" className="secondary" onClick={() => requestOtp()} disabled={loading}>
              Resend code
            </button>
          </div>
        </form>
      )}
    </CustomerShell>
  );
}
