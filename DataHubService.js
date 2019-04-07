/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import axios from 'axios';

const headers = {Accept: 'application/ld+json, application/json'};

export class DataHubService {
  constructor({
    urls = {
      base: '/data-hubs'
    }
  } = {}) {
    this.config = {urls};
  }

  /**
   * Creates a new data hub using the given configuration.
   *
   * @param {Object} options
   *
   * @param {String} options.url the url to post the configuration to.
   *
   * @param {String} options.config the data hub's configuration.
   *
   * @return {Object} the configuration for the newly created data hub.
   */
  async create({url = this.config.urls.base, config}) {
    // TODO: more robustly validate `config` (`kek`, `hmac`, if present, etc.)
    if(!(config && typeof config === 'object')) {
      throw new TypeError('"config" must be an object.');
    }
    if(!(config.controller && typeof config.controller === 'string')) {
      throw new TypeError('"controller" must be a string.');
    }
    const response = await axios.post(url, config, {headers});
    return response.data;
  }

  /**
   * Get the configuration for a data hub.
   *
   * @param {Object} options
   * @param {String} options.baseUrl the base baseUrl.
   * @param {String} options.id the data hub's ID.
   *
   * @return {Object} the configuration for the data hub.
   */
  async get({baseUrl = this.config.urls.base, id}) {
    const response = await axios.get(baseUrl + '/' + id, {headers});
    return response.data;
  }

  /**
   * Get the primary data hub for the given controller.
   *
   * @param {Object} options
   * @param {String} options.baseUrl the base baseUrl.
   * @param {String} options.controller the ID of the controller.
   *
   * @return {Object} the controller's primary data hub configuration.
   */
  async getPrimary({baseUrl = this.config.urls.base, controller}) {
    const results = await this.getAll({baseUrl, controller, primary: true});
    return results[0] || null;
  }

  /**
   * Get all data hub configurations matching a query.
   *
   * @param {Object} options
   * @param {String} options.baseUrl the base baseUrl.
   * @param {String} options.controller the data hub's controller.
   * @param {String} options.primary true to return primary data hubs.
   * @param {String} options.after a data hub's ID.
   * @param {Number} options.limit how many data hub configs to return.
   *
   * @return {Array} the matching data hub configurations.
   */
  async getAll(
    {baseUrl = this.config.urls.base, controller, primary, after, limit}) {
    const response = await axios.get(baseUrl, {
      params: {controller, primary, after, limit}, headers});
    return response.data;
  }

  /**
   * Updates a data hub configuration via a JSON patch as specified by:
   * [json patch format]{@link https://tools.ietf.org/html/rfc6902}
   * [we use fast-json]{@link https://www.npmjs.com/package/fast-json-patch}
   * to apply json patches.
   *
   * @param {Object} options
   * @param {String} options.baseUrl
   * @param {String} options.id an data hub's ID.
   * @param {Number} options.sequence a data hub config's sequence number.
   * @param {Array<Object>} options.patch a JSON patch per RFC6902.
   *
   * @return {Void}
   */
  async update({baseUrl = this.config.urls.base, id, sequence, patch}) {
    const patchHeaders = {'Content-Type': 'application/json-patch+json'};
    await axios.patch(
      `${baseUrl}/${id}`, {sequence, patch}, {headers: patchHeaders});
  }

  /**
   * Sets the status of a data hub.
   *
   * @param {Object} options
   * @param {string} options.baseUrl
   * @param {string} options.id a data hub ID.
   * @param {string} options.status either `active` or `deleted`.
   *
   * @return {Void}
  */
  async setStatus({baseUrl = this.config.urls.base, id, status}) {
    // FIXME: add ability to disable data hub access or to revoke all ocaps
    // that were delegated prior to a date of X.
    await axios.post(`${baseUrl}/${id}/status`, {status}, {headers});
  }
}
