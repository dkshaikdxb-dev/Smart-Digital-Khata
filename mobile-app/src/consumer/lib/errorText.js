// Turning a failure into a sentence a shopper can act on.
//
// The consumer API client keeps the typed part of every failure — HTTP status,
// the backend's `error` code, and (added for this) which transport problem it
// was. A raw server message is fine in a log and useless on a phone in a
// village: "timeout of 15000ms exceeded" or "Network Error" tells a shopper
// nothing about what to do next, and "Request failed with status code 500"
// reads like the app blaming them. So nothing a shopper sees comes from
// err.message — every path below lands on an authored string.
//
// friendlyError() always returns a sentence. canRetry() says whether offering
// a Retry button is honest: retrying a dropped connection or an overloaded
// server helps; retrying a 404 does not.

// The one exception to "never show err.message": a refusal the backend states
// in words the shopper needs verbatim is handled by its own mapper (e.g.
// shopClosedMessage for the 409 shop_closed), not here.

export function friendlyError(t, err) {
  if (!err) return t('err.generic');

  // Transport first — these never reached the server, so status/code are empty
  // and only the transport tag distinguishes "no signal" from "too slow".
  if (err.transport === 'offline') return t('err.offline');
  if (err.transport === 'timeout') return t('err.slow');
  if (err.transport === 'cancelled') return '';

  const status = Number(err.status);
  if (!Number.isFinite(status) || status === 0) return t('err.offline');

  if (status === 401) return t('err.signedOut');
  if (status === 403) return t('err.notAllowed');
  if (status === 404) return t('err.notFound');
  if (status === 429) return t('err.tooMany');
  if (status >= 500) return t('err.server');
  if (status === 400 || status === 422) return t('err.badRequest');
  if (status === 409) return t('err.conflict');
  return t('err.generic');
}

// Whether retrying this failure could plausibly succeed.
export function canRetry(err) {
  if (!err) return true;
  if (err.transport === 'offline' || err.transport === 'timeout') return true;
  const status = Number(err.status);
  if (!Number.isFinite(status) || status === 0) return true;
  return status === 429 || status >= 500;
}

// A REFUSAL the server states in words worth repeating.
//
// friendlyError() flattens every 4xx to one authored sentence, which is right
// for a list that failed to load and wrong for a step-by-step flow: "Something
// in that was not right" cannot tell a shopper apart "that is already your
// current number" from "that code has expired", and both are things only the
// server knows. So for a 4xx that carries a message, the message wins — the
// same trade the OTP login screen already makes. Everything else (no network,
// a timeout, a 5xx, a 4xx with no message) still lands on an authored string.
//
// The server's refusals are authored in English only, so this is a deliberate
// exception to "the shopper always reads their own language", taken where being
// SPECIFIC matters more than being translated. Do not use it for bulk loads.
export function refusalError(t, err) {
  if (!err) return t('err.generic');
  if (err.transport) return friendlyError(t, err);
  const status = Number(err.status);
  if (Number.isFinite(status) && status >= 400 && status < 500 && err.message) {
    return String(err.message);
  }
  return friendlyError(t, err);
}

// True for a request we cancelled ourselves (a superseded search). The caller
// must NOT show anything for these — they are not failures.
export function isCancelled(err) {
  return !!(err && err.transport === 'cancelled');
}
