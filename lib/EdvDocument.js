/*!
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {EdvClient} from './EdvClient.js';
import {ReadableStream} from './util.js';

export class EdvDocument {
  /**
   * Creates a new instance of a EdvDocument.
   *
   * @param {object} options - The options to use.
   * @param {string} [options.id] - The ID of the document; this is
   *   only necessary if the capability's `invocationTarget` is not for the
   *   document itself (but is for the entire EDV).
   * @param {Array} [options.recipients=[]] - An array of additional recipients
   *   for the encrypted content.
   * @param {Function} [options.keyResolver] - A default function that
   *   returns a Promise that resolves a key ID to a DH public key.
   * @param {object} [options.keyAgreementKey] - A KeyAgreementKey API for
   *   deriving KEKs for wrapping/unwrapping content encryption keys.
   * @param {object} [options.hmac] - An HMAC API for blinding indexable
   *   attributes.
   * @param {object} [options.capability] - The OCAP-LD authorization
   *   capability to use to authorize the invocation of EdvClient methods.
   * @param {object} options.invocationSigner - An API for signing
   *   a capability invocation.
   * @param {EdvClient} [options.client] - An EdvClient to use.
   *
   * @returns {EdvDocument} The new EdvDocument instance.
   */
  constructor({
    id, capability, invocationSigner,
    recipients = [], keyResolver,
    keyAgreementKey, hmac,
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
   * @returns {Promise<object>} - Resolves to the decrypted document.
   */
  async read() {
    const {id, keyAgreementKey, capability, invocationSigner, client} = this;
    return client.get({id, keyAgreementKey, capability, invocationSigner});
  }

  /**
   * @typedef ReadableStream
   * Gets a `ReadableStream` to read the chunked data associated with a
   * document.
   *
   * @param {object} options - The options to use.
   * @param {object} options.doc - The decrypted document to get a stream for;
   *   call `read()` to get this.
   *
   * @returns {Promise<ReadableStream>} - Resolves to a `ReadableStream` to read
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
   * @param {object} options - The options to use.
   * @param {object} options.doc - The unencrypted document to update/insert.
   * @param {ReadableStream} [options.stream] - A WHATWG Readable stream to read
   *   from to associate chunked data with this document.
   * @param {number} [options.chunkSize] - The size, in bytes, of the chunks to
   *   break the incoming stream data into.
   * @param {Array} [options.recipients=[]] - An array of additional recipients
   *   for the encrypted content.
   * @param {Function} options.keyResolver - A function that returns a Promise
   *   that resolves a key ID to a DH public key.
   *
   * @returns {Promise<object>} - Resolves to the inserted document.
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
   * @param {object} options - The options to use.
   * @param {object} options.doc - The unencrypted document to update/insert.
   * @param {Array} [options.recipients=[]] - An array of additional recipients
   *   for the encrypted content.
   * @param {Function} options.keyResolver - A function that returns a Promise
   *   that resolves a key ID to a DH public key.
   *
   * @returns {Promise<boolean>} - Resolves to `true` when the document is
   *   deleted.
   */
  async delete({
    doc, recipients = this.recipients, keyResolver = this.keyResolver
  } = {}) {
    const {keyAgreementKey, capability, invocationSigner, client} = this;
    return client.delete({
      doc, recipients, capability, invocationSigner,
      keyAgreementKey, keyResolver
    });
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
