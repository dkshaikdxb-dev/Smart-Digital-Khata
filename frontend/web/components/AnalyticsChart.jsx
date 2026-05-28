'use client';

export default function AnalyticsChart() {
  const bars = [60, 90, 40, 80, 120, 70];

  return (
    <div
      style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '12px'
      }}
    >
      <h3>Collections Analytics</h3>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          height: '200px',
          marginTop: '20px'
        }}
      >
        {bars.map((height, index) => (
          <div
            key={index}
            style={{
              width: '40px',
              height: `${height}px`,
              background: '#111827',
              borderRadius: '6px 6px 0 0'
            }}
          />
        ))}
      </div>
    </div>
  );
}
