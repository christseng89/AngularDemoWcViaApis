// @ts-check
// Quality-report-balance.md BAL-105: baseline flat-config lint gate — none existed before.
// `no-explicit-any` stays a warning (this codebase's own money.ts/db layer sometimes needs it at real
// SQLite/JSON boundaries), consistent with the same choice made in the Angular app's own eslint.config.js.
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
);
