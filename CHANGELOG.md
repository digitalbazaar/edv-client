# @digitalbazaar/edv-client ChangeLog

## 15.0.0 - 2022-xx-xx

### Changed
- **BREAKING**: Convert to module (ESM).
- **BREAKING**: Require Node.js >=14.
- Update dependencies.
- Lint module.

## 14.1.1 - 2022-05-06

### Fixed
- Simplify prewarm cache algorithm.

## 14.1.0 - 2022-05-06

### Added
- Added cache for blinding attributes and code to prewarm it.

### Changed
- Use `Map` and promises instead of `object` for internal cached key
  resolver when processing streams.

## 14.0.0 - 2022-05-05

### Changed
- **BREAKING**: Blinded attributes (aka encrypted attributes/indexes) are
  now calculated differently and are incompatible with previous versions. A
  private `_migrate()` tool has been provided on `EdvClient` that can do
  basic migration from the old version to the new version, but is very
  limited to small queries (< 1000 docs) and must be run in a context that
  ensures unique constraints are not violated but concurrent writes that
  are external to the migration process. A more robust tool will only be
  written if it is found to be necessary.

## 13.0.0 - 2022-03-01

### Changed
- **BREAKING**: Better future proof zcap endpoints by posting zcap
  revocations to `/zcaps/revocations` instead of just `/revocations`.

## 12.0.2 - 2022-02-24

### Fixed
- Ensure EDV ID is parsed from `capability` param.

## 12.0.1 - 2022-02-23

### Fixed
- Add missing `capability` param.

## 12.0.0 - 2022-02-23

### Changed
- **BREAKING**: Locally digest all values used to produce encrypted
  indexes by using sha-256 prior to HMAC'ing them. This increases
  privacy when using a WebKMS system. This approach to producing
  encrypted indexes will be incompatible with previously generated
  attributes.

## 11.3.2 - 2022-02-20

### Fixed
- Fix missing param defaults for `count`.

## 11.3.1 - 2022-02-16

### Fixed
- Fix use of zcap with EDV ID as its target in `find`.

## 11.3.0 - 2022-02-06

### Added
- Expose `generateId` on EdvClientCore instances as well as statically.

## 11.2.0 - 2022-02-05

### Added
- Support `limit` option in `query`. If `limit` is passed, it must be
  an integer >= 1 and <= 1000. An EDV server that understands it will
  limit the results to the given value and report back a boolean,
  `hasMore`, to indicate whether there are more results that match
  the query. There is presently no cursor value that can be passed
  in a future query to continue / skip previous results, this is
  deferred to a future version.

## 11.1.2 - 2022-02-02

### Fixed
- Fix bugs with compound indexes. Previously, when a document contained
  multiple values for an attribute (e.g., an array value was used) that
  participated in a compound index, it was possible for the earlier
  values to be erroneously dropped from the index. This bug has now
  been fixed.
 
## 11.1.1 - 2022-01-31

### Fixed
- Add missing files to package.

## 11.1.0 - 2022-01-31

### Added
- Add new underlying transport layer abstraction for EDV clients. This
  exposes a new class `EdvClientCore` that relies on a `Transport`
  interface to handle communicating with an EDV server / storage. This
  class can be extended by derived classes that provide transport
  implementations. `EdvClient` has been refactored to use an HTTPS
  transport layer -- but in a backwards compatible fashion. A future
  version may introduce breaking changes to further separate concerns
  more cleanly.
- Enable `capability` and `invocationSigner` to be passed to the
  `EdvClient` constructor. If these are passed, then they do not
  need to be passed when calling individual methods as the defaults
  will be used. Take care to ensure that the capability passed is
  usable in all methods that are to be called without passing in
  a specific capability (this is not significantly different concern
  from before, however, there is a subtle difference because of the
  reliance on a default value.

## 11.0.0 - 2022-01-11

### Changed
- **BREAKING**: Use http-signature-zcap-invoke@5. These changes
  include major breaking simplifications to ZCAP (zcap@7).
- **BREAKING**: Renamed package to `@digitalbazaar/edv-client`.

## 10.0.0 - 2021-09-01

### Changed
- **BREAKING**: All root zcaps use `urn:root:zcap:` prefix. Root zcaps
  for documents are the EDV root zcap where the controller resides. This new
  client version must be paired with a new EDV server, it is not compatible
  with an old version.
- **BREAKING**: `getConfig` is now an instance member function instead
  of a static class member function. It requires that a capability be
  invoked to fetch the EDV config.
- **BREAKING**: Use simplified zcap revocation model via `revokeCapability`.
  Now any party that has delegated a zcap may revoke it by calling
  `revokeCapability` with the revoked zcap without passing an additional
  capability that targets a revocation endpoint. If no capability is passed,
  then the client will a root zcap at the `<edvId>/revocations/<zcap ID>`
  endpoint. The controller for this target is expected to be the delegator
  of the zcap.

### Removed
- **BREAKING**: Remove `enableCapability` and `disableCapability`. Full zcaps
  must be sent when invoking them at EDV servers so there is no need for
  enabling/disabling. To revoke a delegated authorized zcap, revoke it via
  `revokeCapability` instead.
- **BREAKING**: Remove unused `setStatus` API.

## 9.1.0 - 2021-08-19

### Changed
- Update dependencies.
- Accept `Hmac.sign()` interface that returns a signature that can
  be either base64url-encoded or bytes via a Uint8Array.
- Pin web-streams-polyfill@3.0.x. See minimal-cipher's changelog for
  more comments.

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
