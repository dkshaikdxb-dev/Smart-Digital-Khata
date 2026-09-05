import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import Balance from '../../components/Balance';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function FamilyDetail() {
  const router = useRouter();
  const { t } = useLang();
  const txnLabel = (v) => { const s = t(`txn.${v}`); return s === `txn.${v}` ? v : s; };
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
  if (!data) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

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
      setMsg(t('fam.memberAdded'));
    } catch (err) { setError(err.message); }
  }

  async function removeMember(m) {
    if (!window.confirm(t('fam.removeConfirm', { name: m.name }))) return;
    setMsg(''); setError('');
    try {
      await apiFetch(`/api/families/${id}/members/${m.id}`, { method: 'DELETE' });
      await load();
      setMsg(t('fam.memberRemoved'));
    } catch (err) { setError(err.message); }
  }

  async function remind() {
    setMsg(''); setError('');
    try {
      const r = await apiFetch(`/api/families/${id}/remind`, { method: 'POST' });
      setMsg(r.sent
        ? t('fam.remindSent', { amt: fmt(r.combined_outstanding) })
        : t('fam.remindNotSent', { amt: fmt(r.combined_outstanding) }));
    } catch (err) { setError(err.message); }
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/families')} style={{ marginBottom: 12 }}>← {t('nav.families')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{family.name}</h2>
            <div className="muted">{t('fam.membersN', { n: members.length, s: members.length === 1 ? '' : 's' })}{data.payer ? t('fam.payerSuffix', { name: data.payer.name }) : t('fam.noPayer')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">{t('fam.combinedOutstanding')}</div>
            <div className="kpi"><Balance paise={combined} /></div>
            <div className="muted">{t('common.limit')} {Number(family.credit_limit) > 0 ? fmt(family.credit_limit) : t('common.none')}</div>
          </div>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
          <button onClick={remind} disabled={Number(combined) <= 0}>{t('fam.sendReminder')}</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>{t('fam.addMember')}</h3>
        <form onSubmit={addMember} style={{ display: 'grid', gridTemplateColumns: '3fr auto', gap: 10 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t('fam.selectCustomer')}</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
            ))}
          </select>
          <button disabled={!pick}>{t('common.add')}</button>
        </form>
        {available.length === 0 && <div className="muted" style={{ marginTop: 8 }}>{t('fam.allInFamily')}</div>}
      </div>

      <div className="card">
        <h3>{t('common.members')}</h3>
        <DataTable
          empty={t('fam.membersEmpty')}
          columns={[
            { key: 'name', label: t('common.name'), render: (m) => <strong>{m.name}</strong> },
            { key: 'phone', label: t('common.phone'), render: (m) => m.phone || '—' },
            { key: 'balance', label: t('common.outstanding'), align: 'right', render: (m) => (
              <Balance paise={m.balance} />
            ) },
            { key: 'sub_limit', label: t('fam.subLimit'), render: (m) => (Number(m.sub_limit) > 0 ? fmt(m.sub_limit) : '—') },
            { key: 'actions', label: t('common.actions'), align: 'right', render: (m) => (
              <span className="row-actions">
                <button className="secondary" onClick={() => router.push(`/customers/${m.id}`)}>{t('common.open')}</button>
                <button className="secondary" onClick={() => removeMember(m)}>{t('common.remove')}</button>
              </span>
            ) },
          ]}
          rows={members}
        />
      </div>

      <div className="card">
        <h3>{t('fam.combinedStatement')}</h3>
        <DataTable
          empty={t('tx.empty')}
          columns={[
            { key: 'created_at', label: t('common.when'), render: (row) => new Date(row.created_at).toLocaleString() },
            { key: 'customer_name', label: t('common.customer') },
            { key: 'type', label: t('common.type'), render: (row) => <span className="badge">{txnLabel(row.type)}</span> },
            { key: 'method', label: t('common.method'), render: (row) => (row.method ? txnLabel(row.method) : '—') },
            { key: 'amount', label: t('common.amount'), align: 'right', render: (row) => (
              <span style={{ color: row.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                {row.type === 'purchase' ? '+' : '−'}{fmt(row.amount)}
              </span>
            ) },
            { key: 'note', label: t('common.note'), render: (row) => row.note || '' },
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
