import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import SupplierTabs from '../../components/SupplierTabs';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// A single blank PO line. catalog_item_id is intentionally never sent from the
// owner side — the picker only prefills the free-text fields — so the backend
// FK to catalog_items can never be violated.
const blankLine = () => ({ name: '', brand: '', pack: '', unit: '', qty: 1 });

export default function Suppliers() {
  const router = useRouter();
  const { t } = useLang();

  const [suppliers, setSuppliers] = useState([]);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [kind, setKind] = useState(''); // '' | 'farmer'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Reorder modal state
  const [target, setTarget] = useState(null); // the supplier being ordered from
  const [lines, setLines] = useState([blankLine()]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [modalErr, setModalErr] = useState('');

  // Product picker (prefill helper)
  const [products, setProducts] = useState([]);
  const [pickSearch, setPickSearch] = useState('');

  async function load(cat, br, kd) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (br) params.set('brand', br);
      if (kd) params.set('kind', kd);
      const qs = params.toString();
      const r = await apiFetch(`/api/suppliers${qs ? `?${qs}` : ''}`);
      setSuppliers(r.suppliers || []);
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
    load('', '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The set of category/brand chips comes from whatever suppliers the shop's
  // city returned — no separate taxonomy call needed.
  const allCategories = useMemo(() => {
    const set = new Set();
    suppliers.forEach((s) => (s.categories || []).forEach((c) => c && set.add(c)));
    return Array.from(set).sort();
  }, [suppliers]);
  const allBrands = useMemo(() => {
    const set = new Set();
    suppliers.forEach((s) => (s.brands || []).forEach((b) => b && set.add(b)));
    return Array.from(set).sort();
  }, [suppliers]);

  function pickCategory(c) {
    const next = category === c ? '' : c;
    setCategory(next);
    load(next, brand, kind);
  }
  function pickBrand(b) {
    const next = brand === b ? '' : b;
    setBrand(next);
    load(category, next, kind);
  }
  function toggleFarmers() {
    const next = kind === 'farmer' ? '' : 'farmer';
    setKind(next);
    load(category, brand, next);
  }
  function clearFilters() {
    setCategory('');
    setBrand('');
    setKind('');
    load('', '', '');
  }

  // ---- Reorder modal ------------------------------------------------------
  function openReorder(supplier) {
    setTarget(supplier);
    setLines([blankLine()]);
    setNote('');
    setModalErr('');
    setPickSearch('');
    // Load the shop's own products once for the prefill picker (best-effort).
    if (products.length === 0) {
      apiFetch('/api/products')
        .then((r) => setProducts(r.items || r.products || []))
        .catch(() => { /* picker is optional chrome */ });
    }
  }
  function closeReorder() {
    setTarget(null);
  }

  function updateLine(i, patch) {
    setLines((prev) => prev.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function removeLine(i) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function addFromProduct(p) {
    // Prefill a new line from a shop product; catalog_item_id stays unset.
    const line = { name: p.name || '', brand: p.brand || '', pack: p.pack || '', unit: p.unit || '', qty: 1 };
    setLines((prev) => {
      // Reuse a leading blank line if present, else append.
      if (prev.length === 1 && !prev[0].name.trim()) return [line];
      return [...prev, line];
    });
  }

  async function submitPO(e) {
    e.preventDefault();
    setModalErr('');
    const items = lines
      .filter((ln) => ln.name.trim() && Number(ln.qty) > 0)
      .map((ln) => {
        const it = { name: ln.name.trim(), qty: Math.round(Number(ln.qty)) };
        if (ln.brand.trim()) it.brand = ln.brand.trim();
        if (ln.pack.trim()) it.pack = ln.pack.trim();
        if (ln.unit.trim()) it.unit = ln.unit.trim();
        return it;
      });
    if (items.length === 0) { setModalErr(t('sup.needItem')); return; }
    setSending(true);
    try {
      const body = { distributor_id: target.id, items };
      if (note.trim()) body.note = note.trim();
      await apiFetch('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body) });
      setSent(t('sup.sent', { name: target.business_name }));
      setTarget(null);
    } catch (err) {
      setModalErr(err.message);
    } finally {
      setSending(false);
    }
  }

  const pq = pickSearch.trim().toLowerCase();
  const pickResults = pq
    ? products.filter((p) => (p.name || '').toLowerCase().includes(pq)).slice(0, 8)
    : [];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('sup.title')}</h1>
        <p className="muted" style={{ marginTop: -6 }}>{t('sup.subtitle')}</p>

        <SupplierTabs active="discover" />

        {sent && <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>{sent}</div>}
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="card">
          <div style={{ marginBottom: (allCategories.length > 0 || allBrands.length > 0) ? 12 : 0 }}>
            <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
              <button className={kind === 'farmer' ? '' : 'secondary'} onClick={toggleFarmers}>{t('sup.freshFilter')}</button>
            </div>
          </div>
          {(allCategories.length > 0 || allBrands.length > 0) && (
            <>
            {allCategories.length > 0 && (
              <div style={{ marginBottom: allBrands.length ? 12 : 0 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('sup.filterCategory')}</div>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  {allCategories.map((c) => (
                    <button key={c} className={category === c ? '' : 'secondary'} onClick={() => pickCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>
            )}
            {allBrands.length > 0 && (
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('sup.filterBrand')}</div>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  {allBrands.map((b) => (
                    <button key={b} className={brand === b ? '' : 'secondary'} onClick={() => pickBrand(b)}>{b}</button>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
          {(category || brand || kind) && (
            <div style={{ marginTop: 12 }}>
              <button className="secondary" onClick={clearFilters}>{t('sup.clearFilters')}</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : suppliers.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0 }}>{category || brand || kind ? t('sup.filterEmpty') : t('sup.empty')}</p>
            {!(category || brand || kind) && <p className="muted" style={{ marginBottom: 0 }}>{t('sup.emptyHint')}</p>}
          </div>
        ) : (
          <div className="grid">
            {suppliers.map((s) => (
              <div key={s.id} className="card" style={{ marginBottom: 0 }}>
                <h3 style={{ margin: '0 0 4px' }}>
                  {s.business_name}
                  {s.is_farmer && <span className="badge" style={{ marginInlineStart: 8 }}>{t('sup.farmerBadge')}</span>}
                </h3>
                {s.is_farmer && s.village && <div className="muted">{t('sup.village')}: {s.village}</div>}
                {s.area && <div className="muted">{t('sup.area')}: {s.area}{s.city ? `, ${s.city}` : ''}</div>}
                {(s.categories || []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span className="muted">{t('sup.carries')}: </span>
                    {(s.categories || []).map((c) => <span key={c} className="badge" style={{ marginRight: 4 }}>{c}</span>)}
                  </div>
                )}
                {(s.brands || []).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span className="muted">{t('sup.brands')}: </span>
                    {(s.brands || []).map((b) => <span key={b} className="badge" style={{ marginRight: 4 }}>{b}</span>)}
                  </div>
                )}
                <div className="muted" style={{ marginTop: 8 }}>
                  {t('sup.minOrder')}: {Number(s.min_order_paise) > 0 ? fmt(s.min_order_paise) : t('sup.noMinOrder')}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => openReorder(s)}>{t('sup.reorder')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <>
          <div className="owner-more-backdrop" onClick={closeReorder} aria-hidden="true" style={{ display: 'block' }} />
          <div className="sup-modal" role="dialog" aria-label={t('sup.newPO')}>
            <form onSubmit={submitPO}>
              <h3 style={{ marginTop: 0 }}>{t('sup.newPO')}</h3>
              <p className="muted">{t('sup.orderingFrom', { name: target.business_name })}</p>
              <p className="muted" style={{ fontSize: 13 }}>{t('sup.priceNote')}</p>

              {/* Prefill from my catalogue */}
              <div style={{ marginBottom: 12 }}>
                <input
                  placeholder={t('sup.searchCatalogue')}
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                />
                {pickResults.length > 0 && (
                  <div className="sup-pick-list">
                    {pickResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="secondary sup-pick-item"
                        onClick={() => { addFromProduct(p); setPickSearch(''); }}
                      >
                        {p.name}{p.unit ? ` · ${p.unit}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="sup-lines">
                {lines.map((ln, i) => (
                  <div key={i} className="sup-line">
                    <input
                      className="sup-line-name"
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
                      className="sup-line-qty"
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
                <button type="button" className="secondary" onClick={addLine}>+ {t('sup.addItem')}</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <textarea
                  placeholder={t('sup.noteOptional')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: 'var(--text)', fontSize: 16 }}
                />
              </div>

              {modalErr && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{modalErr}</div>}

              <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" className="secondary" onClick={closeReorder}>{t('common.cancel')}</button>
                <button type="submit" disabled={sending}>{sending ? t('sup.sending') : t('sup.send')}</button>
              </div>
            </form>
          </div>
        </>
      )}

      <style jsx>{`
        .sup-modal {
          position: fixed; z-index: 32; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: min(560px, calc(100vw - 24px));
          max-height: calc(100vh - 48px); overflow-y: auto;
          background: var(--card); border: 1px solid #334155; border-radius: 16px;
          padding: 20px;
        }
        .sup-pick-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .sup-pick-item { padding: 6px 10px; font-size: 13px; }
        .sup-lines { display: grid; gap: 8px; }
        .sup-line { display: grid; grid-template-columns: 2fr 1.4fr 1fr 72px auto; gap: 6px; align-items: center; }
        .sup-line input { font-size: 15px; }
        @media (max-width: 640px) {
          .sup-line { grid-template-columns: 1fr 1fr; }
          .sup-line-name { grid-column: 1 / -1; }
        }
      `}</style>
    </div>
  );
}
