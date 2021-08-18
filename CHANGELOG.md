# edv-client ChangeLog

## 9.1.0 - 2021-08-xx

### Changed
- Update dependencies.
- Accept `Hmac.sign()` interface that returns a signature that can
  be either base64url-encoded or bytes via a Uint8Array.

## 9.0.1 - 2021-06-08

### Changed
- Move `crypto.js` and `crypto-browser.js` to the `tests/` dir (since they're 
  used only by tests). Main code switches off of `util.js` and `util-browser.js`.

### Fixed
- Ensure indexed attributes are cleared when deleting a document.

## 9.0.0 - 2021-05-04

### Changed
- **BREAKING**: Use [@digitalbazaar/minimal-cipher@3.0](https://github.com/digitalbazaar/minimal-cipher/blob/master/CHANGELOG.md).
  Now uses `X25519KeyAgreementKey2020` instead of `X25519KeyAgreementKey2019`.
- Update deps and test deps to latest.

## 8.0.0 - 2021-03-12

### Changed
- **BREAKING**: Use `http-signature-zcap-invoke@3`. Includes breaking changes
  related to headers that contain timestamps.
- **BREAKING**: Drop support for Node.js 8 and 10.
- Update test dependencies.

## 7.0.1 - 2021-03-04

### Fixed
- Add missing dependency `web-streams-polyfill@2`.

## 7.0.0 - 2020-12-10

### Added
- **BREAKING**: Send stream information to the server (sequence and number of
  chunks), where applicable, since this is information the server could have
  already captured.

## 6.0.1 - 2020-09-28

### Fixed
- Properly handle params in findConfigs and updateConfig APIs.

## 6.0.0 - 2020-09-28

### Changed
- **BREAKING**: Switch internal HTTP client library from `axios` to
  `@digitalbazaar/http-client`. This is a breaking change because many errors
  produced by this client originate with the internal HTTP client library. The
  errors produced by the old library and the new library are not identical and
  therefore any tests/code that makes assertions about specific error signatures
  will need to be updated.

## 5.1.0 - 2020-09-22

### Changed
- Use dev dep node-forge@0.10.0.

### Added
- Add tests for writing an EDV document from a stream.

## 5.0.0 - 2020-08-25

### Changed
- **BREAKING**: Change deletion to remove all content but retain `id`
  and `sequence`.
- **BREAKING**: `doc` and `keyResolver` must be passed as an argument
  to `delete`.

## 4.0.1 - 2020-06-22

### Fixed
- Repair failed publish attempt.

## 4.0.0 - 2020-06-22

### Changed
- **BREAKING**: Improve error handling relating to the upper limits of
  document `sequence` numbers.
- **BREAKING**: The `find` API now returns an object `{documents: [...]}`
  instead of an array of documents.

## 3.1.0 - 2020-06-10

### Added
- Add a `count` method to the `EdvClient` class.

### Changed
- The mock route for EDV queries will return a count if `query.count` is true.

## 3.0.0 - 2020-06-04

### Added
- Add `count` feature to the `find` API.
- Add validation to EDV configs.

### Changed
- **BREAKING**: Do not mutate the document in the insert API.
- **BREAKING**: Serialize document values in a canonical way.
- Improve test coverage.

## 2.7.0 - 2020-04-21

### Added
- Setup CI and coverage workflow.

### Changed
- Use axios@0.19.2.

## 2.6.0 - 2020-04-14

### Added
- Add support for fully functional compound indexes. Partial support was
  available before but it did not function properly; this is being marked
  as an addition instead of a bug fix.

## 2.5.2 - 2020-03-18

### Fixed
- Default parameters to the `EdvDocument` constructor to `undefined` instead
  of `null`.

### 2.5.1 - 2020-03-04

### Fixed
- Fix conditional for `self`.
- Use absolute URL in test suite.

### 2.5.0 - 2020-03-04

### Added
- Implement zCaps in `findConfig` and `findConfigs` APIs.

### Fixed
- Properly construct absolute URLs where required.

## 2.4.1 - 2020-03-03

### Fixed
- Fix creation of root capability.

## 2.4.0 - 2020-03-02

### Added
- Implement revokeCapability API.

## 2.3.0 - 2020-02-27

### Added
- Add the ability to override/augment default HTTP headers in EdvClient API.

## 2.2.0 - 2020-02-26

### Added
- The `createEdv` API may now be called using a zCap. In this case, an
  `invocationSigner` is required, and if not supplied a root capability will
  be generated automatically.

### Changed
- Update dependencies.
- Use base58-universal.

## 2.1.0 - 2020-01-10

### Added
- Do not assume invocation target matches the document URL; handle
  cases where invocation target may be for the document collection.
- Allow capabilities to be used to enable/disable other capabilities.

## 2.0.0 - 2019-09-05

- Renamed to edv-client.

## 1.2.0 - 2019-08-29

### Added
- Add stream support to `DataHubDocument`.

## 1.1.0 - 2019-08-12

### Added
- Fix and enable `updateConfig` API.

## 1.0.3 - 2019-08-08

### Fixed
- Fix API when extending the keyResolver in cached key resolver.

## 1.0.2 - 2019-08-05

### Fixed
- Await random byte generation.

## 1.0.1 - 2019-08-02

### Changed
- Update dependencies.

## 1.0.0 - 2019-08-02

## 0.1.0 - 2019-08-02

### Added
- Add core files.

- See git history for changes previous to this release.
