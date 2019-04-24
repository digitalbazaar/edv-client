/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// polyfills
require('fast-text-encoding');
// translate `main.js` to CommonJS
require = require('esm')(module);
module.exports = require('./main.js');
