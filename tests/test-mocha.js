import chai from 'chai';
global.should = chai.should();

// WebCryypto polyfill if needed
import crypto from 'node:crypto';
import webcrypto from 'isomorphic-webcrypto';

if(!crypto.webcrypto) {
  crypto.webcrypto = webcrypto;
}

// WebStreams polyfill if needed
import {
  ReadableStream, TransformStream
} from 'web-streams-polyfill/dist/ponyfill.mjs';

if(!globalThis.ReadableStream) {
  globalThis.ReadableStream = ReadableStream;
}
if(!globalThis.TransformStream) {
  globalThis.TransformStream = TransformStream;
}
