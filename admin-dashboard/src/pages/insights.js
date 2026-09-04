import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const pct = (f) => `${(Number(f || 0) * 100).toFixed(1)}%`;

const AGING = [
  { key: '0_30', label: '0–30 days' },
  { key: '31_60', label: '31–60 days' },
  { key: '61_90', label: '61–90 days' },
  { key: '90_plus', label: '90+ days' },
];

// CSV endpoints return text/csv and need the Authorization header, so a plain
// <a href> (no auth) won't work — fetch with the bearer token, then download the blob.
async function downloadCsv(path, filename) {
  const token = window.localStorage.getItem('skhata_token');
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function Insights() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [aging, setAging] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async (d) => {
    const o = await apiFetch(`/api/analytics/overview?days=${d}`);
    setOverview(o);
    const a = await apiFetch('/api/analytics/aging');
    setAging(a);
  }, []);

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load(days).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDays(d) {
    setDays(d);
    setError('');
    load(d).catch((e) => setError(e.message));
  }

  async function download(path, filename) {
    setError(''); setMsg('');
    try {
      await downloadCsv(path, filename);
      setMsg(`Downloaded ${filename}.`);
    } catch (err) { setError(err.message); }
  }

  const agingTotal = aging ? Number(aging.total || 0) : 0;

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Insights</h1>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Overview</h3>
            <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
              {[7, 30, 90].map((d) => (
                <button key={d} className={d === days ? '' : 'secondary'} onClick={() => changeDays(d)}>Last {d} days</button>
              ))}
            </div>
          </div>
          {!overview ? <div className="muted">Loading…</div> : (
            <div className="grid">
              <Kpi label={`Purchases (${overview.period_days}d)`} value={fmt(overview.purchases)} />
              <Kpi label={`Collections (${overview.period_days}d)`} value={fmt(overview.collections)} color="var(--accent)" />
              <Kpi label="Collection rate" value={pct(overview.collection_rate)} />
              <Kpi label="Total outstanding" value={fmt(overview.total_outstanding)} color="var(--danger)" />
              <Kpi label="Active customers" value={overview.active_customers} />
              <Kpi label="Customers with dues" value={overview.customers_with_dues} />
              <Kpi label={`New customers (${overview.period_days}d)`} value={overview.new_customers} />
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
        </div>

        <div className="card">
          <h3>Outstanding by age</h3>
          {!aging ? <div className="muted">Loading…</div> : agingTotal === 0 ? (
            <p className="muted" style={{ padding: '8px 2px' }}>No outstanding balances.</p>
          ) : (
            <div>
              {AGING.map((b) => {
                const v = Number(aging[b.key] || 0);
                const w = agingTotal ? Math.round((v / agingTotal) * 100) : 0;
                return (
                  <div key={b.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="muted">{b.label}</span>
                      <span>{fmt(v)}</span>
                    </div>
                    <div style={{ background: '#0b1220', borderRadius: 8, height: 14, overflow: 'hidden' }}>
                      <div style={{ width: `${w}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid #334155', paddingTop: 8 }}>
                <strong>Total</strong>
                <strong>{fmt(agingTotal)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Reports</h3>
          <div className="row-actions" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
            <button className="secondary" onClick={() => download('/api/reports/customers.csv', 'customers.csv')}>Download customers CSV</button>
          </div>
          <div className="muted" style={{ marginBottom: 6 }}>Transactions (optional date range)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={{ maxWidth: 200 }} />
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={{ maxWidth: 200 }} />
            <button className="secondary" onClick={() => {
              const params = [];
              if (range.from) params.push(`from=${encodeURIComponent(range.from)}`);
              if (range.to) params.push(`to=${encodeURIComponent(range.to)}`);
              const qs = params.length ? `?${params.join('&')}` : '';
              download(`/api/reports/transactions.csv${qs}`, 'transactions.csv');
            }}>Download transactions CSV</button>
          </div>
          {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="muted">{label}</div>
      <div className="kpi" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}
