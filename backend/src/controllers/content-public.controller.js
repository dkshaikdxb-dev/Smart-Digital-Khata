const blog = require('../services/content-blog.service');
const newsletter = require('../services/content-newsletter.service');

// Public, unauthenticated content surface (Batch T): the marketing-site blog and
// the newsletter double-opt-in endpoints. Covered by the global /api rate
// limiter. NONE of these reveal internal state — the newsletter endpoints never
// disclose whether an address exists (no enumeration) and return no address.

// GET /api/public/blog?limit=&lang= — published posts, newest first, minimal
// fields (no body).
exports.listBlog = async (req, res) => {
  const posts = await blog.listPosts({ limit: req.query.limit, lang: req.query.lang });
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ posts });
};

// GET /api/public/blog/:slug — one published post (with body), or 404.
exports.getBlog = async (req, res) => {
  const post = await blog.getPost(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.json({ post });
};

// POST /api/public/newsletter/subscribe { email, list } — record a pending
// subscriber and (if SMTP is configured) e-mail a confirmation link. Always
// returns the SAME generic 202 whether or not the address already existed, and
// never echoes the address.
exports.subscribeNewsletter = async (req, res) => {
  const { email, list } = req.body || {};
  await newsletter.subscribe(email, list || 'community');
  res.status(202).json({ ok: true, message: 'Please check your inbox to confirm your subscription.' });
};

// A small friendly self-contained HTML page for the confirm/unsubscribe landings
// (no user input is echoed, so nothing to escape). Served same-origin from the
// API, independent of the marketing site's origin.
function resultPage(res, { heading, body }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Smart Digital Khata</title>' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F0E1;' +
      "color:#2A1E12;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}" +
      '.card{max-width:460px;text-align:center;background:#FFFDF7;border:1px solid #E0D3B8;' +
      'border-radius:16px;padding:36px 28px;box-shadow:0 18px 40px -20px rgba(42,30,18,.28);margin:16px}' +
      'h1{font-size:1.35rem;margin:0 0 10px}p{color:#6B5A45;line-height:1.6;margin:0 0 18px}' +
      'a{display:inline-block;background:#1C7A45;color:#fff;text-decoration:none;font-weight:600;' +
      'border-radius:999px;padding:10px 22px}</style></head><body><div class="card">' +
      `<h1>${heading}</h1><p>${body}</p><a href="/">Back to Smart Digital Khata</a>` +
      '</div></body></html>'
  );
}

// GET /api/public/newsletter/confirm?token= — activate + show a friendly page.
// Safe (and generic) on an unknown/expired token.
exports.confirmNewsletter = async (req, res) => {
  await newsletter.confirm(req.query.token);
  resultPage(res, {
    heading: 'You are subscribed 🎉',
    body: 'Thank you for confirming. You will now receive the Smart Digital Khata newsletter.',
  });
};

// GET /api/public/newsletter/unsubscribe?token= — unsubscribe + friendly page.
exports.unsubscribeNewsletter = async (req, res) => {
  await newsletter.unsubscribe(req.query.token);
  resultPage(res, {
    heading: 'You have been unsubscribed',
    body: 'You will no longer receive this newsletter. You can re-subscribe any time from our site.',
  });
};
