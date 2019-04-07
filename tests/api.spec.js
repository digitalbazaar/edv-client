/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const chai = require('chai').use(require('chai-bytes'));
const env = require('./env');
const should = chai.should();

if(env.nodejs) {
  global.TextEncoder = require('util').TextEncoder;
}

describe('DataHubClient APIs', () => {
  describe('TODO', () => {
    it('should properly do something', async () => {
    });
  });
});

function _strToUint8Array(data) {
  if(typeof data === 'string') {
    // convert data to Uint8Array
    return new TextEncoder().encode(data);
  }
  if(!(data instanceof Uint8Array)) {
    throw new TypeError('"data" be a string or Uint8Array.');
  }
  return data;
}
