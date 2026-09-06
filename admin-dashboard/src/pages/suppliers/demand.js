import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Nav from '../../components/Nav';
import SupplierTabs from '../../components/SupplierTabs';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

// A single blank demand line. qty is an integer COUNT — never money, no ₹ here.
const blankLine = () => ({ name: '', brand: '', unit: '', qty: 1 });

const statusColor = (s) => {
  if (s === 'claimed') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};

export default function OwnerDemandBoard() {
  const router = useRouter();
  const { t } = useLang();

  const [posts, setPosts] = useState([]);
  const [lines, setLines] = useState([blankLine()]);
  const [neededBy, setNeededBy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [formErr, setFormErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/demand-posts');
      setPosts(r.demand_posts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLine(i, patch) {
    setLines((prev) => prev.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function removeLine(i) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function submit(e) {
    e.preventDefault();
    setFormErr(''); setMsg('');
    const items = lines
      .filter((ln) => ln.name.trim() && Number(ln.qty) > 0)
      .map((ln) => {
        const it = { name: ln.name.trim(), qty: Math.round(Number(ln.qty)) };
        if (ln.brand.trim()) it.brand = ln.brand.trim();
        if (ln.unit.trim()) it.unit = ln.unit.trim();
        return it;
      });
    if (items.length === 0) { setFormErr(t('dem.needItem')); return; }
    setPosting(true);
    try {
      const body = { items };
      if (neededBy) body.needed_by = neededBy;
      if (note.trim()) body.note = note.trim();
      await apiFetch('/api/demand-posts', { method: 'POST', body: JSON.stringify(body) });
      setMsg(t('dem.posted'));
      setLines([blankLine()]);
      setNeededBy('');
      setNote('');
      await load();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function cancelPost(id) {
    if (!window.confirm(t('dem.cancelConfirm'))) return;
    setError('');
    try {
      await apiFetch(`/api/demand-posts/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('dem.boardTitle')}</h1>
        <p className="muted" style={{ marginTop: -6 }}>{t('dem.ownerSubtitle')}</p>

        <SupplierTabs active="demand" />

        {msg && <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>{msg}</div>}
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dem.postNeed')}</h3>
          <form onSubmit={submit}>
            <div className="dem-lines">
              {lines.map((ln, i) => (
                <div key={i} className="dem-line">
                  <input
                    className="dem-line-name"
                    placeholder={t('sup.itemName')}
                    value={ln.name}
                    onChange={(e) => updateLine(i, { name: e.target.value })}
                  />
                  <input
                    placeholder={t('sup.brands')}
                    value={ln.brand}
                    onChange={(e) => updateLine(i, { brand: e.target.value })}
                  />
                  <input
                    placeholder={t('common.unit')}
                    value={ln.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                  />
                  <input
                    className="dem-line-qty"
                    type="number"
                    min="1"
                    step="1"
                    aria-label={t('sup.qty')}
                    value={ln.qty}
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                  />
                  <button type="button" className="secondary" onClick={() => removeLine(i)} aria-label={t('common.remove')}>✕</button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8 }}>
              <button type="button" className="secondary" onClick={addLine}>+ {t('dem.addItem')}</button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="muted">{t('dem.neededBy')}</span>
                <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <textarea
                placeholder={t('dem.optionalNote')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: 'var(--text)', fontSize: 16 }}
              />
            </div>

            {formErr && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{formErr}</div>}

            <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="submit" disabled={posting}>{posting ? t('dem.posting') : t('dem.post')}</button>
            </div>
          </form>
        </div>

        <h2 style={{ marginTop: 24 }}>{t('dem.myPosts')}</h2>
        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : posts.length === 0 ? (
          <div className="card">{t('dem.noPosts')}</div>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="muted">
                    {p.needed_by ? t('dem.neededByOn', { when: new Date(p.needed_by).toLocaleDateString() }) : t('dem.noDate')}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {(p.items || []).map((it) => (
                      <span key={it.id} className="badge" style={{ marginRight: 6, marginBottom: 4, display: 'inline-block' }}>
                        {it.qty} × {it.name}{it.unit ? ` ${it.unit}` : ''}
                      </span>
                    ))}
                  </div>
                  {p.note && <div className="muted" style={{ marginTop: 6 }}>{t('common.note')}: {p.note}</div>}
                  {p.status === 'claimed' && (
                    <div style={{ marginTop: 8 }}>
                      {p.claimed_by_name && <span className="muted">{t('dem.claimedBy', { name: p.claimed_by_name })} · </span>}
                      {p.po_id && <Link href={`/suppliers/orders/${p.po_id}`}>{t('dem.viewOrder')}</Link>}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge" style={{ color: statusColor(p.status), height: 'fit-content' }}>{t(`dem.${p.status}`)}</span>
                  {p.status === 'open' && (
                    <div style={{ marginTop: 10 }}>
                      <button className="secondary" onClick={() => cancelPost(p.id)}>{t('dem.cancel')}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .dem-lines { display: grid; gap: 8px; }
        .dem-line { display: grid; grid-template-columns: 2fr 1.4fr 1fr 72px auto; gap: 6px; align-items: center; }
        .dem-line input { font-size: 15px; }
        @media (max-width: 640px) {
          .dem-line { grid-template-columns: 1fr 1fr; }
          .dem-line-name { grid-column: 1 / -1; }
        }
      `}</style>
    </div>
  );
}
