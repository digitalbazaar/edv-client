const proxyquire = require('proxyquire').noCallThru();

proxyquire('./10-DataHubService.spec.js', {
  mock: {
    mock: () => console.log('pretender stubbed')
  }
});

proxyquire('./20-DataHub.spec.js', {
  mock: {
    mock: () => console.log('pretender stubbed')
  }
});
