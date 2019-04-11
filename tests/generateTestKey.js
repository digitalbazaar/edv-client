const cryptoLd = require('crypto-ld');
const MockMasterKey = require('./mockMasterKey');

const {Ed25519KeyPair} = cryptoLd;
const _secret = new TextEncoder().encode('bcrypt of password');

/**
 * This is generates a mock MasterKey.
 *
 * @param {Object} options - The options for the master key.
 * @param {Uint8Array} [secret = _secret]
 * - A Uint8Array with a passphrase for the key.
 * @param {Object} kmsService - A mock kms service for the tests.
 * @return {MockMasterKey} The mock key produced.
 */
async function genMockKey({secret = _secret, kmsService}) {
  const keyPair = await Ed25519KeyPair.generate({secret});
  const signer = keyPair.signer();
  signer.id = `urn:kms:key:${keyPair.fingerprint()}`;
  const masterKey = new MockMasterKey({signer, kmsService});
  return masterKey;
}

exports.getMockKey = genMockKey;
