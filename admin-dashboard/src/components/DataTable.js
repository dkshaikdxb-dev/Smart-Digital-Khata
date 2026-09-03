/**
 * Responsive table: real table on desktop, stacked cards on phones.
 * columns: [{ key, label, render?(row), align? }]
 * onRowClick optional.
 */
export default function DataTable({ columns, rows, onRowClick, empty = 'Nothing here yet.' }) {
  if (!rows || rows.length === 0) {
    return <p className="muted" style={{ padding: '8px 2px' }}>{empty}</p>;
  }
  const cell = (col, row) => (col.render ? col.render(row) : row[col.key]);

  return (
    <div className="dt">
      {/* Desktop table */}
      <div className="dt-table">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => <td key={c.key} style={{ textAlign: c.align || 'left' }}>{cell(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="dt-cards">
        {rows.map((row, i) => (
          <div key={row.id || i} className="dt-card" onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
            {columns.map((c) => (
              <div key={c.key} className="dt-row">
                <span className="dt-key">{c.label}</span>
                <span className="dt-val">{cell(c, row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
