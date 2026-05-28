'use client';

export default function Toast({ message, type = 'success' }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        background: type === 'success' ? '#16a34a' : '#dc2626',
        color: '#fff',
        padding: '14px 20px',
        borderRadius: '10px',
        zIndex: 9999
      }}
    >
      {message}
    </div>
  );
}
