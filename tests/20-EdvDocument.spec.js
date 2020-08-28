/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {EdvDocument, EdvClient} from '..';
import mock from './mock.js';

describe('EdvDocument', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should read a document using EdvDocument', async () => {
    const {invocationSigner, keyResolver} = mock;
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1Id = await EdvClient.generateId();
    const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    const doc = new EdvDocument({
      invocationSigner,
      id: doc1.id,
      keyAgreementKey: client.keyAgreementKey,
      capability: {
        id: `${client.id}`,
        invocationTarget: `${client.id}/documents/${doc1.id}`
      }
    });
    const result = await doc.read();
    result.should.be.an('object');
    result.content.should.deep.equal({indexedKey: 'value1'});
  });
  it('should delete a document using EdvDocument', async () => {
    const {invocationSigner, keyResolver} = mock;
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1Id = await EdvClient.generateId();
    const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    const doc = new EdvDocument({
      invocationSigner,
      id: doc1.id,
      keyAgreementKey: client.keyAgreementKey,
      capability: {
        id: `${client.id}`,
        invocationTarget: `${client.id}/documents/${doc1.id}`
      },
      keyResolver
    });
    const docResult = await doc.read();
    let err;
    let result;
    try {
      result = await doc.delete({
        doc: docResult, invocationSigner, keyResolver
      });
    } catch(e) {
      err = e;
    }
    should.exist(result);
    should.not.exist(err);
    result.should.equal(true);
  });
  it('should throw error if creating EdvDocument without id or capability',
    async () => {
      const {invocationSigner, keyResolver} = mock;
      const client = await mock.createEdv();
      client.ensureIndex({attribute: 'content.indexedKey'});
      const doc1Id = await EdvClient.generateId();
      const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
      await client.insert({doc: doc1, invocationSigner, keyResolver});
      let err;
      let doc;
      try {
        doc = new EdvDocument({
          invocationSigner,
          keyAgreementKey: client.keyAgreementKey,
          keyResolver
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(doc);
      should.exist(err);
      err.name.should.equal('TypeError');
      err.message.should.equal('"capability" must be an object.');
    });
  it('edvDocument id should be undefined if created using invalid ' +
    'capabilityTarget.',
  async () => {
    const {invocationSigner, keyResolver} = mock;
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1Id = await EdvClient.generateId();
    const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    let err;
    let doc;
    try {
      doc = new EdvDocument({
        invocationSigner,
        keyAgreementKey: client.keyAgreementKey,
        capability: {
          id: `${client.id}`,
          invocationTarget: `invalid-invocationTarget`
        },
        keyResolver
      });
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    should.exist(doc);
    should.not.exist(doc.id);
  });
});
