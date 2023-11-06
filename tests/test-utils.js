/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import mock from './mock.js';
export const JWE_ALG = 'ECDH-ES+A256KW';

// takes a did key and makes a jwe header
export const createRecipient = keyAgreementKey => {
  const {id: kid} = keyAgreementKey;
  return {header: {kid, alg: JWE_ALG}};
};

export function isNewEDV({inserted, testId, hmac, sequence = 0}) {
  should.exist(inserted);
  inserted.should.be.an('object');
  inserted.id.should.equal(testId);
  inserted.sequence.should.equal(sequence);
  inserted.indexed.should.be.an('array');
  inserted.indexed.length.should.equal(1);
  inserted.indexed[0].should.be.an('object');
  inserted.indexed[0].sequence.should.equal(1);
  inserted.indexed[0].hmac.should.be.an('object');
  inserted.indexed[0].hmac.should.deep.equal(hmac);
  inserted.indexed[0].attributes.should.be.an('array');
  inserted.jwe.should.be.an('object');
  inserted.jwe.protected.should.be.a('string');
  inserted.jwe.recipients.should.be.an('array');
  inserted.jwe.iv.should.be.a('string');
  inserted.jwe.ciphertext.should.be.a('string');
  inserted.jwe.tag.should.be.a('string');
}

// recipient should be JOSE
// @see https://tools.ietf.org/html/rfc8037
export function isRecipient({recipient, cipherVersion = 'recommended'}) {
  let expected;
  if(cipherVersion === 'fips') {
    expected = {
      kid: mock.keys.fips.keyAgreementKey.id,
      alg: JWE_ALG,
      crv: 'P-256',
      kty: 'EC'
    };
  } else {
    expected = {
      kid: mock.keys.keyAgreementKey.id,
      alg: JWE_ALG,
      crv: 'X25519',
      kty: 'OKP'
    };
  }
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
