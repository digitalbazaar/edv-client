// WebCrypto polyfill
export {default} from 'isomorphic-webcrypto';

// FIXME: here to avoid fixing sub-dependencies
import {default as crypto} from 'isomorphic-webcrypto';
global.crypto = crypto;
