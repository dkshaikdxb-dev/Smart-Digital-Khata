import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerShell from '../../components/CustomerShell';
import { publicFetch, setCustomerToken, getCustomerToken } from '../../lib/customerApi';
import { useLang } from '../../lib/i18n';

// WhatsApp OTP login. Step 1: enter phone → request-otp (dev_code shown in
// non-production). Step 2: enter the 6-digit code → verify-otp → store token.
export default function CustomerLogin() {
  const router = useRouter();
  const { t } = useLang();
  const [mode, setMode] = useState('otp'); // 'otp' | 'pin'
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ref, setRef] = useState(''); // onboarding-source code from the invite link

  // Where to go after login (cart preserves its intent via ?next=).
  const next = typeof router.query.next === 'string' ? router.query.next : '/c/shops';

  // Capture ?ref= from an invite link (unobtrusive; only used when a brand-new
  // consumer is created on first verify — a returning consumer is never re-tagged).
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.ref;
    const code = Array.isArray(q) ? q[0] : q;
    if (code) setRef(String(code));
  }, [router.isReady, router.query.ref]);

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
      const body = { phone: phone.trim(), code: code.trim() };
      if (ref && ref.trim()) body.ref = ref.trim();
      const r = await publicFetch('/api/customer-auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!r || !r.token) throw new Error(t('c.loginFailed'));
      setCustomerToken(r.token, phone.trim());
      router.replace(next.startsWith('/c') ? next : '/c/shops');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await publicFetch('/api/customer-auth/pin/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), pin: pin.trim() }),
      });
      if (!r || !r.token) throw new Error(t('c.loginFailed'));
      setCustomerToken(r.token, phone.trim());
      router.replace(next.startsWith('/c') ? next : '/c/shops');
    } catch (err) {
      // The server sends a clear "too many attempts" message when the PIN is
      // locked — map it to the localized locked-out copy; otherwise show the
      // uniform invalid-credentials message (never reveals if the phone exists).
      const locked = /too many/i.test(err.message || '');
      setError(locked ? t('auth.locked') : t('auth.pinFailed'));
    } finally {
      setLoading(false);
    }
  }

  // If already logged in, bounce straight through.
  if (typeof window !== 'undefined' && getCustomerToken()) {
    router.replace(next.startsWith('/c') ? next : '/c/shops');
  }

  return (
    <CustomerShell title={t('log.signIn')} tabs={false}>
      <div className="card cpwa-hero">
        <div className="cpwa-hero-ico">🛍️</div>
        <h2>Smart Digital Khata</h2>
        <p className="muted">{t('c.loginBlurb')}</p>
      </div>

      {mode === 'otp' && (step === 'phone' ? (
        <form onSubmit={requestOtp} className="card">
          <label className="cpwa-label" htmlFor="phone">{t('c.mobileNumber')}</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <p className="muted" style={{ marginTop: 8 }}>{t('c.otpHint')}</p>
          {error && <div className="cpwa-error">{error}</div>}
          <button disabled={loading} style={{ width: '100%', marginTop: 12 }}>
            {loading ? t('c.sending') : t('c.sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="card">
          <label className="cpwa-label" htmlFor="code">{t('c.enterCodeSentTo', { phone })}</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={t('c.codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
          {devCode && (
            <div className="cpwa-devhint">
              {t('c.devCode')} <strong>{devCode}</strong> {t('c.devCodeNote')}
            </div>
          )}
          {error && <div className="cpwa-error">{error}</div>}
          <button disabled={loading || code.length !== 6} style={{ width: '100%', marginTop: 12 }}>
            {loading ? t('c.verifying') : t('c.verifyContinue')}
          </button>
          <div className="cpwa-row-between" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>
              {t('c.changeNumber')}
            </button>
            <button type="button" className="secondary" onClick={() => requestOtp()} disabled={loading}>
              {t('c.resendCode')}
            </button>
          </div>
        </form>
      ))}

      {mode === 'otp' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <button type="button" className="secondary" onClick={() => { setMode('pin'); setError(''); }}>
            {t('auth.usePin')}
          </button>
        </div>
      )}

      {mode === 'pin' && (
        <form onSubmit={loginWithPin} className="card">
          <label className="cpwa-label" htmlFor="pinphone">{t('c.mobileNumber')}</label>
          <input
            id="pinphone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <div style={{ height: 10 }} />
          <label className="cpwa-label" htmlFor="pin">{t('auth.pin')}</label>
          <input
            id="pin"
            type="password"
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{t('auth.pinNet')}</p>
          {error && <div className="cpwa-error">{error}</div>}
          <button disabled={loading || pin.length < 4 || !phone.trim()} style={{ width: '100%', marginTop: 12 }}>
            {loading ? t('c.verifying') : t('auth.pinLogin')}
          </button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" className="secondary" onClick={() => { setMode('otp'); setPin(''); setError(''); }}>
              {t('auth.useOtp')}
            </button>
          </div>
        </form>
      )}
    </CustomerShell>
  );
}
