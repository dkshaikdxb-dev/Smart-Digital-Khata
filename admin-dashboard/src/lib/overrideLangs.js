// Which languages a marketer may write promo creative in.
//
// This USED to be a hardcoded seven inside the Campaigns page, and that list
// silently went stale. bn/gu/mr were activated in the registry and served
// correctly by promos.controller — COALESCE(c.i18n -> $lang ->> 'title', ...)
// reads whatever key is in the blob, and resolveServingLang gates on
// languages.is_active — but a marketer had no field to TYPE the Bengali,
// Gujarati or Marathi text into, so those shoppers always saw the English base.
//
// The same shape of defect as the old language gate and the frozen
// has_catalogue flag: a second copy of a list the registry already owns. So the
// fix is not "add three more codes", it is to stop keeping a copy. Authoring is
// now driven by the same registry the serving side uses, and activating a
// language in /admin/languages makes it authorable in that same moment.

// Offline / first-paint fallback only: useActiveLanguages() returns the
// built-in LANGS until the registry fetch resolves, and a blank picker would
// make the whole overrides fieldset useless.
export const FALLBACK_OVERRIDE_LANGS = [
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'ur', name: 'اردو' },
  { code: 'en', name: 'English' },
];

// Registry list → the picker's shape. English goes last: it is the base the
// other languages fall back to, so offering it first reads as a choice to make
// rather than the default that is already filled in above.
//
// `authored` are codes that already carry creative on THIS campaign. A language
// can be deactivated after a marketer wrote for it; dropping it from the picker
// would hide that text with no way to read or clear it, so an authored code is
// appended and marked `inactive` even when the registry no longer offers it.
export function toOverrideLangs(active, authored) {
  const list = Array.isArray(active) && active.length ? active : FALLBACK_OVERRIDE_LANGS;
  const seen = new Set();
  const out = [];
  for (const l of list) {
    const code = l && l.code;
    if (!code || code === 'en' || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: l.name || l.label || code });
  }
  for (const code of authored || []) {
    if (!code || code === 'en' || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: code, inactive: true });
  }
  const en = list.find((l) => l && l.code === 'en');
  out.push({ code: 'en', name: (en && (en.name || en.label)) || 'English' });
  return out;
}
