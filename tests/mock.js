/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import Pretender from 'pretender';
import {DataHubClient, DataHubService} from '..';
import {MockStorage} from 'bedrock-web-mock-data-hub-storage';
import {MockKmsService} from 'bedrock-web-mock-kms-http';
import {AccountMasterKey, KmsService} from 'bedrock-web-kms';
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
    const secret = 'bcrypt of password';
    const kmsService = new KmsService();
    mock.keys.master = await AccountMasterKey.fromSecret(
      {secret, accountId, kmsService, kmsPlugin: 'mock'});

    // create KEK and HMAC keys for creating data hubs
    mock.keys.kek = await mock.keys.master.generateKey({type: 'kek'});
    mock.keys.hmac = await mock.keys.master.generateKey({type: 'hmac'});
  }
};

mock.createDataHub = async (
  {controller = mock.accountId, primary = false} = {}) => {
  console.log('createDataHub 1');
  const dhs = new DataHubService();
  console.log('createDataHub 2');
  const {kek, hmac} = mock.keys;
  console.log('createDataHub 3', mock.keys);
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
  console.log('createDataHub end');
  return new DataHubClient({config, kek, hmac});
};
