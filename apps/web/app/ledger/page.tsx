export default function LedgerPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              Ledger Entries
            </h1>
            <p className="text-gray-600">
              Credit and debit transaction history
            </p>
          </div>

          <button className="bg-black text-white px-5 py-3 rounded-xl">
            Add Entry
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">Amount</th>
                <th className="text-left p-4">Date</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="p-4">No ledger entries available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
