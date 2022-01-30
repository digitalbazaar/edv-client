/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
export function assertInvocationSigner(invocationSigner) {
  assert(invocationSigner, 'invocationSigner', 'object');
  const {id, sign} = invocationSigner;
  assert(id, 'invocationSigner.id', 'string');
  assert(sign, 'invocationSigner.sign', 'function');
}

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
