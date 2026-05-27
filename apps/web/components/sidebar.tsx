export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold mb-10">
        Smart Khata
      </h1>

      <nav className="space-y-4">
        <a href="/dashboard" className="block hover:text-gray-300">
          Dashboard
        </a>

        <a href="/customers" className="block hover:text-gray-300">
          Customers
        </a>

        <a href="/ledger" className="block hover:text-gray-300">
          Ledger
        </a>
      </nav>
    </aside>
  );
}
