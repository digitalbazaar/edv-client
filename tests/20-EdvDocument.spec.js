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
      result = await doc.delete({doc: docResult, invocationSigner,
        keyResolver});
    } catch(e) {
      err = e;
    }
    should.exist(result);
    should.not.exist(err);
    result.should.equal(true);
  });
});
