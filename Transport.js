/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
export class Transport {
  /**
   * Creates a Transport layer for an EDV client.
   *
   * @returns {Transport}.
   */
  constructor() {}

  /**
   * Creates a new EDV using the given configuration.
   *
   * @param {object} options - The options to use.
   * @param {string} options.url - The url to post the configuration to.
   * @param {string} options.config - The EDV's configuration.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the newly
   *   created EDV.
   */
  // eslint-disable-next-line no-unused-vars
  async createEdv({url, config} = {}) {
    _throwNotImplemented();
  }

  /**
   * Gets the configuration for an EDV from the server.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the EDV.
   *
   * @returns {Promise<object>} - Resolves to the configuration for the EDV.
   */
  // eslint-disable-next-line no-unused-vars
  async getConfig({id} = {}) {
    _throwNotImplemented();
  }

  /**
   * Sends an updated EDV configuration to the server. The new configuration
   * `sequence` must be incremented by `1` over the previous configuration or
   * the update will fail.
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The new EDV config.
   *
   * @returns {Promise<void>} - Settles once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async updateConfig({config} = {}) {
    _throwNotImplemented();
  }

  /**
   * Get all EDV configurations matching a query.
   *
   * @param {object} options - The options to use.
   * @param {string} options.controller - The EDV's controller.
   * @param {string} [options.referenceId] - A controller-unique reference ID.
   * @param {string} [options.after] - An EDV's ID.
   * @param {number} [options.limit] - How many EDV configs to return.
   *
   * @returns {Promise<Array>} - Resolves to the matching EDV configurations.
   */
  // eslint-disable-next-line no-unused-vars
  async findConfigs({controller, referenceId, after, limit} = {}) {
    _throwNotImplemented();
  }

  /**
   * Sends a new encrypted document to an EDV server. If the server reports
   * that a document with a matching ID already exists, a `DuplicateError` is
   * thrown.
   *
   * @param {object} options - The options to use.
   * @param {object} options.encrypted - The encrypted document to insert.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async insert({encrypted} = {}) {
    _throwNotImplemented();
  }

  /**
   * Sends an encrypted document to an EDV server. If the document does not
   * already exist, it will be created. If the update is rejected because of a
   * conflict, then an `InvalidStateError` will be thrown.
   *
   * @param {object} options - The options to use.
   * @param {object} options.encrypted - The encrypted document to insert.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async update({encrypted} = {}) {
    _throwNotImplemented();
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
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async updateIndex({docId, entry} = {}) {
    _throwNotImplemented();
  }

  /**
   * Gets an encrypted document from an EDV server by its ID.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the document to get.
   *
   * @returns {Promise<object>} - Resolves to the encrypted document.
   */
  // eslint-disable-next-line no-unused-vars
  async get({id} = {}) {
    _throwNotImplemented();
  }

  /**
   * Sends a query to an EDV server to find encrypted documents based on their
   * attributes.
   *
   * @param {object} options - The options to use.
   * @param {object} options.query - The query to send.
   *
   * @returns {Promise<object>} - Resolves to the matching encrypted documents:
   *   `{documents: [...]}` or `{count: docCount}` if `query.count === true`.
   */
  // eslint-disable-next-line no-unused-vars
  async find({query} = {}) {
    _throwNotImplemented();
  }

  /**
   * Store a capability revocation.
   *
   * @param {object} options - The options to use.
   * @param {object} options.capabilityToRevoke - The capability to revoke.
   *
   * @returns {Promise<object>} Resolves once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async revokeCapability({capabilityToRevoke} = {}) {
    _throwNotImplemented();
  }

  /**
   * Sends an encrypted document chunk to an EDV server.
   *
   * @param {object} options - The options to use.
   * @param {string} options.docId - The document ID.
   * @param {number} options.chunk - The encrypted chunk.
   *
   * @returns {Promise} - Settles once the operation completes.
   */
  // eslint-disable-next-line no-unused-vars
  async storeChunk({docId, chunk}) {
    _throwNotImplemented();
  }

  /**
   * Gets an encrypted document chunk from an EDV server.
   *
   * @param {object} options - The options to use.
   * @param {string} options.docId - The document ID.
   * @param {number} options.chunkIndex - The index of the chunk.
   *
   * @returns {Promise<object>} - Resolves to the chunk data.
   */
  // eslint-disable-next-line no-unused-vars
  async getChunk({docId, chunkIndex} = {}) {
    _throwNotImplemented();
  }
}

function _throwNotImplemented() {
  throw new Error('Not implemented.');
}
