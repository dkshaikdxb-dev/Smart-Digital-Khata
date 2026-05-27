export default function AddLedgerEntryModal() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold mb-6">
          Add Ledger Entry
        </h2>

        <form className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">
              Amount
            </label>
            <input
              type="number"
              placeholder="Enter amount"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">
              Entry Type
            </label>

            <select className="w-full border rounded-lg px-4 py-3">
              <option>Credit</option>
              <option>Debit</option>
            </select>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">
              Notes
            </label>

            <textarea
              placeholder="Optional notes"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              className="border px-5 py-3 rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="bg-black text-white px-5 py-3 rounded-lg"
            >
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
