/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/backend/'],
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
    // Not yet covered by this first pass — see README's test-coverage note:
    // Formly-wired orchestration component and the 9 vanilla web components
    // need TestBed/DOM-level tests, a separate, larger follow-up.
    '!src/app/payment-component/business-case-runner.component.ts',
    '!src/app/payment-component/business-case-runner.component.html',
    '!src/app/web-components/**',
    '!src/app/features/lc-payment/lc-payment.component.ts',
    // Pure Angular bootstrap wiring (DI providers, route config, <router-outlet>
    // shell) — no logic, same category as the microservice's excluded server.ts.
    '!src/app/app.component.ts',
    '!src/app/app.config.ts',
    '!src/app/app.routes.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
