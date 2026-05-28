'use client';

export default function AccessibleButton({ label, onClick }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        background: '#111827',
        color: '#fff',
        border: 'none',
        padding: '12px 18px',
        borderRadius: '8px',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  );
}
