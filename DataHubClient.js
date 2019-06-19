/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import axios from 'axios';
import base64url from 'base64url-universal';
import crypto from './crypto.js';
import {Cipher} from './Cipher.js';
import {IndexHelper} from './IndexHelper.js';
import {TextEncoder, URL} from './util.js';
import {createAuthzHeader, createSignatureString} from 'http-signature-header';

const DEFAULT_HEADERS = {Accept: 'application/ld+json, application/json'};

export class DataHubClient {
  /**
   * Creates a new DataHub instance. The storage for the data hub must already
   * exist and have an HTTPS API at the given `baseUrl`.
   *
   * In order to support portability (e.g., the use of DID URLs to reference
   * documents), Secure Data Hub storage MUST expose an HTTPS API with a URL
   * structure that is partitioned like so:
   *
   * <authority>/<URI encoded data hub ID>/documents/<URI encoded document ID>
   *
   * @param {Object} options - The options to use.
   * @param {string} [id=undefined] the ID of the data hub, to be used as a
   *   root OCAP-LD authorization capability that must be a URL that refers to
   *   the data hub's root storage location; if not given, then a separate
   *   capability must be given to each method called on the client instance.
   * @param {Object} [kek=null] a default KEK API for wrapping content
   *   encryption keys.
   * @param {Object} [hmac=null] a default HMAC API for blinding indexable
   *   attributes.
   * @param {https.Agent} [httpsAgent=undefined] an optional HttpsAgent to
   *   use to handle HTTPS requests.
   *
   * @return {DataHubClient}.
   */
  constructor({id, kek, hmac, httpsAgent} = {}) {
    this.id = id;
    this.kek = kek;
    this.hmac = hmac;
    // TODO: support passing cipher `version`
    this.cipher = new Cipher();
    this.indexHelper = new IndexHelper();
    this.httpsAgent = httpsAgent;
  }

  /**
   * Ensures that future documents inserted or updated using this DataHub
   * instance will be indexed according to the given attribute, provided that
   * they contain that attribute.
   *
   * @param {Array|Object} attribute the attribute name or an array of
   *   attribute names.
   * @param {Boolean} [unique=false] `true` if attribute values should be
   *   considered unique, `false` if not.
   */
  ensureIndex({attribute, unique = false}) {
    return this.indexHelper.ensureIndex({attribute, unique});
  }

  /**
   * Encrypts and inserts a document into the data hub if it does not already
   * exist. If a document matching its ID already exists, a `DuplicateError` is
   * thrown.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.doc the document to insert.
   * @param {Object} [options.kek=this.kek] a Kek API for wrapping content
   *   encryption keys.
   * @param {Object} [options.hmac=this.hmac] an HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise<Object>} resolves to the inserted document.
   */
  async insert(
    {doc, kek = this.kek, hmac = this.hmac, capability, invocationSigner}) {
    _assertDocument(doc);

    let url = DataHubClient._getInvocationTarget({capability}) ||
      this._getDocUrl(doc.id);
    // trim document ID and trailing slash, if present, to post to root
    // collection
    const encodedDocId = encodeURIComponent(doc.id);
    if(url.endsWith(encodedDocId)) {
      url = url.substr(0, url.length - encodedDocId.length - 1);
    }
    const encrypted = await this._encrypt({doc, kek, hmac, update: false});
    try {
      // sign HTTP header
      const headers = await _signHeaders({
        url, method: 'post', headers: DEFAULT_HEADERS,
        json: encrypted, capability, invocationSigner,
        capabilityAction: capability && 'write'
      });
      // send request
      const {httpsAgent} = this;
      await axios.post(url, encrypted, {headers, httpsAgent});
      encrypted.content = doc.content;
      encrypted.meta = doc.meta;
      return encrypted;
    } catch(e) {
      const {response = {}} = e;
      if(response.status === 409) {
        const err = new Error('Duplicate error.');
        err.name = 'DuplicateError';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Encrypts and updates a document in the data hub. If the document does not
   * already exist, it is created.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.doc the document to insert.
   * @param {Object} [options.kek=this.kek] a Kek API for wrapping content
   *   encryption keys.
   * @param {Object} [options.hmac=this.hmac] an HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise<Object>} resolves to the updated document.
   */
  async update(
    {doc, kek = this.kek, hmac = this.hmac, capability, invocationSigner}) {
    _assertDocument(doc);

    const encrypted = await this._encrypt({doc, kek, hmac, update: true});
    const url = DataHubClient._getInvocationTarget({capability}) ||
      this._getDocUrl(encrypted.id);
    try {
      // sign HTTP header
      const headers = await _signHeaders({
        url, method: 'post', headers: DEFAULT_HEADERS,
        json: encrypted, capability, invocationSigner,
        capabilityAction: capability && 'write'
      });
      // send request
      const {httpsAgent} = this;
      await axios.post(url, encrypted, {headers, httpsAgent});
    } catch(e) {
      const {response = {}} = e;
      if(response.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
    encrypted.content = doc.content;
    encrypted.meta = doc.meta;
    return encrypted;
  }

  /**
   * Updates an index for the given document, without updating the document
   * contents itself. An index entry will be updated and sent to the data
   * hub storage system; its sequence number must match the document's current
   * sequence number or the update will be rejected with an
   * `InvalidStateError`. Recovery from this error requires fetching the
   * latest document and trying again.
   *
   * Note: If the index does not exist or the document does not have an
   * existing entry for the index, it will be added.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.doc the document to create or update an index for.
   * @param {Object} [options.hmac=this.hmac] an HMAC API for blinding
   *   indexable attributes.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise} resolves once the operation completes.
   */
  async updateIndex({doc, hmac = this.hmac, capability, invocationSigner}) {
    _assertDocument(doc);
    _checkIndexing(hmac);

    // TODO: is appending `/index` the right way to accomplish this?
    const url = (DataHubClient._getInvocationTarget({capability}) ||
      this._getDocUrl(doc.id)) + '/index';
    const entry = await this.indexHelper.createEntry({hmac, doc});
    try {
      // sign HTTP header
      const headers = await _signHeaders({
        url, method: 'post', headers: DEFAULT_HEADERS,
        json: entry, capability, invocationSigner,
        capabilityAction: capability && 'write'
      });
      // send request
      const {httpsAgent} = this;
      await axios.post(url, entry, {headers, httpsAgent});
    } catch(e) {
      const {response = {}} = e;
      if(response.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
    return;
  }

  /**
   * Deletes a document from the data hub.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id the ID of the document to delete.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise<Boolean>} resolves to `true` if the document was deleted
   *   and `false` if it did not exist.
   */
  async delete({id, capability, invocationSigner}) {
    _assertString(id, '"id" must be a string.');

    const url = DataHubClient._getInvocationTarget({capability}) ||
      this._getDocUrl(id);
    try {
      // sign HTTP header
      const headers = await _signHeaders({
        url, method: 'delete', headers: DEFAULT_HEADERS,
        capability, invocationSigner,
        // TODO: should `delete` be used here as a separate action?
        capabilityAction: capability && 'write'
      });
      // send request
      const {httpsAgent} = this;
      await axios.delete(url, {headers, httpsAgent});
    } catch(e) {
      const {response = {}} = e;
      if(response.status === 404) {
        return false;
      }
      throw e;
    }
    return true;
  }

  /**
   * Gets a document from data hub storage by its ID.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id the ID of the document to get.
   * @param {Object} [options.kek=this.kek] a Kek API for wrapping content
   *   encryption keys.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise<Object>} resolves to the document.
   */
  async get({id, kek = this.kek, capability, invocationSigner}) {
    _assertString(id, '"id" must be a string.');

    const url = DataHubClient._getInvocationTarget({capability}) ||
      this._getDocUrl(id);
    let response;
    try {
      // sign HTTP header
      const headers = await _signHeaders({
        url, method: 'get', headers: DEFAULT_HEADERS,
        capability, invocationSigner,
        capabilityAction: capability && 'read'
      });
      // send request
      const {httpsAgent} = this;
      response = await axios.get(url, {headers, httpsAgent});
    } catch(e) {
      response = e.response || {};
      if(response.status === 404) {
        const err = new Error('Document not found.');
        err.name = 'NotFoundError';
        throw err;
      }
      throw e;
    }
    return this._decrypt({encryptedDoc: response.data, kek});
  }

  /**
   * Finds documents based on their attributes. Currently, matching can be
   * performed using an `equals` or a `has` filter (but not both at once).
   *
   * The `equals` filter is an object with key-value attribute pairs. Any
   * document that matches *all* key-value attribute pairs will be returned. If
   * equals is an array, it may contain multiple such filters -- whereby the
   * results will be all documents that matched any one of the filters.
   *
   * The `has` filter is a string representing the attribute name or an
   * array of such strings. If an array is used, then the results will only
   * contain documents that possess *all* of the attributes listed.
   *
   * @param {Object} options - The options to use.
   * @param {Object} [options.kek=this.kek] a Kek API for wrapping content
   *   encryption keys.
   * @param {Object} [options.hmac=this.hmac] an HMAC API for blinding
   *   indexable attributes.
   * @param {Object|Array} [options.equals] - An object with key-value
   *   attribute pairs to match or an array of such objects.
   * @param {String|Array} [options.has] - A string with an attribute name to
   *   match or an array of such strings.
   * @param {string} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of this operation.
   * @param {Object} options.invocationSigner - An API with an
   *   `id` property, a `type` property, and a `sign` function for signing
   *   a capability invocation.
   *
   * @return {Promise<Array>} resolves to the matching documents.
   */
  async find({
    kek = this.kek, hmac = this.hmac, equals, has,
    capability, invocationSigner
  }) {
    _checkIndexing(hmac);
    const query = await this.indexHelper.buildQuery({hmac, equals, has});

    // get results and decrypt them
    // TODO: is appending `query` the right way to do this?
    const url = (DataHubClient._getInvocationTarget({capability}) || this.id) +
      '/query';
    // sign HTTP header
    const headers = await _signHeaders({
      url, method: 'post', headers: DEFAULT_HEADERS,
      json: query, capability, invocationSigner,
      capabilityAction: capability && 'read'
    });
    // send request
    const {httpsAgent} = this;
    const response = await axios.post(url, query, {headers, httpsAgent});
    const docs = response.data;
    return Promise.all(docs.map(
      encryptedDoc => this._decrypt({encryptedDoc, kek})));
  }

  /**
   * Creates a new data hub using the given configuration.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.url - The url to post the configuration to.
   * @param {string} options.config - The data hub's configuration.
   *
   * @return {Promise<Object>} resolves to the configuration for the newly
   *   created data hub.
   */
  static async createDataHub({url = '/data-hubs', config}) {
    // TODO: add `capability` and `invocationSigner` support?
    // TODO: more robustly validate `config` (`kek`, `hmac`, if present, etc.)
    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"config.controller" must be a string.');
    }
    const response = await axios.post(url, config, {headers: DEFAULT_HEADERS});
    return response.data;
  }

  /**
   * Gets the data hub config for the given controller and reference ID.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.url - The url to query.
   * @param {string} options.controller - The ID of the controller.
   * @param {string} options.referenceId - A controller-unique reference ID.
   *
   * @return {Promise<Object>} resolves to the data hub configuration
   *   containing the given controller and reference ID.
   */
  static async findConfig({url = '/data-hubs', controller, referenceId}) {
    // TODO: add `capability` and `invocationSigner` support?
    const results = await this.findConfigs({url, controller, referenceId});
    return results[0] || null;
  }

  /**
   * Get all data hub configurations matching a query.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.url - The url to query.
   * @param {string} options.controller - The data hub's controller.
   * @param {string} [options.referenceId] - A controller-unique reference ID.
   * @param {string} [options.after] - A data hub's ID.
   * @param {number} [options.limit] - How many data hub configs to return.
   *
   * @return {Promise<Array>} resolves to the matching data hub configurations.
   */
  static async findConfigs(
    {url = '/data-hubs', controller, referenceId, after, limit}) {
    // TODO: add `capability` and `invocationSigner` support?
    const response = await axios.get(url, {
      params: {controller, referenceId, after, limit},
      headers: DEFAULT_HEADERS
    });
    return response.data;
  }

  /**
   * Gets the configuration for a data hub.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id the data hub's ID.
   *
   * @return {Promise<Object>} resolves to the configuration for the data hub.
   */
  static async getConfig({id}) {
    // TODO: add `capability` and `invocationSigner` support?
    const response = await axios.get(id, {headers: DEFAULT_HEADERS});
    return response.data;
  }

  /**
   * Updates a data hub configuration via a JSON patch as specified by:
   * [json patch format]{@link https://tools.ietf.org/html/rfc6902}
   * [we use fast-json]{@link https://www.npmjs.com/package/fast-json-patch}
   * to apply json patches.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id - The data hub's ID.
   * @param {Number} options.sequence - The data hub config's sequence number.
   * @param {Array<Object>} options.patch - A JSON patch per RFC6902.
   *
   * @return {Promise<Void>} resolves once the operation completes.
   */
  static async updateConfig({id, sequence, patch}) {
    // TODO: add `capability` and `invocationSigner` support?
    const patchHeaders = {'Content-Type': 'application/json-patch+json'};
    await axios.patch(id, {sequence, patch}, {
      headers: {...DEFAULT_HEADERS, patchHeaders}
    });
  }

  /**
   * Sets the status of a data hub.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id - A data hub ID.
   * @param {string} options.status - Either `active` or `deleted`.
   *
   * @return {Promise<Void>} resolves once the operation completes.
   */
  static async setStatus({id, status}) {
    // TODO: add `capability` and `invocationSigner` support?
    // FIXME: add ability to disable data hub access or to revoke all ocaps
    // that were delegated prior to a date of X.
    await axios.post(`${id}/status`, {status}, {headers: DEFAULT_HEADERS});
  }

  // helper that decrypts an encrypted doc to include its (cleartext) content
  async _decrypt({encryptedDoc, kek}) {
    // validate `encryptedDoc`
    _assertObject(encryptedDoc, 'Encrypted document must be an object.');
    _assertString(
      encryptedDoc.id, 'Encrypted document "id" must be a string".');
    _assertObject(encryptedDoc, 'Encrypted document "jwe" must be an object.');

    // decrypt doc content
    const {cipher} = this;
    const {jwe} = encryptedDoc;
    const data = await cipher.decryptObject({jwe, kek});
    if(data === null) {
      throw new Error('Decryption failed.');
    }
    const {content, meta} = data;
    // append decrypted content and meta
    return {...encryptedDoc, content, meta};
  }

  // helper that creates an encrypted doc using a doc's (clear) content & meta
  // and blinding any attributes for indexing
  async _encrypt({doc, kek, hmac, update}) {
    const encrypted = {...doc};
    if(!encrypted.meta) {
      encrypted.meta = {};
    }

    /* Note: There is an assumption that data hubs will be ported in their
    entirety. If the contents of a single data hub document is to be copied to
    another data hub, it should receive a new data hub document ID on the
    target data hub system. No data hub document with the same ID should live
    on more than one data hub unless those data hubs are intended to be mirrors
    of one another. This reduces synchronization issues to a sequence number
    instead of something more complicated involving digests and other
    synchronization complexities. */

    if(update) {
      if('sequence' in encrypted) {
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

    // update existing recipients
    let recipients;
    if(encrypted.jwe && encrypted.jwe.recipients) {
      if(!Array.isArray(encrypted.jwe.recipients)) {
        throw new TypeError('Invalid existing "recipients" in JWE.');
      }
      recipients = encrypted.jwe.recipients.slice();
      const recipient = recipients.find(
        r => r.header.kid === kek.id && r.header.alg === kek.algorithm);
      if(!recipient) {
        recipients.push({
          header: {
            alg: kek.algorithm,
            kid: kek.id
          }
        });
      }
    }

    // update indexed entries and jwe
    const {content, meta} = doc;
    const [indexed, jwe] = await Promise.all([
      hmac ? indexHelper.updateEntry({hmac, doc: encrypted}) :
        (doc.indexed || []),
      cipher.encryptObject({obj: {content, meta}, kek, recipients})
    ]);

    delete encrypted.content;
    delete encrypted.meta;
    encrypted.indexed = indexed;
    encrypted.jwe = jwe;
    return encrypted;
  }

  // helper that gets a document URL from a document ID
  _getDocUrl(id) {
    return `${this.id}/documents/${encodeURIComponent(id)}`;
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

async function _signHeaders({
  url, method, headers, json, capability = url, invocationSigner,
  capabilityAction
}) {
  // lower case keys to ensure any updates apply properly
  const signed = _lowerCaseObjectKeys(headers);

  if(!('host' in signed)) {
    signed.host = new URL(url).host;
  }
  signed['authorization-capability'] = capability;

  if(json && !('digest' in signed)) {
    // compute digest for json
    const data = new TextEncoder().encode(JSON.stringify(json));
    const digest = await crypto.subtle.digest({name: 'SHA-256'}, data);
    // format as multihash digest
    // sha2-256: 0x12, length: 32 (0x20), digest value
    const mh = new Uint8Array(34);
    mh[0] = 0x12;
    mh[1] = 0x20;
    mh.set(digest, 2);
    // encode multihash using multibase, base64url: `u`
    signed.digest = `multihash=u${base64url.encode(mh)}`;
    if(!('content-type' in signed)) {
      signed['content-type'] = 'application/json';
    }
  }

  // TODO: allow for parameter for expiration window
  // set expiration 10 minutes into the future
  const created = Date.now();
  const expires = new Date(created + 600000).getTime();

  // FIXME: remove me
  if(!invocationSigner) {
    invocationSigner = {
      id: 'urn:example-key:123',
      sign() {
        return new Uint8Array([0x01, 0x02, 0x03]);
      }
    };
  }

  // sign header
  const {id: keyId} = invocationSigner;
  const includeHeaders = [
    '(key-id)', '(created)', '(expires)', '(request-target)',
    'host', 'authorization-capability'];
  if(capabilityAction) {
    includeHeaders.push('authorization-capability-action');
    signed['authorization-capability-action'] = capabilityAction;
  }
  if(json) {
    includeHeaders.push('content-type');
    includeHeaders.push('digest');
  }
  const plaintext = createSignatureString({
    includeHeaders,
    requestOptions: {url, method, headers: signed, created, expires, keyId}
  });
  const data = new TextEncoder().encode(plaintext);
  const signature = base64url.encode(await invocationSigner.sign({data}));

  signed.authorization = createAuthzHeader({
    includeHeaders,
    keyId,
    signature
  });

  if(typeof self !== 'undefined') {
    // remove `host` header as it will be automatically set by the browser
    delete signed.host;
  }

  return signed;
}

function _lowerCaseObjectKeys(obj) {
  const newObject = {};
  for(const k of Object.keys(obj)) {
    newObject[k.toLowerCase()] = obj[k];
  }
  return newObject;
}

function _checkIndexing(hmac) {
  if(!hmac) {
    throw Error('Indexing disabled; no HMAC specified.');
  }
}

function _assertDocument(doc) {
  _assertObject(doc, '"doc" must be an object.');
  const {id, content, meta = {}} = doc;
  _assertString(id, '"doc.id" must be a string.');
  _assertObject(content, '"doc.content" must be an object.');
  _assertObject(meta, '"doc.meta" must be an object.');
}

function _assertObject(x, msg) {
  if(!(x && typeof x === 'object' && !Array.isArray(x))) {
    throw new TypeError(msg);
  }
}

function _assertString(x, msg) {
  if(typeof x !== 'string') {
    throw new TypeError(msg);
  }
}
