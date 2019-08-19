/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubClient} from '..';
import {MockStorage} from './MockStorage.js';
import {MockServer} from './MockServer.js';
import {MockKeyAgreementKey} from './MockKeyAgreementKey.js';
import {MockHmac} from './MockHmac.js';
import {MockControllerKey} from './MockControllerKey.js';

// FIXME use mock test data

class TestMock {
  constructor(server = new MockServer()) {
    // create mock server
    this.server = server;
    const accountId = this.accountId = 'test';
    // mock data hub storage
    this.dataHubStorage = new MockStorage(
      {server: this.server, controller: accountId});
  }
  async init() {
    // only init keys once
    if(!this.keys) {
      // create mock keys
      this.keys = {};
      this.invocationSigner = await MockControllerKey.create();
      // create KAK and HMAC keys for creating data hubs
      const {keyAgreement} = this.invocationSigner;
      this.keys.keyAgreementKey = await MockKeyAgreementKey.create(
        keyAgreement[0]);
      this.keys.hmac = await MockHmac.create();
      this.keyResolver = ({id}) => {
        if(this.keys.keyAgreementKey.id === id) {
          return this.keys.keyAgreementKey;
        }
        return this.keys.hmac;
      };
    }
  }
  async createDataHub({controller = this.accountId, referenceId} = {}) {
    const {keyAgreementKey, hmac} = this.keys;
    let config = {
      sequence: 0,
      controller: this.invocationSigner.id,
      keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
      hmac: {id: hmac.id, type: hmac.type}
    };
    if(referenceId) {
      config.referenceId = referenceId;
    }
    config = await DataHubClient.createDataHub({config});
    return new DataHubClient({id: config.id, keyAgreementKey, hmac});
  }
}

const singleton = new TestMock();
export default singleton;
