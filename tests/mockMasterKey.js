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

    // for the time being, fips and recommended are the same; there is no
    // other standardized key wrapping algorithm
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

    const {kmsService, kmsPlugin: plugin, signer} = this;
    const id = await kmsService.generateKey({plugin, type, signer});
    return new Class({id, kmsService, signer});
  }
}

module.exports = MockMasterKey;
