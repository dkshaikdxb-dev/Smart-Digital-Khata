import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getCustomerToken } from '../../lib/customerApi';

// Entry point: logged-in customers go to the shop directory, others to login.
export default function CustomerEntry() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getCustomerToken() ? '/c/shops' : '/c/login');
  }, [router]);
  return (
    <div className="cpwa">
      <div className="cpwa-shell">
        <main className="cpwa-main">
          <div className="card" style={{ textAlign: 'center' }}>Loading…</div>
        </main>
      </div>
    </div>
  );
}
