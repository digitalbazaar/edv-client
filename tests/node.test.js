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
  it('should get primary data hub storage', async () => {
    // Note: depends on previous test that created primary data hub
    // could alternatively change `before/after` to `beforeEach/afterEach`
    // to enable creating multiple primary data hubs
    const dhs = new DataHubService();
    const config = await dhs.getPrimary({controller: mock.accountId});
    console.log('config', config);
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });
});
