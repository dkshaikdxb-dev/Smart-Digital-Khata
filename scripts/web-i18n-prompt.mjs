// Build the per-language Gemini brief for the web-console translation request.
//
// Two things decide whether a run of this size succeeds, and neither is the
// wording of the instructions:
//
// 1. TRUNCATION. 566 rows answered in one reply is where a model starts
//    dropping rows near the end, and a short reply looks like a complete one.
//    So each language is also split into chunks, cut on KEY-PREFIX boundaries
//    so a feature area is never translated half in one run and half in another.
//
// 2. CONSISTENCY WITH WHAT IS ALREADY SHIPPING. These languages already have
//    human-reviewed translations in the two native app dictionaries. A shopper
//    moves between the app and the site; if the web calls a khata something the
//    app does not, that is a worse outcome than leaving it in English. So the
//    brief carries a GLOSSARY lifted from the shipped translations themselves —
//    not invented here, and not a style preference: it is what these words
//    already say on the same person's phone.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs', 'i18n-web');
const CHUNK_TARGET = 120;

const LANGS = {
  bn: { name: 'Bengali', script: 'Bengali' },
  gu: { name: 'Gujarati', script: 'Gujarati' },
  mr: { name: 'Marathi', script: 'Devanagari' },
  ta: { name: 'Tamil', script: 'Tamil' },
  te: { name: 'Telugu', script: 'Telugu' },
  kn: { name: 'Kannada', script: 'Kannada' },
  ml: { name: 'Malayalam', script: 'Malayalam' },
  ur: { name: 'Urdu', script: 'Urdu (Nastaliq/Arabic)' },
  hi: { name: 'Hindi', script: 'Devanagari' },
};

// Terms worth pinning: the domain words that must not drift, plus the handful
// of UI verbs that appear on every screen.
const GLOSSARY_TERMS = [
  'khata', 'order', 'delivery', 'pickup', 'balance', 'advance', 'due', 'cash',
  'pay', 'shop', 'customer', 'credit', 'credits', 'total', 'items', 'paid',
  'on khata', 'pay online', 'you owe', 'staff', 'free', 'open', 'closed',
  'add', 'remove', 'save', 'cancel', 'retry', 'search', 'close', 'payment',
];

function langBlocks(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const start = m.index;
    const next = s.indexOf('\nconst ', start + 10);
    out[m[1]] = s.slice(start, next > 0 ? next : s.length);
  }
  return out;
}
const pairsOf = (block) => {
  const out = {};
  for (const m of (block || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] = m[2];
  return out;
};

// English phrase -> what the SHIPPED app already calls it in `lang`.
function shippedGlossary(lang) {
  const seen = new Map();
  for (const file of ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js']) {
    const b = langBlocks(file);
    const en = pairsOf(b.en);
    const tr = pairsOf(b[lang]);
    for (const [k, v] of Object.entries(en)) {
      if (!tr[k]) continue;
      const term = v.trim().toLowerCase();
      if (!seen.has(term)) seen.set(term, new Map());
      const counts = seen.get(term);
      counts.set(tr[k], (counts.get(tr[k]) || 0) + 1);
    }
  }
  const rows = [];
  for (const term of GLOSSARY_TERMS) {
    const counts = seen.get(term);
    if (!counts) continue;
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    rows.push([term, best]);
  }
  return rows;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}
const cell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

// Split on key-prefix boundaries near the target size, so one feature area is
// never spread across two runs.
function chunk(rows, target) {
  const out = []; let cur = [];
  const prefix = (r) => r[0].split('.')[0];
  for (let i = 0; i < rows.length; i++) {
    cur.push(rows[i]);
    const last = i === rows.length - 1;
    const boundary = !last && prefix(rows[i]) !== prefix(rows[i + 1]);
    if (last || (cur.length >= target && boundary)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

const only = process.argv[2];
for (const [code, L] of Object.entries(LANGS)) {
  if (only && only !== code) continue;
  const src = path.join(OUT, `web-${code}.csv`);
  if (!fs.existsSync(src)) continue;
  const all = parseCsv(fs.readFileSync(src, 'utf8'));
  const head = all.shift();
  const iKey = head.indexOf('key'), iEn = head.indexOf('english'),
        iPh = head.indexOf('placeholders'), iWh = head.indexOf('where_it_appears');

  const parts = chunk(all, CHUNK_TARGET);
  const dir = path.join(OUT, `web-${code}-parts`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  parts.forEach((rows, i) => {
    const lines = ['key,english,placeholders,where_it_appears'];
    for (const r of rows) lines.push([r[iKey], r[iEn], r[iPh], r[iWh]].map(cell).join(','));
    fs.writeFileSync(path.join(dir, `web-${code}-${String(i + 1).padStart(2, '0')}.csv`), lines.join('\n') + '\n', 'utf8');
  });

  const gloss = shippedGlossary(code);
  // SELF-CONTAINED PASTE PACKS. The first real run came back as a wholly
  // invented string list with its own key scheme: the model never read the
  // attachment and answered from the description of the app instead. An
  // attachment that silently fails to arrive is indistinguishable, in the reply,
  // from one that arrived — so the rows are put INSIDE the prompt. A part is
  // about 9KB of text; there is nothing to attach and nothing to fail.
  parts.forEach((rows, i) => {
    const nn = String(i + 1).padStart(2, '0');
    const table = ['key,english,placeholders,where_it_appears']
      .concat(rows.map((r) => [r[iKey], r[iEn], r[iPh], r[iWh]].map(cell).join(',')))
      .join('\n');
    const body = plainPrompt(code, L, all.length, parts, gloss, { part: i + 1, rows: rows.length })
      .replace('-------------------------------- TO HERE --------------------------------------',
        `Here are the ${rows.length} rows. Translate every one of them.\n\n${table}\n\n-------------------------------- TO HERE --------------------------------------`);
    fs.writeFileSync(path.join(dir, `PASTE-${code}-${nn}.txt`), body, 'utf8');
  });

  const brief = buildPrompt(code, L, all.length, parts, gloss);
  fs.writeFileSync(path.join(OUT, `PROMPT-${code}.md`), brief, 'utf8');
  // The same thing as plain text. The .md renders as a wall of asterisks and
  // pipes in anything that is not a markdown viewer, and this file exists to be
  // opened and copied, not read in a repo browser.
  fs.writeFileSync(path.join(OUT, `PROMPT-${code}.txt`), plainPrompt(code, L, all.length, parts, gloss), 'utf8');
  console.log(`${L.name.padEnd(10)} ${String(all.length).padStart(4)} strings  ->  ${parts.length} parts, ${gloss.length} glossary terms`);
}

function buildPrompt(code, L, total, parts, gloss) {
  const glossTable = gloss.length
    ? gloss.map(([en, tr]) => `| ${en} | ${tr} |`).join('\n')
    : '_(no shipped translations found for this language yet)_';
  return `# ${L.name} (\`${code}\`) — web console translation

${total} strings, split into ${parts.length} files under \`web-${code}-parts/\`.
**Upload ONE part per conversation turn and paste the prompt below each time.**
Asking for all ${total} in one reply is where a model starts dropping rows near
the end, and a short reply looks exactly like a complete one.

## The prompt

---

You are translating the interface of **Smart Digital Khata**, an app used by
small kirana (grocery) shopkeepers and their customers in small towns and
villages in India. It keeps a shop's **khata** — the running credit ledger of
what each customer owes — and lets customers order from the shop.

Translate the attached CSV into **${L.name}**, written in the **${L.script} script**.

**Return a CSV with exactly two columns: \`key\` and \`translation\`.** One row per
input row, in the same order, keys copied exactly. Do not return the other
columns. Do not add, drop, merge or reorder rows. Return nothing but the CSV.

Who reads these words: someone with a cheap Android phone, a 2G connection and
limited schooling. Many are not confident readers. Write the way such a person
speaks — not the way a newspaper, a bank form or a government notice is written.

### Rule zero — read the attached file, do not invent one

Translate ONLY the rows in the attached CSV. Do not write your own list of
interface strings.

Every key in that file contains a **dot**: \`acc.language\`, \`cart.belowMin\`,
\`sup.nav\`. If the keys you are about to write contain underscores
(\`web_nav_tagline\`) or look like names you chose, you are not reading the file
— stop and say so.

Before the CSV, output these three lines so it is clear the file was read:

    FILE: <the filename you were given>
    ROWS: <how many data rows it has>
    FIRST/LAST KEY: <the first key>, <the last key>

If you cannot open or read the attachment, say exactly that and stop. Do not
produce a translation from the description of the app above. An invented list is
worse than no answer: it looks like work and is silently discarded.

### Rules, in order of importance

1. **Placeholders are code, not words.** Anything in curly braces — \`{amount}\`,
   \`{name}\`, \`{n}\`, \`{shop}\` — is replaced with a real value when the app runs.
   Copy each one exactly: same spelling, same braces, no translation, none added
   or dropped. The \`placeholders\` column lists what that row must still contain.
   A missing placeholder prints a broken sentence to a real shopkeeper.

2. **One script only.** Every character must be ${L.script}, except placeholders,
   numerals, and real brand names (UPI, WhatsApp, Razorpay, Smart Khata, PDF,
   OTP, QR). Never leave a row in English. Never use another Indic script.

3. **Use the words this app already uses.** These are not suggestions — they are
   what the same person already sees in the mobile app, and the web must match:

| English | ${L.name} |
|---|---|
${glossTable}

4. **Money words carry direction, and getting one wrong is serious.** This app
   tracks credit. Money the customer **owes the shop** and money the customer
   **has paid or holds in advance** are opposites. A word that can mean "deposit"
   or "amount in your favour" must never be used for a debt. If a short English
   string is ambiguous on its own, use the \`where_it_appears\` column to see which
   screen it is on, choose the reading that fits, and note it at the end.

5. **Plain spoken register.** Where the natural spoken word is an English
   loanword people actually say — order, delivery, balance, online, message,
   mobile — use it written in ${L.script}, rather than forcing a pure word nobody
   uses in a shop.

6. **Numerals stay Latin**: 30, 1,250.00.

7. **Keep it short.** These are buttons, labels and column headings on a small
   phone. Aim to stay within about 1.5x the English length; a long translation is
   cut off mid-word on a 360px screen.

8. **Read \`where_it_appears\`.** "Shopkeeper: settings" means the shop's owner is
   reading it; "Shopper: cart" means their customer is. The politeness level and
   the word for "you" often differ between the two.

After the CSV, list separately: rows you were unsure about and why, and rows
where the **English itself** is ambiguous.

---

## After each part

Save the reply as \`web-${code}-NN.csv\` next to the part it answers and tell me.
Nothing ships before it passes \`node scripts/web-i18n-verify.mjs\`, which
rejects rather than repairs — a silently corrected translation is one nobody
reviewed. It checks that every key is real and unknown to no one, that
placeholders survive exactly, that the text is in ${L.script} and carries no
other Indic script, that no row came back in English, and that nothing contains
a replacement character.

## Parts

${parts.map((p, i) => `- \`web-${code}-parts/web-${code}-${String(i + 1).padStart(2, '0')}.csv\` — ${p.length} strings (${p[0][0]} … ${p[p.length - 1][0]})`).join('\n')}
`;
}

// The prompt with no markup at all: what you paste into Gemini, and nothing
// else. Everything that is instruction-to-the-human lives in the .md.
function plainPrompt(code, L, total, parts, gloss, inline) {
  const width = Math.max(...gloss.map(([en]) => en.length), 10);
  const glossLines = gloss.map(([en, tr]) => `    ${en.padEnd(width)}  ${tr}`).join('\n');
  return `SMART DIGITAL KHATA — ${L.name.toUpperCase()} (${code}) TRANSLATION PROMPT

HOW TO USE
${inline
  ? `  This is part ${inline.part} of ${parts.length} (${inline.rows} of ${total} strings).
  Paste EVERYTHING between the two lines below into Gemini — the rows are
  included, so there is nothing to attach. One part per conversation turn.`
  : `  ${total} strings, split into ${parts.length} files under web-${code}-parts/.
  Upload ONE part per turn and paste everything below the line each time.
  Do not upload all ${total} at once: a model quietly stops near the end, and a
  short reply looks exactly like a complete one.`}

${parts.map((p, i) => `  ${i + 1}. web-${code}-${String(i + 1).padStart(2, '0')}.csv  — ${p.length} strings (${p[0][0]} … ${p[p.length - 1][0]})`).join('\n')}

------------------------------- PASTE FROM HERE -------------------------------

You are translating the interface of Smart Digital Khata, an app used by small
kirana (grocery) shopkeepers and their customers in small towns and villages in
India. It keeps a shop's khata — the running credit ledger of what each customer
owes — and lets customers order from the shop.

Translate the CSV rows ${inline ? 'included below' : 'in the attached file'} into ${L.name}, written in the ${L.script} script.

Return a CSV with exactly two columns: key and translation. One row per input
row, in the same order, keys copied exactly. Do not return the other columns. Do
not add, drop, merge or reorder rows. Return nothing but the CSV.

Who reads these words: someone with a cheap Android phone, a 2G connection and
limited schooling. Many are not confident readers. Write the way such a person
speaks — not the way a newspaper, a bank form or a government notice is written.

RULE ZERO — READ THE ATTACHED FILE, DO NOT INVENT ONE

  Translate ONLY the rows ${inline ? 'given below' : 'in the attached CSV'}. Do not write your
  own list of interface strings.

  Every key in that file contains a DOT: acc.language, cart.belowMin, sup.nav.
  If the keys you are about to write contain underscores (web_nav_tagline) or
  look like names you chose, you are not reading the file — stop and say so.

  Before the CSV, output these three lines so it is clear the file was read:
      FILE: <the filename you were given>
      ROWS: <how many data rows it has>
      FIRST/LAST KEY: <the first key>, <the last key>

  ${inline ? 'If the rows below are missing or unreadable' : 'If you cannot open or read the attachment'}, say exactly that and stop.
  Do not produce a translation from the description of the app above. An
  invented list is worse than no answer: it looks like work and is silently
  discarded.

RULES, IN ORDER OF IMPORTANCE

1. Placeholders are code, not words. Anything in curly braces — {amount}, {name},
   {n}, {shop} — is replaced with a real value when the app runs. Copy each one
   exactly: same spelling, same braces, not translated, none added or dropped.
   The placeholders column lists what that row must still contain. A missing
   placeholder prints a broken sentence to a real shopkeeper.

2. One script only. Every character must be ${L.script}, except placeholders,
   numerals, and real brand names (UPI, WhatsApp, Razorpay, Smart Khata, PDF,
   OTP, QR). Never leave a row in English. Never use another Indic script.

3. Use the words this app already uses. These are not suggestions — they are what
   the same person already sees in the mobile app, and the web must match:

${glossLines}

4. Money words carry direction, and getting one wrong is serious. This app tracks
   credit. Money the customer OWES THE SHOP and money the customer HAS PAID or
   holds IN ADVANCE are opposites. A word that can mean "deposit" or "amount in
   your favour" must never be used for a debt. If a short English string is
   ambiguous on its own, use the where_it_appears column to see which screen it
   is on, choose the reading that fits, and say so at the end.

5. Plain spoken register. Where the natural spoken word is an English loanword
   people actually say — order, delivery, balance, online, message, mobile — use
   it written in ${L.script}, rather than forcing a pure word nobody uses in a shop.

6. Numerals stay Latin: 30, 1,250.00.

7. Keep it short. These are buttons, labels and column headings on a small phone.
   Stay within about 1.5x the English length; a long translation is cut off
   mid-word on a 360px screen.

8. Read where_it_appears. "Shopkeeper: settings" means the shop's owner is
   reading it; "Shopper: cart" means their customer is. The politeness level and
   the word for "you" often differ between the two.

After the CSV, list separately: rows you were unsure about and why, and rows
where the English itself is ambiguous.

-------------------------------- TO HERE --------------------------------------
`;
}
