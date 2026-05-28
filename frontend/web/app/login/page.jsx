export default function LoginPage() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Login</h1>

      <form>
        <input placeholder="Email" type="email" />
        <br />
        <br />
        <input placeholder="Password" type="password" />
        <br />
        <br />
        <button type="submit">Login</button>
      </form>
    </main>
  );
}
