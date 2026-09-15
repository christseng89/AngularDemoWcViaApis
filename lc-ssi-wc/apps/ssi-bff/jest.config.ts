export default {
  displayName: "ssi-bff",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  passWithNoTests: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/**/*.spec.ts"],
  coverageDirectory: "../../coverage/apps/ssi-bff",
};
