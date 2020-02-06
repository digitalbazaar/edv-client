/*!
* Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
*/
'use strict';

import jsigs from 'jsonld-signatures';
import uuid from 'uuid-random';
import {CapabilityDelegation} from 'ocapld';
import {EdvClient, EdvDocument} from '..';
import mock from './mock.js';
import {isRecipient, createRecipient, JWE_ALG} from './test-utils.js';

const {SECURITY_CONTEXT_V2_URL, sign, suites} = jsigs;
const {Ed25519Signature2018} = suites;

describe('EDV Recipients', () => {
  let invocationSigner, keyResolver = null;

  before(async () => {
    await mock.init();
    invocationSigner = mock.invocationSigner;
    keyResolver = mock.keyResolver;
  });

  after(async () => {
    await mock.server.shutdown();
  });

  // this test should be identical to the insert test
  // except that recipients is passed in
  it('should insert a document with a single recipient', async () => {
    const {keyAgreementKey} = mock.keys;
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const recipients = [{header: {kid: keyAgreementKey.id, alg: JWE_ALG}}];
    const inserted = await client.insert(
      {keyResolver, invocationSigner, doc, recipients});
    should.exist(inserted);
    inserted.should.be.an('object');
    inserted.id.should.equal(testId);
    inserted.sequence.should.equal(0);
    inserted.indexed.should.be.an('array');
    inserted.indexed.length.should.equal(1);
    inserted.indexed[0].should.be.an('object');
    inserted.indexed[0].sequence.should.equal(0);
    inserted.indexed[0].hmac.should.be.an('object');
    inserted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    inserted.indexed[0].attributes.should.be.an('array');
    inserted.jwe.should.be.an('object');
    inserted.jwe.protected.should.be.a('string');
    inserted.jwe.recipients.should.be.an('array');
    inserted.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: inserted.jwe.recipients[0]});
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
  });

  it('should insert a document with 5 recipients', async () => {
    const {keyAgreementKey} = mock.keys;
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    // create the did keys then the recipients
    const recipients = (await Promise.all([1, 2, 3, 4]
      .map(() => mock.createKeyAgreementKey())))
      .map(createRecipient);
    // note: when passing recipients it is important to remember
    // to pass in the document creator. EdvClient will use the
    // EdvOwner by default as a recipient if there are no recipients
    // being passed in, but will not if you explicitly pass in recipients.
    recipients.unshift({header: {kid: keyAgreementKey.id, alg: JWE_ALG}});
    const inserted = await client.insert(
      {keyResolver, invocationSigner, doc, recipients});
    should.exist(inserted);
    inserted.should.be.an('object');
    inserted.id.should.equal(testId);
    inserted.sequence.should.equal(0);
    inserted.indexed.should.be.an('array');
    inserted.indexed.length.should.equal(1);
    inserted.indexed[0].should.be.an('object');
    inserted.indexed[0].sequence.should.equal(0);
    inserted.indexed[0].hmac.should.be.an('object');
    inserted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    inserted.indexed[0].attributes.should.be.an('array');
    inserted.jwe.should.be.an('object');
    inserted.jwe.protected.should.be.a('string');
    inserted.jwe.recipients.should.be.an('array');
    // we should have 5 recipients including the EDV owner.
    inserted.jwe.recipients.length.should.equal(5);
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
    inserted.jwe.recipients.forEach((recipient, index) => {
      const expected = recipients[index].header;
      // the curve should be a 25519 curve
      expected.crv = 'X25519';
      // key type should be an Octet Key Pair
      expected.kty = 'OKP';
      isRecipient({recipient, expected});
    });
  });

  it('should enable a capability for a recipient', async function() {
    const {keyAgreementKey} = mock.keys;
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const didKeys = await Promise.all(
      [1].map(() => mock.createKeyAgreementKey()));
    const recipients = didKeys.map(createRecipient);
    // note: when passing recipients it is important to remember
    // to pass in the document creator. EdvClient will use the
    // EdvOwner by default as a recipient if there are no recipients
    // being passed in, but will not if you explicitly pass in recipients.
    recipients.unshift({header: {kid: keyAgreementKey.id, alg: JWE_ALG}});
    const inserted = await client.insert(
      {keyResolver, invocationSigner, doc, recipients});
    should.exist(inserted);
    inserted.should.be.an('object');
    inserted.id.should.equal(testId);
    inserted.sequence.should.equal(0);
    inserted.indexed.should.be.an('array');
    inserted.indexed.length.should.equal(1);
    inserted.indexed[0].should.be.an('object');
    inserted.indexed[0].sequence.should.equal(0);
    inserted.indexed[0].hmac.should.be.an('object');
    inserted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    inserted.indexed[0].attributes.should.be.an('array');
    inserted.jwe.should.be.an('object');
    inserted.jwe.protected.should.be.a('string');
    inserted.jwe.recipients.should.be.an('array');
    // we should have 5 recipients including the EDV owner.
    inserted.jwe.recipients.length.should.equal(2);
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
    inserted.jwe.recipients.forEach((recipient, index) => {
      const expected = recipients[index].header;
      // the curve should a 25519 curve
      expected.crv = 'X25519';
      // key type should be Octet Key Pair
      expected.kty = 'OKP';
      // recipient should be JOSE
      // @see https://tools.ietf.org/html/rfc8037
      isRecipient({recipient, expected});
    });
    const unsignedCapability = {
      '@context': SECURITY_CONTEXT_V2_URL,
      id: `urn:uuid:${uuid()}`,
      invocationTarget: `${client.id}/documents/${inserted.id}`,
      // the invoker is not the creator of the document
      invoker: didKeys[0].id,
      // the invoker will only be allowed to read the document
      allowedAction: 'read',
      // this is the zCap of the document
      parentCapability: `${client.id}/zcaps/documents/${inserted.id}`
    };
    // this is a little confusing but this is the private key
    // of the EDV owner.
    const signer = mock.invocationSigner;
    const {documentLoader} = mock;
    const suite = new Ed25519Signature2018(
      {signer, verificationMethod: signer.id});
    const purpose = new CapabilityDelegation(
      {capabilityChain: [unsignedCapability.parentCapability]});
    const capabilityToEnable = await sign(
      unsignedCapability, {documentLoader, suite, purpose});
    await client.enableCapability({capabilityToEnable});
  });

  it('should read a document using a delegated capability', async function() {
    const {keyAgreementKey} = mock.keys;
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const {capabilityAgent, didKey} = await mock.createCapabilityAgent();
    const recipients = [
      {header: {kid: keyAgreementKey.id, alg: JWE_ALG}},
      createRecipient(didKey)
    ];
    const inserted = await client.insert(
      {keyResolver, invocationSigner, doc, recipients});
    should.exist(inserted);
    inserted.should.be.an('object');
    inserted.id.should.equal(testId);
    inserted.sequence.should.equal(0);
    inserted.indexed.should.be.an('array');
    inserted.indexed.length.should.equal(1);
    inserted.indexed[0].should.be.an('object');
    inserted.indexed[0].sequence.should.equal(0);
    inserted.indexed[0].hmac.should.be.an('object');
    inserted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    inserted.indexed[0].attributes.should.be.an('array');
    inserted.jwe.should.be.an('object');
    inserted.jwe.protected.should.be.a('string');
    inserted.jwe.recipients.should.be.an('array');
    // we should have 5 recipients including the EDV owner.
    inserted.jwe.recipients.length.should.equal(2);
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
    inserted.jwe.recipients.forEach((recipient, index) => {
      const expected = recipients[index].header;
      // the curve should be a 25519 curve
      expected.crv = 'X25519';
      // key type should be an Octet Key Pair
      expected.kty = 'OKP';
      isRecipient({recipient, expected});
    });
    const unsignedCapability = {
      '@context': SECURITY_CONTEXT_V2_URL,
      id: `urn:uuid:${uuid()}`,
      invocationTarget: `${client.id}/documents/${inserted.id}`,
      // the invoker is not the creator of the document
      invoker: didKey.id,
      // the invoker will only be allowed to read the document
      allowedAction: 'read',
      // this is the zCap of the document
      parentCapability: `${client.id}/zcaps/documents/${inserted.id}`
    };
    // this is a little confusing but this is the private key
    // of the user that created the document.
    const signer = mock.invocationSigner;
    const {documentLoader} = mock;
    const suite = new Ed25519Signature2018(
      {signer, verificationMethod: signer.id});
    const purpose = new CapabilityDelegation(
      {capabilityChain: [unsignedCapability.parentCapability]});
    const capabilityToEnable = await sign(
      unsignedCapability, {documentLoader, suite, purpose});
    await client.enableCapability({capabilityToEnable});
    const delegatedDoc = new EdvDocument({
      client,
      // this is the delegated invoker's key
      invocationSigner: capabilityAgent,
      keyResolver: mock.keyResolver,
      // this is the document creator's keyAgreementKey
      keyAgreementKey,
      capability: capabilityToEnable
    });
    const delegatedEDV = await delegatedDoc.read();
    should.exist(delegatedEDV);
    delegatedEDV.should.be.an('object');
    should.exist(delegatedEDV.content);
    delegatedEDV.content.should.deep.equal(inserted.content);
  });

});
