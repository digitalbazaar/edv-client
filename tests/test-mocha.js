const crypto = require('isomorphic-webcrypto');
global.crypto = crypto;
const chai = require('chai');
global.should = chai.should();
