/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {EdvClient} from '..';
import {MockStorage} from './MockStorage.js';
import {MockServer} from './MockServer.js';
import {MockHmac} from './MockHmac.js';
import {MockKak} from './MockKak.js';
import {MockInvoker} from './MockInvoker.js';

class TestMock {
  constructor(server = new MockServer()) {
    // create mock server
    this.server = server;
    const accountId = this.accountId = 'test';
    // mock edv storage
    this.edvStorage = new MockStorage(
      {server: this.server, controller: accountId});
  }
  async init() {
    // only init keys once
    if(!this.keys) {
      // create mock keys
      this.keys = {};
      // this creates the same invocationSigner for each test.
      this.invocationSigner = new MockInvoker();
      // create KAK and HMAC keys for creating edvs
      // this creates the same keyAgreementKey for each test.
      this.keys.keyAgreementKey = new MockKak();
      // the creates the same hmac for each test.
      this.keys.hmac = await MockHmac.create();
      this.keyResolver = ({id}) => {
        if(this.keys.keyAgreementKey.id === id) {
          return this.keys.keyAgreementKey;
        }
        throw new Error(`Key ${id} not found`);
      };
    }
  }
  async createEdv({controller, referenceId} = {}) {
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
    config = await EdvClient.createEdv({config});
    return new EdvClient({id: config.id, keyAgreementKey, hmac});
  }
}

const singleton = new TestMock();
export default singleton;
