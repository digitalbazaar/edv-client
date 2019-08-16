/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';
import * as base64url from 'base64url-universal';

export class MockKeyAgreementKey {
  constructor({id, type, algorithm, key}) {
    this.id = id;
    this.type = type;
    this.algorithm = algorithm;
    this.key = key;
  }

  static async create() {
    // random test data
    const id = 'urn:mockkak:1';
    const type = 'AesKeyWrappingKey2019';
    const algorithm = 'A256KW';
    const data =
      base64url.decode('AOaZ9uajdymvmWDkSPTllw68arl6fRrhLIVtECwhNWY');
    const extractable = true;
    const key = await crypto.subtle.importKey(
      'raw', data, {name: 'AES-KW', length: 256}, extractable,
      ['wrapKey', 'unwrapKey']);
    const kak = new MockKeyAgreementKey({id, type, algorithm, key});
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
