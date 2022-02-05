/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as base58 from 'base58-universal';
import {
  assert, assertDocument, assertDocId, assertTransport
} from './assert.js';
import {Cipher} from '@digitalbazaar/minimal-cipher';
import {IndexHelper} from './IndexHelper.js';
import {ReadableStream, getRandomBytes} from './util.js';

// 1 MiB = 1048576
const DEFAULT_CHUNK_SIZE = 1048576;

export class EdvClientCore {
  /**
   * Creates the core of an EdvClient. The core must be coupled with a
   * Transport layer.
   *
   * @param {object} options - The options to use.
   * @param {object} [options.hmac] - A default HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.id] - The ID of the EDV.
   * @param {object} [options.keyAgreementKey] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   * @param {Function} [options.keyResolver] - A default function that returns
   *   a Promise that resolves a key ID to a DH public key.
   *
   * @returns {EdvClientCore}.
   */
  constructor({hmac, id, keyAgreementKey, keyResolver} = {}) {
    if(id !== undefined) {
      assert(id, 'id', 'string');
    }
    this.hmac = hmac;
    this.id = id;
    this.keyAgreementKey = keyAgreementKey;
    this.keyResolver = keyResolver;
    this.cipher = new Cipher();
    this.indexHelper = new IndexHelper();
  }

  /**
   * Ensures that future documents inserted or updated using this Edv
   * instance will be indexed according to the given attribute, provided that
   * they contain that attribute. Compound indexes can be specified by
   * providing an array for `attribute`.
   *
   * @param {object} options - The options to use.
   * @param {string|Array} options.attribute - The attribute name or an array of
   *   attribute names to create a unique compound index.
   * @param {boolean} [options.unique=false] - Should be `true` if the index is
   *   considered unique, `false` if not.
   */
  ensureIndex({attribute, unique = false} = {}) {
    this.indexHelper.ensureIndex({attribute, unique});
  }

  /**
   * Encrypts and inserts a document into the EDV if it does not already
   * exist. If a document matching its ID already exists, a `DuplicateError` is
   * thrown. If a `stream` is given, the document will be inserted, then
   * the stream will be read, chunked, and stored. Finally, the document will
   * be updated to include meta data about the stored data from the stream,
   * including a message digest.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to insert.
   * @param {ReadableStream} [options.stream] - A WHATWG Readable stream to read
   *   from to associate chunked data with this document.
   * @param {number} [options.chunkSize=1048576] - The size, in bytes, of the
   *   chunks to break the incoming stream data into.
   * @param {object[]} [options.recipients=[]] - A set of JWE recipients
   *   to encrypt the document for; if not present, a default recipient will
   *   be added using `this.keyAgreementKey` and if no `keyAgreementKey` is
   *   set, an error will be thrown.
   * @param {Function} [options.keyResolver=this.keyResolver] - A function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving shared KEKs for wrapping content
   *   encryption keys.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<object>} - Resolves to the inserted document.
   */
  async insert({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac,
    transport
  } = {}) {
    assertDocument(doc);
    assertTransport(transport);

    doc = {...doc};
    // auto generate document ID
    if(doc.id === undefined) {
      doc.id = await EdvClientCore.generateId();
    }

    // if no recipients specified, add default
    if(recipients.length === 0 && keyAgreementKey) {
      recipients = this._createDefaultRecipients(keyAgreementKey);
    }
    // if a stream was specified, indicate a new stream of data will be
    // associated with this document
    if(stream) {
      // specify stream information
      doc.stream = {
        pending: true
      };
      keyResolver = _createCachedKeyResolver(keyResolver);
    }
    const encrypted = await this._encrypt(
      {doc, recipients, keyResolver, hmac, update: false});

    // send encrypted doc to EDV server
    await transport.insert({encrypted});

    let result = encrypted;
    encrypted.content = doc.content;
    encrypted.meta = doc.meta;
    if(doc.stream !== undefined) {
      encrypted.stream = doc.stream;
    }

    // if a `stream` was given, update it
    if(stream) {
      result = await this._updateStream({
        doc: encrypted, stream, chunkSize,
        recipients: recipients.slice(), keyResolver,
        keyAgreementKey, transport
      });
    }
    return result;
  }

  /**
   * Encrypts and updates a document in the EDV. If the document does not
   * already exist, it is created. If a `stream` is provided, the document
   * will be updated twice, once using the given update and a second time
   * once the stream has been read, chunked, and stored to include meta data
   * information such as the stream data's message digest.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to insert.
   * @param {ReadableStream} [options.stream] - A WHATWG Readable stream to read
   *   from to associate chunked data with this document.
   * @param {number} [options.chunkSize=1048576] - The size, in bytes, of the
   *   chunks to break the incoming stream data into.
   * @param {object} [options.recipients=[]] - A set of JWE recipients to
   *   encrypt the document for; if present, recipients will be added to any
   *   existing recipients; to remove existing recipients, modify the
   *   `encryptedDoc.jwe.recipients` field.
   * @param {Function} [options.keyResolver=this.keyResolver] - A function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving shared KEKs for wrapping content
   *   encryption keys.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<object>} - Resolves to the updated document.
   */
  async update({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey,
    hmac = this.hmac, transport
  } = {}) {
    assertDocument(doc);
    assertDocId(doc.id);
    assertTransport(transport);

    // if no recipients specified, add default
    if(recipients.length === 0 && keyAgreementKey) {
      recipients = this._createDefaultRecipients(keyAgreementKey);
    }
    // if a stream was specified, indicate a new stream of data will be
    // associated with this document
    if(stream) {
      // specify stream information
      doc.stream = {
        pending: true
      };
      keyResolver = _createCachedKeyResolver(keyResolver);
    }
    const encrypted = await this._encrypt(
      {doc, recipients, keyResolver, hmac, update: true});

    // send encrypted doc to EDV server
    await transport.update({encrypted});

    let result = encrypted;
    encrypted.content = doc.content;
    encrypted.meta = doc.meta;
    if(doc.stream !== undefined) {
      encrypted.stream = doc.stream;
    }

    // if a `stream` was given, update it
    if(stream) {
      result = await this._updateStream({
        doc: encrypted, stream, chunkSize,
        recipients: recipients.slice(), keyResolver,
        keyAgreementKey, hmac, transport
      });
    }

    return result;
  }

  /**
   * Updates an index for the given document, without updating the document
   * contents itself. An index entry will be updated and sent to the EDV; its
   * sequence number must match the document's current sequence number or the
   * update will be rejected with an `InvalidStateError`. Recovery from this
   * error requires fetching the latest document and trying again.
   *
   * Note: If the index does not exist or the document does not have an
   * existing entry for the index, it will be added.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to create or update an index
   *   for.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise} - Resolves once the operation completes.
   */
  async updateIndex({doc, hmac = this.hmac, transport} = {}) {
    assertDocument(doc);
    assertDocId(doc.id);
    assertTransport(transport);
    _checkIndexing(hmac);

    const entry = await this.indexHelper.createEntry({hmac, doc});

    // send index entry to EDV server
    await transport.updateIndex({docId: doc.id, entry});
  }

  /**
   * Deletes a document from the EDV.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to delete.
   * @param {object} [options.recipients=[]] - A set of JWE recipients to
   *   encrypt the document for; if present, recipients will be added to
   *   any existing recipients; to remove existing recipients, modify
   *   the `encryptedDoc.jwe.recipients` field.
   * @param {Function} [options.keyResolver=this.keyResolver] - A function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving shared KEKs for wrapping content
   *   encryption keys.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<boolean>} - Resolves to `true` if the document was
   *   deleted.
   */
  async delete({
    doc, recipients = [],
    keyResolver = this.keyResolver, keyAgreementKey = this.keyAgreementKey,
    transport
  } = {}) {
    assertDocument(doc);
    assertDocId(doc.id);
    assertTransport(transport);

    // clear document, preserving only its `id`, `sequence`, and previous
    // encrypted data (to be used to preserve recipients)
    const {id, sequence, jwe} = doc;
    doc = {id, sequence, jwe, content: {}, meta: {deleted: true}};

    await EdvClientCore.prototype.update.call(this, {
      doc, recipients, keyResolver, keyAgreementKey, transport
    });

    return true;
  }

  /**
   * Gets a document from the EDV by its ID.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the document to get.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<object>} - Resolves to the document.
   */
  async get({id, keyAgreementKey = this.keyAgreementKey, transport} = {}) {
    assert(id, 'id', 'string');
    assertTransport(transport);

    // get encrypted doc from EDV server
    const encryptedDoc = await transport.get({id});
    return this._decrypt({encryptedDoc, keyAgreementKey});
  }

  /**
   * Gets a `ReadableStream` to read the chunked data associated with a
   * document.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to get a stream for.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<ReadableStream>} - Resolves to a `ReadableStream` to read
   *   the chunked data from.
   */
  async getStream({
    doc, keyAgreementKey = this.keyAgreementKey, transport
  } = {}) {
    assert(doc, 'doc', 'object');
    assertDocId(doc.id);
    assert(doc.stream, 'doc.stream', 'object');
    assertTransport(transport);

    const {cipher} = this;
    const {id: docId} = doc;
    const state = doc.stream;
    let chunkIndex = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        // Note: user will call `read` on the decrypt stream... which will
        // trigger a pull here
        if(chunkIndex >= state.chunks) {
          // done
          controller.close();
          return;
        }
        // get next chunk and enqueue it for reading
        const chunk = await transport.getChunk({docId, chunkIndex});
        chunkIndex++;
        controller.enqueue(chunk);
      }
    });
    const decryptStream = await cipher.createDecryptStream({keyAgreementKey});
    return stream.pipeThrough(decryptStream);
  }

  /**
   * Counts how many documents match a query in an EDV.
   *
   * @see find - For more detailed documentation on the search options.
   *
   * @param {object} options - The options to use.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object|Array} [options.equals] - An object with key-value
   *   attribute pairs to match or an array of such objects.
   * @param {string|Array} [options.has] - A string with an attribute name to
   *   match or an array of such strings.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<number>} - Resolves to the number of matching documents.
  */
  async count({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    transport
  } = {}) {
    const {count} = await EdvClientCore.prototype.find.call(this, {
      keyAgreementKey, hmac, equals, has, count: true, transport
    });
    return count;
  }

  /**
   * Finds documents based on their attributes. Currently, matching can be
   * performed using an `equals` or a `has` filter (but not both at once).
   *
   * The `equals` filter is an object with key-value attribute pairs. Any
   * document that matches *all* given key-value attribute pairs will be
   * returned. If equals is an array, it may contain multiple such filters --
   * whereby the results will be all documents that matched any one of the
   * filters. If the document's value for a matching a key is an array and
   * the array contains a matching value, the document will be considered
   * a match (provided that other key-value attribute pairs also match).
   *
   * The `has` filter is a string representing the attribute name or an
   * array of such strings. If an array is used, then the results will only
   * contain documents that possess *all* of the attributes listed.
   *
   * @param {object} options - The options to use.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object|Array} [options.equals] - An object with key-value
   *   attribute pairs to match or an array of such objects.
   * @param {string|Array} [options.has] - A string with an attribute name to
   *   match or an array of such strings.
   * @param {boolean} [options.count] - Set to `false` to find all documents
   *   that match a query or to `true` to give a count of documents.
   * @param {number} [options.limit] - Set to limit the number of documents
   *   to be returned from a query (min=1, max=1000).
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<object>} - Resolves to the matching documents:
   *   {documents: [...]}.
   */
  async find({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    count = false, limit, transport
  } = {}) {
    assertTransport(transport);
    _checkIndexing(hmac);
    if(limit !== undefined &&
      !(Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000)) {
      throw new Error('"limit" must be an integer >= 1 and <= 1000.');
    }

    const query = await this.indexHelper.buildQuery({hmac, equals, has});

    if(count) {
      query.count = true;
    }

    if(limit !== undefined) {
      query.limit = limit;
    }

    // find results
    const result = await transport.find({query});

    if(count === true) {
      return result;
    }

    // decrypt documents
    const {documents, hasMore} = result;
    const decryptedDocs = await Promise.all(documents.map(
      encryptedDoc => this._decrypt({encryptedDoc, keyAgreementKey})));
    const rval = {documents: decryptedDocs};
    if(hasMore !== undefined) {
      rval.hasMore = hasMore;
    }
    return rval;
  }

  /**
   * Gets the configuration for an EDV.
   *
   * @param {object} options - The options to use.
   * @param {string} [options.id] - The ID of the EDV config.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the EDV.
   */
  async getConfig({id, transport} = {}) {
    assertTransport(transport);
    return transport.getConfig({id});
  }

  /**
   * Updates an EDV configuration. The new configuration `sequence` must
   * be incremented by `1` over the previous configuration or the update will
   * fail.
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The new EDV config.
   * @param {object} options.transport - The Transport instance to use.
   *
   * @returns {Promise} - Resolves once the operation completes.
   */
  async updateConfig({config, transport} = {}) {
    assertTransport(transport);

    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"config.controller" must be a string.');
    }

    return transport.updateConfig({config});
  }

  /**
   * Generates a multibase encoded random 128-bit identifier for a document.
   *
   * @returns {Promise<string>} - Resolves to the identifier.
   */
  static async generateId() {
    // 128-bit random number, multibase encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    const buf = new Uint8Array(18);
    buf[0] = 0x00;
    buf[1] = 0x10;
    const random = new Uint8Array(buf.buffer, buf.byteOffset + 2, 16);
    await getRandomBytes(random);
    // multibase encoding for base58 starts with 'z'
    return 'z' + base58.encode(buf);
  }

  // helper to create default recipients
  _createDefaultRecipients(keyAgreementKey) {
    return keyAgreementKey ? [{
      header: {
        kid: keyAgreementKey.id,
        // only supported algorithm
        alg: 'ECDH-ES+A256KW'
      }
    }] : [];
  }

  // helper that decrypts an encrypted doc to include its (cleartext) content
  async _decrypt({encryptedDoc, keyAgreementKey}) {
    // validate `encryptedDoc`
    assert(encryptedDoc, 'encryptedDoc', 'object');
    assert(encryptedDoc.id, 'encryptedDoc.id', 'string');
    assert(encryptedDoc.jwe, 'encryptedDoc.jwe', 'object');

    // decrypt doc content
    const {cipher} = this;
    const {jwe} = encryptedDoc;
    const data = await cipher.decryptObject({jwe, keyAgreementKey});
    if(data === null) {
      throw new Error('Decryption failed.');
    }
    const {content, meta, stream} = data;
    // append decrypted content, meta, and stream
    const doc = {...encryptedDoc, content, meta};
    if(stream !== undefined) {
      doc.stream = stream;
    }
    return doc;
  }

  // helper that creates an encrypted doc using a doc's (clear) content,
  // meta, and stream ... and blinding any attributes for indexing
  async _encrypt({doc, recipients, keyResolver, hmac, update}) {
    const encrypted = {...doc};
    if(!encrypted.meta) {
      encrypted.meta = {};
    }

    /* Note: There is an assumption that EDVs will be ported in their
    entirety. If the contents of a single EDV document is to be copied to
    another EDV, it should receive a new EDV document ID on the target EDV. No
    EDV document with the same ID should live on more than one EDV unless those
    EDVs are intended to be mirrors of one another. This reduces
    synchronization issues to a sequence number instead of something more
    complicated involving digests and other synchronization complexities. */

    if(update) {
      if('sequence' in encrypted) {
        // Sequence is limited to MAX_SAFE_INTEGER - 1 to avoid unexpected
        // behavior when a client attempts to increment the sequence number.
        if(!Number.isSafeInteger(encrypted.sequence)) {
          throw new Error('"sequence" must be a non-negative safe integer.');
        }
        if(!(encrypted.sequence < Number.MAX_SAFE_INTEGER - 1)) {
          throw new Error('"sequence" is too large.');
        }
        encrypted.sequence++;
      } else {
        encrypted.sequence = 0;
      }
    } else {
      // sequence must be zero for new docs
      if('sequence' in encrypted && encrypted.sequence !== 0) {
        throw new Error(
          `Invalid "sequence" for a new document: ${encrypted.sequence}.`);
      }
      encrypted.sequence = 0;
    }

    const {cipher, indexHelper} = this;

    // include existing recipients
    if(encrypted.jwe && encrypted.jwe.recipients) {
      const prev = encrypted.jwe.recipients.slice();
      if(recipients) {
        // add any new recipients
        for(const recipient of recipients) {
          if(!_findRecipient(prev, recipient)) {
            prev.push(recipient);
          }
        }
      }
      recipients = prev;
    } else if(!(Array.isArray(recipients) && recipients.length > 0)) {
      throw new TypeError('"recipients" must be a non-empty array.');
    }

    // update indexed entries and jwe
    const {content, meta, stream} = doc;
    const obj = {content, meta};
    if(stream !== undefined) {
      obj.stream = stream;
    }
    const [indexed, jwe] = await Promise.all([
      hmac ? indexHelper.updateEntry({hmac, doc: encrypted}) :
        (doc.indexed || []),
      cipher.encryptObject({obj, recipients, keyResolver})
    ]);
    delete encrypted.content;
    delete encrypted.meta;
    if(encrypted.stream) {
      encrypted.stream = {
        sequence: encrypted.stream.sequence,
        chunks: encrypted.stream.chunks
      };
    }
    encrypted.indexed = indexed;
    encrypted.jwe = jwe;
    return encrypted;
  }

  // helper that creates or updates a stream of data associated with a doc
  async _updateStream({
    doc, stream, chunkSize = DEFAULT_CHUNK_SIZE,
    recipients, keyResolver, keyAgreementKey, hmac,
    transport
  }) {
    const {cipher} = this;
    const encryptStream = await cipher.createEncryptStream(
      {recipients, keyResolver, chunkSize});

    // // TODO: tee `stream` to digest stream as well
    // const [forDigest, forStorage] = stream.tee();
    // const digestPromise = forDigest.pipeTo(_createDigestStream());

    // pipe user supplied `stream` through the encrypt stream
    //const readable = forStorage.pipeThrough(encryptStream);
    const readable = stream.pipeThrough(encryptStream);
    const reader = readable.getReader();

    // continually read from encrypt stream and upload result
    const {id: docId} = doc;
    let value;
    let done;
    let chunks = 0;
    while(!done) {
      // read next encrypted chunk
      ({value, done} = await reader.read());
      if(!value) {
        break;
      }

      // create chunk
      chunks++;
      const chunk = {
        sequence: doc.sequence,
        ...value,
      };

      // TODO: in theory could do encryption and sending in parallel, they
      // are safely independent operations, consider this optimization
      await transport.storeChunk({docId, chunk});
    }

    // TODO: await digest from tee'd stream
    // const contentHash = await digestPromise();

    // write total number of chunks and digest of plaintext in doc update
    doc.stream = {
      sequence: doc.sequence,
      chunks,
      //contentHash
    };
    return EdvClientCore.prototype.update.call(this, {
      doc, recipients, keyResolver, keyAgreementKey, hmac, transport
    });
  }
}

function _checkIndexing(hmac) {
  if(!hmac) {
    throw Error('Indexing disabled; no HMAC specified.');
  }
}

function _findRecipient(recipients, recipient) {
  const {kid, alg} = recipient.header;
  return recipients.find(
    r => r.header.kid === kid && r.header.alg === alg);
}

function _createCachedKeyResolver(keyResolver) {
  const cache = {};
  return async ({id}) => {
    let key = cache[id];
    if(key) {
      return key;
    }
    key = await keyResolver({id});
    if(key) {
      cache[id] = key;
    }
    return key;
  };
}
