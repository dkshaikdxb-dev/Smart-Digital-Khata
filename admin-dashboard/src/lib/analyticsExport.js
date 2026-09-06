// Client-side analytics export for the admin "Khata Control Room" (Batch P).
// All four formats operate on the CURRENTLY-LOADED, permission-filtered payload
// the dashboard already fetched — nothing is re-fetched and no new backend
// endpoint exists, so an export can only ever contain figures the caller was
// already shown.
//
//   CSV   — per-tab metric rows + a commentary section, escaped, as a Blob.
//   PNG   — each on-page inline <svg> chart serialised to a PNG (colours inlined
//           so the raster isn't blank). CSS-bar charts (not SVG) are skipped.
//   PPTX  — a title slide + one slide per permitted domain tab, with KPIs, an
//           embedded chart image (from the PNG step) and the analyst's read.
//   PDF   — handled in the page itself via a print stylesheet + window.print();
//           this module only provides the shared helpers the others reuse.
//
// Money is integer paise in the payload; every rupee string here is produced by
// the caller-supplied rupees() helper (the same one the page renders with), so
// no float money math happens in this module.

// ---- small helpers --------------------------------------------------------

// Trigger a browser download for a Blob via a temporary <a download>. This is
// the real deployed admin app (not a sandbox), so downloads work normally.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the click has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A filesystem-safe slug for filenames.
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'export';
}

// RFC-4180 CSV field quoting: wrap in quotes and double any embedded quote when
// the field contains a comma, quote, or newline. Also neutralises CSV/formula
// injection: a value that a user controls (e.g. a distributor's business name in
// a "Referrer:" row) starting with = + - @ — or a leading tab/CR that some
// parsers strip to reveal one — is executed as a formula by Excel/Sheets, so a
// leading apostrophe is prepended to force it to render as literal text.
function csvField(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells) {
  return cells.map(csvField).join(',');
}

// ---- KPI extraction (per tab) ---------------------------------------------
// Pulls a compact, human-readable KPI list for a tab from the loaded sections.
// Kept deliberately simple and defensive: a missing section yields no rows. The
// `rupees`/`num`/`pct` formatters are passed in from the page so the exported
// figures match exactly what is on screen.
function kpisForTab(tab, s, fmt) {
  const { rupees, num, pct } = fmt;
  const rows = [];
  const add = (label, value) => rows.push({ label, value });

  if (tab === 'overview' && s.overview) {
    const o = s.overview;
    add('Total shops', num(o.total_shops));
    add('Active shops (30d)', num(o.active_shops_30d));
    add('Listed shops', num(o.listed_shops));
    add('Consumers', num(o.total_consumers));
    add('Consumers never ordered', num(o.consumers_never_ordered));
    add('Ledger customers', num(o.total_ledger_customers));
    add('Transactions', num(o.total_transactions));
    add('Orders', num(o.total_orders));
    if (s.network) add('Outstanding (udhaar)', rupees(s.network.outstanding_total_paise));
  } else if (tab === 'marketing' && s.marketing) {
    const m = s.marketing;
    add('Listed shops', num(m.listed_shops));
    add('Listed share', pct(m.listed_share_pct));
    if (Array.isArray(m.source_channel_mix)) {
      for (const c of m.source_channel_mix) add(`Channel: ${c.channel}`, num(c.c));
    }
    if (Array.isArray(m.top_referrers)) {
      for (const r of m.top_referrers) add(`Referrer: ${r.label || r.code}`, num(r.referred_count));
    }
  } else if (tab === 'growth' && s.growth) {
    const g = s.growth;
    const a = g.activation || {};
    if (g.wow) add('Week-over-week', g.wow.pct == null ? '—' : `${g.wow.pct}%`);
    add('Registered shops', num(a.total_shops));
    add('Shops with a product', num(a.shops_with_product));
    add('Shops with a transaction', num(a.shops_with_transaction));
    add('Shops with an order', num(a.shops_with_order));
    add('Never activated', num(a.never_activated));
  } else if (tab === 'finance') {
    const f = s.finance;
    const r = s.revenue;
    if (f) {
      add('MRR', rupees(f.mrr_paise));
      add('ARPU', rupees(f.arpu_paise));
      add('Run-rate', rupees(f.run_rate_paise));
      add('Paying shops', num(f.paying_shops));
      if (f.collection_trend) {
        add('Collection (this 30d)', pct(f.collection_trend.current_pct));
        add('Collection (prior 30d)', pct(f.collection_trend.prior_pct));
      }
    }
    if (r) {
      add('Free / Pro / Family', `${num(r.plan_counts.free)} / ${num(r.plan_counts.pro)} / ${num(r.plan_counts.family)}`);
      add('Upsell candidates', num(r.upsell_candidates));
    }
    if (s.commerce) add('Order GMV (30d)', rupees(s.commerce.gmv_30d_paise));
    if (s.network) add('Outstanding (udhaar)', rupees(s.network.outstanding_total_paise));
  } else if (tab === 'research' && s.research) {
    const c = s.research.catalogue || {};
    add('Shops with products', num(c.shops_with_products));
    add('Using base catalogue', num(c.shops_using_base));
    add('Base-linked items', num(c.base_linked_products));
    add('Custom products', num(c.custom_products));
    add('Loose (by weight)', num(c.loose_products));
    add('By unit', num(c.unit_products));
  } else if (tab === 'investor' && s.investor) {
    const iv = s.investor;
    add('Active shops (30d)', num(iv.active_shops_30d));
    add('Consumers', num(iv.total_consumers));
    add('GMV (30d)', rupees(iv.gmv_30d_paise));
    add('GMV (all time)', rupees(iv.gmv_all_time_paise));
    add('MRR', rupees(iv.mrr_paise));
    add('Run-rate', rupees(iv.run_rate_paise));
    add('Growth (30d vs prior)', iv.growth_rate_pct == null ? '—' : `${iv.growth_rate_pct}%`);
    add('Collection rate', pct(iv.collection_rate_pct));
    add('Outstanding', rupees(iv.outstanding_total_paise));
    add('Referral-driven', pct(iv.referral_driven_pct));
  }
  return rows;
}

// Commentary blocks for a tab (Overview gets all permitted; a domain tab gets
// its own domain). `has` is the frontend perm gate (belt-and-braces).
function commentaryForTab(tab, commentary, has) {
  const all = (commentary || []).filter((b) => (!has || has(b.perm)));
  return tab === 'overview' ? all : all.filter((b) => b.domain === tab);
}

// ============================================================================
// CSV
// ============================================================================
export function exportCsv({ tabs, sections, commentary, generatedAt, fmt, has, tabLabel }) {
  const lines = [];
  lines.push(csvRow(['Khata Control Room — analytics export']));
  lines.push(csvRow(['Generated', generatedAt || '']));
  lines.push('');

  for (const tab of tabs) {
    const kpis = kpisForTab(tab, sections, fmt);
    const blocks = commentaryForTab(tab, commentary, has);
    if (!kpis.length && !blocks.length) continue;
    lines.push(csvRow([`Tab: ${tabLabel(tab)}`]));
    if (kpis.length) {
      lines.push(csvRow(['Metric', 'Value']));
      for (const k of kpis) lines.push(csvRow([k.label, k.value]));
    }
    if (blocks.length) {
      lines.push('');
      lines.push(csvRow(["Analyst's read", 'Tone', 'Observation', 'Interpretation', 'Recommendation']));
      for (const b of blocks) {
        lines.push(csvRow([b.title, b.tone, b.observation, b.interpretation, b.recommendation]));
      }
    }
    lines.push('');
  }

  // Prepend a BOM so Excel opens the UTF-8 rupee sign correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `khata-control-room-${slug(generatedAt || 'export').slice(0, 10)}.csv`);
}

// ============================================================================
// PNG — serialise on-page inline SVG charts to raster images
// ============================================================================

// Resolve CSS custom properties (var(--x)) and currentColor to concrete values
// on a detached clone, so the standalone SVG rasterises with real colours rather
// than transparent/black. We walk the clone alongside the live nodes and copy
// the *computed* fill/stroke/color of each element.
function inlineSvgColors(liveSvg) {
  const clone = liveSvg.cloneNode(true);
  const liveEls = [liveSvg, ...liveSvg.querySelectorAll('*')];
  const cloneEls = [clone, ...clone.querySelectorAll('*')];
  for (let i = 0; i < liveEls.length; i++) {
    const cs = window.getComputedStyle(liveEls[i]);
    const el = cloneEls[i];
    if (!el || el.nodeType !== 1) continue;
    for (const prop of ['fill', 'stroke', 'color']) {
      const val = cs.getPropertyValue(prop);
      if (val && val !== 'none' && !val.includes('var(')) el.style.setProperty(prop, val);
    }
    const sw = cs.getPropertyValue('stroke-width');
    if (sw) el.style.setProperty('stroke-width', sw);
    const fs = cs.getPropertyValue('font-size');
    if (fs) el.style.setProperty('font-size', fs);
  }
  return clone;
}

// Rasterise a single inline SVG element to a PNG data URL (transparent areas
// painted on a solid dark ground so the chart is legible in a slide/print).
function svgToPngDataUrl(liveSvg, { background = '#0b1220', scale = 2 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const rect = liveSvg.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || liveSvg.clientWidth || 320));
      const height = Math.max(1, Math.round(rect.height || liveSvg.clientHeight || 60));
      const clone = inlineSvgColors(liveSvg);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
      };
      img.onerror = reject;
      img.src = svg64;
    } catch (e) {
      reject(e);
    }
  });
}

// Collect every inline <svg> under a root (the active tab's DOM), each with a
// label derived from its nearest section heading. Returns [{svg, label}].
function collectSvgCharts(root) {
  if (!root) return [];
  const svgs = Array.from(root.querySelectorAll('svg'));
  return svgs.map((svg, idx) => {
    let label = '';
    // Nearest card heading above this chart, if any.
    const card = svg.closest('.card');
    const h = card && card.querySelector('h3');
    if (h) label = h.textContent.trim();
    return { svg, label: label || `chart-${idx + 1}` };
  });
}

// Public: render each SVG chart in `root` to a PNG and download it. Returns the
// number of charts exported (0 → the caller can surface "no charts here").
export async function exportChartPngs({ root, tab, tabLabel }) {
  const charts = collectSvgCharts(root);
  let done = 0;
  for (let i = 0; i < charts.length; i++) {
    try {
      const { dataUrl } = await svgToPngDataUrl(charts[i].svg);
      const blob = await (await fetch(dataUrl)).blob();
      downloadBlob(blob, `khata-${slug(tabLabel(tab))}-${slug(charts[i].label)}.png`);
      done += 1;
    } catch (e) {
      // Skip a chart that fails to rasterise; keep going with the rest.
    }
  }
  return done;
}

// Produce PNG data URLs (not downloads) for embedding into the PPTX — one per
// tab, using the FIRST SVG chart found for that tab in the provided DOM map.
async function chartImageForTab(svgByTab, tab) {
  const svg = svgByTab[tab];
  if (!svg) return null;
  try {
    return await svgToPngDataUrl(svg, { scale: 2 });
  } catch (e) {
    return null;
  }
}

// ============================================================================
// PPTX — dynamic import so pptxgenjs stays out of the initial bundle
// ============================================================================
export async function exportPptx({ tabs, sections, commentary, generatedAt, fmt, has, tabLabel, svgByTab }) {
  const mod = await import('pptxgenjs');
  const PptxGenJS = mod.default || mod;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'KHATA', width: 10, height: 5.625 });
  pptx.layout = 'KHATA';

  const BG = '0B1220';
  const ACCENT = '22C55E';
  const TEXT = 'E5E7EB';
  const MUTED = '94A3B8';
  const TONE_HEX = { positive: ACCENT, neutral: MUTED, watch: 'EAB308', risk: 'EF4444' };

  // Title slide.
  const title = pptx.addSlide();
  title.background = { color: BG };
  title.addText('Khata Control Room', {
    x: 0.5, y: 1.6, w: 9, h: 1, fontSize: 40, bold: true, color: TEXT, align: 'center',
  });
  title.addText('Platform analytics — permission-filtered snapshot', {
    x: 0.5, y: 2.7, w: 9, h: 0.5, fontSize: 16, color: MUTED, align: 'center',
  });
  title.addText(`Generated ${generatedAt || ''}`, {
    x: 0.5, y: 3.3, w: 9, h: 0.4, fontSize: 12, color: MUTED, align: 'center',
  });

  for (const tab of tabs) {
    const kpis = kpisForTab(tab, sections, fmt);
    const blocks = commentaryForTab(tab, commentary, has);
    if (!kpis.length && !blocks.length) continue;

    const slide = pptx.addSlide();
    slide.background = { color: BG };
    slide.addText(tabLabel(tab), {
      x: 0.4, y: 0.25, w: 9.2, h: 0.6, fontSize: 26, bold: true, color: ACCENT,
    });

    // KPI table (left column).
    if (kpis.length) {
      const rows = kpis.slice(0, 10).map((k) => ([
        { text: k.label, options: { color: MUTED, fontSize: 11 } },
        { text: k.value, options: { color: TEXT, fontSize: 11, bold: true, align: 'right' } },
      ]));
      slide.addTable(rows, {
        x: 0.4, y: 1.0, w: 4.4, colW: [3.0, 1.4], border: { type: 'none' },
        rowH: 0.28, valign: 'middle',
      });
    }

    // Chart image (right column), defensive: skip if none produced.
    const img = await chartImageForTab(svgByTab, tab);
    if (img && img.dataUrl) {
      const maxW = 4.6; const maxH = 2.2;
      const ratio = img.width / img.height || (maxW / maxH);
      let w = maxW; let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      slide.addImage({ data: img.dataUrl, x: 5.0, y: 1.0, w, h });
    }

    // Analyst's read (bottom band), trimmed to fit.
    if (blocks.length) {
      const parts = [];
      for (const b of blocks.slice(0, 3)) {
        parts.push({ text: `${b.title}  `, options: { bold: true, color: TONE_HEX[b.tone] || TEXT, fontSize: 10 } });
        parts.push({ text: `${b.observation} ${b.interpretation} → ${b.recommendation}\n`, options: { color: TEXT, fontSize: 9 } });
      }
      slide.addText(parts, {
        x: 0.4, y: 3.35, w: 9.2, h: 2.0, valign: 'top', lineSpacingMultiple: 1.05,
      });
    }
  }

  await pptx.writeFile({ fileName: `khata-control-room-${slug(generatedAt || 'export').slice(0, 10)}.pptx` });
}

// Expose the small utilities the page reuses (e.g. for the print report).
export { kpisForTab, commentaryForTab, slug };
