import {Kek} from 'bedrock-web-kms/Kek.js';
import {Hmac} from 'bedrock-web-kms/Hmac.js';

class MockMasterKey {
  constructor({accountId = 'test', signer, kmsService, kmsPlugin = 'mock'}) {
    this.accountId = accountId;
    this.signer = signer;
    this.kmsService = kmsService;
    this.kmsPlugin = kmsPlugin;
  }
  async generateKey({type}) {
    let Class;
    if(type === 'hmac') {
      type = 'Sha256HmacKey2019';
      Class = Hmac;
    } else if(type === 'kek') {
      type = 'AesKeyWrappingKey2019';
      Class = Kek;
    } else {
      throw new Error(`Unknown key type "${type}".`);
    }
    // disable exporting keys
    let key;
    const extractable = false;
    if(type === 'AesKeyWrappingKey2019') {
      // TODO: support other lengths?
      key = await crypto.subtle.generateKey(
        {name: 'AES-KW', length: 256},
        extractable,
        ['wrapKey', 'unwrapKey']);
    } else if(type === 'Sha256HmacKey2019') {
      // TODO: support other hashes?
      key = await crypto.subtle.generateKey(
        {name: 'HMAC', hash: {name: 'SHA-256'}},
        extractable,
        ['sign', 'verify']);
    } else {
      throw new Error(`Unknown key type "${type}".`);
    }
    key.id = 'http://localhost:9876/kms/mock/445d6646-076f-43b6-8918-4d55b062c34c';
    key.signer = this.signer;
    key.kmsService = this.kmsService;
    return key;
  }
}

module.exports = MockMasterKey;
