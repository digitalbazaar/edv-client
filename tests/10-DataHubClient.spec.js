/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubClient} from '..';
import mock from './mock.js';

describe('DataHubClient', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should create a new data hub', async () => {
    const {kek, hmac} = mock.keys;
    const config = await DataHubClient.createDataHub({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, type: kek.type},
        hmac: {id: hmac.id, type: hmac.type}
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get data hub storage', async () => {
    const {kek, hmac} = mock.keys;
    const {id} = await DataHubClient.createDataHub({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, type: kek.type},
        hmac: {id: hmac.id, type: hmac.type}
      }
    });
    const config = await DataHubClient.getConfig({id});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should create "primary" data hub storage', async () => {
    const {kek, hmac} = mock.keys;
    const config = await DataHubClient.createDataHub({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, type: kek.type},
        hmac: {id: hmac.id, type: hmac.type},
        referenceId: 'primary'
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get "primary" data hub storage', async () => {
    const {kek, hmac} = mock.keys;
    // note: Tests should run in isolation however this will return 409
    // DuplicateError when running in a suite.
    try {
      await DataHubClient.createDataHub({
        config: {
          sequence: 0,
          controller: mock.accountId,
          kek: {id: kek.id, type: kek.type},
          hmac: {id: hmac.id, type: hmac.type},
          referenceId: 'primary'
        }
      });
    } catch(e) {
      // do nothing we just need to ensure that primary datahub was created.
    }
    const config = await DataHubClient.findConfig(
      {controller: mock.accountId, referenceId: 'primary'});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  // TODO: add more tests: getAll, update, setStatus

  it('should ensure two new indexes', async () => {
    const client = await mock.createDataHub();
    const {indexHelper} = client;
    const indexCount = indexHelper.indexes.size;
    client.ensureIndex({attribute: ['content', 'content.index1']});
    indexHelper.indexes.should.be.a('Map');
    indexHelper.indexes.size.should.equal(indexCount + 2);
    indexHelper.indexes.has('content').should.equal(true);
    indexHelper.indexes.has('content.index1').should.equal(true);
  });

  it('should insert a document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    const inserted = await client.insert({doc});
    should.exist(inserted);
    inserted.should.be.an('object');
    inserted.id.should.equal('foo');
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
    inserted.jwe.recipients[0].should.be.an('object');
    inserted.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    inserted.jwe.iv.should.be.a('string');
    inserted.jwe.ciphertext.should.be.a('string');
    inserted.jwe.tag.should.be.a('string');
    inserted.content.should.deep.equal({someKey: 'someValue'});
  });

  it('should get a document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    await client.insert({doc});
    const expected = {id: 'foo', meta: {}, content: {someKey: 'someValue'}};
    const decrypted = await client.get({id: expected.id});
    decrypted.should.be.an('object');
    decrypted.id.should.equal('foo');
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
    decrypted.jwe.recipients[0].should.be.an('object');
    decrypted.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal(expected.content);
  });

  it('should fail to get a non-existent document', async () => {
    const client = await mock.createDataHub();
    let err;
    try {
      await client.get({id: 'doesNotExist'});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
  });

  it('should fail to insert a duplicate document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    await client.insert({doc});

    let err;
    try {
      await client.insert({doc});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });

  it('should upsert a document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    const updated = await client.update({doc});
    should.exist(updated);
    updated.should.be.an('object');
    updated.id.should.equal('foo');
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
    updated.jwe.recipients[0].should.be.an('object');
    updated.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    updated.jwe.iv.should.be.a('string');
    updated.jwe.ciphertext.should.be.a('string');
    updated.jwe.tag.should.be.a('string');
    updated.content.should.deep.equal({someKey: 'someValue'});
  });

  it('should update an existing document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    const version1 = await client.insert({doc});
    version1.content = {someKey: 'aNewValue'};
    await client.update({doc: version1});
    const version2 = await client.get({id: doc.id});
    should.exist(version2);
    version2.should.be.an('object');
    version2.id.should.equal('foo');
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
    version2.jwe.recipients[0].should.be.an('object');
    version2.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    version2.jwe.iv.should.be.a('string');
    version2.jwe.ciphertext.should.be.a('string');
    version2.jwe.tag.should.be.a('string');
    version2.content.should.deep.equal({someKey: 'aNewValue'});
  });

  it('should delete an existing document', async () => {
    const client = await mock.createDataHub();
    const doc = {id: 'foo', content: {someKey: 'someValue'}};
    await client.insert({doc});
    const decrypted = await client.get({id: doc.id});
    decrypted.should.be.an('object');
    const result = await client.delete({id: doc.id});
    result.should.equal(true);
    let err;
    try {
      await client.get({id: doc.id});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
  });

  it('should fail to delete a non-existent document', async () => {
    const client = await mock.createDataHub();
    const result = await client.delete({id: 'foo'});
    result.should.equal(false);
  });

  it('should insert a document with attributes', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    await client.insert({doc});
    const decrypted = await client.get({id: doc.id});
    should.exist(decrypted);
    decrypted.should.be.an('object');
    decrypted.id.should.equal('hasAttributes1');
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
    decrypted.jwe.recipients[0].should.be.an('object');
    decrypted.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal({indexedKey: 'value1'});
  });

  it('should reject two documents with same unique attribute', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.uniqueKey', unique: true});
    const doc1 = {id: 'hasAttributes1', content: {uniqueKey: 'value1'}};
    const doc2 = {id: 'hasAttributes2', content: {uniqueKey: 'value1'}};
    await client.insert({doc: doc1});
    let err;
    try {
      await client.insert({doc: doc2});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });

  it('should find a document that has an attribute', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    await client.insert({doc});
    const docs = await client.find({has: 'content.indexedKey'});
    docs.should.be.an('array');
    docs.length.should.equal(1);
    const decrypted = docs[0];
    decrypted.should.be.an('object');
    decrypted.id.should.equal('hasAttributes1');
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
    decrypted.jwe.recipients[0].should.be.an('object');
    decrypted.jwe.recipients[0].header.should.deep.equal({
      kid: client.kek.id,
      alg: client.kek.algorithm
    });
    decrypted.jwe.iv.should.be.a('string');
    decrypted.jwe.ciphertext.should.be.a('string');
    decrypted.jwe.tag.should.be.a('string');
    decrypted.content.should.deep.equal({indexedKey: 'value1'});
  });

  it('should find two documents with an attribute', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1 = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    const doc2 = {id: 'hasAttributes2', content: {indexedKey: 'value2'}};
    await client.insert({doc: doc1});
    await client.insert({doc: doc2});
    const docs = await client.find({has: 'content.indexedKey'});
    docs.should.be.an('array');
    docs.length.should.equal(2);
    docs[0].should.be.an('object');
    docs[1].should.be.an('object');
    docs[0].content.should.deep.equal({indexedKey: 'value1'});
    docs[1].content.should.deep.equal({indexedKey: 'value2'});
  });

  it('should find a document that equals an attribute value', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const expected = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    await client.insert({doc: expected});
    const docs = await client.find({equals: {'content.indexedKey': 'value1'}});
    docs.should.be.an('array');
    docs.length.should.equal(1);
    docs[0].should.be.an('object');
    docs[0].content.should.deep.equal(expected.content);
  });

  it('should find a document that equals the value of a' +
    ' URL attribute', async () => {
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.https://schema\\.org/'});
    const expected = {
      id: 'hasAttributes1',
      content: {
        'https://schema.org/': 'value1'
      }
    };
    await client.insert({doc: expected});
    const docs = await client.find({
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
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.nested.array.foo'});
    const expected = {
      id: 'hasDeepArrayAttributes',
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
    await client.insert({doc: expected});

    // find with first value
    let docs = await client.find({
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
    const client = await mock.createDataHub();
    client.ensureIndex({attribute: 'content.indexedKey'});
    const doc1 = {id: 'hasAttributes1', content: {indexedKey: 'value1'}};
    const doc2 = {id: 'hasAttributes2', content: {indexedKey: 'value2'}};
    await client.insert({doc: doc1});
    await client.insert({doc: doc2});
    const docs = await client.find({
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
