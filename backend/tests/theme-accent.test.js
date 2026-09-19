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

describe('festive windows — admin CRUD', () => {
  const url = '/api/admin/theme/campaigns';
  const post = (body) => withToken(request(app).post(url), admin.token).send(body);

  it('creates one, and the list says whether it is live', async () => {
    const res = await post({ name: `${NAME}_diwali`, accent: 'FF8800', status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body.campaign.accent).toBe('#ff8800');      // normalised on the way in
    expect(res.body.campaign.is_live).toBe(true);
    // and it is painting, through the one resolver
    expect((await getConfig()).body.theme.accent).toBe('#ff8800');

    const list = await withToken(request(app).get(url), admin.token);
    expect(list.status).toBe(200);
    const mine = list.body.items.find((x) => x.name === `${NAME}_diwali`);
    expect(mine.is_live).toBe(true);
    // every row carries what its colour will read like, so the list can warn
    expect(mine.contrast.on_accent.ratio).toBeGreaterThan(0);
  });

  it('a draft is created but does not paint, and activating it does', async () => {
    const made = await post({ name: `${NAME}_eid`, accent: '#0055ff', status: 'draft' });
    expect(made.body.campaign.is_live).toBe(false);
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');

    const patched = await withToken(
      request(app).patch(`${url}/${made.body.campaign.id}/status`), admin.token,
    ).send({ status: 'active' });
    expect(patched.status).toBe(200);
    expect(patched.body.campaign.is_live).toBe(true);
    expect((await getConfig()).body.theme.accent).toBe('#0055ff');
  });

  it('pausing a live window hands the colour back without deleting anything', async () => {
    const made = await post({ name: `${NAME}_pongal`, accent: '#0055ff', status: 'active' });
    expect((await getConfig()).body.theme.accent).toBe('#0055ff');

    await withToken(request(app).patch(`${url}/${made.body.campaign.id}/status`), admin.token)
      .send({ status: 'paused' });
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');

    // still there, still editable — a pause is not a loss
    const got = await withToken(request(app).get(`${url}/${made.body.campaign.id}`), admin.token);
    expect(got.status).toBe(200);
    expect(got.body.campaign.status).toBe('paused');
  });

  it('refuses a window that would end before it starts', async () => {
    const res = await post({
      name: `${NAME}_backwards`, accent: '#0055ff', status: 'active',
      starts_at: new Date(Date.now() + 864e5).toISOString(),
      ends_at: new Date(Date.now() - 864e5).toISOString(),
    });
    // It would never paint, and saving it silently is how somebody spends a
    // festival wondering why nothing happened.
    expect(res.status).toBe(400);
  });

  it('refuses a colour that is not a colour, and a window with no name', async () => {
    expect((await post({ name: `${NAME}_x`, accent: 'crimson' })).status).toBe(400);
    expect((await post({ name: '   ', accent: '#0055ff' })).status).toBeGreaterThanOrEqual(400);
  });

  it('edits one in place, and the paint follows', async () => {
    const made = await post({ name: `${NAME}_edit`, accent: '#0055ff', status: 'active' });
    expect((await getConfig()).body.theme.accent).toBe('#0055ff');

    const put = await withToken(request(app).put(`${url}/${made.body.campaign.id}`), admin.token)
      .send({ name: `${NAME}_edit`, accent: '#ff8800', status: 'active' });
    expect(put.status).toBe(200);
    expect((await getConfig()).body.theme.accent).toBe('#ff8800');
  });

  it('deleting the live window returns the standing accent', async () => {
    const made = await post({ name: `${NAME}_gone`, accent: '#0055ff', status: 'active' });
    expect((await getConfig()).body.theme.accent).toBe('#0055ff');
    const del = await withToken(request(app).delete(`${url}/${made.body.campaign.id}`), admin.token);
    expect(del.status).toBe(200);
    expect((await getConfig()).body.theme.accent).toBe('#22c55e');
  });

  it('a window whose colour reads badly is still created, and says so', async () => {
    const res = await post({ name: `${NAME}_dim`, accent: '#777777', status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body.campaign.contrast.warnings.length).toBeGreaterThan(0);
  });

  it('needs admin auth', async () => {
    expect((await request(app).get(url)).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).post(url).send({ name: 'x', accent: '#0055ff' })).status)
      .toBeGreaterThanOrEqual(401);
  });
});
