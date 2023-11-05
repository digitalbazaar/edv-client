import chai from 'chai';
global.should = chai.should();

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
