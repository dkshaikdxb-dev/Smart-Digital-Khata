// Turning a failure into a sentence a shopkeeper can act on.
//
// The dashboard used to put `err.message` on screen. That message is whatever
// the transport or the backend happened to say: "Failed to fetch", "HTTP 500",
// "jwt expired", "shop_suspended". None of it names a cause the person holding
// the phone can do anything about, and some of it reads like the app blaming
// them. So nothing a shopkeeper sees comes from err.message any more — every
// path below lands on an authored string in lib/i18n.js.
//
// The cases are kept APART on purpose. "Something went wrong" for all of them
// would be a regression, not a fix: "no internet" means go outside and try
// again, "you are signed out" means log back in, "the shop is suspended" means
// ring support, and only "something went wrong at our end" means wait.
//
// This mirrors mobile-app/src/consumer/lib/errorText.js, which does the same
// job for the native consumer app, and reuses its i18n keys so a shopper who
// uses both surfaces reads the same sentence in each.

// A backend refusal whose CODE we recognise gets its own sentence, because the
// status alone ("403") cannot tell a suspended shop apart from a permission the
// signed-in staff member simply does not have.
const CODE_KEYS = {
  shop_suspended: 'err.suspended',
};

function typedCode(err) {
  if (!err) return null;
  const body = err.body || {};
  const code = (body.details && body.details.code) || body.code || body.error || err.message;
  return typeof code === 'string' && CODE_KEYS[code] ? code : null;
}

// A fetch() that never reached the server rejects with a TypeError carrying no
// status. Chrome says "Failed to fetch", Firefox "NetworkError when attempting
// to fetch resource", Safari "Load failed" — all the same thing to a shopkeeper.
function isTransport(err) {
  return !!err && !Number.isFinite(Number(err.status));
}

function isTimeout(err) {
  if (!err) return false;
  if (err.timeout) return true;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  // Belt and braces for anything that reaches us from a library that formats
  // its own timeout message (the native app's axios client says exactly this).
  return typeof err.message === 'string' && /timeout|timed out/i.test(err.message);
}

/**
 * A sentence for the person holding the phone. Always returns authored copy.
 * `t` is the translator from useLang(); pass it so the copy follows the
 * owner's chosen language.
 */
export function friendlyError(t, err, options = {}) {
  if (!err) return t('err.generic');

  // The two ways a caller may put its own words on screen, both marked as such.
  // Never err.message.
  //
  // messageKey is the preferred one: a caller that knows the situation better
  // than this mapper names a translation KEY, so its sentence resolves in the
  // reader's language like every other string. userMessage carries finished
  // prose and therefore pins the language at the moment it was thrown, which is
  // only safe where the language is already known.
  if (err.messageKey) return t(err.messageKey);
  if (err.userMessage) return err.userMessage;

  const code = typedCode(err);
  if (code) return t(CODE_KEYS[code]);

  if (isTimeout(err)) return t('err.slow');
  if (isTransport(err)) return t('err.offline');

  const status = Number(err.status);

  // On the sign-in screen the same two statuses mean something else entirely.
  // "You have been signed out. Please sign in again." is nonsense to someone who
  // is trying to sign in and got the password wrong, and "You cannot open this"
  // tells an owner whose shop the platform has stopped nothing they can act on.
  if (options.scope === 'signin') {
    if (status === 401) return t('err.signInRejected');
    if (status === 403) return t('err.accountStopped');
  }

  if (status === 401) return t('err.signedOut');
  if (status === 403) return t('err.notAllowed');
  if (status === 404) return t('err.notFound');
  if (status === 429) return t('err.tooMany');
  if (status === 409) return t('err.conflict');
  if (status === 400 || status === 422) return t('err.badRequest');
  if (status >= 500) return t('err.server');
  return t('err.generic');
}

/** Whether offering a "Try again" button is honest. Retrying a 404 is not. */
export function canRetry(err) {
  if (!err) return true;
  if (typedCode(err)) return false;
  if (isTimeout(err)) return true;
  if (isTransport(err)) return true;
  const status = Number(err.status);
  return status === 429 || status >= 500;
}

/** A 401 means the session is gone; the screen should send them to sign in. */
export function isSignedOut(err) {
  return !!err && Number(err.status) === 401;
}

/**
 * The technical detail, kept reachable for support but never the headline.
 * Short enough to read down a phone line: "500 · /api/customers · r-4f2a".
 *
 * Deliberately a REFERENCE and not a message: it names the status, the call and
 * the request id, and never the raw transport string. "timeout of 15000ms
 * exceeded" printed in small grey type is still that sentence on the screen.
 * The full object goes to the console instead — see logForSupport.
 */
export function supportDetail(err) {
  if (!err) return '';
  const bits = [];
  const status = Number(err.status);
  bits.push(Number.isFinite(status) ? String(status) : (isTimeout(err) ? 'slow' : 'net'));
  if (err.requestPath) bits.push(err.requestPath);
  if (err.requestId) bits.push(err.requestId);
  return bits.join(' · ');
}

/**
 * Put the raw failure where a support engineer can find it — the console — so
 * removing it from the screen does not remove it from the world.
 */
export function logForSupport(err, context) {
  try {
    // eslint-disable-next-line no-console
    console.error('[skhata]', context || 'request failed', supportDetail(err), err);
  } catch (e) { /* console can be absent in an embedded WebView */ }
}

/**
 * The one call a screen makes when a request failed: log the real thing, return
 * the sentence to show. Every `setError(err.message)` in this app is now
 * `setError(uiError(t, err))`.
 */
export function uiError(t, err, context, options) {
  logForSupport(err, context);
  return friendlyError(t, err, options);
}

/** The same, for the sign-in and registration screens. See friendlyError. */
export function signInError(t, err) {
  return uiError(t, err, 'sign-in', { scope: 'signin' });
}
