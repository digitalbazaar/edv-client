/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as didMethodKey from '@digitalbazaar/did-method-key';
import {EdvClient} from '..';
import {MockStorage, BASE_URL} from './MockStorage.js';
import {MockServer} from './MockServer.js';
import {MockHmac} from './MockHmac.js';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {securityLoader} from '@digitalbazaar/security-document-loader';
import {constants as zcapConstants} from '@digitalbazaar/zcap';

const loader = securityLoader();
loader.addStatic(zcapConstants.ZCAP_CONTEXT_URL, zcapConstants.ZCAP_CONTEXT);
const securityDocumentLoader = loader.build();

const didKeyDriver = didMethodKey.driver();

export {BASE_URL};

export class TestMock {
  constructor(server = new MockServer()) {
    // create mock server
    this.server = server;
    const accountId = this.accountId = 'test';
    // mock edv storage
    this.edvStorage = new MockStorage(
      {server: this.server, controller: accountId});
    // this is used to store recipient keys
    this.keyStorage = new Map();
  }
  async init() {
    const controller = await this.createCapabilityAgent();
    const kak = controller.keyAgreementPair;
    const capabilityAgent = controller.capabilityAgent;
    // only init keys once
    // this is used for the edv controller's keys in the tests
    if(!this.keys) {
      // create mock keys
      this.keys = {};
      // this creates the same invocationSigner for each test.
      this.invocationSigner = capabilityAgent.signer;
      // create KAK and HMAC keys for creating edvs
      // this creates the same keyAgreementKey for each test.
      this.keys.keyAgreementKey = kak;
      // the creates the same hmac for each test.
      this.keys.hmac = await MockHmac.create();
      // only store the KaK in the recipient's keyStorage.
      this.keyStorage.set(
        this.keys.keyAgreementKey.id, this.keys.keyAgreementKey);
      this.keyResolver = ({id}) => {
        const key = this.keyStorage.get(id);
        if(key) {
          return key;
        }
        throw new Error(`Key ${id} not found`);
      };
      this.documentLoader = securityDocumentLoader;
      // store delegate for zcap delegation tests
      this.delegate = await this.createCapabilityAgent();
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
    config = await EdvClient.createEdv(
      {config, url: `${BASE_URL}/edvs`});
    return new EdvClient({id: config.id, keyAgreementKey, hmac});
  }

  async createCapabilityAgent() {
    const {methodFor} = await didKeyDriver.generate();
    const capabilityInvocationKeyPair =
      methodFor({purpose: 'capabilityInvocation'});
    const capabilityAgent = new Ed25519Signature2020(
      {key: capabilityInvocationKeyPair});

    const keyAgreementPair = methodFor({purpose: 'keyAgreement'});
    this.keyStorage.set(
      keyAgreementPair.id, keyAgreementPair.export({
        publicKey: true, includeContext: true}));

    return {capabilityAgent, keyAgreementPair};
  }
}

const singleton = new TestMock();
export default singleton;
