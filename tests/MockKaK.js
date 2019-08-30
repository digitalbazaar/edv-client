/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const base58 = require('../base58');
const nacl = require('tweetnacl');

export class MockKaK {
  constructor({secretKey}) {
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
