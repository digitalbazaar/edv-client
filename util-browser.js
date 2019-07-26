// browser TextDecoder/TextEncoder
/* eslint-env browser */
const TextDecoder = self.TextDecoder;
const TextEncoder = self.TextEncoder;
export {TextDecoder, TextEncoder};

let ReadableStream = self.ReadableStream;
let WritableStream = self.WritableStream;
// TODO: ensure this polyfill is necessary
import {ReadableStream as Readable, WritableStream as Writable}
  from 'web-streams-polyfill/ponyfill';
if(!(ReadableStream && ReadableStream.prototype.pipeTo &&
  ReadableStream.prototype.pipeThrough)) {
  // TODO: only polyfill the missing functions
  self.ReadableStream = ReadableStream = Readable;
}
if(!WritableStream) {
  self.WritableStream = WritableStream = Writable;
}
export {ReadableStream, WritableStream};
