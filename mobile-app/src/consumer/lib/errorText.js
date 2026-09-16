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
  if (Number.isFinite(status) && status >= 400 && status < 500 && showableServerText(err)) {
    return String(err.message);
  }
  return friendlyError(t, err);
}

// Is the server's text something to put in front of a shopper?
//
// Two kinds of 4xx text are NOT:
//
//   - A Joi validation failure. middleware/validate.js answers
//     badRequest('Validation failed', [ '"items[0].weight_grams" must be an
//     integer', ... ]) — developer text, and its `details` is an ARRAY, which
//     is what tells it apart from a business refusal's details OBJECT.
//   - A machine code rather than a sentence: the 409 is literally
//     `shop_closed`. Codes are snake_case with no spaces; a refusal a human
//     wrote has spaces in it.
function showableServerText(err) {
  const msg = err && err.message;
  if (!msg || typeof msg !== 'string') return false;
  if (Array.isArray(err.details)) return false;
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(msg.trim())) return false;
  if (/^Validation failed/i.test(msg)) return false;
  return true;
}

// Why an order was refused, in the shopper's own language where we can manage
// it, and in the server's words where we cannot.
//
// Placing an order is the screen where "Something in that was not right" costs
// the most: it is the end of the flow, the shopper has chosen items and a
// payment method, and the refusals are all things ONLY the server knows and the
// shopper can act on — over their khata limit, under the delivery minimum, an
// item the shop has since removed. friendlyError() flattens every one of those
// to the same sentence, which tells them nothing to do next.
//
// The three that matter are recognised STRUCTURALLY, from the details object
// the backend already sends, so they can be answered in the shopper's language:
//
//   credit_limit / family_sub_limit -> my.controller's khata limit gates
//   delivery_min_order              -> the delivery minimum gate
//   product_id                      -> buildLineItems: gone or deactivated
//
// Anything else falls through to the server's own sentence ("This shop does not
// offer pickup.") which is English but specific, and only then to the authored
// generic. `money` formats paise the way the rest of the screen does.
export function orderRefusal(t, err, money) {
  if (!err) return t('err.generic');
  if (err.transport) return friendlyError(t, err);
  const d = err.details;
  if (d && !Array.isArray(d) && typeof d === 'object') {
    if (d.credit_limit != null || d.family_sub_limit != null) return t('cart.khataFull');
    if (d.delivery_min_order != null && typeof money === 'function') {
      return t('cart.belowMin', { amt: money(d.delivery_min_order) });
    }
    if (d.product_id) return t('cart.itemGone');
  }
  return refusalError(t, err);
}

// True for a request we cancelled ourselves (a superseded search). The caller
// must NOT show anything for these — they are not failures.
export function isCancelled(err) {
  return !!(err && err.transport === 'cancelled');
}
