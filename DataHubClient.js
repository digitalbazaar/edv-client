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
   *
   * @return {DataHub}.
   */
  constructor({baseUrl = '/data-hubs', config, kek, hmac}) {
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
    const encrypted = await this._encrypt({doc, update: false});
    // TODO: move axios usage to DataHubService?
    try {
      await axios.post(this.urls.documents, encrypted);
      encrypted.content = doc.content;
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
    const encrypted = await this._encrypt({doc, update: true});
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(encrypted.id);
    try {
      await axios.post(url, encrypted);
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
    const entry = await this.indexHelper.createEntry({doc});
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(doc.id) + '/index';
    try {
      await axios.post(url, entry);
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
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(id);
    try {
      await axios.delete(url);
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
    // TODO: move axios usage to DataHubService?
    const url = this._getDocUrl(id);
    let response;
    try {
      response = await axios.get(url);
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
    const response = await axios.post(this.urls.query, query);
    const docs = response.data;
    return Promise.all(docs.map(this._decrypt.bind(this)));
  }

  // helper that decrypts an encrypted doc to include its (cleartext) content
  async _decrypt(encryptedDoc) {
    // validate `encryptedDoc`
    if(!(encryptedDoc && typeof encryptedDoc === 'object' &&
      typeof encryptedDoc.id === 'string' &&
      encryptedDoc.jwe && typeof encryptedDoc.jwe === 'object')) {
      throw new TypeError(
        '"encryptedDoc" must be an object with "id" and "jwe" properties.');
    }

    // decrypt doc content
    const {cipher, kek} = this;
    const {jwe} = encryptedDoc;
    const content = await cipher.decryptObject({jwe, kek});
    if(content === null) {
      throw new Error('Decryption failed.');
    }
    return {...encryptedDoc, content};
  }

  // helper that creates an encrypted doc using a doc's (clear) content
  // and blinding any attributes for indexing
  async _encrypt({doc, update}) {
    if(!(doc && typeof doc === 'object' && typeof doc.id === 'string' &&
      doc.content && typeof doc.content === 'object' &&
      !Array.isArray(doc.content))) {
      throw new TypeError(
        '"doc" must be an object with value "id" and "content" properties.');
    }

    const encrypted = {...doc};

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
    const [indexed, jwe] = await Promise.all([
      indexHelper.updateEntry({doc: encrypted}),
      cipher.encryptObject({obj: doc.content, kek, recipients})
    ]);

    delete encrypted.content;
    encrypted.indexed = indexed;
    encrypted.jwe = jwe;
    return encrypted;
  }

  // helper that gets a document URL from a document ID
  _getDocUrl(id) {
    return `${this.urls.documents}/${encodeURIComponent(id)}`;
  }
}
