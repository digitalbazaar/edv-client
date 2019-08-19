/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';
import * as base64url from 'base64url-universal';

export class MockKeyAgreementKey {
  constructor({id, type, key}) {
    this.id = id;
    this.type = type;
    this.key = key;
  }

  static async create(key) {
    // random test data
    const id = key.id;
    const type = key.type;
    // this should be a tweet nacl ephemeral key.
    const kak = new MockKeyAgreementKey({id, type, key});
    return kak;
  }

  async wrapKey({unwrappedKey}) {
    const kak = this.key;

    // Note: algorithm name doesn't matter; will exported raw.
    // TODO: support other key lengths?
    const extractable = true;
    unwrappedKey = await crypto.subtle.importKey(
      'raw', unwrappedKey, {name: 'AES-GCM', length: 256},
      extractable, ['encrypt']);
    const wrappedKey = await crypto.subtle.wrapKey(
      'raw', unwrappedKey, kak, kak.algorithm);
    return base64url.encode(new Uint8Array(wrappedKey));
  }

  async unwrapKey({wrappedKey}) {
    const kak = this.key;

    let keyAlgorithm;
    if(kak.algorithm.name === 'AES-KW') {
      // Note: algorithm name doesn't matter; will be exported raw
      keyAlgorithm = {name: 'AES-GCM'};
    } else {
      throw new Error(`Unknown unwrapping algorithm "${kak.algorithm.name}".`);
    }

    wrappedKey = base64url.decode(wrappedKey);
    const extractable = true;
    const key = await crypto.subtle.unwrapKey(
      'raw', wrappedKey, kak, kak.algorithm,
      keyAlgorithm, extractable, ['encrypt']);

    const keyBytes = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(keyBytes);
  }
}
