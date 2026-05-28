'use client';

export default function VirtualizedTable({ items = [] }) {
  const visibleItems = items.slice(0, 20);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden'
      }}
    >
      {visibleItems.map((item, index) => (
        <div
          key={index}
          style={{
            padding: '16px',
            borderBottom: '1px solid #f3f4f6'
          }}
        >
          {JSON.stringify(item)}
        </div>
      ))}
    </div>
  );
}
