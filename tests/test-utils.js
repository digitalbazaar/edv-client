import {expect} from 'chai';

const _x25519Expected = {
  kid: 'urn:123',
  alg: 'ECDH-ES+A256KW',
  crv: 'X25519',
  kty: 'OKP'
};

export function isRecipient({recipient, expected = _x25519Expected}) {
  const {kid, alg, crv, kty} = expected;
  expect(recipient, 'Expected recipient to be an object').to.be.an('object');

  expect(recipient.header, 'Expected recipient.header').to.exist;
  expect(recipient.header, 'Expected recipient.header to be an object').
    to.be.an('object');
  const {header} = recipient;

  // there should be a kid with the KaK's id.
  expect(header.kid, 'Expected header.kid to exist').to.exist;
  expect(header.kid, 'Expected header.kid to be a string').
    to.be.a('string');
  expect(header.kid, `Expected header.kid to match ${kid}`).
    to.equal(kid);

  // there should be an algorithm property set to ECDH-ES+A256KW
  expect(header.alg, 'Expected header.alg to exist').to.exist;
  expect(header.alg, 'Expected header.alg to be a string').
    to.be.a('string');
  expect(header.alg, `Expected alg to match ${alg}`).to.equal(alg);

  expect(header.apu, 'Expected Agreement PartyUInfo to exist').to.exist;
  expect(header.apu, 'Expected Agreement PartyUInfo to be a string').
    to.be.a('string');

  expect(header.apv, 'Expected Agreement PartyVInfo to exist').to.exist;
  expect(header.apv, 'Expected Agreement PartyVInfo to be a string').
    to.be.a('string');

  expect(header.epk, 'Expected ephemeral public key to exist').to.exist;
  expect(header.epk, 'Expected ephemeral public key to be an object').
    to.be.an('object');

  expect(header.epk.crv, 'Expected header.epk.crv to exist').to.exist;
  expect(header.epk.crv, 'Expected header.epk.crv to be a string').
    to.be.a('string');
  expect(header.epk.crv, `Expected header.epk.crv to match ${crv}`).
    to.equal(crv);

  expect(header.epk.kty, 'Expected header.epk.kty to exist').to.exist;
  expect(header.epk.kty, 'Expected header.epk.kty to be a string').
    to.be.a('string');
  expect(header.epk.kty, `Expected header.epk.kty to match ${kty}`).
    to.equal(kty);

  expect(header.epk.x, 'Expected header.epk.x to exist').to.exist;
  expect(header.epk.x, 'Expected header.epk.x to be a string').
    to.be.a('string');
}
