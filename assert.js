/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as base58 from 'base58-universal';

export function assert(variable, name, types) {
  if(!Array.isArray(types)) {
    types = [types];
  }
  const type = variable instanceof Uint8Array ? 'Uint8Array' : typeof variable;
  if(!types.includes(type) ||
    // an object must not falsey nor an array
    (type === 'object' && (!variable || Array.isArray(variable)))) {
    throw new TypeError(
      `"${name}" must be ${types.length === 1 ? 'a' : 'one of'} ` +
      `${types.join(', ')}.`);
  }
}

export function assertDocument(doc) {
  assert(doc, 'doc', 'object');
  const {id, content, meta = {}, stream} = doc;
  if(id !== undefined) {
    assertDocId(doc.id);
  }
  assert(content, 'content', 'object');
  assert(meta, 'meta', 'object');
  if(stream !== undefined) {
    assert(stream, 'stream', 'object');
  }
}

export function assertDocId(id) {
  try {
    // verify ID is multibase base58-encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multibase encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid document ID.');
    }
  } catch(e) {
    throw new Error(`Document ID "${id}" must be a multibase, base58-encoded ` +
      'array of 16 random bytes.');
  }
}

export function assertInvocationSigner(invocationSigner) {
  assert(invocationSigner, 'invocationSigner', 'object');
  const {id, sign} = invocationSigner;
  assert(id, 'invocationSigner.id', 'string');
  assert(sign, 'invocationSigner.sign', 'function');
}

export function assertTransport(transport) {
  assert(transport, 'transport', 'object');
}
