export default {
  displayName: "mock-reference-services",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  passWithNoTests: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/**/*.spec.ts"],
  coverageDirectory: "../../coverage/apps/mock-reference-services",
};
