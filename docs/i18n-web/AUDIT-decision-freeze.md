# Decision Freeze & Conflict Audit — READ-ONLY ARTEFACT

> **RESOLVED 2026-09-17.** Every question in section 9 was answered by the owner
> and the answers are now in `scripts/i18n-decisions.json`, enforced by
> `scripts/i18n-registry-check.mjs` in CI. This file is kept as the record of
> what was found, not as an open list — read the registry for what is true now.
> Two figures below were wrong and are corrected in the registry: the four-state
> split is 55 rows where web = app and 99 adopt-app rows the app has no key for
> (transposed here), and the Gujarati loanword scope is 23 inflected forms across
> 14 lemmas, not 21 tokens.

**Nothing in this audit changed a translation, a dictionary, a ledger, a script,
or the OTA.** It records what is decided, what is in conflict, and what only a
person can settle. It is evidence, not a change.

Scope deliberately excluded: the 370 untranslated strings per language, the
remaining untranslated languages, native-speaker wording review, the OTA, and
all unrelated application code.

---

## 1. Decision inventory

Decisions live in five places today, and that is itself part of the problem —
there is no single registry, so "what was decided" has to be reconstructed.

| artefact | holds | form |
|---|---|---|
| `scripts/keylevel-decisions.json` | 194 key-level verdicts across bn/gu/mr | `app` / `web` / explicit string |
| `scripts/bn-divergence-decisions.json` | Bengali: keep-web, review, align-with-reason, group C | reasons, no status field |
| `scripts/gu-reconcile-decisions.json` | Gujarati: 7 apply, 1 web, 8 review themes | reasons + confidence + native_review |
| `scripts/mr-reconcile-decisions.json` | Marathi: 7 apply, 1 web, 9 review themes | reasons + native_review |
| `scripts/lib/i18n-brand-keys.mjs` | 6 keys English-by-design | a `Set`, no reasons, no status |
| `docs/i18n-web/LEDGER-*.md` | generated records of what each run did | prose, regenerated per run |

**194 decided keys inspected** for this audit (the key-level file; the
reconciliation files are thematic and are treated as scope declarations).

## 2. Four-state comparison

**A** documented decision · **B** current web · **C** current app · **D** tooling registry

| result | count |
|---|---|
| web matches the documented decision | 190 of 194 |
| **web disagrees with the documented decision** | **4 — CONFLICT** |
| web differs from app, and the decision INTENDED that | 36 |
| web differs from app where the decision said adopt-app | **4 — same 4 rows** |
| decision says adopt-app but the app has no such key | 55 |

### CONFLICT — HUMAN DECISION REQUIRED (4 rows)

| key | A documented | B web | C app | D registry |
|---|---|---|---|---|
| `gu set.keySecretSet` | adopt app → `Key Secret આપેલું છે` | `Key secret આપેલું છે` | `Key Secret આપેલું છે` | not declared |
| `gu set.webhookSecretSet` | adopt app → `Webhook Secret …` | `Webhook secret …` | `Webhook Secret …` | not declared |
| `mr set.keySecretSet` | adopt app → `Key Secret दिलेले आहे` | `Key secret दिलेले आहे` | `Key Secret दिलेले आहे` | not declared |
| `mr set.webhookSecretSet` | adopt app → `Webhook Secret …` | `Webhook secret …` | `Webhook Secret …` | not declared |

**Cause, stated plainly:** the Razorpay casing reversal was applied to the
`no…Secret` strings and to the web, but not to the `…SecretSet` strings in the
app. A partial reversal. **Not resolved here** — capital and lower case are both
defensible and the instruction history supports each.

## 3. Decision churn

History of `backend/src/data/regional-i18n.json`: **22 commits**.

| shape | keys |
|---|---|
| changed more than once | **135** |
| of those, a value RETURNED to an earlier one (A→B→A) | **117** |
| changed more than once without returning (A→B→C) | 18 |

**117 of the 135 are one decision, not 117.** The Gujarati orthography flip
(candra ઑ → plain ઓ → candra ઑ) rewrote every string containing a loanword.
This is the single clearest argument for the registry: one house-style decision
reversed twice produced 117 key-level churn events and two full corpus rewrites.

### The four named reversals, verified

| item | historical values (commit) | current web | current app | registry | status |
|---|---|---|---|---|---|
| **gu status chip** `ostatus.accepted` | `સ્વીકાર્યું` (e5a3768) → `સ્વીકાર્યો` (66237e9) → `સ્વીકારેલ` (d57a353) | `સ્વીકારેલ` | `સ્વીકારેલ` | absent | **CHURN ×3, A→B→C** |
| **gu orthography** `nav.orders` | `ઑર્ડર` → `ઓર્ડર` (0effe8e) → `ઑર્ડર` (d57a353) | `ઑર્ડર` | `ઑર્ડર` | absent | **CHURN ×3, A→B→A** |
| **Razorpay casing** `bn set.noKeySecret` | `কোনো কী সিক্রেট নেই` → `Key Secret নেই` (66237e9) → `Key secret নেই` (0effe8e) | `Key secret নেই` | `Key secret নেই` | **not in registry** | **CHURN ×3 + CONFLICT (§2)** |
| **bn `c.deliverTo`** | `যেখানে ডেলিভারি:` — **one committed value only** | `যেখানে ডেলিভারি:` | `এখানে পৌঁছে দিন:` | absent | **instruction churn, repo stable** |

`c.deliverTo` is worth separating: the repository never held the alternative.
`যেখানে ডেলিভারি হবে` was applied and reversed inside one uncommitted session.
The churn was in the instruction stream, not in the code — which is exactly the
distinction a registry has to capture, because a reader of git history would
never see it.

### Additional churn not previously named (A→B→C, 18 keys)

`gu pmode.prepaid`, `gu c.prepaid`, `gu ord.cancelConfirm`, `gu ord.marked`,
`gu dash.commerce.gmv30`, `gu dash.orderStatus.accepted`,
`gu insight.upsell_free_highgmv.detail`, `bn set.noWebhookSecret`,
`gu/mr set.noKeySecret`, `gu/mr set.noWebhookSecret`, and 6 more. Most are a
terminology decision and an orthography decision landing on the same string in
different rounds.

## 4. Decision types — and what was misfiled

| type | definition | examples |
|---|---|---|
| **KEY-LEVEL** | one key | `bn oedit.originalSubtotal`, `gu stmt.title` |
| **TERMINOLOGY** | one concept, many keys | catalogue, product/item, unit, prepaid |
| **HOUSE STYLE** | language- or surface-wide | Gujarati ઑ/ઓ, continuous aspect, status inflection |
| **SEMANTIC BUSINESS RULE** | a distinction the product enforces | Accept≠Approve, Reject≠Cancel, Balance≠Outstanding |

**Misfiled today — house-style decisions recorded as key-level:**

- **Gujarati orthography** was expressed as `"Adopt App's plain ઓ (ઓર્ડર, લોગ આઉટ)"` —
  two example words. It is a rule over **every loanword in the language**
  (21 distinct tokens, ~150 strings). Recorded as examples, it was applied twice
  and reversed once.
- **Continuous aspect** (`-ાઈ રહ્યું છે`) was given as ten key names. It is a
  house rule for every progress string.
- **Status inflection** was given as two chips. It governs at least five —
  `accepted`, `cancelled`, `out_for_delivery`, `preparing`, `completed` — and
  two of those were never named, so they now follow a different rule from the
  ones that were.

**Currently inconsistent as a result:** `gu ostatus.accepted` is the bare
`સ્વીકારેલ` while `gu ostatus.out_for_delivery` is the inflected
`ડિલિવરી માટે નીકળ્યો`. Both were instructed; neither statement mentioned the other.

## 5. Scope before propagation

The catalogue case is the standing evidence: **9 strings contained the word for
"list"; only 3 were catalogue contexts.** The other 6 said *"List my shop so
nearby customers can find you"* and *"hidden from lists"*. Scoping by English
source rather than by target word is what prevented that.

**Declared scope for each terminology decision, as it stands:**

| decision | scope rule used | keys affected |
|---|---|---|
| catalogue | English contains `catalog` | 8 |
| unit | selling counter only; measurement senses excluded | 2 of 4 candidates |
| WhatsApp | every occurrence, per-language postposition | 22 |
| prepaid | `c.prepaid`, `pmode.prepaid` | 5 |
| product/item | target-word substitution — **no English-source scope** | gu 11, mr 12 |
| gu orthography | 21 tokens from the pre-normalisation corpus | ~150 |

**SCOPE PROBLEM:** product/item was applied by substituting ઉત્પાદન→વસ્તુ and
उत्पादन→वस्तू wherever they appeared, with no check on what the English said.
It is the one terminology decision in this set applied the way the catalogue
decision was explicitly not. It may be correct — but it is unverified, and the
catalogue precedent says that is not good enough.

## 6. Current web/app mismatches

40 decided keys where web ≠ app. **36 are intended** — the decision said keep
web, so divergence is the decision. 4 are the CONFLICT in §2.

Web/app divergence is therefore **not** a defect signal on its own, and any
future tool that treats it as one will generate 36 false alarms.

## 7. Proposed Decision Registry — structure only

Not populated beyond what is genuinely established. Statuses: `LOCKED`,
`REVIEW`, `CONFLICT`, `PROPOSED`.

```json
{
  "<language>": {
    "<decision-id>": {
      "type": "KEY-LEVEL | TERMINOLOGY | HOUSE-STYLE | SEMANTIC-RULE",
      "status": "LOCKED | REVIEW | CONFLICT | PROPOSED",
      "concept": "what this decides, in one line",
      "scope": {
        "rule": "how affected keys are IDENTIFIED, not just listed",
        "keys": ["the resolved list at the time of locking"],
        "surfaces": ["web", "app"]
      },
      "value": { "web": "…", "app": "…" },
      "rationale": "why, in the decider's words",
      "decided_by": "who", "decided_on": "ISO date",
      "supersedes": "previous decision id, when this reverses one",
      "override_log": [
        { "from": "…", "to": "…", "on": "…", "by": "…", "reason": "…" }
      ]
    }
  }
}
```

Two fields exist because of what this audit found: `scope.rule` (because listing
example keys is how the orthography and status decisions under-scoped), and
`override_log` (because four items were reversed with no record of why, and git
history cannot show the `c.deliverTo` reversal at all).

### What can be LOCKED today

Only decisions that are stated, applied, and consistent across web, app and
tooling:

| id | type | status | why it qualifies |
|---|---|---|---|
| `whatsapp-latin` | HOUSE-STYLE | **LOCKED** | one rule, all 3 languages, zero transliterations remain |
| `native-digits-latin` | HOUSE-STYLE | **LOCKED** | zero native digits remain in any language, either surface |
| `balance-vs-outstanding` | SEMANTIC-RULE | **LOCKED** | anti-collision verified: no language renders both alike |
| `catalogue-loanword` | TERMINOLOGY | **LOCKED** | scope rule is explicit and verified (English contains `catalog`) |
| `reject-not-cancel` | SEMANTIC-RULE | **LOCKED** | bn verified; the product enforces the distinction |
| `approve-not-accept` | SEMANTIC-RULE | **LOCKED** | gu + mr `chelp.e7.a`, web kept in both |
| `unit-counter` | TERMINOLOGY | **LOCKED** | scope excludes the measurement sense, verified |
| `prepaid-mechanism` | TERMINOLOGY | **LOCKED** | all 3 languages agree, web and app |

### CONFLICT — cannot be locked

| id | detail |
|---|---|
| `razorpay-casing` | 4 rows where web and app disagree; instruction history supports both |

### REVIEW — valid alternatives, needs a native speaker

218 rows behind ~20 questions, already catalogued in the three ledgers and the
terminology matrix. Unchanged by this audit.

### PROPOSED — analysis only

| id | detail |
|---|---|
| `gu-status-inflection` | `accepted` bare vs `out_for_delivery` inflected — currently inconsistent, both instructed |
| `gu-orthography` | reversed twice; needs one statement covering all 21 tokens, not examples |
| `product-item-scope` | applied without English-source scoping; needs the catalogue treatment |

## 8. Required tooling safeguards

The current scripts have none of these. Each is a direct consequence of
something in §2–§5.

1. **A LOCKED decision cannot be silently overwritten.** Any apply run that
   would change a locked value halts and names the decision id.
2. **REVIEW and CONFLICT rows are immutable to tooling.** They change only when
   their status changes first.
3. **A PROPOSED value can never override a LOCKED one**, regardless of ordering.
4. **Overriding a lock is explicit** — an `--override <id>` argument naming the
   decision, refused without a reason string.
5. **Every override is appended to `override_log`** with from, to, date and
   reason, so a reversal is recoverable from the registry even when git cannot
   show it (see `c.deliverTo`).
6. **Terminology applies only to its declared scope**, and the scope is a
   *rule* evaluated at apply time, not a key list copied from a message.
7. **Both surfaces are represented.** A decision writes `value.web` and
   `value.app`, so a partial application cannot produce the §2 conflict.
8. **No default.** No `decision='app'`, no `decision='web'`, no "latest prompt
   wins". An unregistered key is untouched, in both directions.
9. **Placeholder, digit, currency and URL guards refuse the whole run**, as they
   do today — this is the one safeguard already in place and it has fired twice.

## 9. Questions requiring human confirmation

Ordered by what they block.

1. **Razorpay casing** — `Key Secret` or `Key secret`? Four rows are in conflict
   and the answer must cover all six keys: `set.keySecret`, `set.webhookSecret`,
   `set.noKeySecret`, `set.noWebhookSecret`, `set.keySecretSet`,
   `set.webhookSecretSet`. Three of those are in the brand registry and three
   are not.
2. **Gujarati status inflection** — is the rule bare or gender-agreeing? It must
   cover `accepted`, `cancelled`, `out_for_delivery`, `preparing` and
   `completed` together. Today `accepted` and `out_for_delivery` follow
   opposite rules.
3. **Gujarati orthography** — one statement covering all 21 loanword tokens, so
   this cannot flip a third time.
4. **Marathi status** — Marathi kept `स्वीकृत` while Gujarati moved to
   `સ્વીકાર્યો` and back. Is Marathi intended to differ?
5. **Product/item scope** — which English sources does it govern? Currently a
   bare target-word substitution.
6. **Should the brand registry absorb the credential status strings?**
   `set.noKeySecret` and the other three are governed by decisions but absent
   from `i18n-brand-keys.mjs`, so the two disagree by construction.
7. The ~20 native-speaker wording questions already catalogued — unchanged.

## 10. What this audit did not do

It did not choose between conflicting values, did not use recency, majority,
app-preference, web-preference, similarity, frequency or cross-language analogy
to break a tie, and did not modify a single translation.
