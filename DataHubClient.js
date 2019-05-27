/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import axios from 'axios';
import {Cipher} from './Cipher.js';
import {IndexHelper} from './IndexHelper.js';

export class DataHubClient {
  /**
   * Creates a new DataHub instance. The storage for the data hub must already
   * exist and have an HTTPS API at the given `baseUrl`.
   *
   * @param {String} [baseUrl='/data-hubs'] an endpoint for data hub storage.
   * @param {Object} config the data hub's configuration document.
   * @param {kek} kek a KEK API for wrapping content encryption keys.
   * @param {hmac} hmac an HMAC API for blinding indexable attributes.
   * @param {https.Agent} [httpsAgent=undefined] an optional HttpsAgent to
   *   use to handle HTTPS requests.
   *
   * @return {DataHub}.
   */
  constructor({baseUrl = '/data-hubs', config, kek, hmac, httpsAgent}) {
    this.config = config;
    this.kek = kek;
    // TODO: support passing cipher `version`
    this.cipher = new Cipher();
    this.indexHelper = new IndexHelper({hmac});
    const root = `${baseUrl}/${encodeURIComponent(config.id)}`;
    this.urls = {
      root,
      documents: `${root}/documents`,
      query: `${root}/query`
    };
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
   * @param {Object} doc the document to insert.
   *
   * @return {Promise<Object>} resolves to the inserted document.
   */
  async insert({doc}) {
    _assertDocument(doc);

    const encrypted = await this._encrypt({doc, update: false});
    // TODO: move axios usage to DataHubService?
    try {
      const {httpsAgent} = this;
      await axios.post(this.urls.documents, encrypted, {httpsAgent});
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
   * @param {Object} doc the document to insert.
   *
   * @return {Promise<Object>} resolves to the updated document.
   */
  async update({doc}) {
    _assertDocument(doc);

    const encrypted = await this._encrypt({doc, update: true});
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(encrypted.id);
    try {
      const {httpsAgent} = this;
      await axios.post(url, encrypted, {httpsAgent});
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
   * @param {Object} doc the document to create or update an index for.
   *
   * @return {Promise} resolves once the operation completes.
   */
  async updateIndex({doc}) {
    _assertDocument(doc);

    const entry = await this.indexHelper.createEntry({doc});
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(doc.id) + '/index';
    try {
      const {httpsAgent} = this;
      await axios.post(url, entry, {httpsAgent});
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
   * @param {String} id the ID of the document to delete.
   *
   * @return {Promise<Boolean>} resolves to `true` if the document was deleted
   *   and `false` if it did not exist.
   */
  async delete({id}) {
    _assertString(id, '"id" must be a string.');

    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(id);
    try {
      const {httpsAgent} = this;
      await axios.delete(url, {httpsAgent});
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
   * @param {String} id the ID of the document to get.
   *
   * @return {Promise<Object>} resolves to the document.
   */
  async get({id}) {
    _assertString(id, '"id" must be a string.');

    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(id);
    let response;
    try {
      const {httpsAgent} = this;
      response = await axios.get(url, {httpsAgent});
    } catch(e) {
      response = e.response || {};
      if(response.status === 404) {
        const err = new Error('Document not found.');
        err.name = 'NotFoundError';
        throw err;
      }
      throw e;
    }
    return this._decrypt(response.data);
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
   * @param {Object|Array} [equals] an object with key-value attribute pairs to
   *   match or an array of such objects.
   * @param {String|Array} [has] a string with an attribute name to match or an
   *   array of such strings.
   *
   * @return {Promise<Array>} resolves to the matching documents.
   */
  async find({equals, has}) {
    const query = await this.indexHelper.buildQuery({equals, has});

    // get results and decrypt them
    // TODO: move axios usage to DataHubService?
    const {httpsAgent} = this;
    const response = await axios.post(this.urls.query, query, {httpsAgent});
    const docs = response.data;
    return Promise.all(docs.map(this._decrypt.bind(this)));
  }

  // helper that decrypts an encrypted doc to include its (cleartext) content
  async _decrypt(encryptedDoc) {
    // validate `encryptedDoc`
    _assertObject(encryptedDoc, 'Encrypted document must be an object.');
    _assertString(
      encryptedDoc.id, 'Encrypted document "id" must be a string".');
    _assertObject(encryptedDoc, 'Encrypted document "jwe" must be an object.');

    // decrypt doc content
    const {cipher, kek} = this;
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
  async _encrypt({doc, update}) {
    const encrypted = {...doc};
    if(!encrypted.meta) {
      encrypted.meta = {};
    }

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

    const {cipher, kek, indexHelper} = this;

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
      indexHelper.updateEntry({doc: encrypted}),
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
    return `${this.urls.documents}/${encodeURIComponent(id)}`;
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
