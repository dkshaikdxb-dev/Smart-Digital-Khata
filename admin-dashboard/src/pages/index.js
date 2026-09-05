import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import OwnerNudges from '../components/OwnerNudges';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Dashboard() {
  const router = useRouter();
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('skhata_token')) {
      router.replace('/login');
      return;
    }
    if (window.localStorage.getItem('skhata_role') === 'admin') {
      router.replace('/admin');
      return;
    }
    Promise.all([apiFetch('/api/summaries/today'), apiFetch('/api/summaries/outstanding')])
      .then(([s, o]) => { setSummary(s); setOutstanding(o); })
      .catch((e) => setError(e.message));
  }, [router]);

  const fmt = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('dash.today')}</h1>
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="grid">
          <div className="card">
            <div className="muted">{t('dash.purchasesToday')}</div>
            <div className="kpi">{summary ? fmt(summary.purchases) : '—'}</div>
          </div>
          <div className="card">
            <div className="muted">{t('dash.collectionsToday')}</div>
            <div className="kpi">{summary ? fmt(summary.collections) : '—'}</div>
          </div>
          <div className="card">
            <div className="muted">{t('common.totalOutstanding')}</div>
            <div className="kpi">{outstanding ? fmt(outstanding.total) : '—'}</div>
          </div>
          <div className="card">
            <div className="muted">{t('dash.customersWithDues')}</div>
            <div className="kpi">{outstanding ? outstanding.customers.length : '—'}</div>
          </div>
        </div>

        <OwnerNudges />

        <div className="card">
          <h3>{t('dash.topOutstanding')}</h3>
          <DataTable
            empty={t('dash.noDues')}
            onRowClick={(c) => router.push(`/customers/${c.id}`)}
            columns={[
              { key: 'name', label: t('common.customer'), render: (c) => <strong>{c.name}</strong> },
              { key: 'phone', label: t('common.phone') },
              { key: 'balance', label: t('common.outstanding'), align: 'right', render: (c) => (
                <span style={{ color: 'var(--danger)' }}>{fmt(c.balance)}</span>
              ) },
            ]}
            rows={(outstanding?.customers || []).slice(0, 10)}
          />
        </div>
      </div>
    </div>
  );
}
