/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubClient} from '..';
import {MockStorage} from './MockStorage.js';
import {MockServer} from './MockServer.js';
import {MockHmac} from './MockHmac.js';
import {MockKaK} from './MockKaK.js';
import {MockInvoker} from './MockInvoker.js';

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
      // create KAK and HMAC keys for creating data hubs
      const privateKeyBase58 = '5RB6LPkGsS1nuSM7NRmdAiFLGnLvKXH3' +
        'kYDPyEoAZXUjXaK6QxQC51kxH6vWUWNDGXkAYKLejbHHFTZXgA3LB8a3';
      const publicKeyBase58 = '3n6stGrydgUEQSXA4zxWbvdUvpiVwHDgZp2H9SxqY6gw';
      this.invocationSigner = new MockInvoker(
        {privateKeyBase58, publicKeyBase58});
      const secretKey = new TextEncoder('utf-8').encode(
        'testKaK0123456789testKaK01234567');
      this.keys.keyAgreementKey = new MockKaK({secretKey});
      this.keys.hmac = await MockHmac.create();
      this.keyResolver = ({id}) => {
        if(this.keys.keyAgreementKey.id === id) {
          return this.keys.keyAgreementKey;
        }
        return this.keys.hmac;
      };
    }
  }
  async createDataHub({controller, referenceId} = {}) {
    const {keyAgreementKey, hmac} = this.keys;
    let config = {
      sequence: 0,
      controller: controller || this.invocationSigner.id,
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
