/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {edvConfig} from './ConfigSchema';
import Ajv from 'ajv';

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
