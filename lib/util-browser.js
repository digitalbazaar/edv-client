/* eslint-env browser */
let ReadableStream = globalThis.ReadableStream;
let WritableStream = globalThis.WritableStream;
// TODO: ensure this polyfill is necessary
import {
  ReadableStream as Readable, WritableStream as Writable
} from 'web-streams-polyfill/dist/ponyfill.mjs';
if(!(ReadableStream && ReadableStream.prototype.pipeTo &&
  ReadableStream.prototype.pipeThrough)) {
  // TODO: only polyfill the missing functions
  globalThis.ReadableStream = ReadableStream = Readable;
}
if(!WritableStream) {
  globalThis.WritableStream = WritableStream = Writable;
}
export {ReadableStream, WritableStream};

const crypto = (globalThis.crypto || globalThis.msCrypto);

export async function getRandomBytes(buf) {
  return crypto.getRandomValues(buf);
}

export async function sha256(buf) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}
