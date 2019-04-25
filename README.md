# JavaScript Data Hub Client _(data-hub-client)_

[![Build Status](https://travis-ci.org/digitalbazaar/data-hub-client.png?branch=master)](https://travis-ci.org/digitalbazaar/data-hub-client)

> A JavaScript library for Web and node.js apps for interfacing with a remote
> Data Hub server

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
with remote Data Hub servers.

It consists of two main classes:

1. `DataHubService` - stores and manages data hubs with a remote service, e.g.
  [Data Hub storage server](https://github.com/digitalbazaar/bedrock-data-hub-storage).
  Used to create or fetch data hub configuration instances.
2. `DataHubClient` - provides a CRUD (+ find) interface to a specific
  configured Data Hub server. Also ensures appropriate database indexes are
  set up.

## Install

To install locally (for development):

```
git clone https://github.com/digitalbazaar/data-hub-client.git
cd data-hub-client
npm install
```

## Usage

### Creating and registering a data hub

First, create a `DataHubService` instance. This currently requires creating
some cryptographic key material which can be done locally or via a KMS system.
The current example shows using a KMS system (TODO: show a simpler local
example):

```js
import {AccountMasterKey, KmsService} from 'bedrock-web-kms';
import {DataHubClient, DataHubService} from 'data-hub-client';

// Create a `DataHubService` instance (which can be used to create data hubs)
const dhs = new DataHubService();
```

Although you can use Data Hubs while doing your own key management, we
recommend that you set up a Key Management Service such as a
([`bedrock-web-kms`](https://github.com/digitalbazaar/bedrock-web-kms))
instance first.

Optional:

```js
// Create a Master Key (via a key management service)
const kmsService = new KmsService();
const masterKey = await AccountMasterKey.fromSecret({secret, accountId});

// Use the Master Key to create KEK and HMAC keys
const kek = await masterKey.generateKey({type: 'kek'}); // Key Encryption Key
const hmac = await masterKey.generateKey({type: 'hmac'});

```

Now you can create and register a new data hub configuration:

```js
const controller = 'account id goes here';

const primary = true; // TODO: Explain what a primary data hub is

const config = {
  sequence: 0,  // TODO: is sequence required?
  controller,
  primary,
  kek: {id: kek.id, algorithm: kek.algorithm},
  hmac: {id: hmac.id, algorithm: hmac.algorithm}
};

// sends a POST request to the remote service to create a data hub
const remoteConfig = await dhs.create({config});

// connect to the new data hub via a `DataHubClient`
const hub = new DataHubClient({config: remoteConfig, kek, hmac});
```

### Loading a saved data hub config

If you have previously registered a data hub config (via `create()`), and you
know its `id`, you can fetch its config via `get()`:

```js
// previously registered config
const {id} = await dhs.create({config});

// later, it can be fetched via the id
const remoteConfig = await dhs.get({id});

// connect to the existing data hub via a `DataHubClient`
const hub = new DataHubClient({config: remoteConfig, kek, hmac});
```

If you know a controller/`accountId` but do not know a specific hub `id`, you
can request "primary registered data hub for a given account":

```js
// get the account's primary data hub config to connect to the data hub
const remoteConfig = await dhs.getPrimary({controller: accountId});
const hub = new DataHubClient({config: remoteConfig, kek, hmac});
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
