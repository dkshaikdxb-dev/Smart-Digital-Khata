import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DistNav from '../../components/DistNav';
import Balance from '../../components/Balance';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const METHODS = ['cash', 'upi', 'bank', 'other'];

function guard(router) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return false; }
  const role = window.localStorage.getItem('skhata_role');
  if (role === 'admin') { router.replace('/admin'); return false; }
  if (role !== 'distributor') { router.replace('/dashboard'); return false; }
  return true;
}

export default function DistributorShops() {
  const router = useRouter();
  const { t } = useLang();
  const [shops, setShops] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Payment modal
  const [target, setTarget] = useState(null); // shop being paid
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/distributor/shops');
      setShops(r.shops || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!guard(router)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPay(shop) {
    setTarget(shop);
    setAmount('');
    setMethod('cash');
    setNote('');
    setModalErr('');
  }

  async function savePayment(e) {
    e.preventDefault();
    setModalErr('');
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise < 1) { setModalErr(t('dist.payAmountRs')); return; }
    setSaving(true);
    try {
      const body = { amount_paise: paise, method };
      if (note.trim()) body.note = note.trim();
      await apiFetch(`/api/distributor/shops/${target.shop_id}/payment`, { method: 'POST', body: JSON.stringify(body) });
      setMsg(t('dist.paySaved'));
      setTarget(null);
      await load();
    } catch (err) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <DistNav />
      <div className="container">
        <h1>{t('dist.shopsTitle')}</h1>
        <p className="muted" style={{ marginTop: -6 }}>{t('dist.shopsSubtitle')}</p>

        {msg && <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>{msg}</div>}
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : shops.length === 0 ? (
          <div className="card">{t('dist.shopsEmpty')}</div>
        ) : (
          shops.map((s) => (
            <div key={s.shop_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{s.shop_name}</strong>
                <Balance paise={s.balance_paise} />
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="secondary" onClick={() => openPay(s)}>{t('dist.recordPayment')}</button>
              </div>
            </div>
          ))
        )}
      </div>

      {target && (
        <>
          <div className="owner-more-backdrop" onClick={() => setTarget(null)} aria-hidden="true" style={{ display: 'block' }} />
          <div className="dist-modal" role="dialog" aria-label={t('dist.recordPayment')}>
            <form onSubmit={savePayment}>
              <h3 style={{ marginTop: 0 }}>{t('dist.recordPayment')}</h3>
              <p className="muted">{t('dist.payFrom', { name: target.shop_name })}</p>

              <label className="muted">{t('dist.payAmountRs')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <div style={{ height: 12 }} />

              <label className="muted">{t('dist.payMethod')}</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{t(`dist.method${m.charAt(0).toUpperCase() + m.slice(1)}`)}</option>
                ))}
              </select>
              <div style={{ height: 12 }} />

              <label className="muted">{t('dist.payNote')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} />

              {modalErr && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{modalErr}</div>}

              <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" className="secondary" onClick={() => setTarget(null)}>{t('dist.close')}</button>
                <button type="submit" disabled={saving}>{t('dist.paySave')}</button>
              </div>
            </form>
          </div>
        </>
      )}

      <style jsx>{`
        .dist-modal {
          position: fixed; z-index: 32; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: min(440px, calc(100vw - 24px));
          max-height: calc(100vh - 48px); overflow-y: auto;
          background: var(--card); border: 1px solid #334155; border-radius: 16px;
          padding: 20px;
        }
      `}</style>
    </div>
  );
}
