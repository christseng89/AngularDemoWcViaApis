module.exports = {
  displayName: "ssi-checker-approval-qa-evidence",
  preset: "./jest.preset.js",
  rootDir: "../..",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/qa/tests/oracles/ssi-checker-approval/ssi-checker-11-approval.qa.spec.ts",
  ],
};
