import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useLangFor, isRtl } from '../../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// Public, read-only customer khata. No login — access via unguessable link.
//
// This is a page a customer opens from a WhatsApp message, so it is read far
// more often than anything inside the app, and often on a phone that is not the
// reader's own. It was hardcoded English. Every line now goes through t(), and
// the language comes from the KHATA — the customer's own stored choice, which
// the API returns — falling back to this browser's choice when they have never
// picked one (useLangFor).
export default function PublicKhata() {
  const router = useRouter();
  const { token } = router.query;
  const [khata, setKhata] = useState(null);
  // The error is kept as a KEY, not as an English sentence: the fetch happens
  // before we know the reader's language, and storing prose here would have
  // pinned the message to whatever language it was written in.
  const [errorKey, setErrorKey] = useState('');
  const { lang, t } = useLangFor(khata && khata.language);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/public/khata/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('bad link');
        return r.json();
      })
      .then((d) => setKhata(d.khata))
      .catch(() => setErrorKey('pub.khata.linkInvalid'));
  }, [token]);

  const dir = isRtl(lang) ? 'rtl' : 'ltr';

  if (errorKey) {
    return (
      <Center>
        <div className="card" dir={dir} style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>🔗</div>
          <h3>{t('pub.khata.linkInvalidTitle')}</h3>
          <p className="muted">{t(errorKey)}</p>
        </div>
      </Center>
    );
  }
  if (!khata) return <Center><div className="card">{t('common.loading')}</div></Center>;

  return (
    <div dir={dir} style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="muted">{khata.shop_name}</div>
        <h2 style={{ margin: '4px 0 12px' }}>{t('pub.khata.titleOf', { name: khata.customer_name })}</h2>
        <div className="muted">{t('common.outstanding')}</div>
        <div className="kpi" style={{ color: Number(khata.balance) > 0 ? 'var(--danger)' : 'var(--accent)' }}>
          {fmt(khata.balance)}
        </div>
      </div>

      <div className="card">
        <h3>{t('pub.khata.recent')}</h3>
        <table>
          <thead>
            <tr>
              <th>{t('stmt.date')}</th>
              <th>{t('common.type')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {khata.transactions.map((tx, i) => (
              <tr key={i}>
                <td>{new Date(tx.created_at).toLocaleDateString()}</td>
                <td>
                  {entryLabel(t, tx)}
                  {tx.note ? <div className="muted" style={{ fontSize: 12 }}>{tx.note}</div> : null}
                </td>
                <td style={{ textAlign: 'right', color: tx.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                  {tx.type === 'purchase' ? '+' : '−'}{fmt(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          {t('pub.khata.footer', { shop: khata.shop_name })}
        </p>
      </div>
    </div>
  );
}

// The label for one ledger line. It reuses the type.* keys the owner console
// already uses for exactly these rows, so this page needs no wording of its own
// and is translated wherever those are. A payment method we have no key for
// degrades to the plain word for a payment rather than to a blank cell.
function entryLabel(t, tx) {
  if (tx.type === 'purchase') return t('type.purchase');
  if (tx.method === 'cash') return t('type.cashPayment');
  if (tx.method === 'upi') return t('type.upiPayment');
  return t('c.payment');
}

function Center({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>;
}
