import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

// Shop availability (batch A) — the SETTINGS half: the daily opening window and
// the festival closures. The right-now switch and the pause chips live on Home
// (ShopAvailabilityCard), because that is where a shopkeeper reaches in a rush;
// this card holds the things you set once and forget.
//
// Hours are a PAIR: both ends or neither. The server enforces that with a 422
// `hours_incomplete`, and this card refuses to send a one-sided window in the
// first place so the owner gets the explanation, not an error code.
export default function ShopHoursCard() {
  const { t } = useLang();
  const [shop, setShop] = useState(null);
  const [closures, setClosures] = useState([]);
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // The stored TIME comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'.
  const hm = (v) => (v ? String(v).slice(0, 5) : '');

  const load = useCallback(() => {
    apiFetch('/api/shops/me')
      .then((r) => {
        setShop(r.shop);
        setClosures(r.closures || []);
        setOpenTime(hm(r.shop.open_time));
        setCloseTime(hm(r.shop.close_time));
      })
      .catch(() => setShop(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!shop) return null;

  async function saveHours() {
    setMsg('');
    // Both or neither — say so here rather than round-tripping for a 422.
    if (Boolean(openTime) !== Boolean(closeTime)) {
      setMsg(t('open.hoursIncomplete'));
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({ open_time: openTime || null, close_time: closeTime || null }),
      });
      setShop(r.shop);
      setOpenTime(hm(r.shop.open_time));
      setCloseTime(hm(r.shop.close_time));
      setMsg(t('common.saved'));
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function clearHours() {
    setOpenTime('');
    setCloseTime('');
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({ open_time: null, close_time: null }),
      });
      setShop(r.shop);
      setMsg(t('common.saved'));
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function addClosure() {
    if (!date) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me/closures', {
        method: 'POST',
        body: JSON.stringify({ on_date: date, reason: reason.trim() || null }),
      });
      setClosures(r.closures || []);
      setDate('');
      setReason('');
      setMsg(t('common.saved'));
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function removeClosure(id) {
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch(`/api/shops/me/closures/${id}`, { method: 'DELETE' });
      setClosures(r.closures || []);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  // An "opens later than it closes" window is legal — it means the shop stays
  // open past midnight — so it is never rejected; the help text above explains it.
  const hasHours = Boolean(openTime && closeTime);

  return (
    <div className="card" id="shop-hours" style={{ maxWidth: 520 }}>
      <h3>{t('open.hoursTitle')}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{t('open.hoursHelp')}</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="muted" htmlFor="shop-open-time">{t('open.openTime')}</label>
          <input
            id="shop-open-time"
            type="time"
            value={openTime}
            onChange={(e) => setOpenTime(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="muted" htmlFor="shop-close-time">{t('open.closeTime')}</label>
          <input
            id="shop-close-time"
            type="time"
            value={closeTime}
            onChange={(e) => setCloseTime(e.target.value)}
          />
        </div>
      </div>

      {!hasHours && <p className="muted" style={{ marginTop: 8 }}>{t('open.alwaysOpen')}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={saveHours} disabled={busy}>{t('open.saveHours')}</button>
        <button type="button" className="secondary" onClick={clearHours} disabled={busy || !hasHours}>
          {t('open.clearHours')}
        </button>
      </div>

      <hr style={{ margin: '18px 0', border: 0, borderTop: '1px solid var(--border, #e5e7eb)' }} />

      <h3 style={{ marginBottom: 4 }}>{t('open.closuresTitle')}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{t('open.closuresHelp')}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="muted" htmlFor="closure-date">{t('open.closureDate')}</label>
          <input id="closure-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="muted" htmlFor="closure-reason">{t('open.closureReason')}</label>
          <input
            id="closure-reason"
            type="text"
            value={reason}
            maxLength={120}
            placeholder={t('open.closureReasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <button type="button" style={{ marginTop: 10 }} onClick={addClosure} disabled={busy || !date}>
        {t('open.addClosure')}
      </button>

      {closures.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>{t('open.noClosures')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {closures.map((c) => (
            <li
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--border, #e5e7eb)',
              }}
            >
              <strong>{c.on_date}</strong>
              <span className="muted" style={{ flex: 1 }}>{c.reason || ''}</span>
              <button type="button" className="secondary" disabled={busy} onClick={() => removeClosure(c.id)}>
                {t('open.removeClosure')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
