import axios from 'axios';
import sinon from 'sinon';
import pathToRegexp from 'path-to-regexp';
import routeParams from 'route-params';

class MockServer {
  constructor() {
    this.stubs = new Map();
    this.stubs.set('post', sinon.stub(axios, 'post'));
    this.stubs.set('get', sinon.stub(axios, 'get'));
    this.stubs.set('delete', sinon.stub(axios, 'delete'));
    this.post = this.route(this.stubs.get('post'));
    this.get = this.route(this.stubs.get('get'));
    this.delete = this.route(this.stubs.get('delete'));
  }
  route(stub) {
    return function(path, callback) {
      const pathKeys = [];
      const pathRegex = pathToRegexp(path, pathKeys);
      return stub
        .withArgs(sinon.match(value => pathRegex.test(value)))
        .callsFake(function(route, body, headers) {
          const params = routeParams(path, route);
          const queryParams = {};
          for(const key in body.params) {
            queryParams[key] = String(body.params[key]);
          }
          const request = {
            requestBody: JSON.stringify(body),
            headers,
            params,
            queryParams
          };
          const result = callback(request);
          return {data: result[result.length - 1]};
        });
    };
  }
  shutdown() {return true;}
  prepareHeaders() {return true;}
  prepareBody() {return true;}
}

module.exports = MockServer;
