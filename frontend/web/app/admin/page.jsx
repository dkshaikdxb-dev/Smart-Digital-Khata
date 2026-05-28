import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import KpiCard from '../../components/KpiCard';

export default function AdminDashboardPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />

      <div style={{ flex: 1 }}>
        <Header title="Admin Dashboard" />

        <main style={{ padding: '30px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '20px'
            }}
          >
            <KpiCard title="Active Merchants" value="1,248" />
            <KpiCard title="Fraud Alerts" value="18" />
            <KpiCard title="Collections Today" value="₹ 8.4L" />
            <KpiCard title="AI Predictions" value="12,480" />
          </div>
        </main>
      </div>
    </div>
  );
}
