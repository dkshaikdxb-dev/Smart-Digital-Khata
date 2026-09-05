import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../../components/Nav';
import { apiFetch } from '../../../lib/api';
import { useLang } from '../../../lib/i18n';
import { usePermissions } from '../../../lib/adminPerms';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function AdminShopDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { has } = usePermissions();
  const { id } = router.query;
  const [shop, setShop] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const canModerate = has('shops:moderate');
  const canPlan = has('settings:manage') || has('shops:moderate');

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/admin/shops/${id}`);
    setShop(r.shop);
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!shop) return <Shell><div className="card">Loading…</div></Shell>;

  async function patch(body, note) {
    setMsg(''); setError('');
    try {
      await apiFetch(`/api/admin/shops/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      setMsg(note);
    } catch (e) { setError(e.message); }
  }

  // Status changes require a reason (suspend: required, reinstate: optional) and
  // record it in the moderation audit log.
  function changeStatus(nextStatus) {
    const isSuspend = nextStatus === 'suspended';
    const reason = window.prompt(t(isSuspend ? 'mod.suspendReason' : 'mod.reinstateReason'), '');
    if (reason === null) return; // cancelled
    if (isSuspend && !reason.trim()) { setError(t('mod.reasonRequired')); return; }
    patch(
      { status: nextStatus, reason: reason.trim() },
      isSuspend ? t('mod.blocked') : t('mod.unblocked')
    );
  }

  const suspended = shop.status === 'suspended';

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← Platform</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{shop.name}</h2>
            <div className="muted">Owner: {shop.owner.name} · {shop.owner.email} · {shop.owner.phone}</div>
          </div>
          <span className="badge" style={suspended ? { background: 'var(--danger)', color: '#fff' } : { background: 'var(--accent)', color: '#000' }}>
            {shop.status}
          </span>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="grid">
        <div className="card"><div className="muted">Plan</div><div className="kpi"><span className="badge">{shop.plan}</span></div><div className="muted">{fmt(shop.mrr)}/mo</div></div>
        <div className="card"><div className="muted">Customers</div><div className="kpi">{shop.customers_count}</div></div>
        <div className="card"><div className="muted">Transactions</div><div className="kpi">{shop.transactions_count}</div></div>
        <div className="card"><div className="muted">Outstanding</div><div className="kpi">{fmt(shop.outstanding_total)}</div></div>
      </div>

      {canPlan && (
        <div className="card">
          <h3>Plan</h3>
          <p className="muted">Change this shop&rsquo;s plan (overrides billing — use for comps or support).</p>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            {['free', 'pro', 'family'].map((p) => (
              shop.plan === p
                ? <button key={p} disabled>{p} (current)</button>
                : <button key={p} className="secondary" onClick={() => patch({ plan: p }, `Plan changed to ${p}.`)}>Set {p}</button>
            ))}
          </div>
        </div>
      )}

      {canModerate && (
        <div className="card">
          <h3>Account status</h3>
          {suspended ? (
            <>
              <p className="muted">This shop is suspended — the owner cannot sign in.</p>
              <button onClick={() => changeStatus('active')}>Reactivate shop</button>
            </>
          ) : (
            <>
              <p className="muted">Suspending blocks the owner from signing in. Data is kept and can be restored anytime.</p>
              <button style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={() => changeStatus('suspended')}>
                Suspend shop
              </button>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
