import {Kek} from 'bedrock-web-kms/Kek.js';
import {Hmac} from 'bedrock-web-kms/Hmac.js';
import * as base64url from 'base64url-universal';

class MockMasterKey {
  constructor({accountId = 'test', signer, kmsService, kmsPlugin = 'mock'}) {
    this.accountId = accountId;
    this.signer = signer;
    this.kmsService = kmsService;
    this.kmsPlugin = kmsPlugin;
    // babel transpiles the MockKmsService back
    // so far that extends will not work with it
    // so I have to add these methods to MockKmsService here.
    this.kmsService.wrapKey = async function({key, kekId}) {
      const unwrappedKey = base64url.encode(key);
      const operation = {
        type: 'WrapKeyOperation',
        invocationTarget: kekId,
        unwrappedKey
      };
      const {wrappedKey} = await this.plugins
        .get('mock').wrapKey({keyId: kekId, operation});
      return wrappedKey;
    };
    this.kmsService.sign = async function({keyId, data, signer}) {
      data = base64url.encode(data);
      const operation = {
        type: 'SignOperation',
        invocationTarget: keyId,
        verifyData: data
      };
      const {signatureValue} = await this.plugins.get('mock').sign({keyId, operation});
      return signatureValue;
    };
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
    const operation = {
      invocationTarget: {type}
    };
    const base = 'http://localhost:9876/kms/mock/';
    const keyId = `${base}${type}`;
    const key = await this.kmsService.plugins
      .get('mock').generateKey({keyId, operation});
    // disable exporting keys
    const id = key.id;
    const signer = this.signer;
    const kmsService = this.kmsService;
    return new Class({id, signer, kmsService});
  }
}

module.exports = MockMasterKey;
