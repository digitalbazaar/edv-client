/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {httpClient, DEFAULT_HEADERS} from '@digitalbazaar/http-client';
import * as base58 from 'base58-universal';
import {Cipher} from '@digitalbazaar/minimal-cipher';
import {IndexHelper} from './IndexHelper.js';
import {signCapabilityInvocation} from 'http-signature-zcap-invoke';
import {ReadableStream, getRandomBytes} from './util.js';

// 1 MiB = 1048576
const DEFAULT_CHUNK_SIZE = 1048576;

export class EdvClient {
  /**
   * An object that can make HTTPS requests such as node's https.Agent or ky.
   *
   * @typedef {object} httpsAgent
   * @see https://nodejs.org/api/https.html#https_class_https_agent
   *
   * Creates a new EdvClient instance. An EDV is an Encrypted Data Vault.
   * In order to support portability (e.g., the use of DID URLs to reference
   * documents), Encrypted Data Vault storage MUST expose an HTTPS API with
   * a URL structure that is partitioned like so:
   *
   * <edvID>/documents/<documentID>
   *
   * The <edvID> must take the form:
   *
   * <authority>/edvs/<random multibase base58 encoded ID>
   *
   * @param {object} options - The options to use.
   * @param {string} [options.id=undefined] - The ID of the EDV that must be a
   *   URL that refers to the EDV's root storage location; if not given, then
   *   a separate capability must be given to each method called on the client
   *   instance.
   * @param {Function} [options.keyResolver=this.keyResolver] - A default
   *   function that returns a Promise that resolves a key ID to a DH public
   *   key.
   * @param {object} [options.keyAgreementKey=null] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   * @param {object} [options.hmac=null] - A default HMAC API for blinding
   *   indexable attributes.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   HttpsAgent to use to handle HTTPS requests.
   * @param {object} [options.defaultHeaders=undefined] - An optional
   *   defaultHeaders object to use with HTTP requests.
   *
   * @returns {EdvClient}.
   */
  constructor({
    id, keyResolver, keyAgreementKey, hmac, httpsAgent, defaultHeaders
  } = {}) {
    this.id = id;
    this.keyResolver = keyResolver;
    this.keyAgreementKey = keyAgreementKey;
    this.hmac = hmac;
    // TODO: support passing cipher `version`
    this.cipher = new Cipher();
    this.indexHelper = new IndexHelper();
    this.httpsAgent = httpsAgent;
    this.defaultHeaders = {...DEFAULT_HEADERS, ...defaultHeaders};
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
   *
   * @returns {undefined}

   */
  ensureIndex({attribute, unique = false}) {
    return this.indexHelper.ensureIndex({attribute, unique});
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
   * @param {object} [options.keyAgreementKey=null] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} - Resolves to the inserted document.
   */
  async insert({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac,
    capability, invocationSigner
  }) {
    _assertDocument(doc);
    _assertInvocationSigner(invocationSigner);

    doc = {...doc};
    // auto generate document ID
    if(doc.id === undefined) {
      doc.id = await EdvClient.generateId();
    }

    let url = this._getDocUrl(doc.id, capability);
    // trim document ID and trailing slash, if present, to post to root
    // collection
    if(url.endsWith(doc.id)) {
      url = url.substr(0, url.length - doc.id.length - 1);
    }
    // track stream capability differently because the default is different;
    // generally speaking, only the root capability will work cleanly with
    // an `insert` call, calls that don't use the default, root zcap are
    // expected to be done via `update` not `insert`
    let streamCapability = capability;
    if(!capability) {
      capability = `${this.id}/zcaps/documents`;
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
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: this.defaultHeaders,
        json: encrypted, capability, invocationSigner,
        capabilityAction: 'write'
      });

      // send request
      const {httpsAgent: agent} = this;
      await httpClient.post(url, {agent, json: encrypted, headers});

      encrypted.content = doc.content;
      encrypted.meta = doc.meta;
      if(doc.stream !== undefined) {
        encrypted.stream = doc.stream;
      }
      let result = encrypted;

      // if a `stream` was given, update it
      if(stream) {
        if(!streamCapability) {
          // root stream capability is based off of document, not `/documents`
          streamCapability = this._getRootDocCapability(encrypted.id);
        }
        result = await this._updateStream({
          doc: encrypted, stream, chunkSize,
          recipients: recipients.slice(), keyResolver,
          keyAgreementKey, capability: streamCapability, invocationSigner
        });
      }
      return result;
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Duplicate error.');
        err.name = 'DuplicateError';
        throw err;
      }
      throw e;
    }
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
   * @param {object} [options.keyAgreementKey=null] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} - Resolves to the updated document.
   */
  async update({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey,
    hmac = this.hmac, capability, invocationSigner
  }) {
    _assertDocument(doc);
    _assertDocId(doc.id);
    _assertInvocationSigner(invocationSigner);

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
    const url = this._getDocUrl(encrypted.id, capability);
    if(!capability) {
      capability = this._getRootDocCapability(encrypted.id);
    }
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: this.defaultHeaders,
        json: encrypted, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      const {httpsAgent: agent} = this;
      await httpClient.post(url, {agent, json: encrypted, headers});
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
    encrypted.content = doc.content;
    encrypted.meta = doc.meta;
    if(doc.stream !== undefined) {
      encrypted.stream = doc.stream;
    }
    let result = encrypted;

    // if a `stream` was given, update it
    if(stream) {
      result = await this._updateStream({
        doc: encrypted, stream, chunkSize,
        recipients: recipients.slice(), keyResolver,
        keyAgreementKey, hmac, capability, invocationSigner
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
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise} - Resolves once the operation completes.
   */
  async updateIndex({doc, hmac = this.hmac, capability, invocationSigner}) {
    _assertDocument(doc);
    _assertDocId(doc.id);
    _assertInvocationSigner(invocationSigner);
    _checkIndexing(hmac);

    const url = this._getDocUrl(doc.id, capability) + '/index';
    if(!capability) {
      capability = this._getRootDocCapability(doc.id) + '/index';
    }
    const entry = await this.indexHelper.createEntry({hmac, doc});
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: this.defaultHeaders,
        json: entry, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      const {httpsAgent: agent} = this;
      await httpClient.post(url, {headers, json: entry, agent});
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
    return;
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
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {Function} [options.keyResolver=this.keyResolver] - A function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey=null] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   *
   * @returns {Promise<boolean>} - Resolves to `true` if the document was
   *   deleted.
   */
  async delete({
    doc, recipients = [], capability, invocationSigner,
    keyResolver = this.keyResolver, keyAgreementKey = this.keyAgreementKey}) {
    _assertDocument(doc);
    _assertDocId(doc.id);
    _assertInvocationSigner(invocationSigner);

    // clear document, preserving only its `id`, `sequence`, and previous
    // encrypted data (to be used to preserve recipients)
    const {id, sequence, jwe} = doc;
    doc = {id, sequence, jwe, content: {}, meta: {deleted: true}};

    await this.update({
      doc, recipients, keyResolver, keyAgreementKey, capability,
      invocationSigner
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
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} - Resolves to the document.
   */
  async get({
    id, keyAgreementKey = this.keyAgreementKey, capability, invocationSigner
  }) {
    _assert(id, 'id', 'string');
    _assertInvocationSigner(invocationSigner);

    const url = this._getDocUrl(id, capability);
    if(!capability) {
      capability = this._getRootDocCapability(id);
    }
    let response;
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'get', headers: this.defaultHeaders,
        capability, invocationSigner,
        capabilityAction: 'read'
      });
      // send request
      const {httpsAgent: agent} = this;
      response = await httpClient.get(url, {headers, agent});
    } catch(e) {
      if(e.status === 404) {
        const err = new Error('Document not found.');
        err.name = 'NotFoundError';
        throw err;
      }
      throw e;
    }
    return this._decrypt({encryptedDoc: response.data, keyAgreementKey});
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
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<ReadableStream>} - Resolves to a `ReadableStream` to read
   *   the chunked data from.
   */
  async getStream({
    doc, keyAgreementKey = this.keyAgreementKey, capability, invocationSigner
  }) {
    _assert(doc, 'doc', 'object');
    _assertDocId(doc.id);
    _assert(doc.stream, 'doc.stream', 'object');
    _assertInvocationSigner(invocationSigner);

    const self = this;
    const {cipher} = this;
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
        const chunk = await self._getChunk(
          {doc, chunkIndex, capability, invocationSigner});
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
   * @param {string} [options.capability] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<number>} - Resolves to the number of matching documents.
  */
  async count({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    capability, invocationSigner
  }) {
    const {count} = await this.find({
      keyAgreementKey, hmac, equals, has,
      capability, invocationSigner, count: true
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
   * @param {string} [options.capability] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {boolean} [options.count] - Set to `false` to find all documents
   *   that match a query or to `true` to give a count of documents.
   *
   * @returns {Promise<object>} - Resolves to the matching documents:
   *   {documents: [...]}.
   */
  async find({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    capability, invocationSigner, count = false
  }) {
    _assertInvocationSigner(invocationSigner);
    _checkIndexing(hmac);
    const query = await this.indexHelper.buildQuery({hmac, equals, has});

    if(count) {
      query.count = true;
    }
    // get results and decrypt them
    let url = EdvClient._getInvocationTarget({capability}) ||
      `${this.id}/query`;
    // capability with a target of `/documents` can be used to query
    if(url.endsWith('/documents')) {
      url = url.substr(0, url.length - 10) + '/query';
    }
    if(!capability) {
      capability = `${this.id}/zcaps/query`;
    }
    // sign HTTP header
    const headers = await signCapabilityInvocation({
      url, method: 'post', headers: this.defaultHeaders,
      json: query, capability, invocationSigner,
      capabilityAction: 'read'
    });
    // send request
    const {httpsAgent: agent} = this;
    const response = await httpClient.post(url, {headers, json: query, agent});
    if(count === true) {
      return response.data;
    }
    const {data: {documents}} = response;

    const decryptedDocs = await Promise.all(documents.map(
      encryptedDoc => this._decrypt({encryptedDoc, keyAgreementKey})));

    return {documents: decryptedDocs};
  }

  /**
   * Creates a new EDV using the given configuration.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to post the configuration to.
   * @param {string} options.config - The EDV's configuration.
   * @param {string|object} [options.capability] - A zCap authorizing the
   *   creation of an EDV. Defaults to a root capability derived from
   *   the `url` parameter.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the newly
   *   created EDV.
   */
  static async createEdv({
    url = '/edvs', config, httpsAgent, headers, invocationSigner, capability
  }) {
    _assert(url, 'url', 'string');
    url = _createAbsoluteUrl(url);

    // TODO: more robustly validate `config` (`keyAgreementKey`,
    // `hmac`, if present, etc.)
    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"config.controller" must be a string.');
    }

    // no invocationSigner was provided, submit the request without a zCap
    if(!invocationSigner) {
      const response = await httpClient.post(url, {
        headers: {...DEFAULT_HEADERS, ...headers},
        json: config,
        agent: httpsAgent
      });
      return response.data;
    }

    _assertInvocationSigner(invocationSigner);

    if(!capability) {
      capability = `${url}/zcaps/configs`;
    }

    // sign HTTP header
    const signedHeaders = await signCapabilityInvocation({
      url,
      method: 'post',
      headers: {...DEFAULT_HEADERS, ...headers},
      capability,
      invocationSigner,
      capabilityAction: 'write',
      json: config,
    });
    const response = await httpClient.post(url, {
      headers: signedHeaders, json: config, agent: httpsAgent
    });
    return response.data;
  }

  /**
   * Gets the EDV config for the given controller and reference ID.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to query.
   * @param {string} options.controller - The ID of the controller.
   * @param {string} options.referenceId - A controller-unique reference ID.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {string|object} [options.capability] - A zCap authorizing read
   *   access to an EDV config. Defaults to a root capability derived from
   *   the `url` parameter.
   *
   * @returns {Promise<object>} - Resolves to the EDV configuration
   *   containing the given controller and reference ID.
   */
  static async findConfig({
    url = '/edvs', controller, referenceId, httpsAgent, invocationSigner,
    headers, capability
  }) {
    const results = await this.findConfigs({
      url, controller, referenceId, httpsAgent, headers, invocationSigner,
      capability
    });
    return results[0] || null;
  }

  /**
   * Get all EDV configurations matching a query.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to query.
   * @param {string} options.controller - The EDV's controller.
   * @param {string} [options.referenceId] - A controller-unique reference ID.
   * @param {string} [options.after] - An EDV's ID.
   * @param {number} [options.limit] - How many EDV configs to return.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {string|object} [options.capability] - A zCap authorizing read
   *   access to an EDV config. Defaults to a root capability derived from
   *   the `url` parameter.
   *
   * @returns {Promise<Array>} - Resolves to the matching EDV configurations.
   */
  static async findConfigs({
    url = '/edvs', controller, referenceId, after, limit, httpsAgent,
    headers, capability, invocationSigner
  }) {
    url = _createAbsoluteUrl(url);
    // no invocationSigner was provided, submit the request without a zCap

    if(!invocationSigner) {
      const searchParams = {controller, referenceId, after, limit};
      // eliminate undefined properties, otherwise http-client will encode
      // undefined properties as the string literal 'undefined'
      Object.keys(searchParams).forEach(
        key => searchParams[key] === undefined && delete searchParams[key]);

      const response = await httpClient.get(url, {
        searchParams,
        headers: {...DEFAULT_HEADERS, ...headers},
        agent: httpsAgent
      });
      return response.data;
    }

    _assertInvocationSigner(invocationSigner);

    if(!capability) {
      capability = `${url}/zcaps/configs`;
    }

    // sign HTTP header
    const params = new URLSearchParams(Object.fromEntries(
      Object.entries({controller, referenceId, after, limit})
        // eslint-disable-next-line no-unused-vars
        .filter(([k, v]) => v !== undefined)));
    url += `?${params}`;
    const signedHeaders = await signCapabilityInvocation({
      url,
      method: 'get',
      headers: {...DEFAULT_HEADERS, ...headers},
      capability,
      invocationSigner,
      capabilityAction: 'read',
    });

    const response = await httpClient.get(url, {
      headers: signedHeaders,
      agent: httpsAgent
    });
    return response.data;
  }

  /**
   * Gets the configuration for an EDV.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The EDV's ID.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the EDV.
   */
  static async getConfig({id, httpsAgent, headers}) {
    // TODO: add `capability` and `invocationSigner` support?
    const response = await httpClient.get(
      id, {headers: {...DEFAULT_HEADERS, ...headers}, agent: httpsAgent});
    return response.data;
  }

  /**
   * Updates an EDV configuration. The new configuration `sequence` must
   * be incremented by `1` over the previous configuration or the update will
   * fail.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The EDV's ID.
   * @param {object} options.config - The new EDV config.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   *
   * @returns {Promise<void>} - Resolves once the operation completes.
   */
  static async updateConfig({id, config, httpsAgent, headers}) {
    // TODO: add `capability` and `invocationSigner` support?
    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"config.controller" must be a string.');
    }
    await httpClient.post(id, {
      headers: {...DEFAULT_HEADERS, ...headers},
      json: config,
      agent: httpsAgent
    });
  }

  /**
   * Sets the status of an EDV.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - A EDV ID.
   * @param {string} options.status - Either `active` or `deleted`.
   * @param {httpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   *
   * @returns {Promise<void>} - Resolves once the operation completes.
   */
  static async setStatus({id, status, httpsAgent, headers}) {
    // TODO: add `capability` and `invocationSigner` support?
    // FIXME: add ability to disable EDV access or to revoke all ocaps
    // that were delegated prior to a date of X.
    await httpClient.post(
      `${id}/status`, {
        headers: {...DEFAULT_HEADERS, ...headers},
        json: {status},
        agent: httpsAgent
      });
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

  /**
   * Store a capability revocation.
   *
   * @param {object} options - The options to use.
   * @param {object} options.capabilityToRevoke - The capability to revoke.
   * @param {string} [options.capability=undefined] - The zcap authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} Resolves once the operation completes.
   */
  async revokeCapability({
    capabilityToRevoke, capability, invocationSigner
  } = {}) {
    _assert(capabilityToRevoke, 'capabilityToRevoke', 'object');
    _assertInvocationSigner(invocationSigner);

    const url = EdvClient._getInvocationTarget({capability}) ||
      `${this.id}/revocations`;
    if(!capability) {
      capability = `${this.id}/zcaps/revocations`;
    }
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: this.defaultHeaders,
        json: capabilityToRevoke, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      const {httpsAgent: agent} = this;
      await httpClient.post(url, {headers, json: capabilityToRevoke, agent});
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Duplicate error.');
        err.name = 'DuplicateError';
        throw err;
      }
      throw e;
    }
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
    _assert(encryptedDoc, 'encryptedDoc', 'object');
    _assert(encryptedDoc.id, 'encryptedDoc.id', 'string');
    _assert(encryptedDoc.jwe, 'encryptedDoc.jwe', 'object');

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
        if(!Number.isSafeInteger(encrypted.sequence) ||
          !(encrypted.sequence < Number.MAX_SAFE_INTEGER - 1)) {
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

  // helper that gets a document URL from a document ID
  _getDocUrl(id, capability) {
    if(capability && !this.id) {
      const target = EdvClient._getInvocationTarget({capability});
      // target is the entire documents collection
      if(target.endsWith('/documents')) {
        return `${target}/${id}`;
      }
      return target;
    }
    return `${this.id}/documents/${id}`;
  }

  // helper that gets a root zcap document URL from a document ID
  _getRootDocCapability(id) {
    return `${this.id}/zcaps/documents/${id}`;
  }

  // helper that creates or updates a stream of data associated with a doc
  async _updateStream({
    doc, stream, chunkSize = DEFAULT_CHUNK_SIZE,
    recipients, keyResolver, keyAgreementKey, hmac,
    capability, invocationSigner
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
      await this._storeChunk({doc, chunk, capability, invocationSigner});
    }

    // TODO: await digest from tee'd stream
    // const contentHash = await digestPromise();

    // write total number of chunks and digest of plaintext in doc update
    doc.stream = {
      sequence: doc.sequence,
      chunks,
      //contentHash
    };
    return this.update({
      doc, recipients, keyResolver, keyAgreementKey, hmac,
      capability, invocationSigner
    });
  }

  async _storeChunk({doc, chunk, capability, invocationSigner}) {
    let url = this._getDocUrl(doc.id, capability);
    if(!capability) {
      capability = this._getRootDocCapability(doc.id);
    }
    // append `/chunks/<chunkIndex>`
    const {index} = chunk;
    url += `/chunks/${index}`;
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: this.defaultHeaders,
        json: chunk, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      const {httpsAgent: agent} = this;
      await httpClient.post(url, {headers, json: chunk, agent});
    } catch(e) {
      const {response = {}} = e;
      if(response.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
  }

  async _getChunk({doc, chunkIndex, capability, invocationSigner}) {
    let url = this._getDocUrl(doc.id, capability);
    if(!capability) {
      capability = this._getRootDocCapability(doc.id);
    }
    // append `/chunks/<chunkIndex>`
    url += `/chunks/${chunkIndex}`;
    let response;
    try {
      // sign HTTP header
      const headers = await signCapabilityInvocation({
        url, method: 'get', headers: this.defaultHeaders,
        capability, invocationSigner,
        capabilityAction: 'read'
      });
      // send request
      const {httpsAgent: agent} = this;
      response = await httpClient.get(url, {headers, agent});
    } catch(e) {
      response = e.response || {};
      if(response.status === 404) {
        const err = new Error('Document chunk not found.');
        err.name = 'NotFoundError';
        throw err;
      }
      throw e;
    }
    // TODO: validate response.data

    // return chunk
    return response.data;
  }

  static _getInvocationTarget({capability}) {
    // TODO: use ocapld.getTarget() utility function?
    if(!(capability && typeof capability === 'object')) {
      // no capability provided
      return null;
    }
    let result;
    const {invocationTarget} = capability;
    if(invocationTarget && typeof invocationTarget === 'object') {
      result = invocationTarget.id;
    } else {
      result = invocationTarget;
    }
    if(typeof result !== 'string') {
      throw new TypeError('"capability.invocationTarget" is invalid.');
    }
    return result;
  }
}

function _checkIndexing(hmac) {
  if(!hmac) {
    throw Error('Indexing disabled; no HMAC specified.');
  }
}

function _assertDocument(doc) {
  _assert(doc, 'doc', 'object');
  const {id, content, meta = {}, stream} = doc;
  if(id !== undefined) {
    _assertDocId(doc.id);
  }
  _assert(content, 'content', 'object');
  _assert(meta, 'meta', 'object');
  if(stream !== undefined) {
    _assert(stream, 'stream', 'object');
  }
}

function _assertDocId(id) {
  try {
    // verify ID is multibase base58-encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multibase encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid document ID.');
    }
  } catch(e) {
    throw new Error(`Document ID "${id}" must be a multibase, base58-encoded ` +
      'array of 16 random bytes.');
  }
}

function _assertInvocationSigner(invocationSigner) {
  _assert(invocationSigner, 'invocationSigner', 'object');
  const {id, sign} = invocationSigner;
  _assert(id, 'invocationSigner.id', 'string');
  _assert(sign, 'invocationSigner.sign', 'function');
}

function _assert(variable, name, types) {
  if(!Array.isArray(types)) {
    types = [types];
  }
  const type = variable instanceof Uint8Array ? 'Uint8Array' : typeof variable;
  if(!types.includes(type) ||
    // an object must not falsey nor an array
    (type === 'object' && (!variable || Array.isArray(variable)))) {
    throw new TypeError(
      `"${name}" must be ${types.length === 1 ? 'a' : 'one of'} ` +
      `${types.join(', ')}.`);
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

function _createAbsoluteUrl(url) {
  if(url.includes(':')) {
    return url;
  }
  // eslint-disable-next-line no-undef
  if(typeof self !== 'undefined') {
    // eslint-disable-next-line no-undef
    return `${self.location.origin}${url}`;
  }
  throw new Error('"url" must be an absolute URL.');
}
