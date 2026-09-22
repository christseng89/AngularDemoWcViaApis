export default {
  displayName: "contracts",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  collectCoverageFrom: [
    "<rootDir>/src/**/*.ts",
    "!<rootDir>/src/**/*.spec.ts",
    "!<rootDir>/src/**/*.test.ts",
  ],
  coverageDirectory: "../../coverage/libs/contracts",
  coverageThreshold: {
    global: { branches: 92.01, functions: 92.01, lines: 92.01, statements: 92.01 },
  },
};
