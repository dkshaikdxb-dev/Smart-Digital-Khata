export default function AddCustomerModal() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold mb-6">
          Add Customer
        </h2>

        <form className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">
              Customer Name
            </label>
            <input
              type="text"
              placeholder="Enter customer name"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">
              Mobile Number
            </label>
            <input
              type="text"
              placeholder="Enter mobile number"
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
              Save Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
