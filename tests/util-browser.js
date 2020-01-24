
let ReadableStream = window.ReadableStream;
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
