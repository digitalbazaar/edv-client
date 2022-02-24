// Node.js TextDecoder/TextEncoder
export {TextDecoder, TextEncoder} from 'util';
export {ReadableStream, WritableStream} from 'web-streams-polyfill/ponyfill';

const crypto = require('crypto');
const {promisify} = require('util');
const randomFill = promisify(crypto.randomFill);

export async function getRandomBytes(buf) {
  return randomFill(buf);
}

export async function sha256(buf) {
  return new Uint8Array(crypto.createHash('sha256').update(buf).digest());
}
