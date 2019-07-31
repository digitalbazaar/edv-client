// Node.js TextDecoder/TextEncoder
export {TextDecoder, TextEncoder} from 'util';
export {ReadableStream, WritableStream} from 'web-streams-polyfill/ponyfill';

const crypto = require('crypto');
const {promisify} = require('util');
const randomFill = promisify(crypto.randomFill);

export async function getRandomBytes(buf) {
  return randomFill(buf);
}
