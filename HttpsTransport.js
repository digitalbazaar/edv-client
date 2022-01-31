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
   * Creates a transport layer for an EDV client to use to perform an
   * operation with an EDV server over HTTPS.
   *
   * @param {object} options - The options to use.
   * @param {object|string} [options.capability] - The authorization capability
   *   (zcap) to use to authorize the operation.
   * @param {object} [options.defaultHeaders] - Default headers to use with
   *   HTTP requests.
   * @param {string} [options.edvId] - The ID of the target EDV.
   * @param {HttpsAgent} [options.httpsAgent] - A node.js `https.Agent`
   *   instance to use when making requests.
   * @param {object} [options.invocationSigner] - An object with an
   *   `id` property and a `sign` function for signing a capability invocation.
   * @param {string} [options.url] - The url to use.
   *
   * @returns {HttpsTransport}.
   */
  constructor({
    capability, defaultHeaders, edvId, httpsAgent, invocationSigner, url
  } = {}) {
    if(url !== undefined) {
      assert(url, 'url', 'string');
    }
    if(invocationSigner !== undefined) {
      assertInvocationSigner(invocationSigner);
    }
    this.capability = capability;
    this.defaultHeaders = {...DEFAULT_HEADERS, ...defaultHeaders};
    this.edvId = edvId;
    this.httpsAgent = httpsAgent;
    this.invocationSigner = invocationSigner;
    this.url = url;
    if(edvId) {
      this._rootZcapId = `${ZCAP_ROOT_PREFIX}${encodeURIComponent(edvId)}`;
    }
  }

  /**
   * @inheritdoc
   */
  async createEdv({config} = {}) {
    let {capability, url} = this;
    if(!url) {
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
   * @inheritdoc
   */
  async getConfig({id = this.edvId} = {}) {
    let {capability} = this;
    if(!(id || capability)) {
      throw new TypeError('"capability" is required if "id" was not provided.');
    }

    let url;
    if(capability) {
      url = HttpsTransport._getInvocationTarget({capability});
    } else {
      url = id;
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
   * @inheritdoc
   */
  async updateConfig({config} = {}) {
    const {edvId} = this;
    let {capability} = this;
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
   * @inheritdoc
   */
  async findConfigs({controller, referenceId, after, limit} = {}) {
    let {capability, url} = this;
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
   * @inheritdoc
   */
  async insert({encrypted} = {}) {
    let url = this._getDocUrl(encrypted.id);
    // FIXME: set capability to `this._rootZcapId` by default?
    let {capability} = this;
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
   * @inheritdoc
   */
  async update({encrypted} = {}) {
    let {capability} = this;
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
   * @inheritdoc
   */
  async updateIndex({docId, entry} = {}) {
    let {capability} = this;
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
   * @inheritdoc
   */
  async get({id} = {}) {
    let {capability} = this;
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
   * @inheritdoc
   */
  async find({query} = {}) {
    let {capability} = this;
    let url = HttpsTransport._getInvocationTarget({capability});
    if(!url) {
      if(!this.edvId) {
        throw new Error('Either "capability" or "edvId" must be given.');
      }
      url = `${this.edvId}/query`;
    }

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
   * @inheritdoc
   */
  async revokeCapability({capabilityToRevoke} = {}) {
    assert(capabilityToRevoke, 'capabilityToRevoke', 'object');

    let {edvId, capability} = this;
    if(!edvId && !(capability && typeof capability === 'object')) {
      // since no `edvId` was set and no `capability` with an invocation
      // target that can be parsed was given, get the EDV ID from the
      // capability that is to be revoked -- presuming it is a document (if
      // revoking any other capability, the `edvId` must be set or a
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
   * @inheritdoc
   */
  async storeChunk({docId, chunk}) {
    let {capability} = this;
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
   * @inheritdoc
   */
  async getChunk({docId, chunkIndex} = {}) {
    let {capability} = this;
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
    if(!this.edvId) {
      if(!capability) {
        throw new Error('Either "capability" or "edvId" must be given.');
      }
      const target = HttpsTransport._getInvocationTarget({capability});
      // target is the entire documents collection
      if(target.endsWith('/documents')) {
        return `${target}/${id}`;
      }
      return target;
    }
    return `${this.edvId}/documents/${id}`;
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

/**
 * A node.js HTTPS agent.
 *
 * @typedef {object} HttpsAgent
 * @see https://nodejs.org/api/https.html#https_class_https_agent
 */
