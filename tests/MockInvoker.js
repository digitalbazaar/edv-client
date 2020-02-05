import forge from 'node-forge';
import {decode} from 'base58-universal';

const {pki: {ed25519}} = forge;

// Ensures we use the same key for each test.
const _privateKeyBase58 = '5RB6LPkGsS1nuSM7NRmdAiFLGnLvKXH3' +
  'kYDPyEoAZXUjXaK6QxQC51kxH6vWUWNDGXkAYKLejbHHFTZXgA3LB8a3';
const _publicKeyBase58 = '3n6stGrydgUEQSXA4zxWbvdUvpiVwHDgZp2H9SxqY6gw';

export class MockInvoker {
  constructor({
    publicKeyBase58 = _publicKeyBase58,
    privateKeyBase58 = _privateKeyBase58,
    id,
    controller
  } = {}) {
    this.controller = controller;
    this.id = id || 'did:key:controller#assertionMethodId';
    this.type = 'Ed25519VerificationKey2018';
    if(!publicKeyBase58 && !privateKeyBase58) {
      const {publicKey, privateKey} = ed25519.generateKeyPair();
      this.publicKey = publicKey;
      this.privateKey = privateKey;
      return this;
    }
    this.privateKey = decode(privateKeyBase58);
    this.privateKey58 = decode(publicKeyBase58);
  }

  async sign({data}) {
    const {privateKey} = this;
    return ed25519.sign({message: data, privateKey});
  }
}
