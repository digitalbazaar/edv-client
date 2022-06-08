# JavaScript Encrypted Data Vault Client _(edv-client)_

[![Build Status](https://travis-ci.org/digitalbazaar/edv-client.png?branch=master)](https://travis-ci.org/digitalbazaar/edv-client)

> A JavaScript library for Web and node.js apps for interfacing with a remote
> Encrypted Data Vault server

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

This library provides a client that Web and node.js apps can use to interface
with remote Encrypted Data Vault (EDV) servers.

It consists of one main class:

1. `EdvClient` - instances provide a CRUD (+ find) interface to a specific
  configured Encrypted Data Vault server and ensure appropriate database
  indexes are set up. Static methods allow for the creation of EDVs with a
  remote storage service, e.g.
    [Encrypted Data Vault storage server](https://github.com/digitalbazaar/bedrock-data-hub-storage).

## Install

- Browsers and Node.js 14+ are supported.

To install from NPM:

```
npm install @digitalbazaar/edv-client
```

To install locally (for development):

```
git clone https://github.com/digitalbazaar/edv-client.git
cd edv-client
npm install
```

## Usage

### Creating and registering an Encrypted Data Vault (EDV)

First, create a key agreement key and an HMAC (hash-based message authentication
code) key for encrypting your documents and blinding any indexed attributes in
them. This requires creating some cryptographic key material which can be done
locally or via a KMS system. The current example shows using a KMS system
(TODO: show a simpler local example):

```js
import {CapabilityAgent, KeystoreAgent, KmsClient} from 'webkms-client';
import {EdvClient} from 'edv-client';

```
Although Encrypted Data Vaults are not bound to any particular key management
system, we recommend that you set up a Key Management Service using an
implementation such as
[`webkms-switch`](https://github.com/digitalbazaar/webkms-switch)
which you can connect to using
[`webkms-client`](https://github.com/digitalbazaar/webkms-client).

Optional:

```js
// create a CapabilityAgent (for invoking zcaps)
const capabilityAgent = await CapabilityAgent.fromSecret({secret, handle});

// create a keystore and an agent for working with it
// the baseUrl can be set to a dev API or production API
const kmsBaseUrl = `${config.server.baseUri}/kms`;
const keystore = KmsClient.createKeystore({
  // the url for the keystore is configurable
  url: `${kmsBaseUrl}/keystores`,
  config: {
    // on init the sequence must be 0
    sequence: 0,
    controller: capabilityAgent.id,
    invoker: capabilityAgent.id,
    // this allows the capabilityAgent to delegate zCaps
    delegator: capabilityAgent.id
  },
  /**
   * optional `httpsAgent`,
   * usually not applicable for front-end (you may use axios),
   * for back-end use cases a nodejs `https.Agent`
   * may be used to allow the use of self signed certificates using
   * the `rejectUnauthorized: false` flag in the contructor.
  */
  httpsAgent
});
const keystoreAgent = new KeystoreAgent({keystore, capabilityAgent});

// use the keystore agent to create key agreement and HMAC keys
const keyAgreementKey = await keystoreAgent.generateKey({type: 'keyAgreement'});
const hmac = await keystoreAgent.generateKey({type: 'hmac'});
```

Now you can create and register a new EDV configuration:

```js
// TODO: explain EDV service must be able to authenticate user
const controller = 'account id goes here';

const config = {
  // on init the sequence must be 0 and is required
  sequence: 0,
  controller,
  // TODO: Explain what 'referenceId' is
  referenceId: 'primary',
  keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
  hmac: {id: hmac.id, type: hmac.type}
};

// sends a POST request to the remote service to create an EDV
const remoteConfig = await EdvClient.createEdv({config});

// connect to the new EDV via a `EdvClient`
const client = new EdvClient({id: remoteConfig.id, keyAgreementKey, hmac});
```

You can specify a url when you create and register a new EDV configuration:

```js
// TODO: explain EDV service must be able to authenticate user
const controller = 'account id (or DID if using zcaps) goes here';

const config = {
  // on init the sequence must be 0 and is required
  sequence: 0,
  controller,
  // TODO: Explain what 'referenceId' is
  referenceId: 'primary',
  keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
  hmac: {id: hmac.id, type: hmac.type}
};

// sends a POST request to the remote service to create an EDV
const remoteConfig = await EdvClient.createEdv({
  url: 'https://server.example/edvs',
  config,
  // must pass `invocationSigner` and optional `capability` if `controller`
  // is a DID
  /* invocationSigner, capability */
});

// connect to the new EDV via a `EdvClient`
const client = new EdvClient({id: remoteConfig.id, keyAgreementKey, hmac});
```


### Loading a saved EDV config

If you have previously registered an EDV config (via `createEdv()`),
and you know its `id`, you can fetch its config via `get()`:

```js
// registered config
const {id} = await EdvClient.createEdv({config});

// later, it can be fetched via the id
const remoteConfig = await EdvClient.getConfig({id});

// connect to the existing EDV via an `EdvClient` instance
const client = new EdvClient({id: remoteConfig.id, keyAgreementKey, hmac});
```

If you know a controller/`accountId` but do not know a specific EDV `id`, you
can create a client for an EDV by a controller-scoped custom `referenceId`:

```js
// get the account's 'primary' EDV config to connect to the EDV
// note that a referenceId can be any string but must be unique per controller
const config = await EdvClient.findConfig(
  {controller: accountId, referenceId: 'primary'});
const client = new EdvClient({id: config.id, keyAgreementKey, hmac});
```

### Using a EdvClient instance for document storage

See the API section below.

## API

### `EdvClient`

#### `constructor`

#### `insert`

#### `get`

#### `update`

#### `delete`

#### `find`

#### `ensureIndex`

#### `updateIndex`

## Contribute

Please follow the existing code style.

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## Commercial Support

Commercial support for this library is available upon request from
Digital Bazaar: support@digitalbazaar.com

## License

[BSD-3-Clause](LICENSE.md) © Digital Bazaar
