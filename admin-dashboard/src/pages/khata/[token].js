import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// Public, read-only customer khata. No login — access via unguessable link.
export default function PublicKhata() {
  const router = useRouter();
  const { token } = router.query;
  const [khata, setKhata] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/public/khata/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('This khata link is invalid or has been replaced by the shop.');
        return r.json();
      })
      .then((d) => setKhata(d.khata))
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <Center>
        <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>🔗</div>
          <h3>Link not valid</h3>
          <p className="muted">{error}</p>
        </div>
      </Center>
    );
  }
  if (!khata) return <Center><div className="card">Loading…</div></Center>;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="muted">{khata.shop_name}</div>
        <h2 style={{ margin: '4px 0 12px' }}>{khata.customer_name}&rsquo;s Khata</h2>
        <div className="muted">Outstanding</div>
        <div className="kpi" style={{ color: Number(khata.balance) > 0 ? 'var(--danger)' : 'var(--accent)' }}>
          {fmt(khata.balance)}
        </div>
      </div>

      <div className="card">
        <h3>Recent entries</h3>
        <table>
          <thead>
            <tr><th>Date</th><th>Entry</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {khata.transactions.map((t, i) => (
              <tr key={i}>
                <td>{new Date(t.created_at).toLocaleDateString()}</td>
                <td>
                  {t.type === 'purchase' ? 'Purchase' : `Payment (${t.method})`}
                  {t.note ? <div className="muted" style={{ fontSize: 12 }}>{t.note}</div> : null}
                </td>
                <td style={{ textAlign: 'right', color: t.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                  {t.type === 'purchase' ? '+' : '−'}{fmt(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Read-only statement, updated live by {khata.shop_name}. Questions? Contact the shop directly.
        </p>
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>;
}
