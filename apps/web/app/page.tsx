export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">
          Smart Digital Khata
        </h1>

        <p className="text-lg text-gray-700 mb-8">
          Modern ledger and local commerce platform for merchants.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-2">
              Customers
            </h2>
            <p>Manage customer ledgers and balances.</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-2">
              Ledger
            </h2>
            <p>Track credit and debit transactions.</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-2">
              Collections
            </h2>
            <p>Monitor outstanding dues and reminders.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
