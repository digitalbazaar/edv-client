import forge from 'node-forge';

const {pki: {ed25519}, util: {binary: {base58}}} = forge;

export class MockInvoker {
  constructor({publicKeyBase58, privateKeyBase58} = {}) {
    this.id = 'did:mock:invoker';
    this.type = 'Ed25519VerificationKey2018';
    if(!publicKeyBase58 && !privateKeyBase58) {
      const {publicKey, privateKey} = ed25519.generateKeyPair();
      this.publicKey = publicKey;
      this.privateKey = privateKey;
      return this;
    }
    this.privateKey = base58.decode(privateKeyBase58);
    this.privateKey58 = base58.decode(publicKeyBase58);
  }
  async sign({data}) {
    const {privateKey} = this;
    return ed25519.sign({message: data, privateKey});
  }
}
