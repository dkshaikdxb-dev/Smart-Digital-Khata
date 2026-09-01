import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Nav() {
  const router = useRouter();
  const [role, setRole] = useState(null);

  useEffect(() => {
    setRole(window.localStorage.getItem('skhata_role') || 'owner');
  }, []);

  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    window.localStorage.removeItem('skhata_role');
    router.push('/login');
  };

  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      {role === 'admin' ? (
        <>
          <Link href="/admin">Platform</Link>
          <span className="badge">Platform Admin</span>
        </>
      ) : (
        <>
          <Link href="/">Dashboard</Link>
          <Link href="/customers">Customers</Link>
          <Link href="/transactions">Transactions</Link>
          <Link href="/settings">Settings</Link>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button className="secondary" onClick={logout}>Log out</button>
    </div>
  );
}
