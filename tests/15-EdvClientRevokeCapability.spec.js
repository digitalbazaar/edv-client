/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {CapabilityDelegation} from '@digitalbazaar/zcapld';
import {createRecipient, JWE_ALG} from './test-utils.js';
import {EdvClient} from '..';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import jsigs from 'jsonld-signatures';
import mock from './mock.js';
import uuid from 'uuid-random';
import {constants} from 'ed25519-signature-2020-context';
import * as sec from 'security-context';

const {sign} = jsigs;

describe('EdvClient revokeCapability API', () => {
  let invocationSigner;
  let keyResolver;
  let capabilityToRead;
  let edvClient;
  before(async () => {
    await mock.init();
    ({invocationSigner, keyResolver} = mock);
  });

  // create a delegated capability to read a document
  before(async () => {
    const {keyAgreementKey} = mock.keys;
    edvClient = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const {keyAgreementPair} = await mock.createCapabilityAgent();
    const keyAgreementPairs = [keyAgreementPair];
    const recipients = keyAgreementPairs.map(createRecipient);
    recipients.unshift({header: {kid: keyAgreementKey.id, alg: JWE_ALG}});

    const inserted = await edvClient.insert(
      {keyResolver, invocationSigner, doc, recipients});
    capabilityToRead = {
      '@context': [
        sec.constants.SECURITY_CONTEXT_V2_URL,
        constants.CONTEXT_URL
      ],
      id: `urn:uuid:${uuid()}`,
      invocationTarget: `${edvClient.id}/documents/${inserted.id}`,
      // the invoker is not the creator of the document
      invoker: keyAgreementPairs[0].id,
      // the invoker will only be allowed to read the document
      allowedAction: 'read',
      // this is the zCap of the document
      parentCapability: `${edvClient.id}/zcaps/documents/${inserted.id}`
    };
    // this is the private key of the EDV owner.
    const signer = mock.invocationSigner;
    const {documentLoader} = mock;
    const suite = new Ed25519Signature2020(
      {signer, verificationMethod: signer.id});
    const purpose = new CapabilityDelegation(
      {capabilityChain: [capabilityToRead.parentCapability]});
    // sign adds a proof to capabilityToRead
    await sign(capabilityToRead, {documentLoader, suite, purpose});
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('returns TypeError on missing capabilityToRevoke param', async () => {
    let err;
    let result;
    try {
      result = await edvClient.revokeCapability({});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(result);
    err.name.should.equal('TypeError');
    err.message.should.contain('capabilityToRevoke');
  });
  it('returns TypeError on missing invocationSigner param', async () => {
    let err;
    let result;
    try {
      result = await edvClient.revokeCapability({
        capabilityToRevoke: capabilityToRead
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(result);
    err.name.should.equal('TypeError');
    err.message.should.contain('invocationSigner');
  });
  it('should revoke a delegated capability', async () => {
    let err;
    let result;
    try {
      result = await edvClient.revokeCapability({
        capabilityToRevoke: capabilityToRead,
        invocationSigner: mock.invocationSigner,
      });
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    should.not.exist(result);
  });
});
