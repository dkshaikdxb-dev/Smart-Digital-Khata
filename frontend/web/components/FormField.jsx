'use client';

export default function FormField({ label, error, ...props }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: 'bold'
        }}
      >
        {label}
      </label>

      <input
        {...props}
        style={{
          width: '100%',
          padding: '14px',
          border: `1px solid ${error ? '#dc2626' : '#d1d5db'}`,
          borderRadius: '10px'
        }}
      />

      {error && (
        <p style={{ color: '#dc2626', marginTop: '6px' }}>{error}</p>
      )}
    </div>
  );
}
