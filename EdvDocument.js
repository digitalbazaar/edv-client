/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {EdvClient} from './EdvClient.js';

export class EdvDocument {
  /**
   * Creates a new instance of a EdvDocument.
   *
   * @param {Object} options - The options to use.
   * @param {string} [options.id=undefined] the ID of the document; this is
   *   only necessary if the capability's `invocationTarget` is not for the
   *   document itself (but is for the entire EDV).
   * @param {Array} [recipients=[]] an array of additional recipients for the
   *   encrypted content.
   * @param {function} [keyResolver=this.keyResolver] a default function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {Object} [keyAgreementKey=null] a KeyAgreementKey API for deriving
   *   KEKs for wrapping/unwrapping content encryption keys.
   * @param {Object} [hmac=null] an HMAC API for blinding indexable
   *   attributes.
   * @param {Object} [options.capability=undefined] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of EdvClient methods.
   * @param {Object} options.invocationSigner - An API for signing
   *   a capability invocation.
   * @param {EdvClient} [options.client] - An optional EdvClient
   *   to use.
   *
   * @returns {EdvDocument} The new EdvDocument instance.
   */
  constructor({
    id, capability, invocationSigner,
    recipients = [], keyResolver = null,
    keyAgreementKey = null, hmac = null,
    client = new EdvClient()
  }) {
    this.id = id;
    this.recipients = recipients;
    this.keyResolver = keyResolver;
    this.keyAgreementKey = keyAgreementKey;
    this.hmac = hmac;
    this.capability = capability;
    if(!this.id) {
      // TODO: determine if there's a cleaner way to do this that maintains
      // portability
      this.id = _parseEdvDocId(capability);
    }
    this.invocationSigner = invocationSigner;
    this.client = client;
  }

  /**
   * Retrieves and decrypts this document from its EDV.
   *
   * @returns {Promise<Object>} resolves to the decrypted document.
   */
  async read() {
    const {id, keyAgreementKey, capability, invocationSigner, client} = this;
    return client.get({id, keyAgreementKey, capability, invocationSigner});
  }

  /**
   * Gets a `ReadableStream` to read the chunked data associated with a
   * document.
   *
   * @param {Object} options - The options to use.
   * @param {string} options.doc the decrypted document to get a stream for;
   *   call `read()` to get this.
   *
   * @return {Promise<ReadableStream>} resolves to a `ReadableStream` to read
   *   the chunked data from.
   */
  async getStream({doc}) {
    const {keyAgreementKey, capability, invocationSigner, client} = this;
    return client.getStream({
      doc, keyAgreementKey, capability, invocationSigner
    });
  }

  /**
   * Encrypts and updates this document in its EDV.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.doc - The unencrypted document to update/insert.
   * @param {Readable} [options.stream] a WHATWG Readable stream to read
   *   from to associate chunked data with this document.
   * @param {number} [chunkSize] the size, in bytes, of the chunks to
   *   break the incoming stream data into.
   * @param {Array} [recipients=[]] an array of additional recipients for the
   *   encrypted content.
   * @param {function} keyResolver a function that returns a Promise
   *   that resolves a key ID to a DH public key.
   *
   * @returns {Promise<Object>} resolves to the inserted document.
   */
  async write({
    doc, stream, chunkSize,
    recipients = this.recipients, keyResolver = this.keyResolver
  }) {
    const {keyAgreementKey, hmac, capability, invocationSigner, client} = this;
    return client.update({
      doc, stream, chunkSize, recipients, keyResolver,
      keyAgreementKey, hmac, capability, invocationSigner
    });
  }

  /**
   * Deletes this document from the EDV.
   *
   * @return {Promise<Boolean>} resolves to `true` if the document was deleted
   *   and `false` if it did not exist.
   */
  async delete() {
    const {id, capability, invocationSigner, client} = this;
    return client.delete({id, capability, invocationSigner});
  }
}

function _parseEdvDocId(capability) {
  const target = EdvClient._getInvocationTarget({capability});
  if(!target) {
    throw new TypeError('"capability" must be an object.');
  }
  let idx = target.lastIndexOf('/documents/');
  if(idx === -1) {
    // capability is not for a single document
    return;
  }
  idx += '/documents/'.length;
  return decodeURIComponent(target.substr(idx));
}
