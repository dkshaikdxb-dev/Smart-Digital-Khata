export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-lg">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Merchant Registration
        </h1>

        <form className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">
              Full Name
            </label>
            <input
              type="text"
              placeholder="Enter full name"
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

          <div>
            <label className="block mb-2 text-sm font-medium">
              Password
            </label>
            <input
              type="password"
              placeholder="Create password"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-lg"
          >
            Create Account
          </button>
        </form>
      </div>
    </main>
  );
}
