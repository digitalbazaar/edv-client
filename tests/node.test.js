/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import {DataHubService, DataHubClient} from '..';
import mock from './mock.js';

describe('DataHubService', () => {
  before(async () => {
    await mock.init();
  });
  after(async () => {
    await mock.server.shutdown();
  });

  it('should fail to delete a non-existent document', async () => {
    const dataHub = await mock.createDataHub();
    const result = await dataHub.delete({id: 'foo'});
    result.should.equal(false);
  });
});
