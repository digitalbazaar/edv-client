/*!
* Copyright (c) 2020-2023 Digital Bazaar, Inc. All rights reserved.
*/
import {
  CapabilityDelegation, constants as zcapConstants
} from '@digitalbazaar/zcap';
import {createRecipient, isRecipient, JWE_ALG} from './test-utils.js';
import {EdvClient, EdvDocument} from '../lib/index.js';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import jsigs from 'jsonld-signatures';
import mock from './mock.js';
import {v4 as uuid} from 'uuid';

const {ZCAP_CONTEXT_URL, ZCAP_ROOT_PREFIX} = zcapConstants;

const {sign} = jsigs;

const cipherVersions = ['recommended', 'fips'];

describe('EDV Recipients', () => {
  let delegate = null;
  let invocationSigner = null;
  let keyResolver = null;

  before(async () => {
    await mock.init();
    delegate = mock.delegate;
    invocationSigner = mock.invocationSigner;
    keyResolver = mock.keyResolver;
  });

  after(async () => {
    await mock.server.shutdown();
  });

  cipherVersions.forEach(cipherVersion => {
    let kak = null;
    beforeEach(() => {
      kak = cipherVersion === 'fips' ?
        mock.keys.fips.keyAgreementKey : mock.keys.keyAgreementKey;
    });

    describe(`"${cipherVersion}" cipher version`, () => {
      // this test should be identical to the insert test
      // except that recipients is passed in
      it('should insert a document with a single recipient', async () => {
        const client = await mock.createEdv({cipherVersion});
        const testId = await EdvClient.generateId();
        const doc = {id: testId, content: {someKey: 'someValue'}};
        const recipients = [{header: {kid: kak.id, alg: JWE_ALG}}];
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
        isRecipient({recipient: inserted.jwe.recipients[0], cipherVersion});
        inserted.jwe.iv.should.be.a('string');
        inserted.jwe.ciphertext.should.be.a('string');
        inserted.jwe.tag.should.be.a('string');
        inserted.content.should.deep.equal({someKey: 'someValue'});
      });

      it('should insert a document with 5 recipients', async () => {
        const client = await mock.createEdv({cipherVersion});
        const testId = await EdvClient.generateId();
        const doc = {id: testId, content: {someKey: 'someValue'}};
        // create the did keys then the recipients
        const recipients = (await Promise.all([1, 2, 3, 4]
          .map(async () => kak)))
          .map(createRecipient);
        // note: when passing recipients it is important to remember
        // to pass in the document creator. EdvClient will use the
        // EdvOwner by default as a recipient if there are no recipients
        // being passed in, but will not if you explicitly pass in recipients.
        recipients.unshift({header: {kid: kak.id, alg: JWE_ALG}});
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
        inserted.jwe.recipients.forEach(recipient => {
          isRecipient({recipient, cipherVersion});
        });
      });

      it('should read a document using a delegated capability',
        async function() {
          const client = await mock.createEdv({cipherVersion});
          const testId = await EdvClient.generateId();
          const doc = {id: testId, content: {someKey: 'someValue'}};
          const recipients = [
            {header: {kid: kak.id, alg: JWE_ALG}},
            createRecipient(kak)
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
          // we should have 2 recipients including the EDV owner.
          inserted.jwe.recipients.length.should.equal(2);
          inserted.jwe.iv.should.be.a('string');
          inserted.jwe.ciphertext.should.be.a('string');
          inserted.jwe.tag.should.be.a('string');
          inserted.content.should.deep.equal({someKey: 'someValue'});
          inserted.jwe.recipients.forEach(recipient => {
            isRecipient({recipient, cipherVersion});
          });
          const unsignedCapability = {
            '@context': [
              ZCAP_CONTEXT_URL,
              Ed25519Signature2020.CONTEXT_URL,
            ],
            id: `urn:uuid:${uuid()}`,
            invocationTarget: `${client.id}/documents/${inserted.id}`,
            // set zcap controller to the delegate's ID
            controller: delegate.capabilityAgent.id,
            // the invoker will only be allowed to read the document
            allowedAction: 'read',
            // this is the root zCap for the EDV
            parentCapability:
              `${ZCAP_ROOT_PREFIX}${encodeURIComponent(client.id)}`,
            expires: new Date(Date.now() + 300000).toISOString()
          };
          // delegate the zcap using the same key as the EDV controller
          const signer = invocationSigner;
          const {documentLoader} = mock;
          const suite = new Ed25519Signature2020(
            {signer, verificationMethod: signer.id});
          const purpose = new CapabilityDelegation(
            {parentCapability: unsignedCapability.parentCapability});
          const delegatedCapability = await sign(
            unsignedCapability, {documentLoader, suite, purpose});
          const delegatedDoc = new EdvDocument({
            client,
            // the delegate will be invoking the delegated zcap
            invocationSigner: delegate.capabilityAgent.signer,
            keyResolver: mock.keyResolver,
            // this is the document creator's keyAgreementKey; it is just reused
            // here; in a more complete example, the delegate would be given a
            // zcap to use this key agreement key as well as a zcap to access
            // the document
            keyAgreementKey: kak,
            capability: delegatedCapability
          });
          const delegatedEDV = await delegatedDoc.read();
          should.exist(delegatedEDV);
          delegatedEDV.should.be.an('object');
          should.exist(delegatedEDV.content);
          delegatedEDV.content.should.deep.equal(inserted.content);
        });
    });
  });
});
