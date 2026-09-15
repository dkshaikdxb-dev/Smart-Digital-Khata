// Compact geo summary for a table cell: an "Everywhere" pill, or up to a few
// value chips per kind with a "+N" overflow.
//
// Lives here rather than in a page because both surfaces that list campaign
// targeting need it — the Campaigns matrix and the shop-request row in the
// review queue (components/ModerationQueue.js).
export default function GeoChips({ targets }) {
  const list = targets || [];
  if (list.some((t) => t.geo_type === 'all')) {
    return <span className="badge" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>Everywhere</span>;
  }
  if (list.length === 0) return <span className="muted">—</span>;
  const shown = list.slice(0, 4);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240 }}>
      {shown.map((t, i) => (
        <span key={i} className="badge" title={t.geo_type}>{t.geo_type[0].toUpperCase()}·{t.geo_value}</span>
      ))}
      {list.length > shown.length && <span className="badge">+{list.length - shown.length}</span>}
    </div>
  );
}
