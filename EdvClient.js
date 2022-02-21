/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {assert, assertInvocationSigner} from './assert.js';
import {EdvClientCore} from './EdvClientCore.js';
import {DEFAULT_HEADERS} from '@digitalbazaar/http-client';
import {HttpsTransport} from './HttpsTransport.js';
import {ReadableStream} from './util.js';

/**
 * Note: An Encrypted Data Vault (EDV) server MUST expose an HTTPS API with a
 * URL structure that is partitioned like so:
 *
 * <edvID>/documents/<documentID> .
 *
 * The <edvID> must take the form:
 *
 * <authority>/edvs/<multibase base58 multihash encoded random ID> .
 */

export class EdvClient extends EdvClientCore {
  /**
   * Creates a new EdvClient for connecting to an Encrypted Data Vault (EDV).
   *
   * @param {object} options - The options to use.
   * @param {object} [options.capability] - An authorization capability
   *   (zcap) to use that will work with every method called on the client
   *   with the exception of `revokeCapability`, where a capability must be
   *   passed to that function if the root zcap is not to be invoked.
   * @param {object} [options.defaultHeaders] - Default HTTP headers to use
   *   with HTTPS requests.
   * @param {HttpsAgent} [options.httpsAgent] - A HttpsAgent to use to handle
   *   HTTPS requests.
   * @param {object} [options.hmac] - A default HMAC API for blinding
   *   indexable attributes.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing capability invocations.
   * @param {string} [options.id] - The ID of the EDV that must be a
   *   URL that refers to the EDV's root storage location; if not given, then
   *   a separate capability must be given here that can be used for each
   *   method to be called -- or a separate capability must be given to each
   *   called method directly.
   * @param {object} [options.keyAgreementKey] - A default KeyAgreementKey
   *   API for deriving shared KEKs for wrapping content encryption keys.
   * @param {Function} [options.keyResolver] - A default function that returns
   *   a Promise that resolves a key ID to a DH public key.
   *
   * @returns {EdvClient}.
   */
  constructor({
    capability, defaultHeaders, hmac, id, invocationSigner, httpsAgent,
    keyAgreementKey, keyResolver
  } = {}) {
    if(capability !== undefined) {
      assert(capability, 'capability', 'object');
    }
    if(invocationSigner !== undefined) {
      assertInvocationSigner(invocationSigner);
    }

    super({hmac, id, keyAgreementKey, keyResolver});

    // a future version could set a default transport here to wrap this, but
    // it would be a breaking change
    this.capability = capability;
    this.invocationSigner = invocationSigner;
    this.httpsAgent = httpsAgent;
    this.defaultHeaders = {...DEFAULT_HEADERS, ...defaultHeaders};
  }

  /**
   * @inheritdoc
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
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<object>} - Resolves to the inserted document.
   */
  async insert({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac,
    capability = this.capability, invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.insert({
      doc, stream, chunkSize, recipients, keyResolver, keyAgreementKey,
      hmac, transport
    });
  }

  /**
   * @inheritdoc
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
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<object>} - Resolves to the updated document.
   */
  async update({
    doc, stream, chunkSize, recipients = [], keyResolver = this.keyResolver,
    keyAgreementKey = this.keyAgreementKey,
    hmac = this.hmac, capability = this.capability,
    invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.update({
      doc, stream, chunkSize, recipients, keyResolver, keyAgreementKey,
      hmac, transport
    });
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to create or update an index
   *   for.
   * @param {object} [options.hmac=this.hmac] - An HMAC API for blinding
   *   indexable attributes.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise} - Resolves once the operation completes.
   */
  async updateIndex({
    doc, hmac = this.hmac,
    capability = this.capability, invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.updateIndex({doc, hmac, transport});
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to delete.
   * @param {object} [options.recipients=[]] - A set of JWE recipients to
   *   encrypt the document for; if present, recipients will be added to
   *   any existing recipients; to remove existing recipients, modify
   *   the `encryptedDoc.jwe.recipients` field.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   * @param {Function} [options.keyResolver=this.keyResolver] - A function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving shared KEKs for wrapping content
   *   encryption keys.
   *
   * @returns {Promise<boolean>} - Resolves to `true` if the document was
   *   deleted.
   */
  async delete({
    doc, recipients = [],
    capability = this.capability, invocationSigner = this.invocationSigner,
    keyResolver = this.keyResolver, keyAgreementKey = this.keyAgreementKey
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.delete(
      {doc, recipients, keyResolver, keyAgreementKey, transport});
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the document to get.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<object>} - Resolves to the document.
   */
  async get({
    id, keyAgreementKey = this.keyAgreementKey,
    capability = this.capability, invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.get({id, keyAgreementKey, transport});
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The document to get a stream for.
   * @param {object} [options.keyAgreementKey=this.keyAgreementKey] - A
   *   KeyAgreementKey API for deriving a shared KEK to unwrap the content
   *   encryption key.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<ReadableStream>} - Resolves to a `ReadableStream` to read
   *   the chunked data from.
   */
  async getStream({
    doc, keyAgreementKey = this.keyAgreementKey,
    capability = this.capability, invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.getStream({doc, keyAgreementKey, transport});
  }

  /**
   * @inheritdoc
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
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<number>} - Resolves to the number of matching documents.
  */
  async count({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    capability = this.capability, invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.count({keyAgreementKey, hmac, equals, has, transport});
  }

  /**
   * @inheritdoc
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
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   * @param {boolean} [options.count] - Set to `false` to find all documents
   *   that match a query or to `true` to give a count of documents.
   * @param {number} [options.limit] - Set to limit the number of documents
   *   to be returned from a query (min=1, max=1000).
   *
   * @returns {Promise<object>} - Resolves to the matching documents:
   *   {documents: [...]}.
   */
  async find({
    keyAgreementKey = this.keyAgreementKey, hmac = this.hmac, equals, has,
    capability = this.capability, invocationSigner = this.invocationSigner,
    count = false, limit
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    return super.find({
      keyAgreementKey, hmac, equals, has, count, limit, transport
    });
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.headers] - An optional
   *   headers object to use when making requests.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the EDV.
   */
  async getConfig({
    capability = this.capability, headers,
    invocationSigner = this.invocationSigner
  } = {}) {
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders: {...defaultHeaders, ...headers},
      edvId, httpsAgent, invocationSigner
    });
    return super.getConfig({transport});
  }

  /**
   * @inheritdoc
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The new EDV config.
   * @param {object|string} [options.capability=this.capability] - The
   *   authorization capability (zcap) to use to authorize the operation.
   * @param {object} [options.headers] - An optional headers object to use when
   *   making requests.
   * @param {object} [options.invocationSigner=this.invocationSigner] - An API
   *   with an `id` property and a `sign` function for signing a capability
   *   invocation.
   *
   * @returns {Promise<void>} - Resolves once the operation completes.
   */
  async updateConfig({
    config, capability = this.capability, headers,
    invocationSigner = this.invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders: {...defaultHeaders, ...headers},
      edvId, httpsAgent, invocationSigner
    });
    return super.updateConfig({config, transport});
  }

  /**
   * Revoke an authorization capability (zcap). If no `capability` is passed,
   * then the root zcap for the revocation endpoint will be invoked.
   *
   * @param {object} options - The options to use.
   * @param {object} options.capabilityToRevoke - The capability to revoke.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize the operation.
   * @param {object} options.invocationSigner - An API with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} Resolves once the operation completes.
   */
  async revokeCapability({
    capabilityToRevoke, capability, invocationSigner
  } = {}) {
    assertInvocationSigner(invocationSigner);
    const {defaultHeaders, httpsAgent, id: edvId} = this;
    const transport = new HttpsTransport({
      capability, defaultHeaders, edvId, httpsAgent, invocationSigner
    });
    // no `super` method for revoking a zcap, call on `transport`
    return transport.revokeCapability({capabilityToRevoke});
  }

  /**
   * Creates a new EDV using the given configuration.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to post the configuration to.
   * @param {string} options.config - The EDV's configuration.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize the operation.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   * @param {HttpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the newly
   *   created EDV.
   */
  static async createEdv({
    url, config, capability, httpsAgent, headers, invocationSigner
  } = {}) {
    const transport = new HttpsTransport({
      url, capability, defaultHeaders: headers,
      httpsAgent, invocationSigner
    });
    return transport.createEdv({config});
  }

  /**
   * Gets the EDV config for the given controller and reference ID.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to query.
   * @param {string} options.controller - The ID of the controller.
   * @param {string} options.referenceId - A controller-unique reference ID.
   * @param {HttpsAgent} [options.httpsAgent] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers] - An optional
   *   headers object to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize the operation.
   *
   * @returns {Promise<object>} - Resolves to the EDV configuration
   *   containing the given controller and reference ID.
   */
  static async findConfig({
    url, controller, referenceId, httpsAgent, invocationSigner,
    headers, capability
  } = {}) {
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
   * @param {HttpsAgent} [options.httpsAgent=undefined] - An optional
   *   node.js `https.Agent` instance to use when making requests.
   * @param {object} [options.headers=undefined] - An optional
   *   headers object to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize the operation.
   *
   * @returns {Promise<Array>} - Resolves to the matching EDV configurations.
   */
  static async findConfigs({
    url, controller, referenceId, after, limit, httpsAgent,
    headers, capability, invocationSigner
  } = {}) {
    const transport = new HttpsTransport({
      url, capability, defaultHeaders: headers, httpsAgent, invocationSigner
    });
    return transport.findConfigs({controller, referenceId, after, limit});
  }

  /**
   * Generates a multibase encoded random 128-bit identifier for a document.
   *
   * @returns {Promise<string>} - Resolves to the identifier.
   */
  static async generateId() {
    return EdvClientCore.generateId();
  }

  // not used internally, but provided as a temporary backwards compatibility
  // helper
  _getDocUrl(id, capability) {
    return new HttpsTransport({edvId: this.id})._getDocUrl(id, capability);
  }

  // provided temporarily for backwards compatibility; should be moved to
  // a separate helpers file
  static _getInvocationTarget({capability}) {
    return HttpsTransport._getInvocationTarget({capability});
  }
}

/**
 * A node.js HTTPS agent.
 *
 * @typedef {object} HttpsAgent
 * @see https://nodejs.org/api/https.html#https_class_https_agent
 */
