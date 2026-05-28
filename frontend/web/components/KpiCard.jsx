export default function KpiCard({ title, value }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <h3 style={{ marginBottom: '10px', color: '#6b7280' }}>{title}</h3>
      <p style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{value}</p>
    </div>
  );
}
