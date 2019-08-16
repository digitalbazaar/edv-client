import crypto from '../crypto.js';

export class MockControllerKey {
  constructor(seed) {
    this.seed = seed;
  }
  static async create() {
    const extractable = true;
    const key = await crypto.subtle.importKey(
      'raw', 'test', {name: 'HMAC', hash: {name: 'SHA-256'}}, extractable,
      ['sign', 'verify']);
    return {
      id: `did:key:test`,
      type: key.type,
      sign({data}) {
        return key.sign({data});
      }
    };
  }
}
