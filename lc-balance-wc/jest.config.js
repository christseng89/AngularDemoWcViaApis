/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  // This root suite owns only the Angular application. The backend and balance microservice are
  // independent packages with their own Jest/TypeScript configurations and must never be cross-loaded.
  roots: ['<rootDir>/src'],
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
    '!src/app/shared-app.providers.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  // Raised from the original 90% floor (lc-payment-wc/jest.config.js's own convention) to 95%.
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
