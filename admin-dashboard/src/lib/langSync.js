import { apiFetch } from './api';
import { customerFetch, CUSTOMER_TOKEN_KEY } from './customerApi';
import { hasChosenLang, getLang } from './i18n';

// Mirror a language choice to the SERVER (batch LANG).
//
// setLang() in lib/i18n only writes localStorage, which is all the browser
// needs — but it left the server with no idea what anyone reads. That is why
// every shopkeeper's weekly WhatsApp summary went out in Hindi and every
// customer's purchase/payment message went out in English, whatever they had
// chosen in the app. This is the other half: the durable copy.
//
// Best-effort by design. The language is already applied locally by the time
// this runs, so a failed or offline save must never surface an error or block
// the switch; the next deliberate pick tries again.

/**
 * persistLanguage(code) — save `code` wherever the current session has somewhere
 * to save it. A device can legitimately be both (an owner who also shops), so
 * both are attempted.
 *
 *   consumer PWA session → PUT  /api/my/language      → customer_users.language
 *                                                       + every customers row
 *                                                         for that phone
 *   OWNER session        → PATCH /api/shops/me        → shops.language
 *
 * Staff are deliberately excluded from the shop write: `shops.language` is the
 * language the OWNER is written to on WhatsApp, and a staff member changing the
 * screen they are looking at must not quietly re-language the owner's weekly
 * summary.
 */
export function persistLanguage(code) {
  if (typeof window === 'undefined' || !code) return;

  let customerToken = null;
  let ownerToken = null;
  let role = null;
  try {
    customerToken = window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
    ownerToken = window.localStorage.getItem('skhata_token');
    role = window.localStorage.getItem('skhata_role');
  } catch {
    return; // storage blocked — there is no session to attribute this to
  }

  if (customerToken) {
    customerFetch('/api/my/language', {
      method: 'PUT',
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
  }

  if (ownerToken && (role === null || role === 'owner')) {
    // `role` is absent on older sessions that only ever stored a token; those
    // are owner logins, which is why null counts as owner here.
    apiFetch('/api/shops/me', {
      method: 'PATCH',
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
  }
}

// One-time catch-up for everyone who chose a language BEFORE the server had
// anywhere to keep it. Their choice is sitting in localStorage and nowhere
// else, so without this a shopkeeper who picked Marathi two months ago would go
// on getting the Hindi weekly summary until the day they happened to touch the
// switcher again. Runs once per device, then never again — so it can never
// fight a later choice made on another phone.
const BACKFILL_KEY = 'skhata_lang_synced';

export function backfillLanguageOnce() {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(BACKFILL_KEY) === '1') return;
    if (!hasChosenLang()) return; // nothing deliberate to carry over
    window.localStorage.setItem(BACKFILL_KEY, '1');
    persistLanguage(getLang());
  } catch {
    /* storage blocked — skip silently */
  }
}
