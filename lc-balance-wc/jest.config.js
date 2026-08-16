/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/backend/', '<rootDir>/microservices/'],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/main.ts',
    // Pure Angular bootstrap wiring (DI providers, route config, <router-outlet>
    // shell) — no logic, same category lc-payment-wc/jest.config.js excludes.
    '!src/app/app.component.ts',
    '!src/app/app.config.ts',
    '!src/app/app.routes.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  // Same 90% floor convention as lc-payment-wc/jest.config.js.
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
