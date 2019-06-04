# JavaScript Secure Data Hub Client _(secure-data-hub-client)_

[![Build Status](https://travis-ci.org/digitalbazaar/secure-data-hub-client.png?branch=master)](https://travis-ci.org/digitalbazaar/secure-data-hub-client)

> A JavaScript library for Web and node.js apps for interfacing with a remote
> Secure Data Hub server

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
with remote Secure Data Hub servers.

It consists of one main class:

1. `DataHubClient` - instances provide a CRUD (+ find) interface to a specific
  configured Data Hub server and ensure appropriate database indexes are
  set up. Static methods allow for the creation of data hubs with a remote
  storage service, e.g.
    [Data Hub storage server](https://github.com/digitalbazaar/bedrock-data-hub-storage).

## Install

To install locally (for development):

```
git clone https://github.com/digitalbazaar/secure-data-hub-client.git
cd secure-data-hub-client
npm install
```

## Usage

### Creating and registering a secure data hub

First, create a KEK (key encryption key) and an HMAC (hash-based message
authentication code) for encrypting your documents and blinding any indexed
attributes in them. This requires creating some cryptographic key material
which can be done locally or via a KMS system. The current example shows using
a KMS system (TODO: show a simpler local example):

```js
import {ControllerKey, KmsClient} from 'web-kms-client';
import {DataHubClient} from 'secure-data-hub-client';

```
Although Secure Data Hubs are not bound to any particular key management system,
we recommend that you set up a Key Management Service using an implementation
such as [`web-kms-switch`](https://github.com/digitalbazaar/web-kms-switch)
which you can connect to using
[`web-kms-client`](https://github.com/digitalbazaar/web-kms-client).

Optional:

```js
// Create a Controller Key (via a key management service)
const kmsService = new KmsService();
const controllerKey = await ControllerKey.fromSecret({secret, handle});

// Use the Controller Key to create KEK (key encryption key) and HMAC keys
const kek = await controllerKey.generateKey({type: 'kek'});
const hmac = await controllerKey.generateKey({type: 'hmac'});
```

Now you can create and register a new data hub configuration:

```js
// TODO: explain data hub service must be able to authenticate user against this
// using http signatures
const controller = 'account id goes here';

const config = {
  sequence: 0,  // TODO: is sequence required?
  controller,
  // TODO: Explain what 'referenceId' is
  referenceId: 'primary',
  kek: {id: kek.id, type: kek.type},
  hmac: {id: hmac.id, type: hmac.type}
};

// sends a POST request to the remote service to create a data hub
const remoteConfig = await DataHubClient.createDataHub({config});

// connect to the new data hub via a `DataHubClient`
const hub = new DataHubClient({id: remoteConfig.id, kek, hmac});
```

### Loading a saved data hub config

If you have previously registered a data hub config (via `createDataHub()`),
and you know its `id`, you can fetch its config via `get()`:

```js
// registered config
const {id} = await DataHubClient.createDataHub({config});

// later, it can be fetched via the id
const remoteConfig = await DataHubClient.getConfig({id});

// connect to the existing data hub via a `DataHubClient` instance
const hub = new DataHubClient({id: remoteConfig.id, kek, hmac});
```

If you know a controller/`accountId` but do not know a specific hub `id`, you
can request a data hub by a controller-scoped custom `referenceId`:

```js
// get the account's 'primary' data hub config to connect to the data hub
// note that a referenceId can be any string but must be unique per controller
const config = await DataHub.findConfig(
  {controller: accountId, referenceId: 'primary'});
const hub = new DataHubClient({id: config.id, kek, hmac});
```

### Using a DataHubClient instance for document storage

See the API section below.

## API

### `DataHubClient`

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
