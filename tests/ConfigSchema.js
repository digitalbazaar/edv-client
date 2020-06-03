/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */

export const edvConfig = {
  title: 'EDV Configuration',
  type: 'object',
  required: ['controller', 'sequence'],
  properties: {
    id: {
      type: 'string'
    },
    controller: {
      type: 'string'
    },
    invoker: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: [{type: 'string'}]
      }]
    },
    delegator: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: [{type: 'string'}]
      }]
    },
    keyAgreementKey: {
      type: 'object',
      required: ['id', 'type'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
        type: {
          type: 'string'
        }
      }
    },
    hmac: {
      type: 'object',
      required: ['id', 'type'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
        type: {
          type: 'string'
        }
      }
    },
    sequence: {
      type: 'integer',
      minimum: 0
    },
    referenceId: {
      type: 'string'
    }
  },
  additionalProperties: false,
};
