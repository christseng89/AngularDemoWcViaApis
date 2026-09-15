export default {
  displayName: "ssi-portal",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  transform: {
    "^.+\\.(t|j)s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2022",
        },
        module: { type: "commonjs" },
      },
    ],
    "^.+\\.mjs$": [
      "@swc/jest",
      { jsc: { target: "es2022" }, module: { type: "commonjs" } },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!@angular/)"],
  collectCoverageFrom: [
    "<rootDir>/src/**/*.ts",
    "!<rootDir>/src/**/*.spec.ts",
    "!<rootDir>/src/**/*.test.ts",
    "!<rootDir>/src/main.ts",
  ],
  coverageDirectory: "../../coverage/apps/ssi-portal",
};
