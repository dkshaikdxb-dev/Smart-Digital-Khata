import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import ProductThumb from '../components/ProductThumb';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
// Paise → a plain rupee string for editable inputs (e.g. 4550 → "45.5").
const rupeeStr = (p) => String(Number(p || 0) / 100);
const CATALOG_PAGE = 30;
const emptyCustom = { product: '', brand: '', pack: '', category: '', subcategory: '', unit: '', price: '' };

export default function Catalog() {
  const router = useRouter();
  const { t } = useLang();

  const [tab, setTab] = useState('range'); // 'range' | 'browse' | 'custom'
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // --- My range -----------------------------------------------------------
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [priceDraft, setPriceDraft] = useState({}); // { [productId]: rupees string }
  const [photoBusy, setPhotoBusy] = useState(null); // product id currently up/downloading
  const [photoErr, setPhotoErr] = useState({}); // { [productId]: message }

  // --- Add from catalogue (base) -----------------------------------------
  const [categories, setCategories] = useState([]);
  const [catSearch, setCatSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catCategory, setCatCategory] = useState('');
  const [catSubcategory, setCatSubcategory] = useState('');
  const [catItems, setCatItems] = useState([]);
  const [catCursor, setCatCursor] = useState(null);
  const [catLoading, setCatLoading] = useState(false);
  const [catPriceDraft, setCatPriceDraft] = useState({}); // { [catalogItemId]: rupees string }
  const [catChecked, setCatChecked] = useState({}); // { [catalogItemId]: bool } — override of the carried default
  const [bulkBusy, setBulkBusy] = useState(null); // product group key being bulk-added

  // --- Add custom item ----------------------------------------------------
  const [customForm, setCustomForm] = useState(emptyCustom);
  const [customBusy, setCustomBusy] = useState(false);

  async function load() {
    const r = await apiFetch('/api/products');
    setItems(r.items || r.products || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load().catch((e) => setError(e.message));
    apiFetch('/api/catalog/categories')
      .then((r) => setCategories(r.categories || []))
      .catch(() => { /* categories are optional chrome; ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the catalogue search box so a long base list isn't queried per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(catSearch), 300);
    return () => clearTimeout(id);
  }, [catSearch]);

  // Fetch a fresh page of base items whenever the browse filters change (and the
  // browse tab is open). Load-more is handled separately via next_cursor.
  useEffect(() => {
    if (tab !== 'browse') return;
    loadCatalog(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedSearch, catCategory, catSubcategory]);

  async function loadCatalog(reset) {
    setError('');
    setCatLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (catCategory) params.set('category', catCategory);
      if (catSubcategory) params.set('subcategory', catSubcategory);
      params.set('limit', String(CATALOG_PAGE));
      if (!reset && catCursor) params.set('cursor', catCursor);
      const r = await apiFetch(`/api/catalog?${params.toString()}`);
      const next = r.items || [];
      setCatItems((prev) => (reset ? next : [...prev, ...next]));
      setCatCursor(r.next_cursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCatLoading(false);
    }
  }

  // ---- My range mutations -----------------------------------------------
  async function savePrice(p) {
    setError(''); setMsg('');
    const raw = priceDraft[p.id] != null ? priceDraft[p.id] : rupeeStr(p.price);
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ price: Math.round(Number(raw) * 100) }),
      });
      await load();
      setMsg(t('cat.priceSaved'));
    } catch (err) { setError(err.message); }
  }

  // Toggle is_active — this is the "list / deselect" control for a range item.
  async function toggleActive(p) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !(p.is_active !== false) }),
      });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function remove(p) {
    if (!window.confirm(t('cat.deleteConfirm', { name: p.name }))) return;
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err.message); }
  }

  // Replace one product in local state from a server response (new image_url).
  function applyProduct(next) {
    if (!next || !next.id) return;
    setItems((prev) => prev.map((it) => (it.id === next.id ? { ...it, ...next } : it)));
  }

  // Photo upload is multipart, so it uses a raw fetch (NOT apiFetch): the browser
  // must set the multipart boundary itself, so we never set Content-Type by hand.
  async function uploadPhoto(p, file) {
    if (!file) return;
    setError(''); setMsg('');
    setPhotoErr((e) => ({ ...e, [p.id]: '' }));
    setPhotoBusy(p.id);
    try {
      const token = window.localStorage.getItem('skhata_token');
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API}/api/products/${p.id}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      applyProduct(body.product || body);
    } catch (err) {
      setPhotoErr((e) => ({ ...e, [p.id]: err.message }));
    } finally {
      setPhotoBusy(null);
    }
  }

  async function removePhoto(p) {
    setError(''); setMsg('');
    setPhotoErr((e) => ({ ...e, [p.id]: '' }));
    setPhotoBusy(p.id);
    try {
      const r = await apiFetch(`/api/products/${p.id}/image`, { method: 'DELETE' });
      applyProduct(r.product || r);
    } catch (err) {
      setPhotoErr((e) => ({ ...e, [p.id]: err.message }));
    } finally {
      setPhotoBusy(null);
    }
  }

  // The price a variant row shows: an explicit draft, else the shop's current
  // price if already carried, else the catalogue's indicative price.
  function variantPrice(it) {
    if (catPriceDraft[it.id] != null) return catPriceDraft[it.id];
    return rupeeStr(it.carried && it.shop_price != null ? it.shop_price : it.indicative_price);
  }
  // Whether a variant row is checked — carried variants default to checked.
  function isChecked(it) {
    return catChecked[it.id] != null ? catChecked[it.id] : !!it.carried;
  }

  // ---- Add from catalogue: bulk-select a product group's variants --------
  async function addSelected(group) {
    setError(''); setMsg('');
    const items = group.items
      .filter((it) => isChecked(it))
      .map((it) => ({ catalog_item_id: it.id, price: Math.round(Number(variantPrice(it)) * 100) }));
    if (items.length === 0) return;
    setBulkBusy(group.key);
    try {
      await apiFetch('/api/catalog/select-bulk', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      const byId = new Map(items.map((i) => [i.catalog_item_id, i.price]));
      setCatItems((prev) => prev.map((x) => (byId.has(x.id)
        ? { ...x, carried: true, shop_price: byId.get(x.id) }
        : x)));
      await load();
      setMsg(t('cat.addedToRange'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(null);
    }
  }

  // ---- Add custom item ---------------------------------------------------
  async function createCustom(e) {
    e.preventDefault();
    setError(''); setMsg('');
    setCustomBusy(true);
    try {
      const body = { product: customForm.product, price: Math.round(Number(customForm.price) * 100) };
      if (customForm.brand.trim()) body.brand = customForm.brand.trim();
      if (customForm.pack.trim()) body.pack = customForm.pack.trim();
      if (customForm.category.trim()) body.category = customForm.category.trim();
      if (customForm.subcategory.trim()) body.subcategory = customForm.subcategory.trim();
      if (customForm.unit.trim()) body.unit = customForm.unit.trim();
      await apiFetch('/api/catalog/custom', { method: 'POST', body: JSON.stringify(body) });
      setCustomForm(emptyCustom);
      await load();
      setTab('range');
      setMsg(t('cat.customAdded'));
    } catch (err) {
      setError(err.message);
    } finally {
      setCustomBusy(false);
    }
  }

  // ---- Derived -----------------------------------------------------------
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.unit || '').toLowerCase().includes(q))
    : items;

  const activeCat = categories.find((c) => c.category === catCategory);
  const subOptions = (activeCat && activeCat.subcategories) || [];

  // Group the current page of catalogue items by product (first-seen order), so
  // the owner adds all sizes/brands of a product at once. Whatever the current
  // page returns is grouped; further variants may arrive via "Load more".
  const catGroups = [];
  const groupIndex = new Map();
  for (const it of catItems) {
    const key = it.product || it.display_name || it.id;
    let g = groupIndex.get(key);
    if (!g) {
      g = { key, product: it.product || it.display_name || t('common.product'), items: [] };
      groupIndex.set(key, g);
      catGroups.push(g);
    }
    g.items.push(it);
  }

  const columns = [
    {
      key: 'photo', label: t('cat.photo'), render: (p) => {
        const busy = photoBusy === p.id;
        const hasPhoto = !!p.image_url;
        return (
          <span className="cat-photo" onClick={(e) => e.stopPropagation()}>
            <ProductThumb product={p} size={44} />
            <span className="cat-photo-actions">
              <label className="secondary cat-photo-btn" aria-disabled={busy}>
                {hasPhoto ? t('cat.changePhoto') : t('cat.uploadPhoto')}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    e.target.value = '';
                    uploadPhoto(p, f);
                  }}
                />
              </label>
              {hasPhoto && (
                <button type="button" className="secondary" disabled={busy}
                  onClick={(e) => { e.stopPropagation(); removePhoto(p); }}>
                  {t('cat.removePhoto')}
                </button>
              )}
              {photoErr[p.id] && <span className="cat-photo-err">{photoErr[p.id]}</span>}
            </span>
          </span>
        );
      },
    },
    {
      key: 'name', label: t('common.product'), render: (p) => (
        <span>
          <strong>{p.name}</strong>
          {p.unit ? <span className="muted"> · {p.unit}</span> : null}
        </span>
      ),
    },
    {
      key: 'price', label: t('cat.yourPrice'), render: (p) => (
        <span className="cat-price-cell" onClick={(e) => e.stopPropagation()}>
          <input
            className="cat-price-input"
            type="number" min="0" step="0.01"
            value={priceDraft[p.id] != null ? priceDraft[p.id] : rupeeStr(p.price)}
            onChange={(e) => setPriceDraft((d) => ({ ...d, [p.id]: e.target.value }))}
          />
          <button className="secondary" onClick={() => savePrice(p)}>{t('common.save')}</button>
        </span>
      ),
    },
    {
      key: 'is_active', label: t('common.status'), render: (p) => (
        <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}
          title={p.is_active !== false ? t('cat.activeTitle') : t('cat.hiddenTitle')}>
          {p.is_active !== false ? t('cat.active') : t('cat.hidden')}
        </button>
      ),
    },
    {
      key: 'actions', label: t('common.actions'), align: 'right', render: (p) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); remove(p); }}>{t('common.delete')}</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.catalog')}</h1>

        <div className="cat-tabs">
          <button className={`cat-tab${tab === 'range' ? ' active' : ''}`} onClick={() => setTab('range')}>{t('cat.myRange')}</button>
          <button className={`cat-tab${tab === 'browse' ? ' active' : ''}`} onClick={() => setTab('browse')}>{t('cat.addFromCatalogue')}</button>
          <button className={`cat-tab${tab === 'custom' ? ' active' : ''}`} onClick={() => setTab('custom')}>{t('cat.addCustom')}</button>
        </div>

        {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}

        {/* 1. My range ---------------------------------------------------- */}
        {tab === 'range' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <input placeholder={t('cat.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            </div>
            {items.length === 0 ? (
              <p className="muted" style={{ padding: '8px 2px' }}>{t('cat.rangeEmpty')}</p>
            ) : (
              <DataTable columns={columns} rows={filtered} empty={t('cat.noResults')} />
            )}
          </div>
        )}

        {/* 2. Add from catalogue ----------------------------------------- */}
        {tab === 'browse' && (
          <div className="card">
            <div className="cat-browse-filters">
              <input
                placeholder={t('cat.catalogueSearchPlaceholder')}
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
              />
              <select
                value={catCategory}
                onChange={(e) => { setCatCategory(e.target.value); setCatSubcategory(''); }}
              >
                <option value="">{t('cat.allCategories')}</option>
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
                ))}
              </select>
              <select
                value={catSubcategory}
                onChange={(e) => setCatSubcategory(e.target.value)}
                disabled={!catCategory || subOptions.length === 0}
              >
                <option value="">{t('cat.allSubcategories')}</option>
                {subOptions.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                ))}
              </select>
            </div>

            {catGroups.length > 0 && (
              <p className="muted" style={{ marginTop: 0 }}>{t('cat.selectSizes')}</p>
            )}

            <div className="cat-list">
              {catGroups.map((g) => {
                const busy = bulkBusy === g.key;
                const anyChecked = g.items.some((it) => isChecked(it));
                const cat = [g.items[0].category, g.items[0].subcategory].filter(Boolean).join(' › ');
                return (
                  <div key={g.key} className="cat-group">
                    <div className="cat-group-head">
                      <strong>{g.product}</strong>
                      <span className="muted"> · {t('cat.variants')} ({g.items.length})</span>
                      {cat ? <div className="muted cat-group-cat">{cat}</div> : null}
                    </div>
                    <div className="cat-group-vars">
                      {g.items.map((it) => {
                        const carried = !!it.carried;
                        const meta = [it.brand, it.pack].filter(Boolean).join(' · ') || it.display_name || g.product;
                        return (
                          <div key={it.id} className="cat-var-row">
                            <input
                              type="checkbox"
                              className="cat-var-check"
                              checked={isChecked(it)}
                              aria-label={meta}
                              onChange={(e) => setCatChecked((c) => ({ ...c, [it.id]: e.target.checked }))}
                            />
                            <span className="cat-var-name">
                              {meta}
                              {carried && <span className="badge cat-var-badge">{t('cat.inYourShop')}</span>}
                            </span>
                            <span className="cat-var-price">
                              <span className="cat-var-rs">₹</span>
                              <input
                                className="cat-price-input"
                                type="number" min="0" step="0.01"
                                aria-label={t('cat.yourPrice')}
                                value={variantPrice(it)}
                                onChange={(e) => setCatPriceDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                              />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="cat-group-foot">
                      <button disabled={busy || !anyChecked} onClick={() => addSelected(g)}>{t('cat.addSelected')}</button>
                    </div>
                  </div>
                );
              })}
              {!catLoading && catGroups.length === 0 && (
                <p className="muted" style={{ padding: '8px 2px' }}>{t('cat.noResults')}</p>
              )}
              {catLoading && <p className="muted" style={{ padding: '8px 2px' }}>{t('common.loading')}</p>}
            </div>

            {catCursor && (
              <div style={{ marginTop: 12 }}>
                <button className="secondary" disabled={catLoading} onClick={() => loadCatalog(false)}>{t('cat.loadMore')}</button>
                <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>{t('cat.morePagesHint')}</p>
              </div>
            )}
          </div>
        )}

        {/* 3. Add custom item -------------------------------------------- */}
        {tab === 'custom' && (
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>{t('cat.customHint')}</p>
            <form onSubmit={createCustom}>
              <div className="grid">
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.productName')}</span>
                  <input value={customForm.product} onChange={(e) => setCustomForm({ ...customForm, product: e.target.value })} required />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.brand')}</span>
                  <input value={customForm.brand} onChange={(e) => setCustomForm({ ...customForm, brand: e.target.value })} />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.pack')}</span>
                  <input value={customForm.pack} onChange={(e) => setCustomForm({ ...customForm, pack: e.target.value })} />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.category')}</span>
                  <input value={customForm.category} onChange={(e) => setCustomForm({ ...customForm, category: e.target.value })} />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.subcategory')}</span>
                  <input value={customForm.subcategory} onChange={(e) => setCustomForm({ ...customForm, subcategory: e.target.value })} />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('common.unit')}</span>
                  <input placeholder={t('cat.unitPlaceholder')} value={customForm.unit} onChange={(e) => setCustomForm({ ...customForm, unit: e.target.value })} />
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">{t('cat.priceRs')}</span>
                  <input type="number" min="0" step="0.01" value={customForm.price} onChange={(e) => setCustomForm({ ...customForm, price: e.target.value })} required />
                </label>
              </div>
              <div style={{ marginTop: 14 }}>
                <button disabled={customBusy}>{t('cat.addCustom')}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
