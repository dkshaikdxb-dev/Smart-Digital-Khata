import { useEffect, useRef, useState } from 'react';

// Typed-confirmation modal (batch INTEG). Every integration credential save in
// Admin -> Settings routes through this: it lists the changes about to be made
// (secrets never shown — only "•••• (updated)" / "(cleared)"), shows a warning,
// and enables Confirm ONLY once the operator has typed exactly `I CONFIRM`. The
// backend enforces the same phrase (428 without it), so this is the UX half of
// a server-side guard, not a substitute for it.
//
// Keyboard: the input is focused on open, Enter confirms when the phrase
// matches, Esc (or Cancel / the backdrop) closes. Works at 400px width.
export const CONFIRM_PHRASE = 'I CONFIRM';

export default function ConfirmTyped({
  open,
  title = 'Confirm this change',
  changes = [],
  warning = 'This changes a live integration credential. A wrong value can break payments, messaging or publishing until it is corrected.',
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  // Reset + focus each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setText('');
    const id = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 0);
    return () => clearTimeout(id); // eslint-disable-line consistent-return
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel && onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const ok = text === CONFIRM_PHRASE && !busy;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-typed-title"
        aria-describedby="confirm-typed-warning"
        className="card"
        style={{ width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', margin: 0, border: '1px solid var(--danger)' }}
      >
        <h3 id="confirm-typed-title" style={{ marginTop: 0 }}>{title}</h3>
        {changes.length > 0 && (
          <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
            {changes.map((c, i) => (
              <li key={i} style={{ fontSize: 14, marginBottom: 4 }}>
                <b>{c.label}</b>{c.detail ? <span className="muted">: {c.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p id="confirm-typed-warning" style={{ color: 'var(--danger)', fontSize: 13 }}>{warning}</p>
        <label className="muted" htmlFor="confirm-typed-input">Type <b style={{ color: 'var(--text)' }}>{CONFIRM_PHRASE}</b> to continue</label>
        <input
          id="confirm-typed-input"
          ref={inputRef}
          value={text}
          placeholder={`Type ${CONFIRM_PHRASE}`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok && onConfirm) { e.preventDefault(); onConfirm(); } }}
          style={{ marginTop: 6 }}
        />
        <div className="row-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={!ok} style={!ok ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
