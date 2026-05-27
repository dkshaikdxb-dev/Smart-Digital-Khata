export default function Topbar() {
  return (
    <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
      <div>
        <h1 className="text-xl font-semibold">
          Smart Digital Khata
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <button className="bg-black text-white px-4 py-2 rounded-lg">
          Logout
        </button>
      </div>
    </header>
  );
}
