const cryptoLd = require('crypto-ld');
const MockMasterKey = require('./mockMasterKey');

const {Ed25519KeyPair} = cryptoLd;

const _secret = 'bcrypt of password';
const secret = new TextEncoder().encode(_secret);

async function genMockKey() {
  const keyPair = await Ed25519KeyPair.generate({secret});
  const signer = keyPair.signer();
  signer.id = `urn:bedrock-web-kms:key:${keyPair.fingerprint()}`;
  const masterKey = new MockMasterKey({signer});
  return masterKey;
}

exports.getMockKey = genMockKey;
