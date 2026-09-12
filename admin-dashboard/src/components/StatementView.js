import { useLang } from '../lib/i18n';

// Presentational statement: opening balance, dated lines, closing balance and
// totals. `stmt` is the object returned by the statement endpoints (money in
// paise). `fmt` renders paise → a ₹ string. Used both on-screen and, with
// `print`, inside the hidden print block on the account pages.
export default function StatementView({ stmt, fmt, title, print = false }) {
  const { t } = useLang();
  if (!stmt) return null;
  // A purchase raises what is owed; a payment AND a shop adjustment (batch C)
  // both lower it, so both render as a minus. The colour follows the same rule.
  const signed = (l) => `${l.type === 'purchase' ? '+' : '−'}${fmt(l.amount)}`;
  // The transaction type as a word. `txn.adjustment` is authored in en + hi and
  // falls back to English elsewhere; an unknown future type still renders its
  // raw enum rather than a blank cell.
  const typeLabel = (v) => { const s = t(`txn.${v}`); return s === `txn.${v}` ? v : s; };
  return (
    <div className={print ? 'stmt-print-block' : ''}>
      {title && <h3 style={{ margin: '0 0 8px' }}>{title}</h3>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <div><span className="muted">{t('stmt.opening')}:</span> <strong>{fmt(stmt.opening)}</strong></div>
        <div><span className="muted">{t('stmt.closing')}:</span> <strong>{fmt(stmt.closing)}</strong></div>
        <div><span className="muted">{t('stmt.totalPurchases')}:</span> {fmt(stmt.total_purchases)}</div>
        <div><span className="muted">{t('stmt.totalPaid')}:</span> {fmt(stmt.total_paid)}</div>
        {/* Shown only when the shop actually adjusted something, so an
            untouched statement reads exactly as it always has. An adjustment is
            NOT money the customer paid and never joins that figure. */}
        {Number(stmt.total_adjusted) > 0 && (
          <div><span className="muted">{t('stmt.totalAdjusted')}:</span> {fmt(stmt.total_adjusted)}</div>
        )}
      </div>
      {stmt.lines && stmt.lines.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="stmt-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('stmt.date')}</th>
                <th style={{ textAlign: 'left' }}>{t('common.type')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.balance')}</th>
                <th style={{ textAlign: 'left' }}>{t('common.note')}</th>
              </tr>
            </thead>
            <tbody>
              {stmt.lines.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleDateString()}</td>
                  <td>{typeLabel(l.type)}</td>
                  <td style={{ textAlign: 'right', color: print ? '#000' : (l.type === 'purchase' ? 'var(--danger)' : 'var(--accent)') }}>{signed(l)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(l.balance)}</td>
                  <td>{l.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">{t('stmt.noData')}</div>
      )}
    </div>
  );
}
