// Smoke test that doesn't require DB — just ensures app wires up.
describe('smoke', () => {
  it('requires app module without throwing', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/db';
    // eslint-disable-next-line global-require
    const app = require('../src/app');
    expect(typeof app).toBe('function'); // express app is a function
  });
});
