/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import Pretender from 'pretender';
import {DataHubClient, DataHubService} from '..';
import {MockStorage} from 'bedrock-web-mock-data-hub-storage';
import {MockKmsService} from 'bedrock-web-mock-kms-http';
import {AccountMasterKey, KmsService} from 'bedrock-web-kms';
import {getMockKey} from './generateTestKey';

// FIXME use mock test data
//import {AccountMasterKey, KmsService} from 'bedrock-web-kms';

export const mock = {};

// TODO: add some static data to test against

mock.init = async () => {
  const accountId = mock.accountId = 'test';

  // create mock server
  const server = mock.server = new Pretender();
  // FIXME: there is special behavior here that the Mock* classes rely on;
  // we need to clean that up
  server.prepareHeaders = function(headers) {
    if(headers) {
      if(headers.json) {
        headers['content-type'] = 'application/json';
        delete headers.json;
      }
    } else {
      headers = {};
    }
    return headers;
  };
  server.prepareBody = function(body, headers) {
    if(headers && headers['content-type'] === 'application/json') {
      return (body && typeof body !== 'string') ?
        JSON.stringify(body) : '{"message": "mock server error"}';
    }
    return body;
  };

  // mock backend for KMS
  mock.kms = new MockKmsService({server});

  // mock data hub storage
  mock.dataHubStorage = new MockStorage({server, controller: accountId});

  // only init keys once
  if(!mock.keys) {
    // create mock keys
    mock.keys = {};

    // account master key for using KMS
    mock.keys.master = await getMockKey({kmsService: mock.kms});
    // create KEK and HMAC keys for creating data hubs
    mock.keys.kek = await mock.keys.master.generateKey({type: 'kek'});
    mock.keys.hmac = await mock.keys.master.generateKey({type: 'hmac'});
    console.log('hmac', mock.keys.hmac);
  }
};

mock.createDataHub = async (
  {controller = mock.accountId, primary = false} = {}) => {
  const dhs = new DataHubService();
  const {kek, hmac} = mock.keys;
  let config = {
    sequence: 0,
    controller,
    kek: {id: kek.id, algorithm: kek.algorithm},
    hmac: {id: hmac.id, algorithm: hmac.algorithm}
  };
  if(primary) {
    config.primary = true;
  }
  config = await dhs.create({config});
  return new DataHubClient({config, kek, hmac});
};
