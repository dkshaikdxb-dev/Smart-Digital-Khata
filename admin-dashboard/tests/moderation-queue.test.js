/**
 * The Moderation page was a dead end, and nothing anywhere said work was waiting.
 *
 * Two separate defects, pinned here:
 *
 *   1. /admin/moderation rendered a read-only audit log. The approve/reject
 *      actions existed only on /admin/ads (nav label "Campaigns"), so an admin
 *      who went to the page called Moderation to moderate something found
 *      history and no buttons.
 *   2. No surface anywhere carried a count of what was waiting. The only way to
 *      learn that a shop photo or a promo needed a decision was to open
 *      Campaigns and scroll.
 *
 * The queue itself is ONE component rendered by both pages, so these tests also
 * stand as the regression net on Campaigns: the same assertions run against
 * /admin/ads, and a drift between the two would have to break one of them.
 *
 * Nothing here re-tests the money. Approving a promo serves it and rejecting it
 * refunds credits exactly once — that is the backend's guarded path and its own
 * suite; these tests only prove the desk reaches it with the right body.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { translate, getAllKeys } from '../src/lib/i18n';
import { clearPermsCache } from '../src/lib/adminPerms';
import { clearPendingReviewCache } from '../src/lib/pendingReview';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
    query: {}, pathname: '/admin/moderation', route: '/admin/moderation',
    asPath: '/admin/moderation', isReady: true,
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(), apiFetchMeta: jest.fn(), apiPost: jest.fn(), clearApiCache: jest.fn(),
}));

const api = require('../src/lib/api');
const t = (k, v) => translate('en', k, v);

const ALL_PERMS = ['audit:view', 'ads:view', 'ads:manage', 'shops:view', 'users:view', 'customers:view'];

const PHOTO = {
  id: 'img-1',
  shop_id: 'shop-photo',
  shop_name: 'Photo Kirana',
  shop_city: 'Pune',
  position: 0,
  url: '/api/shop-images/img-1?v=1',
  uploaded_at: '2026-09-01T10:00:00.000Z',
  auto_publish: false,
  ai_verdict: null,
  ai_flagged: false,
};

const PROMO = {
  id: 'promo-1',
  shop_name: 'Promo Kirana',
  shop_city: 'Nashik',
  offer_text: '₹20 off on atta',
  glyph: '🏷️',
  credits_spent_paise: 5000,
  is_free: false,
  targets: [],
  starts_at: '2026-09-01T00:00:00.000Z',
  ends_at: '2026-09-30T00:00:00.000Z',
  ai_verdict: null,
  ai_flagged: false,
};

const LOG_ROW = {
  id: 'log-1',
  created_at: '2026-08-30T09:00:00.000Z',
  action: 'user.block',
  target_type: 'user',
  target_label: 'Ramu',
  reason: 'Spamming customers',
  admin_name: 'Asha',
};

// Every admin request this batch touches, answered from one table so a test can
// override just the part it cares about.
function stubApi({ perms = ALL_PERMS, count = { promos: 1, shop_images: 1, spot_checks: 0, total: 2 }, photos = [PHOTO], promos = [PROMO], log = [LOG_ROW] } = {}) {
  api.apiFetch.mockImplementation((path) => {
    if (path.startsWith('/api/admin/me')) return Promise.resolve({ admin_role: 'super', permissions: perms });
    if (path.startsWith('/api/admin/moderation/pending-count')) return Promise.resolve(count);
    if (path.startsWith('/api/admin/shop-images/pending')) return Promise.resolve({ items: photos, auto_publish_shops: [] });
    if (path.startsWith('/api/admin/promos/pending')) return Promise.resolve({ items: promos });
    if (path.startsWith('/api/admin/moderation/spot-checks')) return Promise.resolve({ items: [] });
    if (path.startsWith('/api/admin/moderation/ai-stats')) return Promise.reject(new Error('off'));
    if (path.startsWith('/api/admin/moderation-log')) return Promise.resolve({ items: log, next_cursor: null });
    if (path.startsWith('/api/admin/stats')) return Promise.resolve({ mrr: 0, plan_counts: { pro: 0, family: 0 }, shops: 0, users: 0, transactions: 0, outstanding_total: 0 });
    return Promise.resolve({ items: [] });
  });
  api.apiFetchMeta.mockImplementation((path, opts) =>
    api.apiFetch(path, opts).then((data) => ({ data, fromCache: false, cachedAt: null })));
}

const calls = () => api.apiFetch.mock.calls;
const called = (re) => calls().some(([p]) => re.test(p));

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'admin');
  clearPermsCache();
  clearPendingReviewCache();
  stubApi();
});

afterEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ the page */

describe('the Moderation page can actually moderate', () => {
  test('a shop photo waiting for review is listed with an Approve action', async () => {
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    const row = await screen.findByRole('row', { name: /Photo Kirana/ });
    expect(within(row).getByRole('button', { name: t('modq.approve') })).toBeInTheDocument();
  });

  test('approving a photo posts to the endpoint that publishes it', async () => {
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    const row = await screen.findByRole('row', { name: /Photo Kirana/ });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.approve') }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith('/api/admin/shop-images/img-1/approve', expect.objectContaining({ method: 'POST' }));
    });
  });

  test('rejecting a promo carries the review note the owner is shown', async () => {
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    const row = await screen.findByRole('row', { name: /Promo Kirana/ });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.reject') }));
    fireEvent.change(within(row).getByLabelText(t('modq.reasonLabel')), { target: { value: 'Misleading price claim' } });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.confirmReject') }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        '/api/admin/promos/promo-1/reject',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ review_note: 'Misleading price claim' }) })
      );
    });
  });

  test('approving a promo also carries a note when one was typed', async () => {
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    const row = await screen.findByRole('row', { name: /Promo Kirana/ });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.noteApprove') }));
    fireEvent.change(within(row).getByLabelText(t('modq.noteLabel')), { target: { value: 'Fine, watch the wording' } });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.confirmApprove') }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        '/api/admin/promos/promo-1/approve',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ review_note: 'Fine, watch the wording' }) })
      );
    });
  });

  // Regression control (passes before and after): the log is the record of what
  // was decided and the queue is what is still undecided. Adding one must not
  // cost the other.
  test('the audit log is still on the page', async () => {
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    expect(await screen.findByText('Spamming customers')).toBeInTheDocument();
    expect(screen.getByText(t('mod.logSubtitle'))).toBeInTheDocument();
  });

  test('with no ads:manage the queue is neither shown nor fetched', async () => {
    stubApi({ perms: ['audit:view'] });
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    expect(await screen.findByText('Spamming customers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('modq.approve') })).not.toBeInTheDocument();
    expect(called(/shop-images\/pending/)).toBe(false);
    expect(called(/promos\/pending/)).toBe(false);
    expect(called(/pending-count/)).toBe(false);
  });

  // The other half of the permission split: the marketing role holds ads:manage
  // but NOT audit:view, so it may action the queue and may not read the log.
  test('with no audit:view the queue is shown and the log is not demanded', async () => {
    stubApi({ perms: ['ads:view', 'ads:manage'] });
    const Page = require('../src/pages/admin/moderation').default;
    render(<Page />);
    expect(await screen.findByRole('row', { name: /Photo Kirana/ })).toBeInTheDocument();
    expect(called(/moderation-log/)).toBe(false);
  });
});

/* ----------------------------------------------------- one queue, two pages */

describe('Campaigns renders the same queue', () => {
  // Regression control: the queue behaviour used to live in ads.js. Extracting
  // it must leave Campaigns working exactly as it did.
  test('the promo queue still approves from /admin/ads', async () => {
    const Page = require('../src/pages/admin/ads').default;
    render(<Page />);
    const row = await screen.findByRole('row', { name: /Promo Kirana/ });
    fireEvent.click(within(row).getByRole('button', { name: t('modq.approve') }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith('/api/admin/promos/promo-1/approve', expect.objectContaining({ method: 'POST' }));
    });
  });

  test('Campaigns links to the Moderation page for the full queue', async () => {
    const Page = require('../src/pages/admin/ads').default;
    render(<Page />);
    const links = await screen.findAllByRole('link', { name: t('modq.openOnModeration') });
    expect(links[0]).toHaveAttribute('href', '/admin/moderation');
  });
});

/* ------------------------------------------------------- the pending badge */

describe('an admin is told that work is waiting', () => {
  test('the nav Moderation link carries the aggregate count', async () => {
    const Nav = require('../src/components/Nav').default;
    render(<Nav />);
    expect(await screen.findByLabelText(t('mod.pendingAria', { n: 2 }))).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /2/ });
    expect(link).toHaveAttribute('href', '/admin/moderation');
  });

  // Calm, not broken: zero waiting shows no pill at all, and the count is asked
  // for exactly once per session rather than three queue requests per page.
  test('zero waiting shows no badge, and one request answers the whole count', async () => {
    stubApi({ count: { promos: 0, shop_images: 0, spot_checks: 0, total: 0 } });
    const Nav = require('../src/components/Nav').default;
    render(<Nav />);
    await waitFor(() => expect(called(/pending-count/)).toBe(true));
    expect(screen.queryByLabelText(/waiting for review/i)).not.toBeInTheDocument();
    expect(calls().filter(([p]) => /pending-count/.test(p)).length).toBe(1);
    expect(called(/shop-images\/pending/)).toBe(false);
  });

  test('the nav shows Moderation to an ads:manage admin who cannot read the log', async () => {
    stubApi({ perms: ['ads:view', 'ads:manage'] });
    const Nav = require('../src/components/Nav').default;
    render(<Nav />);
    await waitFor(() => expect(screen.getByRole('link', { name: /Moderation/ })).toBeInTheDocument());
  });

  test('the platform hub shows the waiting count and a way in', async () => {
    const Hub = require('../src/pages/admin').default;
    render(<Hub />);
    expect(await screen.findByText(t('mod.pendingSome', { n: 2 }))).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: t('mod.pendingOpen') })[0]).toHaveAttribute('href', '/admin/moderation');
  });

  test('the platform hub reads as settled when nothing is waiting', async () => {
    stubApi({ count: { promos: 0, shop_images: 0, spot_checks: 0, total: 0 } });
    const Hub = require('../src/pages/admin').default;
    render(<Hub />);
    expect(await screen.findByText(t('mod.pendingNone'))).toBeInTheDocument();
    expect(screen.queryByText(t('mod.pendingSome', { n: 0 }))).not.toBeInTheDocument();
  });

  test('a 403 on the count leaves no broken badge behind', async () => {
    api.apiFetch.mockImplementation((path) => {
      if (path.startsWith('/api/admin/me')) return Promise.resolve({ admin_role: 'super', permissions: ALL_PERMS });
      if (path.startsWith('/api/admin/moderation/pending-count')) {
        const e = new Error('forbidden'); e.status = 403; return Promise.reject(e);
      }
      return Promise.resolve({ items: [] });
    });
    const Nav = require('../src/components/Nav').default;
    render(<Nav />);
    await waitFor(() => expect(called(/pending-count/)).toBe(true));
    expect(screen.queryByLabelText(/waiting for review/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Moderation/ })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------- i18n */

describe('every key the moderation surfaces name resolves', () => {
  // A key that renders as its own raw name is worse than the English it
  // replaced. Guards the new modq.*/mod.pending* keys the same way the i18n
  // gate guards the public pages.
  test('no t() key in the queue, the page or the nav is missing from DICT.en', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const known = new Set(getAllKeys());
    const files = [
      path.join(__dirname, '..', 'src', 'components', 'ModerationQueue.js'),
      path.join(__dirname, '..', 'src', 'pages', 'admin', 'moderation.js'),
      path.join(__dirname, '..', 'src', 'components', 'Nav.js'),
      path.join(__dirname, '..', 'src', 'pages', 'admin.js'),
    ];
    const missing = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) {
        if (!known.has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
