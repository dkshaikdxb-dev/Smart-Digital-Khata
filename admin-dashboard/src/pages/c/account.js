import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerShell, { money, useCustomerGuard } from '../../components/CustomerShell';
import HelpFaq from '../../components/HelpFaq';
import StatementView from '../../components/StatementView';
import DataSaverToggle from '../../components/DataSaverToggle';
import ReferralCard from '../../components/ReferralCard';
import DownloadList from '../../components/DownloadList';
import { customerFetch, clearCustomerToken, swapCustomerToken, CUSTOMER_TOKEN_KEY } from '../../lib/customerApi';
import { clearApiCache } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const isoDay = (d) => d.toISOString().slice(0, 10);
const defFrom = () => isoDay(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
const defTo = () => isoDay(new Date());

// Consumer "Account": editable profile (name, email, gender, DOB — all optional),
// an account statement tool (shop picker + date range → view / CSV / print), the
// Help & FAQ, and Logout. phone is the login id and is shown read-only.
export default function CAccount() {
  const ready = useCustomerGuard();
  const router = useRouter();
  const { t } = useLang();

  const [form, setForm] = useState(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Number-change flow: 'idle' → enter new number → 'code' (OTP sent to new number).
  const [numStep, setNumStep] = useState('idle');
  const [newPhone, setNewPhone] = useState('');
  const [numCode, setNumCode] = useState('');
  const [numDevCode, setNumDevCode] = useState('');
  const [numMsg, setNumMsg] = useState('');
  const [numErr, setNumErr] = useState('');
  const [numBusy, setNumBusy] = useState(false);

  // Login PIN: whether one is set, and the set/change form state.
  const [hasPin, setHasPin] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ pin: '', current_pin: '' });
  const [pinMsg, setPinMsg] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const [shops, setShops] = useState([]);
  const [pick, setPick] = useState(''); // '' = all shops
  const [range, setRange] = useState({ from: defFrom(), to: defTo() });
  const [stmt, setStmt] = useState(null); // { single?: {shop_name, statement}, shops?: [], combined?: {} }
  const [stmtMsg, setStmtMsg] = useState('');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await customerFetch('/api/customer-auth/me');
        // Long-session refresh-on-use: if the server handed back a fresh token,
        // swap it so the rolling 90-day window keeps this device signed in.
        if (r.token) swapCustomerToken(r.token, r.phone);
        const cu = r.customer_user;
        setPhone(cu.phone || '');
        setHasPin(r.has_pin === true);
        setForm({
          name: cu.name || '',
          email: cu.email || '',
          gender: cu.gender || '',
          date_of_birth: cu.date_of_birth ? String(cu.date_of_birth).slice(0, 10) : '',
        });
      } catch (err) { setError(err.message || t('acc.loadError')); }
      try {
        const k = await customerFetch('/api/my/khata');
        setShops(k.shops || []);
      } catch { /* khata list is optional for the profile */ }
    })();
  }, [ready, t]);

  async function saveProfile(e) {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const body = {
        name: form.name || null,
        email: form.email || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
      };
      const r = await customerFetch('/api/customer-auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
      const cu = r.customer_user;
      setForm({
        name: cu.name || '',
        email: cu.email || '',
        gender: cu.gender || '',
        date_of_birth: cu.date_of_birth ? String(cu.date_of_birth).slice(0, 10) : '',
      });
      setMsg(t('acc.saved'));
    } catch (err) { setError(err.message); }
  }

  // --- Number change (OTP-gated on the NEW number) -------------------------
  async function requestNumberOtp(e) {
    if (e) e.preventDefault();
    setNumErr(''); setNumMsg(''); setNumBusy(true);
    try {
      const r = await customerFetch('/api/customer-auth/change-number/request', {
        method: 'POST', body: JSON.stringify({ new_phone: newPhone.trim() }),
      });
      setNumDevCode(r && r.dev_code ? String(r.dev_code) : '');
      setNumStep('code');
    } catch (err) { setNumErr(err.message); } finally { setNumBusy(false); }
  }

  async function confirmNumberChange(e) {
    e.preventDefault();
    setNumErr(''); setNumMsg(''); setNumBusy(true);
    try {
      const r = await customerFetch('/api/customer-auth/change-number/verify', {
        method: 'POST', body: JSON.stringify({ new_phone: newPhone.trim(), code: numCode.trim() }),
      });
      // Token now authenticates as the (possibly merged) identity on the new number.
      if (r && r.token) swapCustomerToken(r.token, r.customer_user?.phone || newPhone.trim());
      clearApiCache();
      setPhone(r.customer_user?.phone || newPhone.trim());
      setNumStep('idle'); setNewPhone(''); setNumCode(''); setNumDevCode('');
      setNumMsg(t('num.changed'));
    } catch (err) { setNumErr(err.message); } finally { setNumBusy(false); }
  }

  function cancelNumberChange() {
    setNumStep('idle'); setNewPhone(''); setNumCode(''); setNumDevCode(''); setNumErr(''); setNumMsg('');
  }

  // --- Login PIN ------------------------------------------------------------
  async function savePin(e) {
    e.preventDefault();
    setPinErr(''); setPinMsg('');
    if (!/^[0-9]{4,6}$/.test(pinForm.pin)) { setPinErr(t('pin.len')); return; }
    setPinBusy(true);
    try {
      const body = { pin: pinForm.pin };
      if (hasPin && pinForm.current_pin) body.current_pin = pinForm.current_pin;
      await customerFetch('/api/customer-auth/pin/set', { method: 'POST', body: JSON.stringify(body) });
      setHasPin(true); setPinOpen(false); setPinForm({ pin: '', current_pin: '' });
      setPinMsg(t('pin.saved'));
    } catch (err) { setPinErr(err.message); } finally { setPinBusy(false); }
  }

  async function removePin() {
    setPinErr(''); setPinMsg(''); setPinBusy(true);
    try {
      await customerFetch('/api/customer-auth/pin/clear', { method: 'POST', body: JSON.stringify({}) });
      setHasPin(false); setPinOpen(false); setPinForm({ pin: '', current_pin: '' });
      setPinMsg(t('pin.removed'));
    } catch (err) { setPinErr(err.message); } finally { setPinBusy(false); }
  }

  function stmtQuery(csv) {
    const p = new URLSearchParams();
    if (pick) p.set('shop_id', pick);
    p.set('from', range.from);
    p.set('to', range.to);
    if (csv) p.set('format', 'csv');
    return p.toString();
  }

  async function viewStatement() {
    setStmtMsg('');
    if (range.from > range.to) { setStmtMsg(t('stmt.rangeError')); return; }
    try {
      const r = await customerFetch(`/api/my/statement?${stmtQuery(false)}`);
      if (pick) setStmt({ single: r.shop });
      else setStmt({ shops: r.shops || [], combined: r.combined });
    } catch (err) { setStmtMsg(err.message || t('stmt.loadError')); }
  }

  async function downloadCsv() {
    setStmtMsg('');
    if (range.from > range.to) { setStmtMsg(t('stmt.rangeError')); return; }
    try {
      const token = window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
      const res = await fetch(`${API}/api/my/statement?${stmtQuery(true)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `statement-${range.from}-to-${range.to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setStmtMsg(err.message); }
  }

  async function printStatement() {
    if (!stmt) { await viewStatement(); }
    setTimeout(() => window.print(), 50);
  }

  function logout() {
    clearCustomerToken();
    clearApiCache();
    router.replace('/c/login');
  }

  if (!ready) return null;

  const singleStmt = stmt && stmt.single ? stmt.single.statement : null;
  const multiShops = stmt && stmt.shops ? stmt.shops : null;

  return (
    <CustomerShell title={t('acc.title')}>
      {error && <div className="card cpwa-error">{error}</div>}

      {form && (
        <form className="card" onSubmit={saveProfile}>
          <h3 style={{ marginTop: 0 }}>{t('acc.profile')}</h3>
          <p className="muted">{t('acc.subtitle')}</p>

          <label className="muted">{t('acc.name')} <span className="muted">({t('acc.optional')})</span></label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div style={{ height: 10 }} />

          <label className="muted">{t('acc.phone')}</label>
          <input value={phone} readOnly disabled />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('acc.phoneReadonly')}</div>
          <div style={{ height: 10 }} />

          <label className="muted">{t('acc.email')} <span className="muted">({t('acc.optional')})</span></label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div style={{ height: 10 }} />

          <label className="muted">{t('acc.gender')} <span className="muted">({t('acc.optional')})</span></label>
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">{t('acc.genderUnset')}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{t(`acc.gender${g === 'prefer_not_to_say' ? 'PreferNot' : g.charAt(0).toUpperCase() + g.slice(1)}`)}</option>
            ))}
          </select>
          <div style={{ height: 10 }} />

          <label className="muted">{t('acc.dob')} <span className="muted">({t('acc.optional')})</span></label>
          <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <div style={{ height: 14 }} />

          <button type="submit">{t('acc.save')}</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
        </form>
      )}

      {/* Mobile number — change flow (OTP sent to the NEW number). */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('num.title')}</h3>
        <label className="muted">{t('num.current')}</label>
        <input value={phone} readOnly disabled dir="ltr" inputMode="tel" />

        {numStep === 'idle' && (
          <div style={{ marginTop: 12 }}>
            <label className="muted">{t('num.new')}</label>
            <input
              type="tel" dir="ltr" inputMode="tel" placeholder="+91XXXXXXXXXX"
              value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>{t('num.newHint')}</div>
            <button type="button" onClick={requestNumberOtp} disabled={numBusy || !newPhone.trim()}>
              {numBusy ? t('num.sending') : t('num.sendCode')}
            </button>
          </div>
        )}

        {numStep === 'code' && (
          <form onSubmit={confirmNumberChange} style={{ marginTop: 12 }}>
            <label className="muted">{t('num.enterCode', { phone: newPhone.trim() })}</label>
            <input
              type="text" dir="ltr" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={numCode} onChange={(e) => setNumCode(e.target.value.replace(/\D/g, ''))}
            />
            {numDevCode && (
              <div className="cpwa-devhint" style={{ marginTop: 8 }}>{t('num.devCode')} <strong>{numDevCode}</strong></div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="submit" disabled={numBusy || numCode.length < 4}>
                {numBusy ? t('num.changing') : t('num.confirm')}
              </button>
              <button type="button" className="secondary" onClick={cancelNumberChange} disabled={numBusy}>
                {t('num.cancel')}
              </button>
            </div>
          </form>
        )}
        {numErr && <div className="cpwa-error" style={{ marginTop: 10 }}>{numErr}</div>}
        {numMsg && <div className="muted" style={{ marginTop: 10 }}>{numMsg}</div>}
      </div>

      {/* Login PIN — faster-than-OTP login. HONEST: still needs internet. */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('pin.title')}</h3>
        <p className="muted" style={{ fontSize: 12 }}>{t('pin.note')}</p>
        <div className="muted" style={{ marginBottom: 10 }}>{hasPin ? t('pin.on') : t('pin.off')}</div>

        {!pinOpen && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setPinOpen(true); setPinMsg(''); setPinErr(''); }}>
              {hasPin ? t('pin.change') : t('pin.set')}
            </button>
            {hasPin && (
              <button type="button" className="secondary" onClick={removePin} disabled={pinBusy}>
                {t('pin.remove')}
              </button>
            )}
          </div>
        )}

        {pinOpen && (
          <form onSubmit={savePin}>
            {hasPin && (
              <>
                <label className="muted">{t('pin.current')}</label>
                <input
                  type="password" dir="ltr" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={pinForm.current_pin}
                  onChange={(e) => setPinForm({ ...pinForm, current_pin: e.target.value.replace(/\D/g, '') })}
                />
                <div style={{ height: 10 }} />
              </>
            )}
            <label className="muted">{t('pin.new')}</label>
            <input
              type="password" dir="ltr" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={pinForm.pin}
              onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, '') })}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="submit" disabled={pinBusy}>{pinBusy ? t('pin.saving') : t('pin.save')}</button>
              <button type="button" className="secondary" onClick={() => { setPinOpen(false); setPinForm({ pin: '', current_pin: '' }); setPinErr(''); }}>
                {t('num.cancel')}
              </button>
            </div>
          </form>
        )}
        {pinErr && <div className="cpwa-error" style={{ marginTop: 10 }}>{pinErr}</div>}
        {pinMsg && <div className="muted" style={{ marginTop: 10 }}>{pinMsg}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('stmt.title')}</h3>
        <p className="muted">{t('stmt.subtitle')}</p>
        <label className="muted">{t('stmt.pickShop')}</label>
        <select value={pick} onChange={(e) => { setPick(e.target.value); setStmt(null); }}>
          <option value="">{t('stmt.allShops')}</option>
          {shops.map((s) => (
            <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>
          ))}
        </select>
        <div style={{ height: 10 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="muted">{t('stmt.from')}</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="muted">{t('stmt.to')}</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        </div>
        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={viewStatement}>{t('stmt.view')}</button>
          <button type="button" className="secondary" onClick={downloadCsv}>{t('stmt.download')}</button>
          <button type="button" className="secondary" onClick={printStatement}>{t('stmt.print')}</button>
        </div>
        {stmtMsg && <div className="muted" style={{ marginTop: 8 }}>{stmtMsg}</div>}

        {singleStmt && (
          <div style={{ marginTop: 14 }}>
            <StatementView stmt={singleStmt} fmt={money} title={stmt.single.shop_name} />
          </div>
        )}
        {multiShops && (
          <div style={{ marginTop: 14 }}>
            {multiShops.length === 0 && <div className="muted">{t('stmt.noData')}</div>}
            {multiShops.map((s) => (
              <div key={s.shop_id} style={{ marginBottom: 16 }}>
                <StatementView stmt={s.statement} fmt={money} title={s.shop_name} />
              </div>
            ))}
            {stmt.combined && multiShops.length > 0 && (
              <div className="muted" style={{ marginTop: 8 }}>
                {t('stmt.combined')}: {t('stmt.closing')} {money(stmt.combined.closing)}
              </div>
            )}
          </div>
        )}
      </div>

      <DownloadList
        title={t('dl.title')}
        subtitle={t('dl.consumerSubtitle')}
        tokenKey={CUSTOMER_TOKEN_KEY}
        items={[
          { key: 'myOrders', label: t('dl.myOrders'), filename: 'my-orders.csv', path: '/api/my/orders.csv' },
        ]}
      />

      <ReferralCard fetcher={customerFetch} endpoint="/api/customer-auth/referral" />

      <HelpFaq variant="cpwa" />

      <div className="card">
        <DataSaverToggle variant="cpwa" />
      </div>

      <div className="card">
        <button type="button" className="secondary" onClick={logout} style={{ width: '100%' }}>
          🚪 {t('acc.logout')}
        </button>
      </div>

      {/* Hidden print block — populated once a statement is viewed. */}
      {(singleStmt || (multiShops && multiShops.length)) && (
        <div className="stmt-print" aria-hidden="true">
          <h2>{t('stmt.title')}</h2>
          <div>{range.from} → {range.to}</div>
          {singleStmt && <StatementView stmt={singleStmt} fmt={money} title={stmt.single.shop_name} print />}
          {multiShops && multiShops.map((s) => (
            <StatementView key={s.shop_id} stmt={s.statement} fmt={money} title={s.shop_name} print />
          ))}
        </div>
      )}
    </CustomerShell>
  );
}
