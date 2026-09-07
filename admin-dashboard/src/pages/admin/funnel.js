import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';

// Admin acquisition funnel (Analytics Phase 1). Renders
// GET /api/admin/analytics/funnel?days=30 — five funnel stages with the
// stage-to-stage conversion / drop computed client-side, plus a by-source
// breakdown of the signup cohort. Auth/guard mirrors pages/admin/dashboard.js
// (token + admin role), and the request carries the admin bearer token via the
// shared apiFetch helper in src/lib/api.js.

const num = (n) => Number(n || 0).toLocaleString('en-IN');

// Percentage of `part` out of `whole`, guarding divide-by-zero. Returns null
// when there is no denominator so callers can render an em-dash.
function ratioPct(part, whole) {
  const w = Number(whole || 0);
  if (w <= 0) return null;
  return Math.round((Number(part || 0) / w) * 1000) / 10; // 1 decimal place
}

const fmtPct = (v) => (v == null ? '—' : `${v}%`);

const DAY_OPTIONS = [7, 30, 90];

export default function Funnel() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/analytics/funnel?days=${d}`);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load funnel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function changeDays(d) {
    setDays(d);
    load(d);
  }

  const stages = (data && Array.isArray(data.stages)) ? data.stages : [];
  const bySource = (data && Array.isArray(data.bySource)) ? data.bySource : [];
  const topCount = stages.length ? Number(stages[0].count || 0) : 0;
  const hasAnyData = stages.some((s) => Number(s.count || 0) > 0);

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Acquisition funnel</h1>
        <p className="muted">
          From anonymous landing visits to shops that collect a payment. Top-of-funnel stages
          count distinct anonymous sessions; the lower stages track the signup cohort created in
          this window.
        </p>

        {/* Days selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 16px', flexWrap: 'wrap' }}>
          <span className="muted">Window:</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => changeDays(d)}
              className={d === days ? undefined : 'secondary'}
              style={{ borderRadius: 999, padding: '6px 16px', ...(d === days ? { fontWeight: 700 } : {}) }}
            >
              {d} days
            </button>
          ))}
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
        {loading && !data && <div className="card">Loading…</div>}

        {data && !hasAnyData && (
          <div className="card">No data yet for this window.</div>
        )}

        {data && hasAnyData && (
          <>
            {/* Funnel stages: one row per stage, with conversion/drop vs. the
                previous stage shown between rows. */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Stages</h3>
              <div style={{ display: 'grid', gap: 0 }}>
                {stages.map((s, i) => {
                  const count = Number(s.count || 0);
                  const prev = i > 0 ? Number(stages[i - 1].count || 0) : null;
                  const conv = i > 0 ? ratioPct(count, prev) : null;
                  const drop = conv == null ? null : Math.round((100 - conv) * 10) / 10;
                  const widthPct = topCount > 0 ? Math.max(2, (count / topCount) * 100) : 2;
                  const overall = i > 0 ? ratioPct(count, topCount) : null;
                  return (
                    <div key={s.key || i}>
                      {i > 0 && (
                        <div
                          className="muted"
                          style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '4px 2px 6px', fontSize: 13 }}
                        >
                          <span>
                            ↳ Conversion:{' '}
                            <strong style={{ color: 'var(--accent)' }}>{fmtPct(conv)}</strong>
                          </span>
                          <span>
                            Drop:{' '}
                            <strong style={{ color: drop && drop > 0 ? 'var(--danger)' : 'var(--text)' }}>
                              {fmtPct(drop)}
                            </strong>
                          </span>
                          <span>vs. visited: {fmtPct(overall)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 170, flex: '0 0 auto' }}>
                          <div style={{ fontWeight: 600 }}>{s.label || s.key}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{s.key}</div>
                        </div>
                        <div style={{ flex: 1, background: '#0b1220', borderRadius: 6, minWidth: 40 }}>
                          <div
                            style={{
                              width: `${widthPct}%`,
                              minWidth: 4,
                              height: 34,
                              borderRadius: 6,
                              background: 'var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              paddingRight: 10,
                              color: '#000',
                              fontWeight: 700,
                            }}
                          >
                            {widthPct > 18 ? num(count) : ''}
                          </div>
                        </div>
                        <div style={{ width: 90, textAlign: 'end', fontWeight: 700, flex: '0 0 auto' }}>{num(count)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By-source breakdown of the signup cohort. */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>By source</h3>
              {bySource.length === 0 ? (
                <div className="muted">No signups in this window.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th style={{ textAlign: 'end' }}>Signups</th>
                      <th style={{ textAlign: 'end' }}>Activated</th>
                      <th style={{ textAlign: 'end' }}>Collecting</th>
                      <th style={{ textAlign: 'end' }}>Signup → collecting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((row, i) => {
                      const conv = ratioPct(row.collecting, row.signups);
                      return (
                        <tr key={(row.source || 'src') + i}>
                          <td>{row.source || '(direct)'}</td>
                          <td style={{ textAlign: 'end' }}>{num(row.signups)}</td>
                          <td style={{ textAlign: 'end' }}>{num(row.activated)}</td>
                          <td style={{ textAlign: 'end' }}>{num(row.collecting)}</td>
                          <td style={{ textAlign: 'end', color: conv == null ? 'var(--muted)' : 'var(--accent)' }}>
                            {fmtPct(conv)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {data.window && data.window.from && data.window.to && (
              <p className="muted" style={{ fontSize: 13 }}>
                Window: {new Date(data.window.from).toLocaleDateString()} – {new Date(data.window.to).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
