/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';

export const JWE_ENC = 'A256GCM';

/**
 * Generates a content encryption key (CEK). The 256-bit key is intended to be
 * used as an AES-GCM key.
 *
 * @return {Promise<CryptoKey>} resolves to the generated key.
 */
export async function generateKey() {
  // generate content encryption key
  return crypto.subtle.generateKey(
    {name: 'AES-GCM', length: 256},
    // key must be extractable in order to be wrapped
    true,
    ['encrypt']);
}

/**
 * Encrypts some data. The data will be encrypted using the given 256-bit
 * AES-GCM content encryption key (CEK).
 *
 * @param {Uint8Array} data the data to encrypt.
 * @param {Uint8Array} additionalData optional additional authentication data.
 * @param {Uint8Array|CryptoKey} the content encryption key to use.
 *
 * @return {Promise<Object>} resolves to `{ciphertext, iv, tag}`.
 */
export async function encrypt({data, additionalData, cek}) {
  cek = _importCek({cek, usages: ['encrypt']});

  // NIST Special Publication 800-38D 8.2.2 RGB Construction of IV allows for
  // 96-bit IVs to be randomly generated; should this recommendation change
  // we can pass in a sequence number that can be used in a fixed subfield
  // along with random bytes in another subfield
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // encrypt data
  const tagBytes = 16;
  const tagLength = tagBytes * 8;
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv, tagLength, additionalData}, cek, data));
  // split ciphertext and tag
  const ciphertext = encrypted.subarray(0, encrypted.length - tagBytes);
  const tag = encrypted.subarray(encrypted.length - tagBytes);

  return {
    ciphertext,
    iv,
    tag
  };
}

/**
 * Decrypts some encrypted data. The data must have been encrypted using
 * the given 256-bit AES-GCM content encryption key.
 *
 * @param {Uint8Array} ciphertext the data to decrypt.
 * @param {Uint8Array} iv the initialization vector.
 * @param {Uint8Array} tag the authentication tag.
 * @param {Uint8Array} additionalData optional additional authentication data.
 * @param {Uint8Array|CryptoKey} cek the content encryption key to use.
 *
 * @return {Promise<Uint8Array>} the decrypted data.
 */
export async function decrypt({ciphertext, iv, tag, additionalData, cek}) {
  if(!(iv instanceof Uint8Array)) {
    throw new Error('Invalid or missing "iv".');
  }
  if(!(ciphertext instanceof Uint8Array)) {
    throw new Error('Invalid or missing "ciphertext".');
  }
  if(!(tag instanceof Uint8Array)) {
    throw new Error('Invalid or missing "tag".');
  }

  cek = _importCek({cek, usages: ['decrypt']});

  // decrypt `ciphertext`
  const tagLength = tag.length;
  const encrypted = new Uint8Array(ciphertext.length + tagLength);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  const decrypted = new Uint8Array(await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv, tagLength, additionalData}, cek, encrypted));
  return decrypted;
}

function _importCek({cek, usages}) {
  if(cek instanceof CryptoKey) {
    // already imported
    return cek;
  }
  if(!(cek instanceof Uint8Array)) {
    throw new TypeError('"cek" must be a CryptoKey or Uint8Array.');
  }
  return crypto.subtle.importKey(
    'raw', cek, {name: 'AES-GCM', length: 256}, false, usages);
}
