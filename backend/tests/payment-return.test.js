// Post-payment RETURN redirect. Razorpay's callback_url is
// `${APP_URL}/api/payments/orders/:id/return`; before the fix that route did not
// exist and the customer's browser landed on a 404 after paying (the payment
// still settled via webhook, but the return page was broken). This verifies the
// public route now 302-redirects to the web "thank you" page `/pay/:id`.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');

describe('Payment return redirect', () => {
  test('GET /api/payments/orders/:id/return → 302 to /pay/:id (public, no auth)', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app).get(`/api/payments/orders/${id}/return`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/pay/${id}`);
  });

  test('id is always appended under the fixed /pay/ prefix (no open redirect)', async () => {
    // The Location is always a relative path under /pay/ — never an absolute or
    // protocol-relative URL — so it can never redirect off-site.
    const res = await request(app).get('/api/payments/orders/abc123/return');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/pay/abc123');
    expect(res.headers.location.startsWith('/pay/')).toBe(true);
  });
});
