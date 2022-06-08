export async function getRandomBytes(buf) {
  return globalThis.crypto.getRandomValues(buf);
}

export async function sha256(buf) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buf));
}
