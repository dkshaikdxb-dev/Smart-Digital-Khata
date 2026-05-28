import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';

const collections = [
  {
    customer: 'Aman Stores',
    amount: '₹ 18,000',
    status: 'Pending'
  },
  {
    customer: 'Rahul Traders',
    amount: '₹ 7,500',
    status: 'Collected'
  }
];

export default function CollectionsPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />

      <div style={{ flex: 1 }}>
        <Header title="Collections" />

        <main style={{ padding: '30px' }}>
          <table
            style={{
              width: '100%',
              background: '#fff',
              borderCollapse: 'collapse'
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: '16px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '16px', textAlign: 'left' }}>Amount</th>
                <th style={{ padding: '16px', textAlign: 'left' }}>Status</th>
              </tr>
            </thead>

            <tbody>
              {collections.map(item => (
                <tr key={item.customer}>
                  <td style={{ padding: '16px' }}>{item.customer}</td>
                  <td style={{ padding: '16px' }}>{item.amount}</td>
                  <td style={{ padding: '16px' }}>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      </div>
    </div>
  );
}
