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
    // business-case-runner.component.ts now has its own spec (direct
    // instantiation, same pattern as leg-allocator/suspense-entries — no
    // TestBed needed for its pure calculation methods and RxJS/API wiring).
    // Its .html template still isn't covered — see the 9 vanilla web
    // components note below; DOM-level rendering tests remain a separate,
    // larger follow-up for both.
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
  // Enforced floor for the Payment Component Simulator (this project's own tracked
  // coverage surface — see collectCoverageFrom above; everything outside it is either
  // template markup, pure DI/bootstrap wiring, or the vanilla web components, none of
  // which this config collects coverage from at all). `npm test` fails below this.
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
