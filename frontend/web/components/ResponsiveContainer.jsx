'use client';

export default function ResponsiveContainer({ children }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '20px'
      }}
    >
      {children}
    </div>
  );
}
