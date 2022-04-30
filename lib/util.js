export {
  ReadableStream, WritableStream
} from 'web-streams-polyfill/dist/ponyfill.mjs';
//} from 'web-streams-polyfill/ponyfill';

import crypto from 'crypto';
import {promisify} from 'util';
const randomFill = promisify(crypto.randomFill);

export async function getRandomBytes(buf) {
  return randomFill(buf);
}

export async function sha256(buf) {
  return new Uint8Array(crypto.createHash('sha256').update(buf).digest());
}
