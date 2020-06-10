/*!
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {encode, decode} from 'base58-universal';
import nacl from 'tweetnacl';
import {TextEncoder} from '../util.js';

// ensures tests use the same KaK for each test.
const _secretKey = new TextEncoder('utf-8').encode(
  'testKaK0123456789testKaK01234567');

export class MockKak {
  constructor({secretKey = _secretKey} = {}) {
    const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    this.id = 'urn:123',
    this.type = 'X25519KeyAgreementKey2019';
    this.privateKey = keyPair.secretKey;
    this.publicKey = keyPair.publicKey;
    this.publicKeyBase58 = encode(this.publicKey);
  }

  async deriveSecret({publicKey}) {
    const remotePublicKey = decode(publicKey.publicKeyBase58);
    return nacl.scalarMult(this.privateKey, remotePublicKey);
  }
}
