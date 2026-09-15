import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';
import { uiError } from '../lib/errorText';
import { usePermissions } from '../lib/adminPerms';
import { money } from '../lib/money';
import { refreshPendingReview } from '../lib/pendingReview';
import GeoChips from './GeoChips';

// THE review queue — the one place the approve/reject behaviour lives.
//
// It used to be ~250 lines inside the Campaigns desk (pages/admin/ads.js), which
// is why the page actually called "Moderation" had nothing but an audit log on
// it. The behaviour is unchanged and the endpoints are the existing ones; what
// changed is that it is now a component, so the Moderation page and the
// Campaigns desk render the SAME queue rather than two copies free to drift.
//
// Three queues, in the order a desk should read them:
//   1. post-publish spot checks  — already public, a second look at what the AI
//      published on its own (POST /moderation/spot-checks/:id)
//   2. storefront photos         — pre-publish (POST /shop-images/:id/approve|reject)
//   3. shop promo requests       — pre-publish, and a reject refunds credits
//      server-side (POST /promos/:id/approve|reject)
//
// Nothing about money is decided here. Approving a promo makes it serve and
// rejecting it refunds the shop's Khata Credits exactly once — both on the
// backend's own guarded path. This component only carries the decision and the
// review note to it.
//
// Gated on ads:manage, the same permission as every endpoint it calls, so it
// renders nothing at all (and asks for nothing) for an admin who could not act
// on the answer anyway.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// The gallery photo bytes are served by the API host (not the dashboard origin).
const resolveImg = (url) => (!url ? '' : (/^https?:\/\//i.test(url) ? url : `${API}${url}`));

const cell = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' };

// The "N waiting" pill. --warn-bg/--warn-ink is the audited warning pairing
// (contrast-audit B5, 4.5:1), so a count that has to be noticed is readable
// rather than a new colour nobody measured.
const countPill = { background: 'var(--warn-bg)', color: 'var(--warn-ink)' };

export default function ModerationQueue({ pageLink = false, onDecision }) {
  const { t } = useLang();
  const { has } = usePermissions();
  const canManage = has('ads:manage');

  const [pending, setPending] = useState([]); // self-serve shop promos awaiting moderation
  const [modBusy, setModBusy] = useState(null); // id currently being approved/rejected
  // Storefront photo moderation queue: photos awaiting review + the shops
  // currently trusted to auto-publish.
  const [photoQueue, setPhotoQueue] = useState({ items: [], auto_publish_shops: [] });
  const [photoBusy, setPhotoBusy] = useState(null); // photo id / shop id being acted on
  // Post-publish spot checks: a sample of what the AI published, waiting for a
  // human second look. Everything in here is ALREADY LIVE.
  const [spotChecks, setSpotChecks] = useState([]);
  const [spotBusy, setSpotBusy] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Every load is best-effort: a failure leaves that queue empty rather than
  // taking the whole desk down with it.
  const loadPending = useCallback(async () => {
    if (!canManage) return;
    try {
      const r = await apiFetch('/api/admin/promos/pending');
      setPending(r.items || []);
    } catch (e) { /* non-fatal — the queue just stays empty */ }
  }, [canManage]);

  const loadPhotoQueue = useCallback(async () => {
    if (!canManage) return;
    try {
      const r = await apiFetch('/api/admin/shop-images/pending');
      setPhotoQueue({ items: r.items || [], auto_publish_shops: r.auto_publish_shops || [] });
    } catch (e) { /* non-fatal — the queue just stays empty */ }
  }, [canManage]);

  const loadSpotChecks = useCallback(async () => {
    if (!canManage) return;
    try {
      const r = await apiFetch('/api/admin/moderation/spot-checks');
      setSpotChecks(r.items || []);
    } catch (e) { /* non-fatal — the card just stays empty */ }
  }, [canManage]);

  useEffect(() => { if (canManage) loadPending(); }, [canManage, loadPending]);
  useEffect(() => { if (canManage) loadPhotoQueue(); }, [canManage, loadPhotoQueue]);
  useEffect(() => { if (canManage) loadSpotChecks(); }, [canManage, loadSpotChecks]);

  const reloadAll = () => { loadSpotChecks(); loadPhotoQueue(); loadPending(); };

  // After any decision: the chrome's pending count falls with the queue, and the
  // host page refreshes whatever else the decision moved (the campaign list and
  // the AI-triage strip on the Campaigns desk; the audit log on the Moderation
  // page — the decision has just been written to it).
  const decided = () => {
    refreshPendingReview();
    if (onDecision) onDecision();
  };

  // OK → the AI was right, the item stays live and the check closes. Not OK →
  // the item is taken straight back down to the review queue (it stops being
  // public), the shop loses the trust point the auto-approval earned, and the
  // decision is audited against this admin.
  async function reviewSpotCheck(id, verdict) {
    if (!canManage || spotBusy) return;
    setSpotBusy(id); setError(''); setMsg('');
    try {
      const r = await apiFetch(`/api/admin/moderation/spot-checks/${id}`, {
        method: 'POST', body: JSON.stringify({ verdict }),
      });
      setMsg(verdict === 'ok'
        ? t('modq.msgSpotOk')
        : t(r && r.took_down === false ? 'modq.msgSpotBadAlready' : 'modq.msgSpotBad'));
      await Promise.all([loadSpotChecks(), loadPhotoQueue(), loadPending()]);
      decided();
    } catch (e) { setError(uiError(t, e, 'moderation queue')); }
    finally { setSpotBusy(null); }
  }

  // Approve → the photo goes live on the storefront. Reject → it never shows and
  // the note is shown to the owner on their photo. No money moves either way.
  async function moderatePhoto(id, action, note) {
    if (!canManage || photoBusy) return;
    setPhotoBusy(id); setError(''); setMsg('');
    try {
      const body = note ? { review_note: note } : {};
      await apiFetch(`/api/admin/shop-images/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setMsg(t(action === 'approve' ? 'modq.msgPhotoApproved' : 'modq.msgPhotoRejected'));
      await loadPhotoQueue();
      decided();
    } catch (e) { setError(uiError(t, e, 'moderation queue')); }
    finally { setPhotoBusy(null); }
  }

  // Per-shop trust toggle: future uploads from this shop publish without review
  // (on) or wait in this queue (off). Already-pending photos stay in the queue.
  async function setAutoPublish(shopId, on) {
    if (!canManage || photoBusy) return;
    setPhotoBusy(shopId); setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/shops/${shopId}/slides`, { method: 'PATCH', body: JSON.stringify({ auto_publish: !!on }) });
      setMsg(t(on ? 'modq.msgTrustOn' : 'modq.msgTrustOff'));
      await loadPhotoQueue();
    } catch (e) { setError(uiError(t, e, 'moderation queue')); }
    finally { setPhotoBusy(null); }
  }

  // Approve → the promo goes active and starts serving. Reject → it is declined
  // and the shop's Khata Credits are refunded (idempotently, server-side).
  async function moderate(id, action, note, isFree) {
    if (!canManage || modBusy) return;
    setModBusy(id); setError(''); setMsg('');
    try {
      // review_note is the canonical field; it is captured on both approve and
      // reject and shown back to the owner on their placement.
      const body = note ? { review_note: note } : {};
      await apiFetch(`/api/admin/promos/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setMsg(action === 'approve'
        ? t('modq.msgPromoApproved')
        : t(isFree ? 'modq.msgPromoRejected' : 'modq.msgPromoRefunded'));
      await loadPending();
      decided();
    } catch (e) { setError(uiError(t, e, 'moderation queue')); }
    finally { setModBusy(null); }
  }

  // A view-only admin (ads:view, no ads:manage) could not act on any of this, so
  // it is not shown to them at all — and nothing above was ever fetched.
  if (!canManage) return null;

  const total = spotChecks.length + photoQueue.items.length + pending.length;

  return (
    <>
      <div className="card" style={{ borderLeft: total > 0 ? '4px solid var(--warn)' : '4px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>
            {t('modq.title')}{' '}
            {total > 0 && <span className="badge" style={countPill}>{total}</span>}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {pageLink && <Link href="/admin/moderation">{t('modq.openOnModeration')}</Link>}
            <button type="button" className="secondary" onClick={reloadAll}>{t('common.refresh')}</button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {total > 0 ? t('modq.subtitle') : t('modq.allClear')}
        </p>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {/* POST-PUBLISH SPOT CHECKS. Deliberately its own card, above the two
          pre-publish queues and tinted differently: everything here is ALREADY
          PUBLIC. "OK" closes the check; "Not OK" takes the item down and drops
          it back into the queue below. */}
      <div className="card" style={{ borderLeft: `4px solid ${spotChecks.length ? 'var(--warn)' : 'var(--border)'}` }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>
            {t('modq.spot')} <span className="badge" style={spotChecks.length ? countPill : undefined}>{spotChecks.length}</span>
          </h3>
          <button type="button" className="secondary" onClick={loadSpotChecks}>{t('common.refresh')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{t('modq.spotHelp')}</p>
        {spotChecks.length === 0 ? (
          <div className="muted">{t('modq.spotEmpty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('modq.colShop')}</th>
                  <th>{t('modq.colItem')}</th>
                  <th>{t('modq.colAiSaid')}</th>
                  <th>{t('modq.colPublished')}</th>
                  <th>{t('mod.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {spotChecks.map((sc) => (
                  <SpotCheckRow key={sc.id} sc={sc} busy={spotBusy === sc.id} onReview={reviewSpotCheck} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Storefront photo queue. Owner photos wait here at pending_review until a
          manager approves (→ live on the storefront) or rejects them (→ never
          shown, note goes to the owner). The per-shop trust toggle lets a shop's
          uploads skip the queue. */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>
            {t('modq.photos')} <span className="badge" style={photoQueue.items.length ? countPill : undefined}>{photoQueue.items.length}</span>
          </h3>
          <button type="button" className="secondary" onClick={loadPhotoQueue}>{t('common.refresh')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{t('modq.photosHelp')}</p>
        {photoQueue.items.length === 0 ? (
          <div className="muted">{t('modq.photosEmpty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('modq.colShop')}</th>
                  <th>{t('modq.colPhoto')}</th>
                  <th>{t('modq.colAi')}</th>
                  <th>{t('modq.colUploaded')}</th>
                  <th>{t('modq.colTrust')}</th>
                  <th>{t('mod.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {photoQueue.items.map((p) => (
                  <PhotoPendingRow
                    key={p.id} p={p} t={t}
                    busy={photoBusy === p.id || photoBusy === p.shop_id}
                    onModerate={moderatePhoto}
                    onAutoPublish={setAutoPublish}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {photoQueue.auto_publish_shops.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t('modq.trustedShops')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {photoQueue.auto_publish_shops.map((s) => (
                <span key={s.shop_id} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#14532d', color: '#bbf7d0' }}>
                  {s.shop_name}{s.shop_city ? ` · ${s.shop_city}` : ''}
                  <button
                    type="button"
                    disabled={photoBusy === s.shop_id}
                    onClick={() => setAutoPublish(s.shop_id, false)}
                    title={t('modq.trustRemove')}
                    aria-label={t('modq.trustRemoveAria', { shop: s.shop_name })}
                    style={{ background: 'transparent', color: 'inherit', padding: 0, fontWeight: 700, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Shop self-serve promo queue. Shops buy a promo with Khata Credits; it
          waits here at pending_review until a manager approves it (→ live) or
          rejects it (→ refunded, once, server-side). */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>
            {t('modq.promos')} <span className="badge" style={pending.length ? countPill : undefined}>{pending.length}</span>
          </h3>
          <button type="button" className="secondary" onClick={loadPending}>{t('common.refresh')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{t('modq.promosHelp')}</p>
        {pending.length === 0 ? (
          <div className="muted">{t('modq.promosEmpty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('modq.colShop')}</th>
                  <th>{t('modq.colCreative')}</th>
                  <th>{t('modq.colAi')}</th>
                  <th>{t('modq.colTargets')}</th>
                  <th>{t('modq.colWindow')}</th>
                  <th>{t('modq.colPaid')}</th>
                  <th>{t('mod.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <PendingRow key={p.id} p={p} busy={modBusy === p.id} onModerate={moderate} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// The AI's suggestion on a queue row: decision + confidence % + its one-line
// reason. "Hold" is a red pill (the row is also tinted), "Approve" green (it sat
// below the auto-approve threshold, so a human still decides), "Review" neutral.
// Nothing when the job has not run (feature off / no verdict).
const AI_BADGE = {
  approve: { key: 'modq.aiApprove', bg: '#14532d', fg: '#bbf7d0' },
  hold: { key: 'modq.aiHold', bg: '#7f1d1d', fg: '#fecaca' },
  review: { key: 'modq.aiReview', bg: '#334155', fg: '#cbd5e1' },
};
function AiBadge({ v, t }) {
  if (!v || !AI_BADGE[v.decision]) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  const b = AI_BADGE[v.decision];
  const pct = Number.isFinite(Number(v.confidence)) ? `${Math.round(Number(v.confidence) * 100)}%` : '';
  const cats = Array.isArray(v.categories) && v.categories.length ? v.categories.join(', ') : '';
  return (
    <div style={{ display: 'grid', gap: 3, maxWidth: 220 }}>
      <span className="badge" style={{ background: b.bg, color: b.fg, width: 'fit-content' }} title={cats || undefined}>
        {t(b.key)}{pct ? ` · ${pct}` : ''}
      </span>
      {v.reason && <div className="muted" style={{ fontSize: 12 }}>{v.reason}</div>}
    </div>
  );
}

// Rows the AI flagged sort first and read as "look at me".
const flaggedRow = { background: 'rgba(127, 29, 29, 0.28)' };
const aiReason = (p) => (p && p.ai_verdict && typeof p.ai_verdict.reason === 'string' ? p.ai_verdict.reason : '');

/**
 * The action cluster every pre-publish row shares.
 *
 * Three ways out, and the note is the reason this is one component rather than
 * two copies: the backend captures review_note on BOTH verbs and shows it back
 * to the owner, but the desk only ever offered it on reject. "Approve with note"
 * is the missing half — an approval that carries a word of guidance instead of
 * silence.
 *
 *   Approve            one tap, no note
 *   Approve with note  opens the note field, then Confirm approve
 *   Reject             opens the reason field (pre-filled with the AI's reason
 *                      when there is one), then Confirm reject
 */
function RowActions({ busy, rejectPlaceholder, aiPrefill, onApprove, onReject, t }) {
  const [mode, setMode] = useState(null); // null | 'approve' | 'reject'
  const [note, setNote] = useState('');
  const close = () => { setMode(null); setNote(''); };
  const trimmed = () => note.trim() || undefined;

  if (mode) {
    const rejecting = mode === 'reject';
    return (
      <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
        <input
          value={note}
          placeholder={rejecting ? rejectPlaceholder : t('modq.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          aria-label={t(rejecting ? 'modq.reasonLabel' : 'modq.noteLabel')}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            style={rejecting ? { color: 'var(--danger)' } : undefined}
            disabled={busy}
            onClick={() => (rejecting ? onReject(trimmed()) : onApprove(trimmed()))}
          >
            {busy ? '…' : t(rejecting ? 'modq.confirmReject' : 'modq.confirmApprove')}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={close}>{t('common.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" disabled={busy} onClick={() => onApprove(undefined)}>
        {busy ? '…' : t('modq.approve')}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setNote(''); setMode('approve'); }}>
        {t('modq.noteApprove')}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setNote(aiPrefill || ''); setMode('reject'); }}>
        {t('modq.reject')}
      </button>
    </div>
  );
}

// One row in the shop self-serve moderation queue. Approve → live; Reject
// captures an optional note (shown to the owner) and, for a PAID promo, refunds
// the shop's credits server-side. A FREE request (is_free) paid nothing, so its
// reject refunds nothing — the row makes that explicit with a "Free" pill.
function PendingRow({ p, busy, onModerate, t }) {
  const isFree = !!p.is_free || (Number(p.credits_spent_paise) || 0) === 0;
  const paid = money(p.credits_spent_paise);
  const win = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
  return (
    <tr style={p.ai_flagged ? flaggedRow : undefined}>
      <td style={cell}>
        <div style={{ fontWeight: 600 }}>{p.shop_name || p.advertiser || '—'}</div>
        {p.shop_city && <div className="muted" style={{ fontSize: 12 }}>{p.shop_city}</div>}
      </td>
      <td style={cell}>
        <div>{p.glyph} {p.offer_text || <span className="muted">{t('modq.noOffer')}</span>}</div>
        {p.subtitle && <div className="muted" style={{ fontSize: 12 }}>{p.subtitle}</div>}
      </td>
      <td style={cell}><AiBadge v={p.ai_verdict} t={t} /></td>
      <td style={cell}><GeoChips targets={p.targets} /></td>
      <td style={cell}>{win(p.starts_at)} – {win(p.ends_at)}</td>
      <td style={cell}>
        {isFree
          ? <span className="badge" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>{t('modq.free')}</span>
          : paid}
      </td>
      <td style={cell}>
        <RowActions
          busy={busy}
          t={t}
          aiPrefill={aiReason(p)}
          rejectPlaceholder={t(isFree ? 'modq.reasonFree' : 'modq.reasonPaid')}
          onApprove={(note) => onModerate(p.id, 'approve', note, isFree)}
          onReject={(note) => onModerate(p.id, 'reject', note, isFree)}
        />
      </td>
    </tr>
  );
}

// One row in the POST-PUBLISH spot-check card. The item is already live, so this
// is a two-button row and nothing else: OK (the AI was right) or Not OK (take it
// down now, back into the review queue). No note input — the real decision
// happens in the pre-publish queue the item lands back in.
function SpotCheckRow({ sc, busy, onReview, t }) {
  const when = sc.created_at ? new Date(sc.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const creative = sc.creative || {};
  return (
    <tr>
      <td style={cell}>
        <div style={{ fontWeight: 600 }}>{sc.shop_name || '—'}</div>
        {sc.shop_city && <div className="muted" style={{ fontSize: 12 }}>{sc.shop_city}</div>}
      </td>
      <td style={cell}>
        {sc.kind === 'shop_image' ? (
          sc.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={resolveImg(sc.url)} alt={t('modq.publishedAlt')} style={{ width: 88, height: 66, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
            : <span className="muted">{t('modq.colPhoto')}</span>
        ) : (
          <div style={{ maxWidth: 260 }}>
            <div>{creative.glyph} {creative.offer_text || creative.title || <span className="muted">{t('modq.noOffer')}</span>}</div>
            {creative.subtitle && <div className="muted" style={{ fontSize: 12 }}>{creative.subtitle}</div>}
          </div>
        )}
        {!sc.live && <div className="muted" style={{ fontSize: 12 }}>{t('modq.alreadyDown')}</div>}
      </td>
      <td style={cell}><AiBadge v={sc.ai_verdict} t={t} /></td>
      <td style={cell}>{when}</td>
      <td style={cell}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => onReview(sc.id, 'ok')}>{busy ? '…' : t('modq.ok')}</button>
          <button type="button" className="secondary" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => onReview(sc.id, 'bad')}>
            {t('modq.takeDown')}
          </button>
        </div>
      </td>
    </tr>
  );
}

// One row in the storefront photo moderation queue. Mirrors PendingRow: Approve
// → live; Reject captures an optional note shown to the owner (pre-filled with
// the AI's reason when there is one). The auto-publish checkbox is the per-shop
// trust toggle.
function PhotoPendingRow({ p, busy, onModerate, onAutoPublish, t }) {
  const when = p.uploaded_at ? new Date(p.uploaded_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <tr style={p.ai_flagged ? flaggedRow : undefined}>
      <td style={cell}>
        <div style={{ fontWeight: 600 }}>{p.shop_name || '—'}</div>
        {p.shop_city && <div className="muted" style={{ fontSize: 12 }}>{p.shop_city}</div>}
      </td>
      <td style={cell}>
        <a href={resolveImg(p.url)} target="_blank" rel="noreferrer" title={t('modq.openFull')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImg(p.url)}
            alt={t('modq.photoAlt', { shop: p.shop_name || '', n: (p.position || 0) + 1 })}
            loading="lazy"
            style={{ display: 'block', width: 160, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
          />
        </a>
      </td>
      <td style={cell}><AiBadge v={p.ai_verdict} t={t} /></td>
      <td style={cell}><div style={{ fontSize: 13 }}>{when}</div></td>
      <td style={cell}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto', cursor: 'pointer' }} title={t('modq.trustTitle')}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={!!p.auto_publish}
            disabled={busy}
            onChange={(e) => onAutoPublish(p.shop_id, e.target.checked)}
          />
          <span style={{ fontSize: 12 }}>{t('modq.trustShop')}</span>
        </label>
      </td>
      <td style={cell}>
        <RowActions
          busy={busy}
          t={t}
          aiPrefill={aiReason(p)}
          rejectPlaceholder={t('modq.reasonPhoto')}
          onApprove={(note) => onModerate(p.id, 'approve', note)}
          onReject={(note) => onModerate(p.id, 'reject', note)}
        />
      </td>
    </tr>
  );
}
