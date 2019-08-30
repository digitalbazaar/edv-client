/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';
import * as base64url from 'base64url-universal';
const _secret = base64url.decode(
  '49JUNpuy7808NoTTbB0q8rgRuPSMyeqSswCnWKr0MF4');

export class MockHmac {
  constructor({id, type, algorithm, key}) {
    this.id = id;
    this.type = type;
    this.algorithm = algorithm;
    this.key = key;
  }

  static async create({data = _secret} = {}) {
    // random test data
    const id = 'urn:mockhmac:1';
    const type = 'Sha256HmacKey2019';
    const algorithm = 'HS256';
    const extractable = true;
    const key = await crypto.subtle.importKey(
      'raw', data, {name: 'HMAC', hash: {name: 'SHA-256'}}, extractable,
      ['sign', 'verify']);
    const hmac = new MockHmac({id, type, algorithm, key});
    return hmac;
  }

  async sign({data}) {
    const key = this.key;
    const signature = new Uint8Array(
      await crypto.subtle.sign(key.algorithm, key, data));
    return base64url.encode(signature);
  }

  async verify({data, signature}) {
    const key = this.key;
    signature = base64url.decode(signature);
    return crypto.subtle.verify(key.algorithm, key, signature, data);
  }
}
