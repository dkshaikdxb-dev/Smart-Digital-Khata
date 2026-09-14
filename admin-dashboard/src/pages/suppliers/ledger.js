import { useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import SupplierTabs from '../../components/SupplierTabs';
import Balance from '../../components/Balance';
import ListState from '../../components/ListState';
import { apiFetch } from '../../lib/api';
import { useListLoad } from '../../lib/useListLoad';
import { friendlyError, logForSupport } from '../../lib/errorText';
import { money } from '../../lib/money';
import { useLang } from '../../lib/i18n';

export default function SupplierLedger() {
  const router = useRouter();
  const { t } = useLang();
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null); // distributor_id whose entries are shown
  const [entries, setEntries] = useState([]);
  const [entriesBusy, setEntriesBusy] = useState(false);

  const list = useListLoad(async ({ load }) => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    const r = await load('/api/suppliers/ledger');
    setSuppliers(r.suppliers || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleEntries(distributorId) {
    if (openId === distributorId) { setOpenId(null); setEntries([]); return; }
    setOpenId(distributorId);
    setEntries([]);
    setEntriesBusy(true);
    try {
      const r = await apiFetch(`/api/suppliers/ledger?distributor_id=${encodeURIComponent(distributorId)}`);
      setEntries(r.entries || []);
    } catch (e) {
      logForSupport(e, 'supplier ledger entries');
      setError(friendlyError(t, e));
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

        {/* "You don't owe any supplier right now" is a statement about money.
            It must not be what a shopkeeper reads when the request failed. */}
        <ListState state={list}>
        {suppliers.length === 0 ? (
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
                              {e.type === 'supply' ? '+' : '−'}{money(e.amount_paise)}
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
        </ListState>
      </div>
    </div>
  );
}
