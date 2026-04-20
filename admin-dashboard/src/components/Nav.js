import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Nav() {
  const router = useRouter();
  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    router.push('/login');
  };
  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      <Link href="/">Dashboard</Link>
      <Link href="/customers">Customers</Link>
      <Link href="/transactions">Transactions</Link>
      <Link href="/settings">Settings</Link>
      <span style={{ flex: 1 }} />
      <button className="secondary" onClick={logout}>Log out</button>
    </div>
  );
}
