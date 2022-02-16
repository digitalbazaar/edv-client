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

    // submit request w/signed zcap invocation
    const response = await this._signedHttpPost({
      url, json: config, capability, insert: true
    });
    return response.data;
  }

  /**
   * @inheritdoc
   */
  async getConfig({id = this.edvId} = {}) {
    const {capability} = this;
    if(!(id || capability)) {
      throw new TypeError('"capability" is required if "id" was not provided.');
    }
    const url = HttpsTransport._getInvocationTarget({capability}) || id;

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
    const response = await this._signedHttpGet({
      url, capability, notFoundMessage: 'Config not found.'
    });
    return response.data;
  }

  /**
   * @inheritdoc
   */
  async updateConfig({config} = {}) {
    const {capability, edvId} = this;
    if(!(edvId || capability)) {
      throw new TypeError(
        '"capability" is required if "edvId" was not provided ' +
        'to the HttpsTransport constructor.');
    }
    const url = HttpsTransport._getInvocationTarget({capability}) || edvId;

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
    await this._signedHttpPost({url, json: config, capability, insert: false});
  }

  /**
   * @inheritdoc
   */
  async findConfigs({controller, referenceId, after, limit} = {}) {
    let {capability, url} = this;
    if(!url) {
      url = HttpsTransport._getInvocationTarget({capability}) ||
        _createAbsoluteUrl('/edvs');
    }

    // eliminate undefined properties, to prevent expression of them using
    // the string literal `undefined`
    const searchParams = Object.fromEntries(
      Object.entries({controller, referenceId, after, limit})
        .filter(([, v]) => v !== undefined));

    // no invocationSigner was provided, submit the request without a zCap
    const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
    if(!invocationSigner) {
      // send request w/o signed zcap invocation
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

    // add params to URL so they will be signed
    url += `?${new URLSearchParams(searchParams)}`;
    const response = await this._signedHttpGet({url, capability});
    return response.data;
  }

  /**
   * @inheritdoc
   */
  async insert({encrypted} = {}) {
    // trim document ID and trailing slash to post to `/documents`
    let url = this._getDocUrl(encrypted.id);
    if(url.endsWith(encrypted.id)) {
      url = url.slice(0, -(encrypted.id.length + 1));
    }
    await this._signedHttpPost({url, json: encrypted, insert: true});
  }

  /**
   * @inheritdoc
   */
  async update({encrypted} = {}) {
    const url = this._getDocUrl(encrypted.id, this.capability);
    await this._signedHttpPost({url, json: encrypted, insert: false});
  }

  /**
   * @inheritdoc
   */
  async updateIndex({docId, entry} = {}) {
    const url = this._getDocUrl(docId, this.capability) + '/index';
    await this._signedHttpPost({url, json: entry, insert: false});
  }

  /**
   * @inheritdoc
   */
  async get({id} = {}) {
    const url = this._getDocUrl(id, this.capability);
    const response = await this._signedHttpGet({
      url, notFoundMessage: 'Document not found.'
    });
    return response.data;
  }

  /**
   * @inheritdoc
   */
  async find({query} = {}) {
    const {capability, edvId} = this;
    let url = HttpsTransport._getInvocationTarget({capability});
    if(!url) {
      if(!edvId) {
        throw new Error('Either "capability" or "edvId" must be given.');
      }
      url = `${edvId}/query`;
    } else if(!url.endsWith('/query')) {
      // note: capability with a target of `/documents` or the EDV ID,
      // then it can be used to query by augmenting with `/query`
      url += '/query';
    }

    // do signed HTTP post w/'read' action
    const response = await this._signedHttpPost({
      url, json: query, capability, capabilityAction: 'read'
    });
    if(query.count === true) {
      return response.data;
    }
    const {data: {documents, hasMore}} = response;
    const result = {documents};
    if(hasMore !== undefined) {
      result.hasMore = hasMore;
    }
    return result;
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
    await this._signedHttpPost({
      url, json: capabilityToRevoke, capability, insert: true
    });
  }

  /**
   * @inheritdoc
   */
  async storeChunk({docId, chunk}) {
    // append `/chunks/<chunkIndex>`
    const {index} = chunk;
    const url = this._getDocUrl(docId, this.capability) + `/chunks/${index}`;
    await this._signedHttpPost({url, json: chunk, insert: false});
  }

  /**
   * @inheritdoc
   */
  async getChunk({docId, chunkIndex} = {}) {
    // append `/chunks/<chunkIndex>`
    const url = this._getDocUrl(docId, this.capability) +
      `/chunks/${chunkIndex}`;
    const response = await this._signedHttpGet({
      url, notFoundMessage: 'Document chunk not found.'
    });

    // TODO: validate response.data

    // return chunk
    return response.data;
  }

  async _signedHttpGet({
    url, capability = this.capability, notFoundMessage
  } = {}) {
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
      return await httpClient.get(url, {headers, agent});
    } catch(e) {
      // normalize not found errors
      if(notFoundMessage && e.status === 404) {
        const err = new Error(notFoundMessage);
        err.name = 'NotFoundError';
        err.cause = e;
        throw err;
      }
      throw e;
    }
  }

  async _signedHttpPost({
    url, json, capability = this.capability, capabilityAction = 'write', insert
  } = {}) {
    if(!capability) {
      capability = this._rootZcapId;
    }
    try {
      // sign HTTP header
      const {defaultHeaders, httpsAgent: agent, invocationSigner} = this;
      const headers = await signCapabilityInvocation({
        url, method: 'post', headers: defaultHeaders,
        json, capability, invocationSigner,
        capabilityAction
      });

      // send request
      return await httpClient.post(url, {agent, json, headers});
    } catch(e) {
      // normalize 409 errors to duplicate / conflict errors
      if(insert !== undefined && e.status === 409) {
        const cause = e;
        if(insert) {
          e = new Error('Duplicate error.');
          e.name = 'DuplicateError';
        } else {
          e = new Error('Conflict error.');
          e.name = 'InvalidStateError';
        }
        e.cause = cause;
      }
      throw e;
    }
  }

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
