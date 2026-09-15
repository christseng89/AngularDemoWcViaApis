export default {
  displayName: "ssi-web-components",
  preset: "../../jest.preset.js",
  testEnvironment: "jsdom",
  testMatch: ["**/*.spec.ts"],
  passWithNoTests: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/main.ts"],
  coverageDirectory: "../../coverage/apps/ssi-web-components",
};
