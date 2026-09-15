export default {
  displayName: "ssi-service",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/main.ts"],
  coverageDirectory: "../../coverage/apps/ssi-service",
  coverageThreshold: {
    "apps/ssi-service/src/app/fin-field-resolution.service.ts": {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    "apps/ssi-service/src/app/fin-field-resolution.policy.ts": {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
