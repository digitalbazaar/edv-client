// browser TextDecoder/TextEncoder
/* eslint-env browser */
const TextDecoder = self.TextDecoder;
const TextEncoder = self.TextEncoder;

// Note: ie11 needs a polyfill for URL
let URL = self.URL;
if(typeof URL !== 'function' && typeof window !== 'undefined') {
  // provide polyfill for ie11... note that this won't work in a WebWorker
  // because it relies on the DOM to parse URLs
  URL = function(url, base) {
    if(typeof url !== 'string') {
      throw new TypeError('"url" must be a string.');
    }
    if(base === undefined) {
      base = window.location.href;
    }
    // FIXME: rudimentary relative URL resolution
    if(!url.includes(':')) {
      if(base.startsWith('http') && !url.startsWith('/')) {
        url = base + '/' + url;
      } else {
        url = base + url;
      }
    }

    // `URL` API not supported, use DOM to parse URL
    const parser = document.createElement('a');
    parser.href = url;
    let origin = (parser.protocol || window.location.protocol) + '//';
    if(parser.host) {
      // use hostname when using default ports
      // (IE adds always adds port to `parser.host`)
      if((parser.protocol === 'http:' && parser.port === '80') ||
        (parser.protocol === 'https:' && parser.port === '443')) {
        origin += parser.hostname;
      } else {
        origin += parser.host;
      }
    } else {
      origin += window.location.host;
    }

    // ensure pathname begins with `/`
    let pathname = parser.pathname;
    if(!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }

    // TODO: is this safe for general use on every browser that doesn't
    //   support WHATWG URL?
    this.host = parser.host || window.location.host;
    this.hostname = parser.hostname;
    this.origin = origin;
    this.protocol = parser.protocol;
    this.pathname = pathname;
  };
  URL.prototype = self.URL;
}

export {TextDecoder, TextEncoder, URL};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64Encode(data) {
  return btoa(decoder.decode(data));
}

export function base64Decode(str) {
  return encoder.encode(atob(str));
}
