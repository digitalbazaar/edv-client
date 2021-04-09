/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
import didContext from 'did-context';
import * as didMethodKey from '@digitalbazaar/did-method-key';
import {EdvClient} from '..';
import {MockStorage} from './MockStorage.js';
import {MockServer} from './MockServer.js';
import {MockHmac} from './MockHmac.js';
import {X25519KeyAgreementKey2020} from
  '@digitalbazaar/x25519-key-agreement-key-2020';
import {
  documentLoaderFactory,
  contexts,
} from '@transmute/jsonld-document-loader';
import * as ed25519 from 'ed25519-signature-2020-context';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';

const didKeyDriver = didMethodKey.driver();

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
    const res = await this.createCapabilityAgent();
    const capabilityInvocationKeyPair = res.capabilityInvocationKeyPair;
    const keyAgreementPair = res.keyAgreementPair;

    const capabilityAgent =
      new Ed25519Signature2020({key: capabilityInvocationKeyPair});

    // only init keys once
    // this is used for the edv controller's keys in the tests
    if(!this.keys) {
      // create mock keys
      this.keys = {};
      // this creates the same invocationSigner for each test.
      this.invocationSigner = capabilityAgent.signer;
      // create KAK and HMAC keys for creating edvs
      // this creates the same keyAgreementKey for each test.
      this.keys.keyAgreementKey = keyAgreementPair;
      // the creates the same hmac for each test.
      this.keys.hmac = await MockHmac.create();
      // only store the KaK in the recipients' keyStorage.
      this.keyStorage.set(
        this.keys.keyAgreementKey.id, this.keys.keyAgreementKey);
      this.keyResolver = ({id}) => {
        const key = this.keyStorage.get(id);
        if(key) {
          return key;
        }
        throw new Error(`Key ${id} not found`);
      };
      this.documentLoader = documentLoaderFactory.pluginFactory
        .build({
          contexts: {
            ...contexts.W3C_Verifiable_Credentials,
            'https://w3id.org/security/suites/ed25519-2020/v1': ed25519
              .contexts.get('https://w3id.org/security/suites/ed25519-2020/v1')
          }
        })
        .addContext({
          [didContext.constants.DID_CONTEXT_URL]: didContext
            .contexts.get('https://www.w3.org/ns/did/v1')
        })
        .buildDocumentLoader();
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
      {config, url: 'http://localhost:9876/edvs'});
    return new EdvClient({id: config.id, keyAgreementKey, hmac});
  }

  async createCapabilityAgent() {
    const {methodFor} = await didKeyDriver.generate();
    const capabilityInvocationKeyPair =
      methodFor({purpose: 'capabilityInvocation'});
    const keyAgreementPair = methodFor({purpose: 'keyAgreement'});
    this.keyStorage.set(
      keyAgreementPair.id, keyAgreementPair.export({
        publicKey: true, includeContext: true}));
    return {capabilityInvocationKeyPair, keyAgreementPair};
  }
  async createKeyAgreementKey(verificationKeyPair) {
    let didDocument, keyAgreementPair;

    if(verificationKeyPair) {
      // convert keyMaterial to a didDocument
      didDocument = await didKeyDriver.get({
        id: verificationKeyPair.controller});
      const [keyAgreementObj] = didDocument.keyAgreement;
      keyAgreementPair = await X25519KeyAgreementKey2020.from(keyAgreementObj);
    } else {
      // else generate a new one
      const result = await didKeyDriver.generate();
      const {methodFor} = result;
      ({didDocument} = result);
      keyAgreementPair = methodFor({purpose: 'keyAgreement'});
    }
    this.keyStorage.set(
      keyAgreementPair.id, keyAgreementPair.export({
        publicKey: true, includeContext: true}));
    return {didDocument, keyAgreementPair};
  }
}

const singleton = new TestMock();
export default singleton;
