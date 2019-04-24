/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from '../crypto.js';
// TODO: replace with forge once available?
// TODO: replace with XChaCha20Poly1305 once available
import {ChaCha20Poly1305, KEY_LENGTH} from '@stablelib/chacha20poly1305';

export const JWE_ENC = 'C20P';

/**
 * Generates a content encryption key (CEK). The 256-bit key is intended to be
 * used as a ChaCha20Poly1305 (RFC8439) key.
 *
 * @return {Promise<Uint8Array>} resolves to the generated key.
 */
export async function generateKey() {
  // generate content encryption key
  return crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
}

/**
 * Encrypts some data. The data will be encrypted using the given 256-bit
 * ChaCha20Poly1305 (RFC8439) content encryption key (CEK).
 *
 * @param {Uint8Array} data the data to encrypt.
 * @param {Uint8Array} additionalData optional additional authentication data.
 * @param {Uint8Array} the content encryption key to use.
 *
 * @return {Promise<Object>} resolves to `{ciphertext, iv, tag}`.
 */
export async function encrypt({data, additionalData, cek}) {
  if(!(data instanceof Uint8Array)) {
    throw new TypeError('"data" must be a Uint8Array.');
  }
  if(!(cek instanceof Uint8Array)) {
    throw new TypeError('"cek" must be a Uint8Array.');
  }

  const cipher = new ChaCha20Poly1305(cek);
  // Note: Uses a random value here as a counter is not viable -- multiple
  // recipients may be trying to update at the same time and use the same
  // counter breaking security; using XChaCha20Poly1305 once available will
  // further reduce chances of a collision as it has a 192-bit IV
  const iv = crypto.getRandomValues(new Uint8Array(cipher.nonceLength));

  // encrypt data
  const encrypted = cipher.seal(iv, data, additionalData);

  // split ciphertext and tag
  const ciphertext = encrypted.subarray(0, encrypted.length - cipher.tagLength);
  const tag = encrypted.subarray(encrypted.length - cipher.tagLength);

  return {
    ciphertext,
    iv,
    tag
  };
}

/**
 * Decrypts some encrypted data. The data must have been encrypted using
 * the given ChaCha20Poly1305 (RFC8439) content encryption key (CEK).
 *
 * @param {Uint8Array} ciphertext the data to decrypt.
 * @param {Uint8Array} iv the initialization vector (aka nonce).
 * @param {Uint8Array} tag the authentication tag.
 * @param {Uint8Array} additionalData optional additional authentication data.
 * @param {Uint8Array} cek the content encryption key to use.
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
  if(!(cek instanceof Uint8Array)) {
    throw new TypeError('"cek" must be a Uint8Array.');
  }

  // decrypt `ciphertext`
  const cipher = new ChaCha20Poly1305(cek);
  const encrypted = new Uint8Array(ciphertext.length + cipher.tagLength);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  return cipher.open(iv, encrypted, additionalData);
}
