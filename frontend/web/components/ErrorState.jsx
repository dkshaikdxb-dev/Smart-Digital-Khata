export default function ErrorState({ message = 'Something went wrong' }) {
  return (
    <div
      style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        padding: '20px',
        borderRadius: '10px',
        color: '#991b1b'
      }}
    >
      <strong>Error:</strong> {message}
    </div>
  );
}
