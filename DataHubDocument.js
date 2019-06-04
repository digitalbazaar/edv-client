/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {DataHubClient} from './DataHubClient.js';

export class DataHubDocument {
  /**
   * Creates a new instance of a DataHubDocument.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.id - The ID for this document.
   * @param {Object} kek a KEK API for wrapping content encryption keys.
   * @param {Object} [hmac=null] an HMAC API for blinding indexable
   *   attributes.
   * @param {Object} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of DataHubClient methods.
   * @param {Object} options.invocationSigner - An API for signing
   *   a capability invocation.
   * @param {DataHubClient} [options.client] - An optional DataHubClient
   *   to use.
   *
   * @returns {DataHubDocument} The new DataHubDocument instance.
   */
  constructor({
    id, capability, invocationSigner, kek = null, hmac = null,
    client = new DataHubClient()
  }) {
    this.id = id;
    this.kek = kek;
    this.hmac = hmac;
    this.capability = capability;
    this.invocationSigner = invocationSigner;
    this.client = client;
  }

  /**
   * Retrieves and decrypts this document from its data hub.
   *
   * @returns {Promise<Object>} resolves to the decrypted document.
   */
  async read() {
    const {id, kek, capability, invocationSigner, client} = this;
    return client.get({id, kek, capability, invocationSigner});
  }

  /**
   * Encrypts and updates this document in its data hub.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.doc - The unencrypted document to update/insert.
   *
   * @returns {Promise<Object>} resolves to the inserted document.
   */
  async write({doc}) {
    const {kek, hmac, capability, invocationSigner, client} = this;
    return client.update({doc, kek, hmac, capability, invocationSigner});
  }
}
