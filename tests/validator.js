/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {edvConfig} from './ConfigSchema';

const Ajv = require('ajv');
const ajv = new Ajv({verbose: true, removeAdditional: false});
ajv.addSchema(edvConfig, 'edvConfig');

// throws if validation fails
export function validateSchema({payload}) {
  // validate payload against JSON schema
  const valid = ajv.validate('edvConfig', payload);
  if(valid) {
    return true;
  }
  const error = new SyntaxError('Validation error.');
  error.errors = ajv.errors;
  throw error;
}
