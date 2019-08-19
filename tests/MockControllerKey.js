import didKeyMethod from 'did-method-key';

const didKeyDriver = didKeyMethod.driver();

// TODO this needs to be an Ed25519 key pair from cryptold
// which in turn is an ed25519 pair from lib-sodium
export class MockControllerKey {
  constructor() {
    this.key = null;
  }
  static async create() {
    const controllerKey = await didKeyDriver.generate();
    return controllerKey;
  }
}
