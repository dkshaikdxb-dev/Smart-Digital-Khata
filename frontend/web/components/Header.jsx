export default function Header({ title }) {
  return (
    <header
      style={{
        background: '#fff',
        padding: '20px 30px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <h1 style={{ margin: 0 }}>{title}</h1>

      <div>
        <button
          style={{
            background: '#111827',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px'
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
