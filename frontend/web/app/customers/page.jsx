import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';

const customers = [
  {
    name: 'Rahul Traders',
    outstanding: '₹ 12,000',
    risk: 'Medium'
  },
  {
    name: 'Aman Stores',
    outstanding: '₹ 28,000',
    risk: 'High'
  }
];

export default function CustomersPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />

      <div style={{ flex: 1 }}>
        <Header title="Customers" />

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
                <th style={{ padding: '16px', textAlign: 'left' }}>Outstanding</th>
                <th style={{ padding: '16px', textAlign: 'left' }}>Risk</th>
              </tr>
            </thead>

            <tbody>
              {customers.map(customer => (
                <tr key={customer.name}>
                  <td style={{ padding: '16px' }}>{customer.name}</td>
                  <td style={{ padding: '16px' }}>{customer.outstanding}</td>
                  <td style={{ padding: '16px' }}>{customer.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      </div>
    </div>
  );
}
