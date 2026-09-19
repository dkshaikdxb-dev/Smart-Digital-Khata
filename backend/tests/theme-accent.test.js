// The operator-settable accent, and the festive windows that override it
// (batch THEME1). Requires a real Postgres (DATABASE_URL) with migrations
// applied incl. 0076_theme_accent.
//
// The point of most of these is what the RESOLVER refuses to do: a draft window
// must not paint, a window whose dates have not arrived must not paint, and a
// malformed colour anywhere must land on the colour the clients already ship
// rather than on nothing. A theme that fails open to "no accent" is worse than
// one that never changed.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const theme = require('../src/utils/theme');

const uniq = Date.now().toString().slice(-9);
const NAME = `thm_${uniq}`;

const mkCampaign = (over = {}) => pool.query(
  `INSERT INTO theme_campaigns (name, accent, status, starts_at, ends_at, priority)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [over.name ?? NAME, over.accent ?? '#ff8800', over.status ?? 'active',
   over.starts_at ?? null, over.ends_at ?? null, over.priority ?? 0],
).then((r) => r.rows[0].id);

const getConfig = () => request(app).get('/api/public/config');
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

let admin;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    [`Thm Super ${uniq}`, `thm_${uniq}@test.local`, `+9153${uniq}`],
  );
  admin = { id: r.rows[0].id, token: tokenFor(r.rows[0].id) };
});

afterEach(async () => {
  await pool.query('DELETE FROM theme_campaigns WHERE name LIKE $1', [`thm_${uniq}%`]);
  await pool.query("UPDATE platform_settings SET value = '#22c55e' WHERE key = 'theme_accent'");
});

afterAll(async () => {
  await pool.query('DELETE FROM theme_campaigns WHERE name LIKE $1', [`thm_${uniq}%`]);
  await pool.query('DELETE FROM users WHERE id = $1', [admin.id]);
  await pool.end();
});

describe('colour parsing and contrast', () => {
  it('accepts the shapes an operator actually types, and rejects the rest', () => {
    expect(theme.normalizeHex('#22c55e')).toBe('#22c55e');
    expect(theme.normalizeHex('22C55E')).toBe('#22c55e');   // no hash, upper case
    expect(theme.normalizeHex('  #2c5  ')).toBe('#22cc55');  // short form, padded
    for (const bad of ['', 'green', '#12345', '#1234567', null, undefined, 42, {}]) {
      expect(theme.normalizeHex(bad)).toBeNull();
    }
  });

  it('computes WCAG contrast, checked against known values', () => {
    // Black on white is the defined maximum, 21:1.
    expect(theme.contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    // A colour against itself is 1:1, and the order of the pair cannot matter.
    expect(theme.contrastRatio('#22c55e', '#22c55e')).toBeCloseTo(1, 5);
    expect(theme.contrastRatio('#22c55e', '#0f172a'))
      .toBeCloseTo(theme.contrastRatio('#0f172a', '#22c55e'), 10);
  });

  it('the accent the clients ship today passes both checks', () => {
    const r = theme.contrastReport(theme.DEFAULT_ACCENT);
    expect(r.on_accent.passes_aa).toBe(true);
    expect(r.on_app_bg.passes_aa).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('warns — and only warns — about a colour that would be hard to read', () => {
    const r = theme.contrastReport('#777777');
    expect(r.warnings.length).toBeGreaterThan(0);
    // The report is advice. It still hands back a usable colour, because the
    // operator decides: refusing here would block a brand colour they own.
    expect(r.accent).toBe('#777777');
  });

  it('returns null for a value that is not a colour at all', () => {
    expect(theme.contrastReport('not a colour')).toBeNull();
  });
});

describe('GET /api/public/config — the resolved accent', () => {
  it('serves the standing accent when no window is live', async () => {
    const res = await getConfig();
    expect(res.status).toBe(200);
    expect(res.body.theme).toMatchObject({ accent: '#22c55e', source: 'default', campaign: null });
  });

  it('follows an operator edit of the standing accent', async () => {
    await pool.query("UPDATE platform_settings SET value = '#0055ff' WHERE key = 'theme_accent'");
    const res = await getConfig();
    expect(res.body.theme.accent).toBe('#0055ff');
    expect(res.body.theme.source).toBe('default');
  });

  it('an active window overrides it, and says which one', async () => {
    await mkCampaign({ accent: '#ff8800' });
    const res = await getConfig();
    expect(res.body.theme).toMatchObject({ accent: '#ff8800', source: 'campaign', campaign: NAME });
  });

  it('a DRAFT window does not paint', async () => {
    await mkCampaign({ accent: '#ff8800', status: 'draft' });
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');
  });

  it('a PAUSED window does not paint', async () => {
    await mkCampaign({ accent: '#ff8800', status: 'paused' });
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');
  });

  it('a window whose start has not arrived does not paint', async () => {
    await mkCampaign({ accent: '#ff8800', starts_at: new Date(Date.now() + 864e5) });
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');
  });

  it('a window that has ended does not paint', async () => {
    await mkCampaign({ accent: '#ff8800', ends_at: new Date(Date.now() - 864e5) });
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');
  });

  it('an open-ended window (no dates) paints', async () => {
    await mkCampaign({ accent: '#ff8800', starts_at: null, ends_at: null });
    expect((await getConfig()).body.theme.accent).toBe('#ff8800');
  });

  it('when two windows overlap, the higher priority wins', async () => {
    await mkCampaign({ name: `${NAME}_lo`, accent: '#111111', priority: 1 });
    await mkCampaign({ name: `${NAME}_hi`, accent: '#eeeeee', priority: 9 });
    const res = await getConfig();
    expect(res.body.theme.accent).toBe('#eeeeee');
    expect(res.body.theme.campaign).toBe(`${NAME}_hi`);
  });

  it('two windows at equal priority resolve the same way every time', async () => {
    await mkCampaign({ name: `${NAME}_a`, accent: '#111111', priority: 5 });
    await mkCampaign({ name: `${NAME}_b`, accent: '#eeeeee', priority: 5 });
    const first = (await getConfig()).body.theme.campaign;
    for (let i = 0; i < 4; i += 1) {
      expect((await getConfig()).body.theme.campaign).toBe(first);
    }
  });

  it('a malformed colour in a window falls back rather than serving nothing', async () => {
    await mkCampaign({ accent: 'not-a-colour' });
    const res = await getConfig();
    // The window is skipped, not obeyed, and not fatal.
    expect(res.body.theme.accent).toBe('#22c55e');
    expect(res.body.theme.source).toBe('default');
  });

  it('a malformed standing accent falls back to the colour the clients ship', async () => {
    await pool.query("UPDATE platform_settings SET value = 'rgb(1,2,3)' WHERE key = 'theme_accent'");
    expect((await getConfig()).body.theme.accent).toBe(theme.DEFAULT_ACCENT);
  });

  it('still needs no auth', async () => {
    const res = await request(app).get('/api/public/config'); // no Authorization header
    expect(res.status).toBe(200);
    expect(res.body.theme).toBeDefined();
  });
});

describe('the admin sets the accent', () => {
  it('PATCH /api/admin/settings stores a normalised colour, and /public/config serves it', async () => {
    // Typed without a hash, in upper case — the shapes an operator actually uses.
    const patch = await withToken(request(app).patch('/api/admin/settings'), admin.token)
      .send({ theme_accent: 'FF8800' });
    expect(patch.status).toBe(200);
    expect((await getConfig()).body.theme.accent).toBe('#ff8800');
  });

  it('GET /api/admin/settings echoes it back with its contrast measured', async () => {
    await withToken(request(app).patch('/api/admin/settings'), admin.token)
      .send({ theme_accent: '#22c55e' });
    const got = await withToken(request(app).get('/api/admin/settings'), admin.token);
    expect(got.status).toBe(200);
    expect(got.body.features.theme_accent).toBe('#22c55e');
    const c = got.body.features.theme_accent_contrast;
    expect(c.on_accent.passes_aa).toBe(true);
    expect(c.warnings).toEqual([]);
  });

  it('a colour that reads badly SAVES, and comes back carrying the warning', async () => {
    const patch = await withToken(request(app).patch('/api/admin/settings'), admin.token)
      .send({ theme_accent: '#777777' });
    expect(patch.status).toBe(200);                       // not a gate
    const got = await withToken(request(app).get('/api/admin/settings'), admin.token);
    expect(got.body.features.theme_accent).toBe('#777777');
    expect(got.body.features.theme_accent_contrast.warnings.length).toBeGreaterThan(0);
  });

  it('a value that is not a colour is refused outright', async () => {
    for (const bad of ['chartreuse', '#12345', '']) {
      const res = await withToken(request(app).patch('/api/admin/settings'), admin.token)
        .send({ theme_accent: bad });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    // ...and nothing was written: the last good value still stands.
    const got = await withToken(request(app).get('/api/admin/settings'), admin.token);
    expect(got.body.features.theme_accent).toBe('#777777');
  });

  it('setting the accent needs no typed I CONFIRM — it is a policy value, not a credential', async () => {
    const res = await withToken(request(app).patch('/api/admin/settings'), admin.token)
      .send({ theme_accent: '#22c55e' });   // no confirm field
    expect(res.status).toBe(200);
  });
});
