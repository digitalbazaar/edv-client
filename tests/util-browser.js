// eslint-disable-next-line no-undef
let ReadableStream = globalThis.ReadableStream;
// eslint-disable-next-line no-undef
let TransformStream = globalThis.TransformStream;

import {
  ReadableStream as Readable,
  TransformStream as Transform
} from 'web-streams-polyfill/dist/ponyfill.mjs';
if(!ReadableStream) {
  ReadableStream = Readable;
}
if(!TransformStream) {
  TransformStream = Transform;
}
export {ReadableStream, TransformStream};
