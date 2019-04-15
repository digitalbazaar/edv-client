/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubService} from '..';
import mock from './mock.js';

describe('DataHubService', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    mock.server.shutdown();
  });

  it('should create data hub storage', async () => {
    console.log('should create data hub storage');
    const dhs = new DataHubService();
    console.log('should create data hub storage 2');
    const {kek, hmac} = mock.keys;
    const config = await dhs.create({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, algorithm: kek.algorithm},
        hmac: {id: hmac.id, algorithm: hmac.algorithm}
      }
    });
    console.log('should create data hub storage 3 config made', config);
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });
});
