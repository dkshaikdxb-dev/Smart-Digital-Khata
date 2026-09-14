require('@testing-library/jest-dom');

// jsdom ships no fetch; every test that needs one installs its own stub, and a
// test that forgets should fail loudly rather than hang.
if (!global.fetch) {
  global.fetch = () => Promise.reject(new Error('fetch was not stubbed by this test'));
}
