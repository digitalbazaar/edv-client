/*!
 * Copyright (c) 2018-2023 Digital Bazaar, Inc. All rights reserved.
 */
import {
  CapabilityDelegation,
  constants as zcapConstants
} from '@digitalbazaar/zcap';
import {createRecipient, JWE_ALG} from './test-utils.js';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {EdvClient} from '../lib/index.js';
import jsigs from 'jsonld-signatures';
import mock from './mock.js';
import {v4 as uuid} from 'uuid';

const {ZCAP_CONTEXT_URL, ZCAP_ROOT_PREFIX} = zcapConstants;

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
    const {keyAgreementKey: kak} = mock.keys;
    edvClient = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const kaks = [kak];
    const recipients = kaks.map(createRecipient);
    recipients.unshift({header: {kid: kak.id, alg: JWE_ALG}});

    const inserted = await edvClient.insert(
      {keyResolver, invocationSigner, doc, recipients});

    capabilityToRead = {
      '@context': [
        ZCAP_CONTEXT_URL,
        Ed25519Signature2020.CONTEXT_URL,
      ],
      id: `urn:uuid:${uuid()}`,
      invocationTarget: `${edvClient.id}/documents/${inserted.id}`,
      // the invoker is not the creator of the document
      invoker: kaks[0].id,
      // the invoker will only be allowed to read the document
      allowedAction: 'read',
      // this is the root zCap for the EDV
      parentCapability: ZCAP_ROOT_PREFIX +
        `${encodeURIComponent(edvClient.id)}`,
      expires: new Date(Date.now() + 300000).toISOString()
    };
    // this is the private key of the EDV owner.
    const signer = mock.invocationSigner;
    const {documentLoader} = mock;
    const suite = new Ed25519Signature2020(
      {signer, verificationMethod: signer.id});
    const purpose = new CapabilityDelegation(
      {parentCapability: capabilityToRead.parentCapability});
    // sign adds a proof to capabilityToRead
    await sign(capabilityToRead, {documentLoader, suite, purpose});
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('throws TypeError on missing capabilityToRevoke param', async () => {
    let err;
    let result;
    try {
      result = await edvClient.revokeCapability({invocationSigner});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(result);
    err.name.should.equal('TypeError');
    err.message.should.contain('capabilityToRevoke');
  });
  it('throws TypeError on missing invocationSigner param', async () => {
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
