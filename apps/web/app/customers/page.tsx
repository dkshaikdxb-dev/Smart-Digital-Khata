export default function CustomersPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              Customers
            </h1>
            <p className="text-gray-600">
              Manage merchant customer ledger accounts
            </p>
          </div>

          <button className="bg-black text-white px-5 py-3 rounded-xl">
            Add Customer
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Mobile</th>
                <th className="text-left p-4">Outstanding</th>
                <th className="text-left p-4">Status</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="p-4">No customers added</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
