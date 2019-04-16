// this is the polyfil so node has a crypto.subtle etc.
const crypto = require('isomorphic-webcrypto');
global.crypto = crypto;
const chai = require('chai');
global.should = chai.should();
