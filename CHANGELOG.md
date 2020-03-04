# edv-client ChangeLog

### 2.5.0 - TBD

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
