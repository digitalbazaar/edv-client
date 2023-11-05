/*
 * Copyright (c) 2019-2023 Digital Bazaar, Inc. All rights reserved.
 */
import Ajv from 'ajv';
import {edvConfig} from './ConfigSchema.js';

const ajv = new Ajv({verbose: true, removeAdditional: false});
ajv.addSchema(edvConfig, 'edvConfig');

// throws if validation fails
export function validateSchema({payload}) {
  // validate payload against JSON schema
  const valid = ajv.validate('edvConfig', payload);
  if(valid) {
    return true;
  }
  const error = new Error('Validation error.');
  error.errors = ajv.errors;
  throw error;
}
