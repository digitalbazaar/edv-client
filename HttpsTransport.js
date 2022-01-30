/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
import {assert, assertInvocationSigner} from './assert.js';
import {httpClient, DEFAULT_HEADERS} from '@digitalbazaar/http-client';
import {signCapabilityInvocation} from
  '@digitalbazaar/http-signature-zcap-invoke';

const ZCAP_ROOT_PREFIX = 'urn:zcap:root:';

export class HttpsTransport {
  /**
   * Creates a transport layer for an EDV client to use to communicate
   * with an EDV server over HTTPS.
   *
   * @typedef {object} httpsAgent
   * @see https://nodejs.org/api/https.html#https_class_https_agent
   *
   * @param {object} options - The options to use.
   * @param {object} [options.defaultHeaders] - Default headers to use with
   *   HTTP requests.
   * @param {string} [options.edvId] - The ID of the target EDV.
   * @param {httpsAgent} [options.httpsAgent] - A node.js `https.Agent`
   *   instance to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   *
   * @returns {HttpsTransport}.
   */
  constructor({defaultHeaders, edvId, httpsAgent, invocationSigner} = {}) {
    assertInvocationSigner(invocationSigner);
    this.defaultHeaders = {...DEFAULT_HEADERS, ...defaultHeaders};
    this.edvId = edvId;
    this.httpsAgent = httpsAgent;
    this.invocationSigner = invocationSigner;
    if(edvId) {
      this._rootZcapId = `${ZCAP_ROOT_PREFIX}${encodeURIComponent(edvId)}`;
    }
  }

  /**
   * Creates a new EDV using the given configuration.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to post the configuration to.
   * @param {string} options.config - The EDV's configuration.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the newly
   *   created EDV.
   */
  async createEdv({url, config, capability} = {}) {
    if(url) {
      assert(url, 'url', 'string');
    } else {
      url = HttpsTransport._getInvocationTarget({capability}) ||
        _createAbsoluteUrl('/edvs');
    }

    // no invocationSigner was provided, submit the request without a zCap
    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    if(!invocationSigner) {
      const response = await httpClient.post(url, {
        headers: defaultHeaders,
        json: config,
        agent
      });
      return response.data;
    }

    if(!capability) {
      capability = `${ZCAP_ROOT_PREFIX}${encodeURIComponent(url)}`;
    }

    // sign HTTP header
    const signedHeaders = await signCapabilityInvocation({
      url,
      method: 'post',
      headers: defaultHeaders,
      capability,
      invocationSigner,
      capabilityAction: 'write',
      json: config,
    });
    const response = await httpClient.post(url, {
      headers: signedHeaders, json: config, agent
    });
    return response.data;
  }

  /**
   * Sends a new encrypted document to an EDV server. If the server reports
   * that a document with a matching ID already exists, a `DuplicateError` is
   * thrown.
   *
   * @param {object} options - The options to use.
   * @param {object} options.encrypted - The encrypted document to insert.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  async insert({encrypted, capability} = {}) {
    let url = this._getDocUrl(encrypted.id, capability);
    if(!capability) {
      capability = this._rootZcapId;
    }

    // trim document ID and trailing slash, if present, to post to root
    // collection
    if(url.endsWith(encrypted.id)) {
      url = url.slice(0, -(encrypted.id.length + 1));
    }

    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json: encrypted, capability, invocationSigner,
        capabilityAction: 'write'
      });

      // send request
      await httpClient.post(url, {agent, json: encrypted, headers});
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
   * Sends an encrypted document to an EDV server. If the document does not
   * already exist, it will be created. If the update is rejected because of a
   * conflict, then an `InvalidStateError` will be thrown.
   *
   * @param {object} options - The options to use.
   * @param {object} options.encrypted - The encrypted document to insert.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  async update({encrypted, capability} = {}) {
    const url = this._getDocUrl(encrypted.id, capability);
    if(!capability) {
      capability = this._rootZcapId;
    }
    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json: encrypted, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      await httpClient.post(url, {agent, json: encrypted, headers});
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Sends an update for an index for the given document, without updating the
   * document itself. If the index entry's sequence number does not match the
   * document's current sequence number, update will be rejected with an
   * `InvalidStateError`.
   *
   * Note: If the index does not exist or the document does not have an
   * existing entry for the index, it will be added.
   *
   * @param {object} options - The options to use.
   * @param {string} options.docId - The ID of the document.
   * @param {object} options.entry - The index entry to send.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  async updateIndex({docId, entry, capability} = {}) {
    const url = this._getDocUrl(docId, capability) + '/index';
    if(!capability) {
      capability = this._rootZcapId;
    }
    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json: entry, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
      await httpClient.post(url, {headers, json: entry, agent});
    } catch(e) {
      if(e.status === 409) {
        const err = new Error('Conflict error.');
        err.name = 'InvalidStateError';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Gets an encrypted document from an EDV server by its ID.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the document to get.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} - Resolves to the encrypted document.
   */
  async get({id, capability} = {}) {
    assert(id, 'id', 'string');

    const url = this._getDocUrl(id, capability);
    if(!capability) {
      capability = this._rootZcapId;
    }

    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'get', headers: defaultHeaders,
        capability, invocationSigner,
        capabilityAction: 'read'
      });
      // send request
      const response = await httpClient.get(url, {headers, agent});
      return response.data;
    } catch(e) {
      if(e.status === 404) {
        const err = new Error('Document not found.');
        err.name = 'NotFoundError';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Sends a query to an EDV server to find encrypted documents based on their
   * attributes.
   *
   * @param {object} options - The options to use.
   * @param {object} options.query - The query to send.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} - Resolves to the matching encrypted documents:
   *   `{documents: [...]}` or `{count: docCount}` if `query.count === true`.
   */
  async find({query, capability} = {}) {
    let url = HttpsTransport._getInvocationTarget({capability}) ||
      `${this.id}/query`;

    // note: capability with a target of `/documents` can be used to query
    // by augmenting with `/query`
    if(url.endsWith('/documents')) {
      url = `${url}/query`;
    }

    if(!capability) {
      capability = this._rootZcapId;
    }

    // sign HTTP header
    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    const headers = await signCapabilityInvocation({
      url, method: 'post', headers: defaultHeaders,
      json: query, capability, invocationSigner,
      capabilityAction: 'read'
    });
    // send request
    const response = await httpClient.post(url, {headers, json: query, agent});
    if(query.count === true) {
      return response.data;
    }
    const {data: {documents}} = response;
    return {documents};
  }

  /**
   * Gets the configuration for an EDV from the server.
   *
   * @param {object} options - The options to use.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the EDV.
   */
  async getConfig({capability} = {}) {
    const {edvId} = this;
    if(!(edvId || capability)) {
      throw new TypeError(
        '"capability" is required if "edvId" was not provided ' +
        'to the HttpsTransport constructor.');
    }

    let url;
    if(capability) {
      url = HttpsTransport._getInvocationTarget({capability});
    } else {
      url = edvId;
      capability = this._rootZcapId;
    }

    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    if(!invocationSigner) {
      // send request w/o zcap invocation
      const response = await httpClient.get(url, {
        headers: defaultHeaders,
        agent
      });
      return response.data;
    }

    // send request w/ zcap invocation
    const signedHeaders = await signCapabilityInvocation({
      url, method: 'get',
      headers: defaultHeaders,
      capability,
      invocationSigner,
      capabilityAction: 'read'
    });
    const response = await httpClient.get(url, {agent, headers: signedHeaders});
    return response.data;
  }

  /**
   * Sends an updated EDV configuration to the server. The new configuration
   * `sequence` must be incremented by `1` over the previous configuration or
   * the update will fail.
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The new EDV config.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<void>} - Settles once the operation completes.
   */
  async updateConfig({config, capability} = {}) {
    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"config.controller" must be a string.');
    }

    const {edvId} = this;
    if(!(edvId || capability)) {
      throw new TypeError(
        '"capability" is required if "id" was not provided ' +
        'to the EdvClient constructor.');
    }

    let url;
    if(capability) {
      url = HttpsTransport._getInvocationTarget({capability});
    } else {
      url = edvId;
      capability = this._rootZcapId;
    }

    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    if(!invocationSigner) {
      // send request w/o zcap invocation
      await httpClient.post(url, {
        headers: defaultHeaders,
        json: config,
        agent
      });
    }

    // send request w/ zcap invocation
    const signedHeaders = await signCapabilityInvocation({
      url,
      method: 'post',
      headers: defaultHeaders,
      capability,
      invocationSigner,
      capabilityAction: 'write',
      json: config
    });
    // send request w/o zcap invocation
    await httpClient.post(url, {
      headers: signedHeaders,
      json: config,
      agent
    });
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
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<Array>} - Resolves to the matching EDV configurations.
   */
  async findConfigs({
    url, controller, referenceId, after, limit, capability
  } = {}) {
    if(url) {
      assert(url, 'url', 'string');
    } else {
      url = HttpsTransport._getInvocationTarget({capability}) ||
        _createAbsoluteUrl('/edvs');
    }

    // no invocationSigner was provided, submit the request without a zCap
    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    if(!invocationSigner) {
      const searchParams = {controller, referenceId, after, limit};
      // eliminate undefined properties, otherwise http-client will encode
      // undefined properties as the string literal 'undefined'
      Object.keys(searchParams).forEach(
        key => searchParams[key] === undefined && delete searchParams[key]);

      const response = await httpClient.get(url, {
        searchParams,
        headers: defaultHeaders,
        agent
      });
      return response.data;
    }

    if(!capability) {
      capability = `${ZCAP_ROOT_PREFIX}${encodeURIComponent(url)}`;
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
      headers: defaultHeaders,
      capability,
      invocationSigner,
      capabilityAction: 'read'
    });

    const response = await httpClient.get(url, {
      headers: signedHeaders,
      agent
    });
    return response.data;
  }

  /**
   * Store a capability revocation.
   *
   * @param {object} options - The options to use.
   * @param {object} options.capabilityToRevoke - The capability to revoke.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} Resolves once the operation completes.
   */
  async revokeCapability({capabilityToRevoke, capability} = {}) {
    assert(capabilityToRevoke, 'capabilityToRevoke', 'object');

    let {id: edvId} = this;
    if(!edvId && !(capability && typeof capability === 'object')) {
      // since no `edvId` was set and no `capability` with an invocation
      // target that can be parsed was given, get the EDV ID from the
      // capability that is to be revoked -- presuming it is a document (if
      // revoking any other capability, the `keystoreId` must be set or a
      // `capability` passed to invoke)
      const invocationTarget = HttpsTransport._getInvocationTarget(
        {capability: capabilityToRevoke});
      const idx = invocationTarget.lastIndexOf('/documents');
      if(idx === -1) {
        throw new Error(
          `Invalid EDV invocation target (${invocationTarget}).`);
      }
      edvId = invocationTarget.slice(0, idx);
    }

    const url = HttpsTransport._getInvocationTarget({capability}) ||
      `${edvId}/revocations/${encodeURIComponent(capabilityToRevoke.id)}`;
    if(!capability) {
      capability = `${ZCAP_ROOT_PREFIX}${encodeURIComponent(url)}`;
    }
    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json: capabilityToRevoke, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
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

  /**
   * Sends an encrypted document chunk to an EDV server.
   *
   * @param {object} options - The options to use.
   * @param {string} options.docId - The document ID.
   * @param {number} options.chunk - The encrypted chunk.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  async storeChunk({docId, chunk, capability}) {
    let url = this._getDocUrl(docId, capability);
    if(!capability) {
      capability = this._rootZcapId;
    }
    // append `/chunks/<chunkIndex>`
    const {index} = chunk;
    url += `/chunks/${index}`;

    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json: chunk, capability, invocationSigner,
        capabilityAction: 'write'
      });
      // send request
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

  /**
   * Gets an encrypted document chunk from an EDV server.
   *
   * @param {object} options - The options to use.
   * @param {string} options.docId - The document ID.
   * @param {number} options.chunkIndex - The index of the chunk.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize this operation; defaults to using the root
   *   zcap for the `url`.
   *
   * @returns {Promise<object>} - Resolves to the chunk data.
   */
  async getChunk({docId, chunkIndex, capability} = {}) {
    let url = this._getDocUrl(docId, capability);
    if(!capability) {
      capability = this._rootZcapId;
    }
    // append `/chunks/<chunkIndex>`
    url += `/chunks/${chunkIndex}`;

    let response;
    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'get', headers: defaultHeaders,
        capability, invocationSigner,
        capabilityAction: 'read'
      });
      // send request
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

  // FIXME: add _post() and _get() helpers to make code more DRY

  // helper that gets a document URL from a document ID
  _getDocUrl(id, capability) {
    if(capability && !this.id) {
      const target = HttpsTransport._getInvocationTarget({capability});
      // target is the entire documents collection
      if(target.endsWith('/documents')) {
        return `${target}/${id}`;
      }
      return target;
    }
    return `${this.id}/documents/${id}`;
  }

  static _getInvocationTarget({capability}) {
    // no capability, so no invocation target
    if(capability === undefined || capability === null) {
      return null;
    }

    let invocationTarget;
    if(typeof capability === 'string') {
      if(!capability.startsWith(ZCAP_ROOT_PREFIX)) {
        throw new Error(
          'If "capability" is a string, it must be a root capability.');
      }
      invocationTarget = decodeURIComponent(
        capability.substring(ZCAP_ROOT_PREFIX));
    } else if(typeof capability === 'object') {
      ({invocationTarget} = capability);
    }

    if(!(typeof invocationTarget === 'string' &&
      invocationTarget.includes(':'))) {
      throw new TypeError(
        '"invocationTarget" from capability must be an "https" URL.');
    }

    return invocationTarget;
  }
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
