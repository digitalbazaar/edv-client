const cryptoLd = require('crypto-ld');
const MockMasterKey = require('./mockMasterKey');

const {Ed25519KeyPair} = cryptoLd;

const _secret = new TextEncoder().encode('bcrypt of password');

async function genMockKey({secret = _secret, kmsService}) {
  const keyPair = await Ed25519KeyPair.generate({secret});
  const signer = keyPair.signer();
  signer.id = `urn:bedrock-web-kms:key:${keyPair.fingerprint()}`;
  const masterKey = new MockMasterKey({signer, kmsService});
  return masterKey;
}

exports.getMockKey = genMockKey;
