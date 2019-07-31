/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {encode as _encode, decode as _decode} from './baseN.js';

// base58 characters (Bitcoin alphabet)
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encode(input, maxline) {
  return _encode(input, alphabet, maxline);
}

export function decode(input) {
  return _decode(input, alphabet);
}
