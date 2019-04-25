/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';
import * as base64url from 'base64url-universal';

export class MockKek {
  constructor({id, algorithm, key}) {
    this.id = id;
    this.algorithm = algorithm;
    this.key = key;
  }

  static async create() {
    // random test data
    const id = 'urn:mockkek:1';
    const algorithm = 'A256KW';
    const data =
      base64url.decode('AOaZ9uajdymvmWDkSPTllw68arl6fRrhLIVtECwhNWY');
    const extractable = true;
    const key = await crypto.subtle.importKey(
      'raw', data, {name: 'AES-KW', length: 256}, extractable,
      ['wrapKey', 'unwrapKey']);
    const kek = new MockKek({id, algorithm, key});
    return kek;
  }

  async wrap({key}) {
    const kek = this.key;

    // Note: algorithm name doesn't matter; will exported raw.
    // TODO: support other key lengths?
    const extractable = true;
    key = await crypto.subtle.importKey(
      'raw', key, {name: 'AES-GCM', length: 256}, extractable, ['encrypt']);
    const wrappedKey = await crypto.subtle.wrapKey(
      'raw', key, kek, kek.algorithm);
    return base64url.encode(new Uint8Array(wrappedKey));
  }

  async unwrap({wrappedKey}) {
    const kek = this.key;

    let keyAlgorithm;
    if(kek.algorithm.name === 'AES-KW') {
      // Note: algorithm name doesn't matter; will be exported raw
      keyAlgorithm = {name: 'AES-GCM'};
    } else {
      throw new Error(`Unknown unwrapping algorithm "${kek.algorithm.name}".`);
    }

    wrappedKey = base64url.decode(wrappedKey);
    const extractable = true;
    const key = await crypto.subtle.unwrapKey(
      'raw', wrappedKey, kek, kek.algorithm,
      keyAlgorithm, extractable, ['encrypt']);

    const keyBytes = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(keyBytes);
  }
}
