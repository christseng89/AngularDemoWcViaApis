const nxPreset = require('@nx/jest/preset').default;
module.exports = {
  ...nxPreset,
  transform: { '^.+\\.(t|j)s$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', decorators: true }, target: 'es2022' }, module: { type: 'commonjs' } }] },
  moduleFileExtensions: ['ts', 'js', 'html']
};
