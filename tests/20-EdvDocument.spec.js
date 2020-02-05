/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

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
});
