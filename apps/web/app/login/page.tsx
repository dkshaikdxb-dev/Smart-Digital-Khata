export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Merchant Login
        </h1>

        <form className="space-y-4">
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
              placeholder="Enter password"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-lg"
          >
            Login
          </button>
        </form>
      </div>
    </main>
  );
}
