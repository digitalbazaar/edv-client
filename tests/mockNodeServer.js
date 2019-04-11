import axios from 'axios';
import sinon from 'sinon';
import pathToRegexp from 'path-to-regexp';
import routeParams from 'route-params';

/**
 * This is the sinon stub mock server.
 * It lacks some of the functionality of Pretender
 * however it can run alot of tests in node using mocha in less time.
 *
 * @class MockServer
 */
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
  /**
   * This is the core of the sinon axios mock server.
   * It takes in a stub which is then setup to a regex
   * to match a route and an async function that will handle the mock data
   *
   * @param {sinon.stub} stub - A sinon stub.
   *
   * @returns {Function} A function that will allow other services
   * should as mock storage and mock kms to setup test data.
   */
  route(stub) {
    /**
     * This is a function curried to a stub.
     *
     * @param {string} path - A valid express route path ex: data-hubs/:id
     * @param {Function} callback - A function that accepts the route params
     * and then produces mock data for a test.
     *
     * @returns {Object} The result of the callback.
     */
    return function(path, callback) {
      const pathRegex = pathToRegexp(path);
      return stub
        .withArgs(sinon.match(value => pathRegex.test(value)))
        .callsFake(async function(route, body, headers) {
          const params = routeParams(path, route);
          const queryParams = body ? body.params : {};
          for(const key in queryParams) {
            queryParams[key] = String(body.params[key]);
          }
          const request = {
            requestBody: JSON.stringify(body),
            headers,
            params,
            queryParams
          };
          const result = await callback(request);
          const [statusCode] = result;
          if(statusCode > 300) {
            const error = new Error(statusCode);
            error.response = {status: statusCode};
            switch(statusCode) {
              case 404:
                error.name = 'NotFoundError';
                throw error;
              case 409:
                error.name = 'DuplicateError';
                throw error;
              default:
                throw error;
            }
          }
          return {data: result[result.length - 1], status: statusCode};
        });
    };
  }
  shutdown() {return true;}
  prepareHeaders() {return true;}
  prepareBody() {return true;}
}

module.exports = MockServer;
