// Quality-report-balance.md BAL-105: baseline flat-config lint gate — none existed before.
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        global: 'writable',
        fetch: 'readonly',
      },
    },
    ignores: ['coverage/**', 'node_modules/**'],
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', jest: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
  },
];
