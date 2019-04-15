import axios from 'axios';
import sinon from 'sinon';
import pathToRegexp from 'path-to-regexp';

class MockServer {
  constructor() {
    this.stubs = new Map();
    this.stubs.set('post', sinon.stub(axios, 'post'));
    this.stubs.set('get', sinon.stub(axios, 'get'));
    this.post = this.route(this.stubs.get('post'));
    this.get = this.route(this.stubs.get('get'));
  }
  route(stub) {
    return function(path, callback) {
      const pathRegex = pathToRegexp(path);
      console.log('pathRegex');
      return stub
        .withArgs(sinon.match(value => pathRegex.test(value)))
        .callsFake(callback);
    };
  }
}

export default MockServer;
