import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';
import { availabilityLine, isOpen } from '../lib/shopOpen';

// Shop availability (batch A) — the owner's HOME control, not a settings page.
//
// "Are we open?" is the single most time-critical thing a shopkeeper changes,
// so it lives at the TOP of the dashboard: one big switch, the current state in
// plain words, and three one-tap pause chips (30 min / 1 hour / Rest of today)
// with "Resume now" while paused. No time picker, ever.
//
// Every word comes from the server's `availability` object — the SAME one the
// consumer PWA and both native apps render — so the owner is never told
// something different from what a shopper sees. The daily hours and the
// festival closures live in Settings; this card is only about right now.
export default function ShopAvailabilityCard() {
  const { t, lang } = useLang();
  const [shop, setShop] = useState(null);
  // The next 90 days of closures, ordered from TODAY. When availability says
  // 'holiday', the first entry is today's — that is where "Diwali" comes from.
  const [closures, setClosures] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/shops/me')
      .then((r) => { setShop(r.shop); setClosures(r.closures || []); })
      // Staff/permission or network trouble: the card simply does not render.
      // The dashboard must never break because of it.
      .catch(() => setShop(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!shop) return null;

  const availability = shop.availability;
  const open = isOpen(availability);
  // The closure's own reason ("Diwali") when today is a holiday, so the card
  // says WHY rather than a bare "closed today".
  const todayReason = availability && availability.reason === 'holiday' && closures[0]
    ? closures[0].reason
    : null;
  const line = open ? '' : availabilityLine(t, availability, lang, { reason: todayReason });
  const paused = !open && availability && availability.reason === 'paused';

  async function toggleOpen(next) {
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({ is_open: next }),
      });
      setShop(r.shop);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  // One tap = one call. `minutes` is 30, 60, the string 'today' (rest of today,
  // resolved in the SHOP's timezone server-side) or 0 to resume now.
  async function pause(minutes) {
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me/pause', {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      });
      setShop((s) => ({ ...s, paused_until: r.paused_until, availability: r.availability }));
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ borderLeft: `6px solid ${open ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, flex: 1 }}>{t('open.title')}</h3>
        <span
          style={{
            background: open ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)',
            color: '#fff', borderRadius: 999, padding: '4px 14px', fontWeight: 700, fontSize: 14,
          }}
        >
          {open ? t('open.open') : t('open.closed')}
        </span>
      </div>

      {/* The big master switch. Turning it off closes the shop outright; the
          pause chips below are the "back in a bit" alternative. */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', marginTop: 12 }}>
        <input
          type="checkbox"
          style={{ width: 'auto', transform: 'scale(1.4)' }}
          checked={shop.is_open !== false}
          disabled={busy}
          onChange={(e) => toggleOpen(e.target.checked)}
        />
        <span style={{ fontWeight: 600 }}>{t('open.switchLabel')}</span>
      </label>

      {/* Never a bare "Closed": the state is always said in words, with the
          reason and the reopen time whenever the server knows one. */}
      <div className="muted" style={{ marginTop: 8 }}>
        {open ? t('open.takingOrders') : line || t('open.notTakingOrders')}
      </div>

      <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>{t('open.pauseHelp')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="secondary" disabled={busy} onClick={() => pause(30)}>
          {t('open.pause30')}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => pause(60)}>
          {t('open.pause60')}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => pause('today')}>
          {t('open.pauseToday')}
        </button>
        {paused && (
          <button type="button" disabled={busy} onClick={() => pause(0)}>
            {t('open.resume')}
          </button>
        )}
      </div>

      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
