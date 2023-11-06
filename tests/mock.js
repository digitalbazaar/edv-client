/*!
 * Copyright (c) 2018-2023 Digital Bazaar, Inc. All rights reserved.
 */
import * as didMethodKey from '@digitalbazaar/did-method-key';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import {BASE_URL, MockStorage} from './MockStorage.js';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';
import {EdvClient} from '../lib/index.js';
import {MockHmac} from './MockHmac.js';
import {MockServer} from './MockServer.js';
import {securityLoader} from '@digitalbazaar/security-document-loader';
import {X25519KeyAgreementKey2020} from
  '@digitalbazaar/x25519-key-agreement-key-2020';
import {constants as zcapConstants} from '@digitalbazaar/zcap';

const loader = securityLoader();
loader.addStatic(zcapConstants.ZCAP_CONTEXT_URL, zcapConstants.ZCAP_CONTEXT);
const securityDocumentLoader = loader.build();

const didKeyDriver = didMethodKey.driver();
didKeyDriver.use({
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: Ed25519VerificationKey2020.from
});
didKeyDriver.use({
  multibaseMultikeyHeader: 'zDna',
  fromMultibase: EcdsaMultikey.from
});

export {BASE_URL};

const FIPS_KAK = {
  '@context': 'https://w3id.org/security/multikey/v1',
  id: 'did:key:zDnaey9HdsvnNjAn2PaCXXJihjNsiXWzCvRS9HgEbcjPqvPNY#' +
    'zDnaey9HdsvnNjAn2PaCXXJihjNsiXWzCvRS9HgEbcjPqvPNY',
  type: 'Multikey',
  controller: 'did:key:zDnaey9HdsvnNjAn2PaCXXJihjNsiXWzCvRS9HgEbcjPqvPNY',
  publicKeyMultibase: 'zDnaey9HdsvnNjAn2PaCXXJihjNsiXWzCvRS9HgEbcjPqvPNY',
  secretKeyMultibase: 'z42tqAhAsKYYJ3RnqzYKMzFvExVNK3NPNHgRHihqJjDAUzx6'
};

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
      const keyAgreement = true;
      const fipsKak = await EcdsaMultikey.from(FIPS_KAK, keyAgreement);
      fipsKak.type = FIPS_KAK.type;
      this.keys.fips = {keyAgreementKey: fipsKak};
      this.keyStorage.set(
        this.keys.fips.keyAgreementKey.id, this.keys.fips.keyAgreementKey);
      this.documentLoader = securityDocumentLoader;
      // store delegate for zcap delegation tests
      this.delegate = await this.createCapabilityAgent();
    }
  }
  async createEdv({
    controller, referenceId, invocationSigner, keyResolver,
    cipherVersion, _attributeVersion
  } = {}) {
    const {hmac} = this.keys;
    const {keyAgreementKey} = cipherVersion === 'fips' ?
      this.keys.fips : this.keys;
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
    return new EdvClient({
      id: config.id, keyAgreementKey, hmac,
      invocationSigner, keyResolver, cipherVersion, _attributeVersion
    });
  }

  async createCapabilityAgent() {
    // create capability agent for signing zcaps
    const verificationKeyPair = await Ed25519VerificationKey2020.generate();
    const {methodFor} = await didKeyDriver.fromKeyPair({verificationKeyPair});
    const capabilityInvocationKeyPair = methodFor(
      {purpose: 'capabilityInvocation'});
    const signer = verificationKeyPair.signer();
    signer.id = capabilityInvocationKeyPair.id;
    const capabilityAgent = {
      id: capabilityInvocationKeyPair.controller,
      signer
    };

    // get matching key agreement key pair
    const keyAgreementPublicKey = methodFor({purpose: 'keyAgreement'});
    const keyAgreementPair =
      X25519KeyAgreementKey2020.fromEd25519VerificationKey2020(
        {keyPair: verificationKeyPair});
    keyAgreementPair.id = keyAgreementPublicKey.id;
    keyAgreementPair.controller = keyAgreementPublicKey.controller;
    this.keyStorage.set(
      keyAgreementPair.id, keyAgreementPair.export({
        publicKey: true, includeContext: true}));

    return {capabilityAgent, keyAgreementPair};
  }
}

const singleton = new TestMock();
export default singleton;
