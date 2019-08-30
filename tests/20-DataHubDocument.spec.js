/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubDocument, DataHubClient} from '..';
import mock from './mock.js';

describe('DataHubDocument', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should read a document using DataHubDocument', async () => {
    const {invocationSigner, keyResolver} = mock;
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1Id = await DataHubClient.generateId();
    const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    const doc = new DataHubDocument({
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
});
