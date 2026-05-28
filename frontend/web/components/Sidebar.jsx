const links = [
  'Dashboard',
  'Customers',
  'Collections',
  'Payments',
  'AI Insights',
  'Risk Monitoring'
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: '240px',
        background: '#111827',
        color: '#fff',
        minHeight: '100vh',
        padding: '24px'
      }}
    >
      <h2>Smart Khata</h2>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {links.map(link => (
          <li key={link} style={{ margin: '16px 0' }}>
            {link}
          </li>
        ))}
      </ul>
    </aside>
  );
}
