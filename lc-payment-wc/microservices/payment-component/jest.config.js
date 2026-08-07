/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    // Thin bootstrap (app.listen()) — exercised by nothing meaningful to unit-test; app.ts itself IS covered via supertest.
    '!src/server.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
