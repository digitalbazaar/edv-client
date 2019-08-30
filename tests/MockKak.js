/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const base58 = require('../base58');
const nacl = require('tweetnacl');

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
    this.publicKeyBase58 = this.base58Encode(this.publicKey);
  }

  async deriveSecret({publicKey}) {
    const remotePublicKey = base58.decode(publicKey.publicKeyBase58);
    return nacl.scalarMult(this.privateKey, remotePublicKey);
  }

  base58Encode(x) {
    return base58.encode(x);
  }
}
