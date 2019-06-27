// Node.js TextDecoder/TextEncoder/URL
export {TextDecoder, TextEncoder} from 'util';
export {URL} from 'url';

export function base64Encode(data) {
  return Buffer.from(data, data.offset, data.length).toString('base64');
}

export function base64Decode(str) {
  return Buffer.from(str, 'base64');
}
