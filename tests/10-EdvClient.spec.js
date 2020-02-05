/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {EdvClient} from '..';
import mock from './mock.js';
import {isRecipient} from './test-utils.js';

describe('EdvClient', () => {
  let invocationSigner, keyResolver = null;
  before(async () => {
    await mock.init();
    invocationSigner = mock.invocationSigner;
    keyResolver = mock.keyResolver;
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should find document by index after updates', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {
      id: testId,
      content: {someKey: '111111', indexedKey: 'value1'}
    };
    let version1 = await client.insert({
      doc,
      invocationSigner,
      keyResolver
    });
    version1 = await client.get({id: doc.id, invocationSigner});

    await client.update({
      doc: {
        ...version1,
        content: {
          ...version1.content,
          someKey: '22222'
        }
      },
      invocationSigner,
      keyResolver
    });
    const version2 = await client.get({id: doc.id, invocationSigner});
    await client.update({
      doc: {
        ...version2,
        content: {
          ...version2.content,
          someKey: '33333'
        }
      },
      invocationSigner,
      keyResolver
    });

    const docs = await client.find({
      has: 'content.indexedKey',
      invocationSigner
    });

    docs.should.be.an('array');
    docs.length.should.equal(1);
  });

  it('should not find document by index after update', async () => {
    const {keyAgreementKey, hmac} = mock.keys;
    let docs = [];
    const config = await EdvClient.createEdv({
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
        hmac: {id: hmac.id, type: hmac.type},
        referenceId: 'web'
      }
    });
    const client = new EdvClient({id: config.id, keyAgreementKey, hmac});
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {
      id: testId,
      content: {someKey: 'someValue', indexedKey: 'value1'}
    };
    const version1 = await client.insert({
      doc,
      invocationSigner,
      keyResolver
    });
    // the content no longer has the indexed property.
    version1.content = {someKey: 'aNewValue'};
    await client.update({doc: version1, invocationSigner, keyResolver});
    docs = await client.find({
      has: 'content.indexedKey',
      invocationSigner
    });
    docs.should.be.an('array');
    docs.length.should.equal(0);
  });

  it('should create a new encrypted data vault', async () => {
    const {keyAgreementKey, hmac} = mock.keys;
    const config = await EdvClient.createEdv({
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
        hmac: {id: hmac.id, type: hmac.type}
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get an encrypted data vault config', async () => {
    const {keyAgreementKey, hmac} = mock.keys;
    const {id} = await EdvClient.createEdv({
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
        hmac: {id: hmac.id, type: hmac.type}
      }
    });
    const config = await EdvClient.getConfig({id});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should create "primary" encrypted data vault', async () => {
    const {keyAgreementKey, hmac} = mock.keys;
    const config = await EdvClient.createEdv({
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
        hmac: {id: hmac.id, type: hmac.type},
        referenceId: 'primary'
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get "primary" encrypted data vault', async () => {
    const {keyAgreementKey, hmac} = mock.keys;
    // note: Tests should run in isolation however this will return 409
    // DuplicateError when running in a suite.
    try {
      await EdvClient.createEdv({
        config: {
          sequence: 0,
          controller: invocationSigner.id,
          keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
          hmac: {id: hmac.id, type: hmac.type},
          referenceId: 'primary'
        }
      });
    } catch(e) {
      // do nothing we just need to ensure that primary edv was created.
    }
    const config = await EdvClient.findConfig(
      {controller: mock.accountId, referenceId: 'primary'});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  // TODO: add more tests: getAll, update, setStatus

  it('should ensure two new indexes', async () => {
    const client = await mock.createEdv();
    const {indexHelper} = client;
    const indexCount = indexHelper.indexes.size;
    client.ensureIndex({attribute: ['content', 'content.index1']});
    indexHelper.indexes.should.be.a('Map');
    indexHelper.indexes.size.should.equal(indexCount + 2);
    indexHelper.indexes.has('content').should.equal(true);
    indexHelper.indexes.has('content.index1').should.equal(true);
  });

  it('should insert a document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const inserted = await client.insert({keyResolver, invocationSigner, doc});
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
    isRecipient({recipient: inserted.jwe.recipients[0]});
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
  });

  it('should get a document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    await client.insert({doc, invocationSigner, keyResolver});
    const expected = {id: testId, meta: {}, content: {someKey: 'someValue'}};
    const decrypted = await client.get({id: expected.id, invocationSigner});
    decrypted.should.be.an('object');
    decrypted.id.should.equal(testId);
    decrypted.sequence.should.equal(0);
    decrypted.indexed.should.be.an('array');
    decrypted.indexed.length.should.equal(1);
    decrypted.indexed[0].should.be.an('object');
    decrypted.indexed[0].sequence.should.equal(0);
    decrypted.indexed[0].hmac.should.be.an('object');
    decrypted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    decrypted.indexed[0].attributes.should.be.an('array');
    decrypted.jwe.should.be.an('object');
    decrypted.jwe.protected.should.be.a('string');
    decrypted.jwe.recipients.should.be.an('array');
    decrypted.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: decrypted.jwe.recipients[0]});
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal(expected.content);
  });

  it('should fail to get a non-existent document', async () => {
    const client = await mock.createEdv();
    let err;
    try {
      await client.get({id: 'doesNotExist', invocationSigner});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
  });

  it('should fail to insert a duplicate document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    await client.insert({doc, invocationSigner, keyResolver});

    let err;
    try {
      await client.insert({doc, invocationSigner, keyResolver});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });

  it('should upsert a document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const updated = await client.update({doc, invocationSigner, keyResolver});
    should.exist(updated);
    updated.should.be.an('object');
    updated.id.should.equal(testId);
    updated.sequence.should.equal(0);
    updated.indexed.should.be.an('array');
    updated.indexed.length.should.equal(1);
    updated.indexed[0].should.be.an('object');
    updated.indexed[0].sequence.should.equal(0);
    updated.indexed[0].hmac.should.be.an('object');
    updated.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    updated.indexed[0].attributes.should.be.an('array');
    updated.jwe.should.be.an('object');
    updated.jwe.protected.should.be.a('string');
    updated.jwe.recipients.should.be.an('array');
    updated.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: updated.jwe.recipients[0]});
    updated.jwe.iv.should.be.a('string');
    updated.jwe.ciphertext.should.be.a('string');
    updated.jwe.tag.should.be.a('string');
    updated.content.should.deep.equal({someKey: 'someValue'});
  });

  it('should update an existing document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    const version1 = await client.insert({doc, invocationSigner, keyResolver});
    version1.content = {someKey: 'aNewValue'};
    await client.update({doc: version1, invocationSigner, keyResolver});
    const version2 = await client.get({id: doc.id, invocationSigner});
    should.exist(version2);
    version2.should.be.an('object');
    version2.id.should.equal(testId);
    version2.sequence.should.equal(1);
    version2.indexed.should.be.an('array');
    version2.indexed.length.should.equal(1);
    version2.indexed[0].should.be.an('object');
    version2.indexed[0].sequence.should.equal(1);
    version2.indexed[0].hmac.should.be.an('object');
    version2.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    version2.indexed[0].attributes.should.be.an('array');
    version2.jwe.should.be.an('object');
    version2.jwe.protected.should.be.a('string');
    version2.jwe.recipients.should.be.an('array');
    version2.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: version2.jwe.recipients[0]});
    version2.jwe.iv.should.be.a('string');
    version2.jwe.ciphertext.should.be.a('string');
    version2.jwe.tag.should.be.a('string');
    version2.content.should.deep.equal({someKey: 'aNewValue'});
  });

  it('should delete an existing document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    await client.insert({doc, invocationSigner, keyResolver});
    const decrypted = await client.get({id: doc.id, invocationSigner});
    decrypted.should.be.an('object');
    const result = await client.delete({id: doc.id, invocationSigner});
    result.should.equal(true);
    let err;
    try {
      await client.get({id: doc.id, invocationSigner});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
  });

  it('should fail to delete a non-existent document', async () => {
    const client = await mock.createEdv();
    const result = await client.delete({id: 'foo', invocationSigner});
    result.should.equal(false);
  });

  it('should insert a document with attributes', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {indexedKey: 'value1'}};
    await client.insert({keyResolver, invocationSigner, doc});
    const decrypted = await client.get({id: doc.id, invocationSigner});
    should.exist(decrypted);
    decrypted.should.be.an('object');
    decrypted.id.should.equal(testId);
    decrypted.sequence.should.equal(0);
    decrypted.indexed.should.be.an('array');
    decrypted.indexed.length.should.equal(1);
    decrypted.indexed[0].should.be.an('object');
    decrypted.indexed[0].sequence.should.equal(0);
    decrypted.indexed[0].hmac.should.be.an('object');
    decrypted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    decrypted.indexed[0].attributes.should.be.an('array');
    decrypted.indexed[0].attributes.length.should.equal(1);
    decrypted.indexed[0].attributes[0].should.be.an('object');
    decrypted.indexed[0].attributes[0].name.should.be.a('string');
    decrypted.indexed[0].attributes[0].value.should.be.a('string');
    decrypted.jwe.should.be.an('object');
    decrypted.jwe.protected.should.be.a('string');
    decrypted.jwe.recipients.should.be.an('array');
    decrypted.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: decrypted.jwe.recipients[0]});
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal({indexedKey: 'value1'});
  });

  it('should reject two documents with same unique attribute', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.uniqueKey', unique: true});
    const doc1ID = await EdvClient.generateId();
    const doc2ID = await EdvClient.generateId();
    const doc1 = {id: doc1ID, content: {uniqueKey: 'value1'}};
    const doc2 = {id: doc2ID, content: {uniqueKey: 'value1'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    let err;
    try {
      await client.insert({doc: doc2, invocationSigner, keyResolver});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });

  it('should find a document that has an attribute', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {indexedKey: 'value1'}};
    await client.insert({doc, invocationSigner, keyResolver});
    const docs = await client.find(
      {has: 'content.indexedKey', invocationSigner});
    docs.should.be.an('array');
    docs.length.should.equal(1);
    const decrypted = docs[0];
    decrypted.should.be.an('object');
    decrypted.id.should.equal(testId);
    decrypted.sequence.should.equal(0);
    decrypted.indexed.should.be.an('array');
    decrypted.indexed.length.should.equal(1);
    decrypted.indexed[0].should.be.an('object');
    decrypted.indexed[0].sequence.should.equal(0);
    decrypted.indexed[0].hmac.should.be.an('object');
    decrypted.indexed[0].hmac.should.deep.equal({
      id: client.hmac.id,
      type: client.hmac.type
    });
    decrypted.indexed[0].attributes.should.be.an('array');
    decrypted.indexed[0].attributes.length.should.equal(1);
    decrypted.indexed[0].attributes[0].should.be.an('object');
    decrypted.indexed[0].attributes[0].name.should.be.a('string');
    decrypted.indexed[0].attributes[0].value.should.be.a('string');
    decrypted.jwe.should.be.an('object');
    decrypted.jwe.protected.should.be.a('string');
    decrypted.jwe.recipients.should.be.an('array');
    decrypted.jwe.recipients.length.should.equal(1);
    isRecipient({recipient: decrypted.jwe.recipients[0]});
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal({indexedKey: 'value1'});
  });

  it('should find two documents with an attribute', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1ID = await EdvClient.generateId();
    const doc2ID = await EdvClient.generateId();
    const doc1 = {id: doc1ID, content: {indexedKey: 'value1'}};
    const doc2 = {id: doc2ID, content: {indexedKey: 'value2'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    await client.insert({doc: doc2, invocationSigner, keyResolver});
    const docs = await client.find({
      invocationSigner,
      has: 'content.indexedKey'
    });
    docs.should.be.an('array');
    docs.length.should.equal(2);
    docs[0].should.be.an('object');
    docs[1].should.be.an('object');
    docs[0].content.should.deep.equal({indexedKey: 'value1'});
    docs[1].content.should.deep.equal({indexedKey: 'value2'});
  });

  it('should find a document that equals an attribute value', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const expected = {id: testId, content: {indexedKey: 'value1'}};
    await client.insert({doc: expected, invocationSigner, keyResolver});
    const docs = await client.find({
      invocationSigner,
      equals: {'content.indexedKey': 'value1'}
    });
    docs.should.be.an('array');
    docs.length.should.equal(1);
    docs[0].should.be.an('object');
    docs[0].content.should.deep.equal(expected.content);
  });

  it('should find a document that equals the value of a' +
    ' URL attribute', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.https://schema\\.org/'});
    const testId = await EdvClient.generateId();
    const expected = {
      id: testId,
      content: {
        'https://schema.org/': 'value1'
      }
    };
    await client.insert({doc: expected, invocationSigner, keyResolver});
    const docs = await client.find({
      invocationSigner,
      equals: {
        'content.https://schema\\.org/': 'value1'
      }
    });
    docs.should.be.an('array');
    docs.length.should.equal(1);
    docs[0].should.be.an('object');
    docs[0].content.should.deep.equal(expected.content);
  });

  it('should find a document with a deep index on an array', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.nested.array.foo'});
    const testId = await EdvClient.generateId();
    const expected = {
      id: testId,
      content: {
        nested: {
          array: [{
            foo: 'bar'
          }, {
            foo: 'baz'
          }]
        }
      }
    };
    await client.insert({doc: expected, keyResolver, invocationSigner});

    // find with first value
    let docs = await client.find({
      invocationSigner,
      equals: {
        'content.nested.array.foo': 'bar'
      }
    });
    docs.should.be.an('array');
    docs.length.should.equal(1);
    docs[0].should.be.an('object');
    docs[0].content.should.deep.equal(expected.content);

    // find with second value
    docs = await client.find({
      invocationSigner,
      equals: {
        'content.nested.array.foo': 'baz'
      }
    });
    docs.should.be.an('array');
    docs.length.should.equal(1);
    docs[0].should.be.an('object');
    docs[0].content.should.deep.equal(expected.content);
  });

  it('should find two documents with attribute values', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1ID = await EdvClient.generateId();
    const doc2ID = await EdvClient.generateId();
    const doc1 = {id: doc1ID, content: {indexedKey: 'value1'}};
    const doc2 = {id: doc2ID, content: {indexedKey: 'value2'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    await client.insert({doc: doc2, invocationSigner, keyResolver});
    const docs = await client.find({
      invocationSigner,
      equals: [
        {'content.indexedKey': 'value1'},
        {'content.indexedKey': 'value2'}
      ]
    });
    docs.should.be.an('array');
    docs.length.should.equal(2);
    docs[0].should.be.an('object');
    docs[1].should.be.an('object');
    docs[0].content.should.deep.equal({indexedKey: 'value1'});
    docs[1].content.should.deep.equal({indexedKey: 'value2'});
  });
});
