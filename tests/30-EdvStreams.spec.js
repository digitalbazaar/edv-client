/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {EdvDocument, EdvClient} from '..';
import mock from './mock.js';
import {isRecipient, isNewEDV} from './test-utils.js';
import {ReadableStream} from '../util';

function getRandomUint8({size = 50} = {}) {
  return new Uint8Array(size).map(
    () => Math.floor(Math.random() * 255));
}

describe('EDV Stream Tests', function() {
  let invocationSigner, keyResolver = null;
  before(async () => {
    await mock.init();
    invocationSigner = mock.invocationSigner;
    keyResolver = mock.keyResolver;
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should insert a document with a stream', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const data = getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const inserted = await client.insert(
      {keyResolver, invocationSigner, doc, stream});
    const hmac = {
      id: client.hmac.id,
      type: client.hmac.type
    };
    // Streams are added in an update
    // after the initial document has been written
    // hence the sequence is 1 and not 0.
    isNewEDV({hmac, inserted, testId, sequence: 1});
    isRecipient({recipient: inserted.jwe.recipients[0]});
    inserted.content.should.deep.equal({someKey: 'someValue'});
    should.exist(inserted.stream);
    inserted.stream.should.be.an('object');
  });

  it('should be able to decrypt a stream from an EdvDocument', async () => {
    const {invocationSigner, keyResolver} = mock;
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1Id = await EdvClient.generateId();
    const doc1 = {id: doc1Id, content: {indexedKey: 'value1'}};
    const data = getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    await client.insert({doc: doc1, stream, invocationSigner, keyResolver});
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
    should.exist(result.stream);
    result.stream.should.be.an('object');
    const expectedStream = await doc.getStream({doc: result});
    const reader = expectedStream.getReader();
    let streamData = new Uint8Array(0);
    let done = false;
    while(!done) {
      // value is either undefined or a Uint8Array
      const {value, done: _done} = await reader.read();
      // if there is a chunk then we need to update the streamData
      if(value) {
        // create a new array with the new length
        const next = new Uint8Array(streamData.length + value.length);
        // set the first values to the existing chunk
        next.set(streamData);
        // set the chunk's values to the rest of the array
        next.set(value, streamData.length);
        // update the streamData
        streamData = next;
      }
      done = _done;
    }
    console.log('streamData', {streamData, data});
  });

});
