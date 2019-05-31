/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubDocument} from '..';
import mock from './mock.js';

describe('DataHubDocument', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should read a document using DataHubDocument', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1 = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    await client.insert({doc: doc1});
    const doc = new DataHubDocument({
      id: doc1.id,
      kek: client.kek,
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
