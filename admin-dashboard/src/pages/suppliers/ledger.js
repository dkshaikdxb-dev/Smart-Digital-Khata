import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import SupplierTabs from '../../components/SupplierTabs';
import Balance from '../../components/Balance';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function SupplierLedger() {
  const router = useRouter();
  const { t } = useLang();
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // distributor_id whose entries are shown
  const [entries, setEntries] = useState([]);
  const [entriesBusy, setEntriesBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    apiFetch('/api/suppliers/ledger')
      .then((r) => setSuppliers(r.suppliers || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function toggleEntries(distributorId) {
    if (openId === distributorId) { setOpenId(null); setEntries([]); return; }
    setOpenId(distributorId);
    setEntries([]);
    setEntriesBusy(true);
    try {
      const r = await apiFetch(`/api/suppliers/ledger?distributor_id=${encodeURIComponent(distributorId)}`);
      setEntries(r.entries || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setEntriesBusy(false);
    }
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('sup.ledgerTitle')}</h1>

        <SupplierTabs active="ledger" />

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : suppliers.length === 0 ? (
          <div className="card">{t('sup.ledgerEmpty')}</div>
        ) : (
          suppliers.map((s) => (
            <div key={s.distributor_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{s.business_name}</strong>
                <Balance paise={s.balance_paise} />
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="secondary" onClick={() => toggleEntries(s.distributor_id)}>
                  {openId === s.distributor_id ? t('sup.hideEntries') : t('sup.viewEntries')}
                </button>
              </div>

              {openId === s.distributor_id && (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ marginBottom: 8 }}>{t('sup.entriesFor', { name: s.business_name })}</div>
                  {entriesBusy ? (
                    <div className="muted">{t('common.loading')}</div>
                  ) : entries.length === 0 ? (
                    <div className="muted">{t('sup.noEntries')}</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>{t('common.when')}</th>
                          <th>{t('common.type')}</th>
                          <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id}>
                            <td>{new Date(e.created_at).toLocaleDateString()}</td>
                            <td>
                              {e.type === 'supply' ? t('sup.typeSupply') : t('sup.typePayment')}
                              {e.po_id ? <span className="muted"> · {t('sup.poRef')}</span> : null}
                            </td>
                            <td style={{ textAlign: 'right', color: e.type === 'supply' ? 'var(--danger)' : 'var(--accent)' }}>
                              {e.type === 'supply' ? '+' : '−'}{fmt(e.amount_paise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
