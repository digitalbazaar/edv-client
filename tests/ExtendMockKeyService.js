import {MockKmsService} from 'bedrock-web-mock-kms-http';
import * as base64url from 'base64url-universal';

class MockKeyService extends MockKmsService {
  constructor(params) {
    super(params);
  }
  async wrapKey({key, kekId, signer}) {
    const unwrappedKey = base64url.encode(key);
    const operation = {
      url: kekId,
      operation: {
        type: 'WrapKeyOperation',
        invocationTarget: kekId,
        unwrappedKey
      },
      signer
    };
    const {wrappedKey} = this.plugins.get('mock').wrapKey({operation});
    return wrappedKey;
  }
}

export default MockKeyService;
