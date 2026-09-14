// Test runner for the owner console + consumer PWA.
//
// next/jest wires up the same SWC transform the app is built with, so tests
// compile JSX and modern syntax exactly as Next does — no Babel config to keep
// in step. jsdom gives the component tests a DOM; the pure helpers (money, the
// error copy, the service-worker cache policy) need nothing from it.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
});
