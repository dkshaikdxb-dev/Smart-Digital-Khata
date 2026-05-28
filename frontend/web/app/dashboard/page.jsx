import Sidebar from '../../components/Sidebar';

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />

      <main style={{ flex: 1, padding: '40px' }}>
        <h1>Merchant Dashboard</h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginTop: '30px'
          }}
        >
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px' }}>
            <h3>Total Collections</h3>
            <p>₹ 2,45,000</p>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px' }}>
            <h3>Outstanding Dues</h3>
            <p>₹ 84,000</p>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px' }}>
            <h3>AI Risk Alerts</h3>
            <p>12 Active Alerts</p>
          </div>
        </div>
      </main>
    </div>
  );
}
