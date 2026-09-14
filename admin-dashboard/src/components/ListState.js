import { useLang } from '../lib/i18n';
import { canRetry, friendlyError, supportDetail } from '../lib/errorText';

// The three things a list has to be able to say, in one place.
//
//   loading  we are still asking        -> "Loading…"
//   error    it did not come back       -> an authored sentence + Try again
//   ok       it came back               -> the list, which may then be empty
//
// The point is the boundary between the second and the third. A screen that
// renders its empty state while a request is in flight, or after one failed,
// tells a shopkeeper their khata is empty when what actually happened is that
// the network gave up. Only `ok` reaches the children, so "No customers yet"
// can only ever mean the shop genuinely has no customers.
//
// When the figures came off this phone's own cache the children still render —
// offline reading is the whole point on 2G — with a notice above them saying so
// and a Refresh beside it.

export function StaleNotice({ cachedAt, onRefresh, busy }) {
  const { t, lang } = useLang();
  let when = '';
  if (cachedAt) {
    try {
      when = new Date(cachedAt).toLocaleString(lang === 'en' ? 'en-IN' : undefined, {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      });
    } catch (e) {
      when = new Date(cachedAt).toLocaleString();
    }
  }
  return (
    <div className="list-stale" role="status">
      <div>
        <strong>{t('stale.title')}</strong>
        {when && <div className="list-stale-when">{t('stale.line', { when })}</div>}
      </div>
      <button type="button" className="secondary" onClick={onRefresh} disabled={busy}>
        {t('common.refresh')}
      </button>
    </div>
  );
}

export default function ListState({ state, children, silent = false }) {
  const { t } = useLang();
  const { status, error, fromCache, cachedAt, reload, refresh } = state;

  if (status === 'loading') {
    if (silent) return null;
    return <p className="muted" style={{ padding: '8px 2px' }}>{t('common.loading')}</p>;
  }

  if (status === 'error') {
    if (silent) return null;
    const detail = supportDetail(error);
    return (
      <div className="list-error" role="alert">
        <p className="list-error-text">{friendlyError(t, error)}</p>
        {canRetry(error) && (
          <button type="button" onClick={reload}>{t('common.retry')}</button>
        )}
        {/* Kept for support, deliberately small and last: it is a reference to
            read down a phone line, never the explanation. */}
        {detail && <div className="list-error-detail">{detail}</div>}
      </div>
    );
  }

  return (
    <>
      {fromCache && !silent && <StaleNotice cachedAt={cachedAt} onRefresh={refresh} />}
      {children}
    </>
  );
}
