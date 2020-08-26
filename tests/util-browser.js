
// eslint-disable-next-line no-undef
let ReadableStream = window.ReadableStream;
// eslint-disable-next-line no-undef
let TransformStream = window.TransformStream;

// TODO: ensure this polyfill is necessary
import {ReadableStream as Readable, TransformStream as Transform}
  from 'web-streams-polyfill/ponyfill';
if(!ReadableStream) {
  ReadableStream = Readable;
}
if(!TransformStream) {
  TransformStream = Transform;
}
export {ReadableStream, TransformStream};
