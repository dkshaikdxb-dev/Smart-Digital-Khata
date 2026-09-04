import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import { apiFetch } from '../../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function FamilyDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [statement, setStatement] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/families/${id}`);
    setData(r);
    const st = await apiFetch(`/api/families/${id}/statement`);
    setStatement(st.transactions || []);
    const cs = await apiFetch('/api/customers');
    setCustomers(cs.items || []);
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  if (error && !data) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!data) return <Shell><div className="card">Loading…</div></Shell>;

  const family = data.family || data;
  const members = data.members || [];
  const combined = data.combined_balance != null ? data.combined_balance : members.reduce((s, m) => s + Number(m.balance || 0), 0);
  const memberIds = new Set(members.map((m) => m.id));
  const available = customers.filter((c) => !memberIds.has(c.id));

  async function addMember(e) {
    e.preventDefault(); setMsg(''); setError('');
    if (!pick) return;
    try {
      await apiFetch(`/api/families/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ customer_id: pick }),
      });
      setPick('');
      await load();
      setMsg('Member added.');
    } catch (err) { setError(err.message); }
  }

  async function removeMember(m) {
    if (!window.confirm(`Remove ${m.name} from this family?`)) return;
    setMsg(''); setError('');
    try {
      await apiFetch(`/api/families/${id}/members/${m.id}`, { method: 'DELETE' });
      await load();
      setMsg('Member removed.');
    } catch (err) { setError(err.message); }
  }

  async function remind() {
    setMsg(''); setError('');
    try {
      const r = await apiFetch(`/api/families/${id}/remind`, { method: 'POST' });
      setMsg(r.sent
        ? `WhatsApp reminder sent to the payer (combined outstanding ${fmt(r.combined_outstanding)}).`
        : `Reminder not sent — payer has alerts muted or no payer set (combined outstanding ${fmt(r.combined_outstanding)}).`);
    } catch (err) { setError(err.message); }
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/families')} style={{ marginBottom: 12 }}>← Families</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{family.name}</h2>
            <div className="muted">{members.length} member{members.length === 1 ? '' : 's'}{data.payer ? ` · Payer: ${data.payer.name}` : ' · No payer set'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Combined outstanding</div>
            <div className="kpi" style={{ color: Number(combined) > 0 ? 'var(--danger)' : 'var(--accent)' }}>{fmt(combined)}</div>
            <div className="muted">Limit {Number(family.credit_limit) > 0 ? fmt(family.credit_limit) : 'none'}</div>
          </div>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
          <button onClick={remind} disabled={Number(combined) <= 0}>Send WhatsApp reminder</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>Add member</h3>
        <form onSubmit={addMember} style={{ display: 'grid', gridTemplateColumns: '3fr auto', gap: 10 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select a customer…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
            ))}
          </select>
          <button disabled={!pick}>Add</button>
        </form>
        {available.length === 0 && <div className="muted" style={{ marginTop: 8 }}>All customers are already in this family, or none exist yet.</div>}
      </div>

      <div className="card">
        <h3>Members</h3>
        <DataTable
          empty="No members yet. Add one above."
          columns={[
            { key: 'name', label: 'Name', render: (m) => <strong>{m.name}</strong> },
            { key: 'phone', label: 'Phone', render: (m) => m.phone || '—' },
            { key: 'balance', label: 'Outstanding', align: 'right', render: (m) => (
              <span style={{ color: Number(m.balance) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt(m.balance)}</span>
            ) },
            { key: 'sub_limit', label: 'Sub-limit', render: (m) => (Number(m.sub_limit) > 0 ? fmt(m.sub_limit) : '—') },
            { key: 'actions', label: 'Actions', align: 'right', render: (m) => (
              <span className="row-actions">
                <button className="secondary" onClick={() => router.push(`/customers/${m.id}`)}>Open</button>
                <button className="secondary" onClick={() => removeMember(m)}>Remove</button>
              </span>
            ) },
          ]}
          rows={members}
        />
      </div>

      <div className="card">
        <h3>Combined statement</h3>
        <DataTable
          empty="No transactions yet."
          columns={[
            { key: 'created_at', label: 'When', render: (t) => new Date(t.created_at).toLocaleString() },
            { key: 'customer_name', label: 'Customer' },
            { key: 'type', label: 'Type', render: (t) => <span className="badge">{t.type}</span> },
            { key: 'method', label: 'Method', render: (t) => t.method || '—' },
            { key: 'amount', label: 'Amount', align: 'right', render: (t) => (
              <span style={{ color: t.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                {t.type === 'purchase' ? '+' : '−'}{fmt(t.amount)}
              </span>
            ) },
            { key: 'note', label: 'Note', render: (t) => t.note || '' },
          ]}
          rows={statement}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
