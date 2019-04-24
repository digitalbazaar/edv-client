module.exports = {
  root: true,
  extends: ['eslint-config-digitalbazaar'],
  env: {
    node: true
  },
  globals: {
    CryptoKey: true,
    TextDecoder: true,
    TextEncoder: true,
    Uint8Array: true
  }
}
