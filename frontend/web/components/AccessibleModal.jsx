'use client';

export default function AccessibleModal({ title, children, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: '24px',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px'
        }}
      >
        <h2 id="modal-title">{title}</h2>
        <div>{children}</div>
        <button aria-label="Close modal" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
