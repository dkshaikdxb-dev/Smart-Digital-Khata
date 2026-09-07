// Real NEWSLETTER publisher (Batch T). Requires a real Postgres (DATABASE_URL,
// migrations 0001..0032). NO real SMTP / network is EVER made — every send path
// injects a FAKE transport ({ sendMail }). Covers:
//   1. subscribe creates a `pending` subscriber with confirm + unsub tokens;
//      confirm → active; unsubscribe → unsubscribed; an unknown token is safe.
//   2. isConfigured() is false without SMTP env, true with it.
//   3. subscribe with a configured (fake) transport e-mails the double-opt-in
//      confirmation with a confirm link.
//   4. newsletterAdapter.send with a FAKE transport sends ONLY to `active`
//      subscribers of the mapped list (not pending/unsubscribed, not the other
//      list), each with an unsubscribe footer, and returns the sent count; with
//      NO transport → 'failed'.
//   5. The resolver falls back to the OUTBOX for a newsletter item when SMTP is
//      unconfigured, and the tier gate still SKIPS an unapproved Tier-1 item.
//   6. The public subscribe endpoint returns NO address and does not enumerate
//      (same generic 202 for a new and an already-existing address).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://khata.test.local';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const newsletter = require('../src/services/content-newsletter.service');
const publisher = require('../src/services/content-publisher.service');

const uniq = Date.now().toString().slice(-9);
const createdEmails = [];
const createdContentIds = [];

// Clear every SMTP env var so a test starts UNCONFIGURED unless it opts in.
function clearSmtp() {
  delete process.env.SMTP_URL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_SECURE;
  delete process.env.NEWSLETTER_FROM;
  newsletter.__setTransport(null);
}
function setSmtpConfigured() {
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '587';
  process.env.NEWSLETTER_FROM = 'news@khata.test.local';
}

// A fake nodemailer transport that records every sendMail call.
function fakeTransport() {
  const calls = [];
  return { calls, sendMail: async (msg) => { calls.push(msg); return { messageId: `m_${calls.length}` }; } };
}

const email = (tag) => `nl_${tag}_${uniq}@test.local`;

async function insertSub(em, list, status) {
  createdEmails.push(em);
  const r = await pool.query(
    `INSERT INTO newsletter_subscribers (email, list, status, confirm_token, unsub_token, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (email, list) DO UPDATE SET status = EXCLUDED.status
     RETURNING *`,
    [em, list, status, status === 'pending' ? `ct_${em}` : null, `ut_${em}`, status === 'active' ? new Date().toISOString() : null]
  );
  return r.rows[0];
}

async function insertItem(over = {}) {
  const o = {
    channel: 'newsletter_community', engine: 'reach', autonomy_tier: 0, language: 'en',
    title: 'News', body: 'hello subscribers', status: 'scheduled',
    scheduled_at: new Date(Date.now() - 60000).toISOString(),
    approved_at: null, approved_by: null, source: 'human',
    ...over,
  };
  const r = await pool.query(
    `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, body, status, scheduled_at, approved_at, approved_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [o.channel, o.engine, o.autonomy_tier, o.language, o.title, o.body, o.status, o.scheduled_at, o.approved_at, o.approved_by, o.source]
  );
  createdContentIds.push(r.rows[0].id);
  return r.rows[0];
}

beforeEach(() => { clearSmtp(); });

afterAll(async () => {
  if (createdEmails.length) {
    await pool.query('DELETE FROM newsletter_subscribers WHERE email = ANY($1)', [createdEmails]);
  }
  if (createdContentIds.length) {
    await pool.query('DELETE FROM content_items WHERE id = ANY($1)', [createdContentIds]);
  }
  clearSmtp();
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. Subscriber lifecycle
// ---------------------------------------------------------------------------
describe('subscriber lifecycle (double opt-in)', () => {
  it('subscribe creates a pending subscriber with confirm + unsub tokens', async () => {
    const em = email('life');
    createdEmails.push(em);
    await newsletter.subscribe(em, 'community');
    const r = await pool.query('SELECT * FROM newsletter_subscribers WHERE email=$1 AND list=$2', [em, 'community']);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].status).toBe('pending');
    expect(r.rows[0].confirm_token).toBeTruthy();
    expect(r.rows[0].unsub_token).toBeTruthy();
    expect(r.rows[0].confirmed_at).toBeNull();
  });

  it('confirm activates the subscriber and clears the confirm token', async () => {
    const em = email('confirm');
    createdEmails.push(em);
    await newsletter.subscribe(em, 'community');
    const before = await pool.query('SELECT confirm_token FROM newsletter_subscribers WHERE email=$1', [em]);
    await newsletter.confirm(before.rows[0].confirm_token);
    const after = await pool.query('SELECT status, confirmed_at, confirm_token FROM newsletter_subscribers WHERE email=$1', [em]);
    expect(after.rows[0].status).toBe('active');
    expect(after.rows[0].confirmed_at).not.toBeNull();
    expect(after.rows[0].confirm_token).toBeNull();
  });

  it('unsubscribe marks the subscriber unsubscribed', async () => {
    const em = email('unsub');
    const sub = await insertSub(em, 'community', 'active');
    await newsletter.unsubscribe(sub.unsub_token);
    const after = await pool.query('SELECT status, unsubscribed_at FROM newsletter_subscribers WHERE email=$1', [em]);
    expect(after.rows[0].status).toBe('unsubscribed');
    expect(after.rows[0].unsubscribed_at).not.toBeNull();
  });

  it('an unknown confirm/unsubscribe token is safe (no throw, no change)', async () => {
    await expect(newsletter.confirm('totally-unknown-token')).resolves.toEqual({ ok: true });
    await expect(newsletter.unsubscribe('totally-unknown-token')).resolves.toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. SMTP gating + confirmation e-mail
// ---------------------------------------------------------------------------
describe('SMTP gating', () => {
  it('isConfigured() is false without SMTP env and true with it', () => {
    clearSmtp();
    expect(newsletter.isConfigured()).toBe(false);
    setSmtpConfigured();
    expect(newsletter.isConfigured()).toBe(true);
    // Missing NEWSLETTER_FROM → not configured.
    delete process.env.NEWSLETTER_FROM;
    expect(newsletter.isConfigured()).toBe(false);
    clearSmtp();
  });

  it('subscribe with a configured transport e-mails the double-opt-in confirm link', async () => {
    setSmtpConfigured();
    const t = fakeTransport();
    newsletter.__setTransport(t);
    const em = email('optin');
    createdEmails.push(em);
    await newsletter.subscribe(em, 'community');
    expect(t.calls.length).toBe(1);
    expect(t.calls[0].to).toBe(em);
    expect(t.calls[0].text).toContain('/api/public/newsletter/confirm?token=');
    clearSmtp();
  });
});

// ---------------------------------------------------------------------------
// 4. newsletterAdapter.send
// ---------------------------------------------------------------------------
describe('newsletterAdapter.send', () => {
  it('sends only to active subscribers of the mapped list and returns the count', async () => {
    const a = email('adA');
    const b = email('adB');
    const c = email('adC');
    const d = email('adD');
    const e = email('adE');
    await insertSub(a, 'community', 'active');
    await insertSub(b, 'community', 'active');
    await insertSub(c, 'community', 'pending'); // not sent
    await insertSub(d, 'community', 'unsubscribed'); // not sent
    await insertSub(e, 'ecosystem', 'active'); // other list — not sent

    const t = fakeTransport();
    const item = { id: 'x', channel: 'newsletter_community', title: 'Hello', body: 'Weekly update' };
    const out = await newsletter.newsletterAdapter.send(item, { transport: t });

    const recipients = t.calls.map((m) => m.to);
    // The two active community subs ARE included; pending/unsubscribed/other-list
    // are NOT. (Other active community subs from sibling tests may also appear —
    // the adapter targets active-of-list, so we assert membership, not equality.)
    expect(recipients).toContain(a);
    expect(recipients).toContain(b);
    expect(recipients).not.toContain(c); // pending
    expect(recipients).not.toContain(d); // unsubscribed
    expect(recipients).not.toContain(e); // other list
    expect(out.result).toBe('sent');
    expect(out.externalRef).toBe(`newsletter:${t.calls.length}`);
    // Each message carries an unsubscribe footer.
    expect(t.calls[0].text).toContain('Unsubscribe: ');
    expect(t.calls[0].text).toContain('/api/public/newsletter/unsubscribe?token=');
  });

  it('with NO transport (SMTP unconfigured) → failed', async () => {
    clearSmtp();
    const out = await newsletter.newsletterAdapter.send(
      { id: 'y', channel: 'newsletter_community', title: 'T', body: 'B' },
      {}
    );
    expect(out.result).toBe('failed');
    expect(out.detail).toMatch(/SMTP/i);
  });

  it('publishes to exactly the active recipients and is always result:sent (0 is fine)', async () => {
    // Whatever the active count for the list is, the broadcast is a successful
    // 'sent' publish (an empty list simply sends to 0 — still configured/sent).
    const t = fakeTransport();
    const before = await pool.query(
      `SELECT COUNT(*)::int c FROM newsletter_subscribers WHERE list='ecosystem' AND status='active'`
    );
    const out = await newsletter.newsletterAdapter.send(
      { id: 'z', channel: 'newsletter_ecosystem', title: 'T', body: 'B' },
      { transport: t }
    );
    expect(out.result).toBe('sent');
    expect(out.externalRef).toBe(`newsletter:${before.rows[0].c}`);
    expect(t.calls.length).toBe(before.rows[0].c);
  });
});

// ---------------------------------------------------------------------------
// 5. Resolver fallback to outbox + tier gate
// ---------------------------------------------------------------------------
describe('publishDue with SMTP unconfigured', () => {
  it('a newsletter item falls back to the outbox adapter', async () => {
    clearSmtp();
    const item = await insertItem({ channel: 'newsletter_community', autonomy_tier: 0, body: 'via outbox' });
    await publisher.publishDue(new Date());
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id=$1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toMatch(/^outbox:/);
    const log = await pool.query('SELECT adapter, result FROM content_publish_log WHERE content_id=$1', [item.id]);
    expect(log.rows[0].adapter).toBe('outbox');
    expect(log.rows[0].result).toBe('sent');
  });

  it('the tier gate still SKIPS an unapproved Tier-1 newsletter item', async () => {
    clearSmtp();
    const bad = await insertItem({ channel: 'newsletter_ecosystem', engine: 'reach', autonomy_tier: 1, approved_at: null, body: 'nope' });
    await publisher.publishDue(new Date());
    const row = await pool.query('SELECT status, published_at, publish_attempts FROM content_items WHERE id=$1', [bad.id]);
    expect(row.rows[0].status).toBe('scheduled');
    expect(row.rows[0].published_at).toBeNull();
    expect(row.rows[0].publish_attempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Public subscribe endpoint — no address, no enumeration
// ---------------------------------------------------------------------------
describe('POST /api/public/newsletter/subscribe', () => {
  it('returns a generic 202 with no address, identically for new and existing', async () => {
    clearSmtp();
    // A real TLD so the endpoint's strict email validation accepts it.
    const em = `nl_pub_${uniq}@example.com`;
    createdEmails.push(em);

    const first = await request(app).post('/api/public/newsletter/subscribe').send({ email: em, list: 'community' });
    expect(first.status).toBe(202);
    expect(JSON.stringify(first.body)).not.toContain(em);
    expect(first.body.email).toBeUndefined();

    // Same address again → identical response (no enumeration signal).
    const second = await request(app).post('/api/public/newsletter/subscribe').send({ email: em, list: 'community' });
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/public/newsletter/subscribe').send({ email: 'not-an-email', list: 'community' });
    expect(res.status).toBe(400);
  });
});
