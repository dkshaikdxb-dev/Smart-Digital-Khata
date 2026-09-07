import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Editor-in-chief content desk (Batch Q). Guarded by admin + content:manage. A
// review queue over the editorial pipeline: status counts + filters, a compose
// form, and per-item actions that respect the state machine and the human gate.
// Publishing is never a manual button — the worker does it; the desk shows the
// scheduled time. Until channel adapters are wired, publishing is simulated
// through the outbox (the note at the top says so).

const CHANNELS = [
  'blog', 'linkedin', 'twitter', 'newsletter_community', 'newsletter_ecosystem',
  'whatsapp_tip', 'reel', 'voice',
];
const ENGINES = ['record', 'reach'];
const STATUSES = [
  'idea', 'drafting', 'draft', 'localized', 'in_review', 'approved',
  'scheduled', 'published', 'rejected', 'archived',
];
const FORWARD = ['idea', 'drafting', 'draft', 'localized', 'in_review', 'approved', 'scheduled', 'published'];

// Colour a tier badge by risk: 0 safe (green), 1 needs approval (amber), 2 high
// scrutiny (red).
const TIER_COLOR = { 0: '#166534', 1: '#92400e', 2: '#991b1b' };
const TIER_BG = { 0: '#dcfce7', 1: '#fef3c7', 2: '#fee2e2' };

const cell = { padding: '8px 10px', verticalAlign: 'top', borderTop: '1px solid var(--border, #eee)' };

// The next forward status for the "advance" action; draft/localized jump to
// in_review, earlier states step one rank. Null once at in_review or beyond.
function advanceTarget(status) {
  if (status === 'draft' || status === 'localized') return 'in_review';
  const i = FORWARD.indexOf(status);
  if (i >= 0 && i < FORWARD.indexOf('in_review')) return FORWARD[i + 1];
  return null;
}

function fmtWhen(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

export default function AdminContent() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ status: '', channel: '', engine: '' });
  const [compose, setCompose] = useState({
    channel: 'blog', engine: 'record', autonomy_tier: 0, language: 'en',
    title: '', brief: '', body: '', status: 'idea',
  });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [scheduleId, setScheduleId] = useState(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);
  const [draftingId, setDraftingId] = useState(null);

  const canManage = has('content:manage');

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.channel) qs.set('channel', filters.channel);
      if (filters.engine) qs.set('engine', filters.engine);
      const [s, list, cfg] = await Promise.all([
        apiFetch('/api/admin/content/summary'),
        apiFetch(`/api/admin/content${qs.toString() ? `?${qs}` : ''}`),
        apiFetch('/api/admin/content/config').catch(() => ({ ai_drafting: false })),
      ]);
      setSummary(s);
      setItems(list.items || []);
      setAiDrafting(Boolean(cfg && cfg.ai_drafting));
    } catch (e) { setError(e.message); }
  }, [filters]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    load();
  }, [load, router]);

  async function createItem(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      const payload = {
        channel: compose.channel, engine: compose.engine,
        autonomy_tier: Number(compose.autonomy_tier), language: compose.language,
        title: compose.title || null, brief: compose.brief || null,
        body: compose.body || null, status: compose.status,
      };
      await apiFetch('/api/admin/content', { method: 'POST', body: JSON.stringify(payload) });
      setCompose({ ...compose, title: '', brief: '', body: '' });
      setMsg(t('content.created'));
      await load();
    } catch (e2) { setError(e2.message); }
  }

  // Hand an idea/draft item to the LLM drafting agent. The worker fills the body
  // and moves it to 'draft' — never past the human gate. We poll a refresh so the
  // desk shows the drafted body once the worker finishes.
  async function draftWithAi(id) {
    setError(''); setMsg('');
    setDraftingId(id);
    try {
      await apiFetch(`/api/admin/content/${id}/draft`, { method: 'POST' });
      setMsg(t('content.drafting'));
      // Give the worker a moment, then refresh to pick up the drafted body.
      setTimeout(() => { load().finally(() => setDraftingId(null)); }, 2500);
    } catch (e) {
      setDraftingId(null);
      setError(e.message);
    }
  }

  async function transition(id, to, extra = {}) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/content/${id}/transition`, {
        method: 'POST', body: JSON.stringify({ to, ...extra }),
      });
      setScheduleId(null); setScheduleAt('');
      await load();
    } catch (e) { setError(e.message); }
  }

  function startEdit(item) {
    setEditId(item.id);
    setEditForm({
      title: item.title || '', brief: item.brief || '', body: item.body || '',
      language: item.language || 'en', autonomy_tier: item.autonomy_tier,
    });
  }

  async function saveEdit(id) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/content/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title, brief: editForm.brief, body: editForm.body,
          language: editForm.language, autonomy_tier: Number(editForm.autonomy_tier),
        }),
      });
      setEditId(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function doSchedule(id) {
    if (!scheduleAt) { setError(t('content.schedulePrompt')); return; }
    let iso;
    try { iso = new Date(scheduleAt).toISOString(); } catch (e) { setError('Invalid date'); return; }
    await transition(id, 'scheduled', { scheduled_at: iso });
  }

  if (!ready) return (<Shell><div className="card">{t('content.loading')}</div></Shell>);
  if (!canManage) return (<Shell><div className="card">{t('content.loading')}</div></Shell>);

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('content.back')}</button>
      <h1>{t('content.title')}</h1>
      <p className="muted">{t('content.subtitle')}</p>

      <div className="card" style={{ background: 'var(--warn-bg, #fffbe6)', borderInlineStart: '4px solid #f59e0b' }}>
        {t('content.outboxNote')}
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{
          display: 'inline-block', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: aiDrafting ? '#dcfce7' : '#f1f5f9',
          color: aiDrafting ? '#166534' : '#475569',
        }}>
          {aiDrafting ? t('content.aiConnected') : t('content.aiNotConfigured')}
        </span>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {/* Status counts */}
      <div className="grid">
        <div className="card"><div className="muted">{t('content.summaryTotal')}</div><div className="kpi">{summary ? summary.total : '—'}</div></div>
        {summary && ['idea', 'in_review', 'approved', 'scheduled', 'published'].map((s) => (
          <div className="card" key={s}>
            <div className="muted">{t(`content.status.${s}`)}</div>
            <div className="kpi">{summary.by_status[s] || 0}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="muted">{t('content.filterStatus')}</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t('content.filterAll')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`content.status.${s}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="muted">{t('content.filterChannel')}</label>
          <select value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
            <option value="">{t('content.filterAll')}</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{t(`content.channel.${c}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="muted">{t('content.filterEngine')}</label>
          <select value={filters.engine} onChange={(e) => setFilters({ ...filters, engine: e.target.value })}>
            <option value="">{t('content.filterAll')}</option>
            {ENGINES.map((en) => <option key={en} value={en}>{t(`content.engine.${en}`)}</option>)}
          </select>
        </div>
        <button className="secondary" onClick={load}>{t('content.refresh')}</button>
      </div>

      {/* Compose */}
      <div className="card">
        <h3>{t('content.composeTitle')}</h3>
        <form onSubmit={createItem} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <label className="muted">{t('content.fldChannel')}</label>
              <select value={compose.channel} onChange={(e) => setCompose({ ...compose, channel: e.target.value })}>
                {CHANNELS.map((c) => <option key={c} value={c}>{t(`content.channel.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="muted">{t('content.fldEngine')}</label>
              <select value={compose.engine} onChange={(e) => setCompose({ ...compose, engine: e.target.value })}>
                {ENGINES.map((en) => <option key={en} value={en}>{t(`content.engine.${en}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="muted">{t('content.fldTier')}</label>
              <select value={compose.autonomy_tier} onChange={(e) => setCompose({ ...compose, autonomy_tier: e.target.value })}>
                {[0, 1, 2].map((n) => <option key={n} value={n}>{t(`content.tier.${n}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="muted">{t('content.fldLanguage')}</label>
              <input value={compose.language} onChange={(e) => setCompose({ ...compose, language: e.target.value })} style={{ width: 70 }} />
            </div>
            <div>
              <label className="muted">{t('content.fldStatus')}</label>
              <select value={compose.status} onChange={(e) => setCompose({ ...compose, status: e.target.value })}>
                <option value="idea">{t('content.status.idea')}</option>
                <option value="draft">{t('content.status.draft')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="muted">{t('content.fldTitle')}</label>
            <input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} />
          </div>
          <div>
            <label className="muted">{t('content.fldBrief')}</label>
            <textarea value={compose.brief} onChange={(e) => setCompose({ ...compose, brief: e.target.value })} rows={2} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="muted">{t('content.fldBody')}</label>
            <textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} rows={3} style={{ width: '100%' }} />
          </div>
          <div><button type="submit">{t('content.create')}</button></div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        {items.length === 0 ? (
          <div className="muted">{t('content.empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'start' }}>
                <th style={cell}>{t('content.colTitle')}</th>
                <th style={cell}>{t('content.colChannel')}</th>
                <th style={cell}>{t('content.colEngine')}</th>
                <th style={cell}>{t('content.colTier')}</th>
                <th style={cell}>{t('content.colLanguage')}</th>
                <th style={cell}>{t('content.colStatus')}</th>
                <th style={cell}>{t('content.colScheduled')}</th>
                <th style={cell}>{t('content.colActions')}</th>
              </tr></thead>
              <tbody>
                {items.map((it) => (
                  <ItemRow
                    key={it.id} item={it} t={t}
                    editId={editId} editForm={editForm} setEditForm={setEditForm}
                    startEdit={startEdit} saveEdit={saveEdit} cancelEdit={() => setEditId(null)}
                    transition={transition}
                    scheduleId={scheduleId} setScheduleId={setScheduleId}
                    scheduleAt={scheduleAt} setScheduleAt={setScheduleAt} doSchedule={doSchedule}
                    aiDrafting={aiDrafting} draftingId={draftingId} draftWithAi={draftWithAi}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ItemRow({
  item: it, t, editId, editForm, setEditForm, startEdit, saveEdit, cancelEdit,
  transition, scheduleId, setScheduleId, scheduleAt, setScheduleAt, doSchedule,
  aiDrafting, draftingId, draftWithAi,
}) {
  const editing = editId === it.id;
  const scheduling = scheduleId === it.id;
  const terminal = it.status === 'published' || it.status === 'archived' || it.status === 'rejected';
  const canEdit = it.status !== 'published' && it.status !== 'archived';
  const canArchive = it.status !== 'published' && it.status !== 'archived';
  const adv = advanceTarget(it.status);
  const canSchedule = it.status === 'approved' || (it.status === 'in_review' && it.autonomy_tier === 0);
  // The drafting agent only accepts an idea or an existing draft (a re-draft).
  const canDraftAi = it.status === 'idea' || it.status === 'draft';
  const isDrafting = draftingId === it.id;

  return (
    <tr>
      <td style={cell}>
        {editing ? (
          <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
        ) : (
          <div>
            <div style={{ fontWeight: 600 }}>{it.title || '—'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{t(`content.source${it.source === 'strategist' ? 'Strategist' : 'Human'}`)}</div>
          </div>
        )}
      </td>
      <td style={cell}>{t(`content.channel.${it.channel}`)}</td>
      <td style={cell}><span className="badge">{t(`content.engine.${it.engine}`)}</span></td>
      <td style={cell}>
        <span style={{ background: TIER_BG[it.autonomy_tier], color: TIER_COLOR[it.autonomy_tier], padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
          {t(`content.tierShort.${it.autonomy_tier}`)}
        </span>
      </td>
      <td style={cell}>{it.language}</td>
      <td style={cell}><span className="badge">{t(`content.status.${it.status}`)}</span></td>
      <td style={cell}>
        {it.status === 'published'
          ? <span className="muted">{t('content.publishedAt', { when: fmtWhen(it.published_at) })}</span>
          : it.scheduled_at
            ? <span className="muted">{t('content.scheduledFor', { when: fmtWhen(it.scheduled_at) })}</span>
            : t('content.notScheduled')}
      </td>
      <td style={cell}>
        {editing ? (
          <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
            <textarea value={editForm.brief} onChange={(e) => setEditForm({ ...editForm, brief: e.target.value })} rows={2} placeholder={t('content.fldBrief')} />
            <textarea value={editForm.body} onChange={(e) => setEditForm({ ...editForm, body: e.target.value })} rows={2} placeholder={t('content.fldBody')} />
            <select value={editForm.autonomy_tier} onChange={(e) => setEditForm({ ...editForm, autonomy_tier: e.target.value })}>
              {[0, 1, 2].map((n) => <option key={n} value={n}>{t(`content.tier.${n}`)}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => saveEdit(it.id)}>{t('content.actSave')}</button>
              <button className="secondary" onClick={cancelEdit}>{t('content.actCancel')}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canEdit && <button className="secondary" onClick={() => startEdit(it)}>{t('content.actEdit')}</button>}
            {canDraftAi && (
              <button
                onClick={() => draftWithAi(it.id)}
                disabled={!aiDrafting || isDrafting}
                title={aiDrafting ? '' : t('content.aiNotConfigured')}
                style={{ background: '#4338ca' }}
              >
                {isDrafting ? t('content.drafting') : t('content.draftWithAi')}
              </button>
            )}
            {adv && !terminal && it.status !== 'in_review' && (
              <button onClick={() => transition(it.id, adv)}>{t('content.actAdvance')}</button>
            )}
            {it.status === 'in_review' && (
              <>
                <button style={{ background: '#166534' }} onClick={() => transition(it.id, 'approved')} title={t('content.approveHint')}>{t('content.actApprove')}</button>
                <button style={{ background: '#991b1b' }} onClick={() => transition(it.id, 'rejected')}>{t('content.actReject')}</button>
              </>
            )}
            {canSchedule && !scheduling && (
              <button onClick={() => { setScheduleId(it.id); setScheduleAt(''); }}>{t('content.actSchedule')}</button>
            )}
            {scheduling && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                <button onClick={() => doSchedule(it.id)}>{t('content.actSchedule')}</button>
                <button className="secondary" onClick={() => setScheduleId(null)}>{t('content.actCancel')}</button>
              </span>
            )}
            {canArchive && <button className="secondary" onClick={() => transition(it.id, 'archived')}>{t('content.actArchive')}</button>}
          </div>
        )}
      </td>
    </tr>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
