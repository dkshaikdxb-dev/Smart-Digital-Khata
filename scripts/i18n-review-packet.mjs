// Print what a native speaker actually has to answer.
//
// The registry now holds 464 strings that no speaker of the language has read,
// and it holds them safely: nothing can change one without a decision. That is
// the whole of what the governance is for, and it is finished. It does not make
// a single one of those strings right — only a person who speaks the language
// can do that, and until now there was nowhere for them to look.
//
// This writes that place. It ENFORCES NOTHING: no gate, no CI step, no status
// changes. It reads the registry and the dictionaries and emits one markdown
// file per reviewer, with the English source beside what each surface currently
// says, so the question is answerable without opening a JSON file.
//
// What it deliberately leaves out:
//
//   The 274 UNDECIDED web/app divergences. They are pairs nobody has ruled on,
//   and they stay that way. A reviewer answering rows in this packet must not be
//   handed them by accident — "while you are here" is exactly how an undecided
//   row gets decided by whoever happened to be looking.
//
//   Anything LOCKED. Those were decided by a person already.
//
// Regenerate after a review lands, so the packet tracks what is still open:
//
//   node scripts/i18n-review-packet.mjs            # preview the counts
//   node scripts/i18n-review-packet.mjs --write    # write docs/i18n-review/
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs/i18n-review');
const APPS = [['app/consumer', 'mobile-app/src/consumer/i18n.js'], ['app/owner', 'mobile-app/src/i18n.js']];

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-decisions.json'), 'utf8'));
const WEB = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'));
const kvOf = (blk) => {
  const o = {};
  for (const m of (blk || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2].replace(/\\'/g, "'");
  for (const m of (blk || '').matchAll(/'([^']+)':\s*"((?:[^"\\]|\\.)*)"/g)) o[m[1]] = m[2].replace(/\\"/g, '"');
  return o;
};
function appDict(rel) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const a = m.index, b = s.indexOf('\nconst ', a + 10);
    out[m[1]] = kvOf(s.slice(a, b > 0 ? b : s.length));
  }
  return out;
}
const APP = Object.fromEntries(APPS.map(([id, rel]) => [id, appDict(rel)]));
const LANG_NAME = { bn: 'Bengali', gu: 'Gujarati', mr: 'Marathi', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', ur: 'Urdu', en: 'English' };

// A row's English is the source both surfaces were translated from. The web and
// the app often key it differently — web c.pay is app khata.pay — so each side
// is read against its own English block.
const enWeb = (key) => (staticValue('en', key) || '').trim();
const enApp = (sid, key) => (APP[sid].en?.[key] || '').trim();

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// Which question a row belongs to.
//
// The ledgers say it plainly — "123 rows resolve to about eight decisions, not
// 123" — and then record only a count per theme, so the mapping was never
// written down. Listing 112 rows flat asks a reviewer for 112 answers when the
// corpus only contains about seven questions, which is the difference between an
// afternoon and a month. This derives the membership from the strings.
//
// Order matters: the first test that matches wins, so the specific themes are
// tried before the catch-all. `register_and_tense` IS the catch-all, and the
// ledger describes it that way — everything left once the word choices are out
// is one decision about voice.
const plainGu = (s) => String(s).replace(/ઑ/g, 'ઓ').replace(/ૉ/g, 'ો').replace(/ઍ/g, 'એ').replace(/ૅ/g, 'ે');
const THEMES = {
  bn: [],
  gu: [
    ['balance_vs_outstanding', (r) => ['common.balance', 'common.outstanding'].includes(r.web)],
    ['ref.shareLink', (r) => r.web === 'ref.shareLink'],
    // The ENGLISH, not the word that happens to appear: catalogue-loanword says
    // so itself, and of nine gu strings carrying the word for "list" only three
    // were about a catalogue. set.discovery is "Discovery (list your shop)".
    ['catalogue_word', (r) => /catalog/i.test(r.en)],
    ['cart_word', (r) => /કાર્ટ|ટોપલી/.test(r.w + r.a)],
    ['product_word', (r) => /સામાન|ઉત્પાદન|વસ્તુ/.test(r.w + r.a)],
    // Nothing reaches this any more: gu-orthography settled the candra spelling
    // across the whole corpus, so no row now differs by that alone. Kept so the
    // zero is visible rather than inferred.
    ['orthography_candra_o', (r) => r.w && r.a && r.w !== r.a && plainGu(r.w) === plainGu(r.a)],
    ['register_and_tense', () => true],
  ],
  mr: [
    ['c.locationNotSet', (r) => r.web === 'c.locationNotSet'],
    // The mr ledger never named these two, but the corpus has both splits and
    // they are the same questions Gujarati asks. Grouping them here rather than
    // leaving them in the catch-all is not a decision — it is putting the same
    // question on one page instead of five.
    ['catalogue_word', (r) => /catalog/i.test(r.en)],
    ['cart_word', (r) => /कार्ट|टोपली/.test(r.w + r.a)],
    ['outstanding_word', (r) => /बाकी|उधारी/.test(r.w + r.a)],
    ['pay_verb', (r) => /भर|देण|द्या/.test(r.w + r.a)],
    ['product_word', (r) => /उत्पादन|वस्तू/.test(r.w + r.a)],
    ['register_and_tense', () => true],
  ],
};
// The question each theme asks, as its ledger words it.
const THEME_Q = {};
for (const [lang, f] of [['gu', 'scripts/gu-reconcile-decisions.json'], ['mr', 'scripts/mr-reconcile-decisions.json']]) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).review;
  for (const [k, v] of Object.entries(j)) {
    if (k === '_themes') continue;
    THEME_Q[`${lang}:${k}`] = typeof v === 'string' ? v : { q: v.question, why: v.why_not_mechanical };
  }
}
// A theme a LOCKED decision already answers is not a question, and putting it to
// a reviewer would be asking them to re-decide something a person decided. The
// catalogue one is live: its app side does not obey the decision (see below),
// but that is a defect to repair, not a question to ask.
const SETTLED_BY = {
  catalogue_word: {
    by: 'catalogue-loanword',
    rule: 'where the ENGLISH says catalog, the language uses the loanword, not its word for "list". That settles the WORD. It says nothing about the case ending or the verb around it, so a row where both surfaces already use the loanword and still differ is a register question and belongs to the theme below.',
    note: 'The web obeys it. The app does not, in nine strings across bn, gu and mr — `shopdetail.loading`, `cat.searchCatalogue` and `cat.noCatalogue`. That decision carries no values and the gate cannot evaluate it, which is how they drifted unseen. Repairing them needs the loanword forms written by someone who speaks the language; it is not a choice between the two surfaces.',
  },
};

const valuesOf = (lang, r) => ({
  w: WEB[lang]?.[r.web] ?? staticValue(lang, r.web),
  a: APP['app/consumer'][lang]?.[r.app] ?? APP['app/owner'][lang]?.[r.app],
  en: enWeb(r.web) || enApp('app/consumer', r.app) || enApp('app/owner', r.app),
});
function byTheme(lang, rows) {
  const tests = THEMES[lang] || [];
  const buckets = new Map(tests.map(([t]) => [t, []]));
  for (const row of rows) {
    const r = { ...row, ...valuesOf(lang, row) };
    const hit = tests.find(([, test]) => test(r));
    if (hit) buckets.get(hit[0]).push(r); else (buckets.get('_ungrouped') || buckets.set('_ungrouped', []).get('_ungrouped')).push(r);
  }
  return buckets;
}

function rowBlock(lang, r) {
  const lines = [];
  const en = enWeb(r.web) || enApp('app/consumer', r.app) || enApp('app/owner', r.app);
  lines.push(`### \`${r.web}\`${r.app && r.app !== r.web ? `  ·  app key \`${r.app}\`` : ''}`);
  if (en) lines.push(`- **English** — ${esc(en)}`);
  const w = WEB[lang]?.[r.web] ?? staticValue(lang, r.web);
  if (w !== undefined) lines.push(`- web — ${esc(w)}`);
  for (const [sid] of APPS) {
    const v = APP[sid][lang]?.[r.app];
    if (v !== undefined) lines.push(`- ${sid} — ${esc(v)}`);
  }
  lines.push('- **Your answer:** ');
  return lines.join('\n');
}

const files = new Map();
const summary = [];

/* ---- one packet per language with an open queue ------------------------ */
for (const lang of ['bn', 'gu', 'mr']) {
  const d = registry.decisions[`native-speaker-queue-${lang}`];
  if (!d) continue;
  const name = LANG_NAME[lang];
  const body = [];

  // An answered queue keeps its file. Deleting it would make the work look like
  // it never happened, and the next reviewer of another language should be able
  // to see what a finished one looks like.
  if (!d.protects.rows.length) {
    const answered = d.resolved_rows || [];
    body.push(`# ${name} — answered`);
    body.push('');
    body.push(`Nothing is waiting. All ${answered.length} rows were read by a ${name} speaker and are`);
    body.push('now LOCKED: no script can change them, and any future change goes through the registry.');
    body.push('');
    for (const a of answered) {
      const by = registry.decisions[a.answered_by];
      const v = by?.rows?.find((x) => x.web === a.web);
      body.push(`### \`${a.web}\`${a.app && a.app !== a.web ? `  ·  app key \`${a.app}\`` : ''}`);
      const en = enWeb(a.web) || enApp('app/consumer', a.app) || enApp('app/owner', a.app);
      if (en) body.push(`- **English** — ${esc(en)}`);
      if (v) {
        body.push(`- web — ${esc(v.web_value)}`);
        body.push(`- app — ${esc(v.app_value)}${v.converges ? '' : '  _(kept different on purpose)_'}`);
      }
      if (a.note) body.push(`- ${esc(a.note)}`);
      body.push('');
    }
    body.push(`_Recorded as \`${answered[0]?.answered_by || '(see the registry)'}\` in \`scripts/i18n-decisions.json\`._`);
    files.set(`${lang}-queue.md`, body.join('\n'));
    summary.push([`${lang}-queue.md`, `${name} — answered`, 0]);
    continue;
  }

  body.push(`# ${name} — strings waiting for you`);
  body.push('');
  body.push(`${d.protects.rows.length} rows. Every one of them is a string a ${name} speaker has not read.`);
  body.push('');
  body.push('Each row shows the English it was translated from and what each surface says today.');
  body.push('The web is khata.dadashaik.com; app/consumer is the shopper\'s phone app and app/owner');
  body.push('the shopkeeper\'s. Where the two surfaces differ, that is the question — but they are');
  body.push('**allowed** to differ, and often should: a chip on a phone and a sentence on a page are');
  body.push('not the same thing. Say what each one should read.');
  body.push('');
  body.push('Write your answer on the **Your answer** line. "web is right", "app is right", or a better');
  body.push('string — all three are useful answers. "I would not say this at all" is also an answer.');
  body.push('');
  const buckets = byTheme(lang, d.protects.rows);
  const live = [...buckets].filter(([, rows]) => rows.length).sort((a, b) => b[1].length - a[1].length);
  if (live.length) {
    body.push(`## ${live.length} questions, not ${d.protects.rows.length} answers`);
    body.push('');
    body.push(`The ledger says so itself — "${d.protects.rows.length} rows resolve to about ${live.length} decisions". Answer the`);
    body.push('question at the head of each section and every row under it follows. You do not have to');
    body.push('rule on each line, though you can: a row you disagree with overrides its theme.');
    body.push('');
    for (const [t, rows] of live) body.push(`- **\`${t}\`** — ${rows.length} rows`);
    const empty = [...buckets].filter(([, rows]) => !rows.length).map(([t]) => t);
    if (empty.length) {
      body.push('');
      body.push(`Closed since the ledger was written, with no rows left: ${empty.map((t) => `\`${t}\``).join(', ')}.`);
    }
    body.push('');
  }
  for (const [t, rows] of live) {
    const q = THEME_Q[`${lang}:${t}`];
    body.push(`## \`${t}\` — ${rows.length} rows`);
    body.push('');
    if (q) { body.push(`**${typeof q === 'string' ? q : q.q}**`); if (q.why) body.push('', q.why); body.push(''); }
    const settled = SETTLED_BY[t];
    if (settled) {
      body.push(`> **Already decided — do not answer this one.** \`${settled.by}\` is LOCKED and says: ${settled.rule}`);
      body.push('>');
      body.push(`> ${settled.note}`);
      body.push('');
    } else {
      body.push('**Your answer for this whole theme:** ');
      body.push('');
    }
    // Split the rows that actually pose a web-vs-app choice from the ones where
    // the two surfaces already say the same thing. They are different questions:
    // one is "which of these", the other is "is this right at all".
    const differ = rows.filter((r) => r.a !== undefined && r.w !== r.a);
    const agree = rows.filter((r) => r.a === undefined || r.w === r.a);
    if (differ.length) {
      body.push(`### The surfaces disagree — ${differ.length}`);
      body.push('');
      body.push('| key | English | web | app |');
      body.push('|---|---|---|---|');
      for (const r of differ) {
        const en = enWeb(r.web) || enApp('app/consumer', r.app) || enApp('app/owner', r.app);
        body.push(`| \`${r.web}\`${r.app !== r.web ? ` / \`${r.app}\`` : ''} | ${esc(en)} | ${esc(r.w)} | ${esc(r.a)} |`);
      }
      body.push('');
    }
    if (agree.length) {
      body.push(`### Both surfaces already say this — ${agree.length}`);
      body.push('');
      body.push('No choice to make between them. The question is only whether the wording is right.');
      body.push('');
      body.push('| key | English | both |');
      body.push('|---|---|---|');
      for (const r of agree) {
        const en = enWeb(r.web) || enApp('app/consumer', r.app) || enApp('app/owner', r.app);
        body.push(`| \`${r.web}\`${r.app !== r.web ? ` / \`${r.app}\`` : ''} | ${esc(en)} | ${esc(r.w ?? r.a)} |`);
      }
      body.push('');
    }
  }
  files.set(`${lang}-queue.md`, body.join('\n'));
  summary.push([`${lang}-queue.md`, `${name} — ${live.length} questions over ${d.protects.rows.length} rows`, d.protects.rows.length]);
}

/* ---- the REVIEW decisions that are not the per-language queue ---------- */
const OTHER = Object.entries(registry.decisions)
  .filter(([id, d]) => d.status === 'REVIEW' && !id.startsWith('native-speaker-queue-'));
{
  const body = [];
  body.push('# The other open questions');
  body.push('');
  body.push('These are not per-language row lists — each is one question, sometimes across several');
  body.push('languages. The biggest by far is the consumer FAQ: 36 translations written by a machine');
  body.push('and read by nobody who speaks the language.');
  body.push('');
  for (const [id, d] of OTHER) {
    let n = 0;
    for (const byLang of Object.values(d.protected || {})) for (const kv of Object.values(byLang)) n += Object.keys(kv).length;
    body.push(`## \`${id}\` — ${n} strings`);
    body.push('');
    if (d.concept) body.push(`**${d.concept}**`);
    if (d.why_review) body.push('', d.why_review);
    body.push('');
    for (const [surface, byLang] of Object.entries(d.protected || {})) {
      for (const [lang, kv] of Object.entries(byLang)) {
        for (const [key, v] of Object.entries(kv)) {
          body.push(`- \`${key}\` · ${LANG_NAME[lang] || lang} · ${surface} — ${esc(v)}`);
        }
      }
    }
    body.push('', '**Your answer:** ', '');
  }
  files.set('other-questions.md', body.join('\n'));
  const n = OTHER.reduce((s, [, d]) => s + Object.values(d.protected || {})
    .reduce((t, byLang) => t + Object.values(byLang).reduce((u, kv) => u + Object.keys(kv).length, 0), 0), 0);
  summary.push(['other-questions.md', `${OTHER.length} cross-cutting decisions`, n]);
}

/* ---- the index --------------------------------------------------------- */
{
  const body = [];
  const total = summary.reduce((s, [, , n]) => s + n, 0);
  // A queue row is ONE question even where it pins two or three strings — the
  // web copy and the app copies of the same sentence. Counting the strings
  // would tell a reviewer they have twice the work they actually have.
  let pinned = 0;
  for (const d of Object.values(registry.decisions)) {
    if (d.status !== 'REVIEW') continue;
    for (const byLang of Object.values(d.protected || {})) for (const kv of Object.values(byLang)) pinned += Object.keys(kv).length;
  }
  body.push('# Native-speaker review');
  body.push('');
  body.push(`${total} questions, covering the ${pinned} strings the registry holds under REVIEW.`);
  body.push('Nothing in this repository can change one of them without a decision behind it — that');
  body.push('part is finished and enforced in CI. What it cannot do is tell you whether any of them is');
  body.push('the right thing to say to a shopkeeper in Bengali, Gujarati or Marathi. That is what these');
  body.push('files are for.');
  body.push('');
  body.push('| file | what it holds | questions |');
  body.push('|---|---|---|');
  for (const [f, what, n] of summary) body.push(`| [\`${f}\`](${f}) | ${what} | ${n} |`);
  body.push('');
  body.push('## What is NOT in here, and must not be answered here');
  body.push('');
  const div = registry.divergences;
  body.push(`**The ${div.UNDECIDED.count} undecided web/app differences.** Those are pairs where the two`);
  body.push('surfaces say different things and nobody has ruled on whether that is a problem. They are');
  body.push('deliberately absent. Answering one in passing, because it turned up next to a row you were');
  body.push('reading, is how an undecided question gets settled by whoever happened to be looking —');
  body.push('which is the failure this whole apparatus exists to prevent. If you notice one and think it');
  body.push('is wrong, say so separately; it needs its own decision.');
  body.push('');
  body.push(`**The ${div.INTENTIONAL_DIVERGENCE.count} intentional divergences.** The web and the app say`);
  body.push('different things there on purpose, and each one is recorded with a reason.');
  body.push('');
  body.push('**Anything LOCKED.** Already decided by a person. `scripts/i18n-decisions.json` has them.');
  body.push('');
  body.push('## When an answer lands');
  body.push('');
  body.push('An approved wording replaces the machine-authored one through the registry — the write');
  body.push('guard refuses it otherwise, which is the point. Re-run');
  body.push('`node scripts/i18n-review-snapshot.mjs --apply` so the snapshot tracks the approved text,');
  body.push('and `node scripts/i18n-review-packet.mjs --write` so this packet stops asking a question');
  body.push('that has been answered.');
  body.push('');
  body.push('_Generated by `scripts/i18n-review-packet.mjs`. Do not edit by hand — edit the registry._');
  files.set('README.md', body.join('\n'));
}

for (const [f, what, n] of summary) console.log(`  ${f.padEnd(24)} ${String(n).padStart(4)} questions   ${what}`);
console.log(`\n${summary.reduce((s, [, , n]) => s + n, 0)} questions across ${files.size} files.`);
if (!process.argv.includes('--write')) { console.log('preview only — pass --write to write docs/i18n-review/'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
for (const [f, content] of files) fs.writeFileSync(path.join(OUT, f), content.replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
console.log(`written to ${path.relative(ROOT, OUT)}/`);
