/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {EdvClient} from '..';
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

});
