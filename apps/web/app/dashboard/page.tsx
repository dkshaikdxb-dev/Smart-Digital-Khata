export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              Merchant Dashboard
            </h1>
            <p className="text-gray-600">
              Smart Digital Khata Overview
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-sm text-gray-500 mb-2">
              Total Outstanding
            </h2>
            <p className="text-3xl font-bold">
              ₹0
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-sm text-gray-500 mb-2">
              Customers
            </h2>
            <p className="text-3xl font-bold">
              0
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-sm text-gray-500 mb-2">
              Collections
            </h2>
            <p className="text-3xl font-bold">
              ₹0
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-sm text-gray-500 mb-2">
              Pending Dues
            </h2>
            <p className="text-3xl font-bold">
              ₹0
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Recent Transactions
          </h2>

          <div className="text-gray-500">
            No transactions available.
          </div>
        </div>
      </div>
    </main>
  );
}
