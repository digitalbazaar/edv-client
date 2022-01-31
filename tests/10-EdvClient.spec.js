/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {EdvClient} from '..';
import {default as mock, BASE_URL} from './mock.js';
import {isRecipient} from './test-utils.js';

describe('EdvClient', () => {
  let invocationSigner = null;
  let keyResolver = null;
  let kak = null;
  before(async () => {
    await mock.init();
    kak = mock.keys.keyAgreementKey;
    invocationSigner = mock.invocationSigner;
    keyResolver = mock.keyResolver;
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should throw an error when config is invalid', async () => {
    let result;
    let err;
    try {
      result = await EdvClient.createEdv({
        url: `${BASE_URL}/edvs`,
        config: {
          sequence: 0,
          controller: mock.accountId,
          // intentionally adding an invalid property to the config.
          invalid: 'invalid'
        },
        invocationSigner
      });
    } catch(e) {
      err = e;
    }
    should.not.exist(result);
    should.exist(err);
    err.message.should.equal('Validation error.');
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

    const {documents: docs} = await client.find({
      has: 'content.indexedKey',
      invocationSigner
    });
    docs.should.be.an('array');
    docs.length.should.equal(1);
  });

  it('find a document using a multi property query', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.someKey'});

    const testId = await EdvClient.generateId();
    const doc = {
      id: testId,
      content: {
        someKey: {
          b: 5,
          a: 4
        }
      }
    };

    await client.insert({
      doc,
      invocationSigner,
      keyResolver
    });

    // it should find the document when property keys are in same order.
    const {documents: docs} = await client.find({
      equals: {
        'content.someKey': {
          b: 5,
          a: 4
        }
      },
      invocationSigner
    });

    docs.should.be.an('array');
    docs.length.should.equal(1);

    // it should find the document when property keys are in a different order.
    const {documents: docs2} = await client.find({
      equals: {
        'content.someKey': {
          a: 4,
          b: 5
        }
      },
      invocationSigner
    });

    docs2.should.be.an('array');
    docs2.length.should.equal(1);

    // no results when attempting to find a document when
    // property keys have values that do not match the stored document.
    const {documents: docs3} = await client.find({
      equals: {
        'content.someKey': {
          b: 11111,
          a: 22222
        }
      },
      invocationSigner
    });

    docs3.should.be.an('array');
    docs3.length.should.equal(0);
  });

  it('should not find document by index after update', async () => {
    const {hmac} = mock.keys;
    const config = await EdvClient.createEdv({
      url: `${BASE_URL}/edvs`,
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: kak.id, type: kak.type},
        hmac: {id: hmac.id, type: hmac.type},
        referenceId: 'web'
      }
    });
    const client = new EdvClient({id: config.id, keyAgreementKey: kak, hmac});
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
    const {documents: docs} = await client.find({
      has: 'content.indexedKey',
      invocationSigner
    });
    docs.should.be.an('array');
    docs.length.should.equal(0);
  });

  it('should create a new encrypted data vault', async () => {
    const {hmac} = mock.keys;
    const config = await EdvClient.createEdv({
      url: `${BASE_URL}/edvs`,
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: kak.id, type: kak.type},
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
    const {hmac} = mock.keys;
    const {id} = await EdvClient.createEdv({
      url: `${BASE_URL}/edvs`,
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: kak.id, type: kak.type},
        hmac: {id: hmac.id, type: hmac.type}
      }
    });
    const client = new EdvClient({id, keyAgreementKey: kak, hmac});
    const config = await client.getConfig();
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should create "primary" encrypted data vault', async () => {
    const {hmac} = mock.keys;
    const config = await EdvClient.createEdv({
      url: `${BASE_URL}/edvs`,
      config: {
        sequence: 0,
        controller: mock.accountId,
        keyAgreementKey: {id: kak.id, type: kak.type},
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
    const {hmac} = mock.keys;
    // note: Tests should run in isolation however this will return 409
    // DuplicateError when running in a suite.
    try {
      await EdvClient.createEdv({
        url: `${BASE_URL}/edvs`,
        config: {
          sequence: 0,
          controller: invocationSigner.id,
          keyAgreementKey: {id: kak.id, type: kak.type},
          hmac: {id: hmac.id, type: hmac.type},
          referenceId: 'primary'
        }
      });
    } catch(e) {
      // do nothing we just need to ensure that primary edv was created.
    }
    const config = await EdvClient.findConfig({
      controller: mock.accountId, referenceId: 'primary',
      url: `${BASE_URL}/edvs`
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.keyAgreementKey.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  // TODO: add more tests: getAll, update

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
    const docCopy = {...doc};
    const inserted = await client.insert({keyResolver, invocationSigner, doc});
    should.exist(inserted);
    docCopy.should.deep.equal(doc);
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

  it('should not mutate a doc when config does not include id', async () => {
    const client = await mock.createEdv();
    const doc = {content: {someKey: 'someValue'}};
    const docCopy = {...doc};
    const inserted = await client.insert({keyResolver, invocationSigner, doc});
    should.exist(inserted);
    docCopy.should.deep.equal(doc);
    inserted.should.be.an('object');
    inserted.should.have.property('id');
    inserted.id.should.be.a('string');
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
    const result = await client.delete({
      doc: decrypted, invocationSigner, keyResolver
    });
    result.should.equal(true);
    let err;
    let deletedResult;
    try {
      deletedResult = await client.get({id: doc.id, invocationSigner});
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    should.exist(deletedResult);
    deletedResult.meta.deleted.should.equal(true);
  });

  it('should increase sequence when updating a deleted document', async () => {
    const client = await mock.createEdv();
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {someKey: 'someValue'}};
    await client.insert({doc, invocationSigner, keyResolver});
    const decrypted = await client.get({id: doc.id, invocationSigner});
    decrypted.should.be.an('object');
    await client.delete({doc: decrypted, invocationSigner, keyResolver});
    const deletedResult = await client.get({id: doc.id, invocationSigner});
    deletedResult.sequence.should.equal(1);
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

  it('should not find a deleted document via its attributes', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {indexedKey: 'toDelete'}};
    await client.insert({doc, invocationSigner, keyResolver});

    // should find doc before deleting it
    const {documents: docsBefore} = await client.find(
      {equals: {'content.indexedKey': 'toDelete'}, invocationSigner});
    docsBefore.should.be.an('array');
    docsBefore.length.should.equal(1);

    // delete doc
    const decrypted = await client.get({id: doc.id, invocationSigner});
    const result = await client.delete({
      doc: decrypted, invocationSigner, keyResolver
    });
    result.should.equal(true);

    // should NOT find doc after deleting it
    const {documents: docsAfter} = await client.find(
      {equals: {'content.indexedKey': 'toDelete'}, invocationSigner});
    docsAfter.should.be.an('array');
    docsAfter.length.should.equal(0);
  });

  it('should not find a deleted document via its attributes when ' +
    'deleted with no hmac set', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const doc = {id: testId, content: {indexedKey: 'toDelete'}};
    await client.insert({doc, invocationSigner, keyResolver});

    // should find doc before deleting it
    const {documents: docsBefore} = await client.find(
      {equals: {'content.indexedKey': 'toDelete'}, invocationSigner});
    docsBefore.should.be.an('array');
    docsBefore.length.should.equal(1);

    // delete doc
    const decrypted = await client.get({id: doc.id, invocationSigner});
    const savedHmac = client.hmac;
    client.hmac = undefined;
    const result = await client.delete({
      doc: decrypted, invocationSigner, keyResolver
    });
    client.hmac = savedHmac;
    result.should.equal(true);

    // should NOT find doc after deleting it
    const {documents: docsAfter} = await client.find(
      {equals: {'content.indexedKey': 'toDelete'}, invocationSigner});
    docsAfter.should.be.an('array');
    docsAfter.length.should.equal(0);
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
    const {documents: docs} = await client.find(
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
    const {documents: docs} = await client.find({
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

  it('should count two documents with an attribute', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1ID = await EdvClient.generateId();
    const doc2ID = await EdvClient.generateId();
    const doc1 = {id: doc1ID, content: {indexedKey: 'value1'}};
    const doc2 = {id: doc2ID, content: {indexedKey: 'value2'}};
    await client.insert({doc: doc1, invocationSigner, keyResolver});
    await client.insert({doc: doc2, invocationSigner, keyResolver});
    const count = await client.count({
      invocationSigner,
      has: 'content.indexedKey'
    });
    should.exist(count);
    count.should.be.an('number');
    count.should.equal(2);
  });

  it('should find a document that equals an attribute value', async () => {
    const client = await mock.createEdv();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const testId = await EdvClient.generateId();
    const expected = {id: testId, content: {indexedKey: 'value1'}};
    await client.insert({doc: expected, invocationSigner, keyResolver});
    const {documents: docs} = await client.find({
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
    const {documents: docs} = await client.find({
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
    const {documents: docs} = await client.find({
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
    const {documents: docs2} = await client.find({
      invocationSigner,
      equals: {
        'content.nested.array.foo': 'baz'
      }
    });
    docs2.should.be.an('array');
    docs2.length.should.equal(1);
    docs2[0].should.be.an('object');
    docs2[0].content.should.deep.equal(expected.content);
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
    const {documents: docs} = await client.find({
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
