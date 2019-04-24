const chai = require('chai');
global.should = chai.should();

// FIXME: setting global to avoid fixing sub-dependencies
global.crypto = require('isomorphic-webcrypto');
