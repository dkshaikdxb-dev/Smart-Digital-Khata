import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useLang } from '../../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// PUBLIC, no-login Delivery Champion page. The unguessable 32-hex token in the
// URL IS the credential — it only ever shows/mutates THIS champion's own
// deliveries (the backend scopes every query by the token's champion). Built
// mobile-first with big tap targets for a delivery agent on a cheap 2G phone.
export default function ChampionDeliveries() {
  const router = useRouter();
  const { token } = router.query;
  const { t, lang, setLang } = useLang();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notfound | error
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({}); // deliveryId -> true (just delivered)

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/delivery/t/${token}`);
      if (res.status === 404 || res.status === 400) { setState('notfound'); return; }
      if (!res.ok) { setState('error'); return; }
      const d = await res.json();
      setData(d);
      setState('ready');
    } catch (e) {
      setState('error');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function update(deliveryId, status) {
    setBusy(deliveryId);
    try {
      const res = await fetch(`${API}/api/delivery/t/${token}/${deliveryId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok && status === 'delivered') {
        setDone((s) => ({ ...s, [deliveryId]: true }));
        setTimeout(() => load(), 900); // let the "Delivered, thank you!" flash show
      } else {
        await load();
      }
    } catch (e) {
      await load();
    } finally {
      setBusy(null);
    }
  }

  const wrap = { maxWidth: 520, margin: '0 auto', padding: '16px 14px', minHeight: '100vh' };
  const bigBtn = {
    width: '100%', padding: '16px', fontSize: 18, fontWeight: 700, borderRadius: 12, marginTop: 12,
  };

  if (state === 'loading') {
    return <div style={wrap}><div className="card">{t('champ.loading')}</div></div>;
  }
  if (state === 'notfound') {
    return (
      <div style={wrap}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🔗</div>
          <h3>{t('champ.title')}</h3>
          <p className="muted">{t('champ.notFound')}</p>
        </div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={wrap}>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">{t('champ.loadError')}</p>
          <button style={bigBtn} onClick={load}>{t('champ.refresh')}</button>
        </div>
      </div>
    );
  }

  const deliveries = (data && data.deliveries) || [];
  const name = data && data.champion ? data.champion.name : '';

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div className="muted">{t('champ.title')}</div>
          <h2 style={{ margin: '2px 0' }}>{t('champ.greeting', { name })}</h2>
        </div>
        <button className="secondary" style={{ padding: '6px 10px' }}
          onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}>
          {lang === 'hi' ? 'EN' : 'हिं'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t('champ.subtitle')}</p>

      <div className="row-actions" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
        <button className="secondary" onClick={load}>{t('champ.refresh')}</button>
      </div>

      {deliveries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>📦</div>
          <p className="muted">{t('champ.none')}</p>
        </div>
      ) : (
        deliveries.map((d) => (
          <div key={d.delivery_id} className="card">
            {done[d.delivery_id] ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 34 }}>✅</div>
                <strong>{t('champ.doneMsg')}</strong>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 17 }}>{d.customer_name || '—'}</strong>
                  {d.status === 'picked_up' && (
                    <span className="badge" style={{ color: 'var(--accent)' }}>{t('champ.pickedBadge')}</span>
                  )}
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="muted">{t('champ.address')}</div>
                  <div style={{ fontSize: 16 }}>{d.address || '—'}</div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="muted">{t('champ.items')}</div>
                  <div>{d.items_summary || '—'}</div>
                </div>

                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t('champ.total')}</span>
                  <span>{fmt(d.total)}</span>
                </div>

                {d.customer_phone && (
                  <a href={`tel:${d.customer_phone}`} style={{ textDecoration: 'none' }}>
                    <button className="secondary" style={{ ...bigBtn, marginTop: 12 }}>
                      📞 {t('champ.call')} {d.customer_phone}
                    </button>
                  </a>
                )}

                {d.status === 'assigned' && (
                  <button style={bigBtn} disabled={busy === d.delivery_id}
                    onClick={() => update(d.delivery_id, 'picked_up')}>
                    {busy === d.delivery_id ? t('champ.updating') : t('champ.markPickedUp')}
                  </button>
                )}
                {d.status === 'picked_up' && (
                  <button style={bigBtn} disabled={busy === d.delivery_id}
                    onClick={() => update(d.delivery_id, 'delivered')}>
                    {busy === d.delivery_id ? t('champ.updating') : t('champ.markDelivered')}
                  </button>
                )}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
