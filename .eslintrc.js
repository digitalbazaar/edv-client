module.exports = {
  root: true,
  extends: [
    'digitalbazaar',
    'digitalbazaar/jsdoc'
  ],
  env: {
    node: true
  },
  globals: {
    CryptoKey: true,
    TextDecoder: true,
    TextEncoder: true,
    Uint8Array: true
  },
  ignorePatterns: ['dist/']
};
