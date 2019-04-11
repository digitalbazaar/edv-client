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
    const dhs = new DataHubService();
    const {kek, hmac} = mock.keys;
    const config = await dhs.create({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, algorithm: kek.algorithm},
        hmac: {id: hmac.id, algorithm: hmac.algorithm}
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get data hub storage', async () => {
    const dhs = new DataHubService();
    const {kek, hmac} = mock.keys;
    const {id} = await dhs.create({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, algorithm: kek.algorithm},
        hmac: {id: hmac.id, algorithm: hmac.algorithm}
      }
    });
    const config = await dhs.get({id});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should create primary data hub storage', async () => {
    const dhs = new DataHubService();
    const {kek, hmac} = mock.keys;
    const config = await dhs.create({
      config: {
        sequence: 0,
        controller: mock.accountId,
        kek: {id: kek.id, algorithm: kek.algorithm},
        hmac: {id: hmac.id, algorithm: hmac.algorithm},
        primary: true
      }
    });
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  it('should get primary data hub storage', async () => {
    const dhs = new DataHubService();
    const {kek, hmac} = mock.keys;
    // note: Tests should run in isolation however this will return 409
    // DuplicateError when running in a suite.
    try {
      await dhs.create({
        config: {
          sequence: 0,
          controller: mock.accountId,
          kek: {id: kek.id, algorithm: kek.algorithm},
          hmac: {id: hmac.id, algorithm: hmac.algorithm},
          primary: true
        }
      });
    } catch(e) {
      // do nothing we just need to ensure that primary datahub was created.
    }
    const config = await dhs.getPrimary({controller: mock.accountId});
    config.should.be.an('object');
    config.id.should.be.a('string');
    config.controller.should.equal(mock.accountId);
    config.kek.should.be.an('object');
    config.hmac.should.be.an('object');
  });

  // TODO: add more tests: getAll, update, setStatus
});
