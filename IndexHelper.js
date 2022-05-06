/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
import base64url from 'base64url-universal';
import canonicalize from 'canonicalize';
import {LruCache} from '@digitalbazaar/lru-memoize';
import split from 'split-string';
import {sha256, TextEncoder} from './util.js';

const ATTRIBUTE_PREFIXES = ['content', 'meta'];

export class IndexHelper {
  /**
   * Creates a new IndexHelper instance that can be used to blind EDV
   * document attributes to enable indexing.
   *
   * @returns {IndexHelper}.
   */
  constructor() {
    this.indexes = new Map();
    this.compoundIndexes = new Map();
    this._cache = new LruCache({
      // each entry size ~64 bytes, 1000 entries ~= 64KiB
      max: 1000
    });
  }

  /**
   * Ensures that future documents inserted or updated using this client
   * instance will be indexed according to the given attribute, provided that
   * they contain that attribute. Compound indexes can be specified by
   * providing an array for `attribute`.
   *
   * Queries may be performed using compound indexes without specifying all
   * attributes in the compound index so long as there is at least one value
   * (or the attribute name for "has" queries) specified for consecutive
   * attributes starting with the first. This allows for querying using only
   * a prefix of a compound index. However, uniqueness will not be enforced
   * unless all attributes in the compound index are present in a document.
   *
   * @param {object} options - The options to use.
   * @param {string|string[]} options.attribute - The attribute name or an
   *   array of attribute names to create a unique compound index.
   * @param {boolean} [options.unique=false] - Set to `true` if the index
   *   should be considered unique, `false` if not.
   * @param {object} [options.hmac] - An optional HMAC API with `id`, `sign`,
   *   and `verify` properties for prewarming caches.
   */
  ensureIndex({attribute, unique = false, hmac} = {}) {
    let attributes = attribute;
    if(!Array.isArray(attribute)) {
      attributes = [attribute];
    }
    if(!(attributes.length > 0 &&
      attributes.every(x => typeof x === 'string'))) {
      throw new TypeError(
        '"attribute" must be a string or an array of strings.');
    }

    if(attributes.length === 1) {
      // add simple index
      this.indexes.set(attributes[0], unique);
    } else {
      // add compound index
      const key = attributes.map(x => encodeURIComponent(x)).join('|');
      this.compoundIndexes.set(key, {attributes, unique});
    }

    if(hmac) {
      _assertHmac(hmac);
      // ignore errors during prewarm; they are not fatal
      this._prewarmCache({attributes, hmac}).catch(() => {});
    }
  }

  /**
   * Creates an indexable entry of blinded attributes for the given document
   * using the HMAC associated with this instance.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {object} options.doc - The document to create the indexable entry
   *   for.
   *
   * @returns {Promise<object>} - Resolves to the new indexable entry.
   */
  async createEntry({hmac, doc}) {
    _assertHmac(hmac);
    const entry = {
      hmac: {
        id: hmac.id,
        type: hmac.type
      },
      sequence: doc.sequence,
      attributes: await this._buildBlindAttributes({hmac, doc})
    };
    return entry;
  }

  /**
   * Returns a shallow copy of the array of indexed entries for the given
   * document where any existing entry matching the HMAC associated with this
   * instance is updated to include the current document attributes. If no
   * existing entry is found, a new entry is appended to the shallow copy
   * prior to its return.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {object} options.doc - The document to create or update an indexable
   *   entry for.
   *
   * @returns {Promise<Array>} - Resolves to the updated array of indexable
   *   entries.
   */
  async updateEntry({hmac, doc}) {
    _assertHmac(hmac);

    // get previously indexed entries to update
    let {indexed = []} = doc;
    if(!Array.isArray(indexed)) {
      throw new TypeError('"indexed" must be an array.');
    }

    // create new entry
    const entry = await this.createEntry({hmac, doc});

    // find existing entry in `indexed` by hmac ID and type
    const i = indexed.findIndex(
      e => e.hmac.id === hmac.id && e.hmac.type === hmac.type);

    // replace or append new entry
    indexed = indexed.slice();
    if(i === -1) {
      indexed.push(entry);
    } else {
      indexed[i] = entry;
    }

    return indexed;
  }

  /**
   * Builds a query that can be submitted to an EDV index service.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {object|Array} [options.equals] - An object with key-value
   *   attribute pairs to match or an array of such objects.
   * @param {string|Array} [options.has] - A string with an attribute name to
   *   match or an array of such strings.
   *
   * @returns {Promise<object>} - Resolves to the built query.
   */
  async buildQuery({hmac, equals, has}) {
    _assertHmac(hmac);

    // validate params
    if(equals === undefined && has === undefined) {
      throw new Error('Either "equals" or "has" must be defined.');
    }
    if(equals !== undefined && has !== undefined) {
      throw new Error('Only one of "equals" or "has" may be defined at once.');
    }
    if(equals !== undefined) {
      if(Array.isArray(equals)) {
        if(!equals.every(x => (x && typeof x === 'object'))) {
          throw new TypeError('"equals" must be an array of objects.');
        }
      } else if(!(equals && typeof equals === 'object')) {
        throw new TypeError(
          '"equals" must be an object or an array of objects.');
      }
    }
    if(has !== undefined) {
      if(Array.isArray(has)) {
        if(!has.every(x => (x && typeof x === 'string'))) {
          throw new TypeError('"has" must be an array of strings.');
        }
      } else if(typeof has !== 'string') {
        throw new TypeError('"has" must be a string or an array of strings.');
      }
    }

    const query = {
      index: hmac.id,
    };

    if(equals) {
      // normalize to array
      if(!Array.isArray(equals)) {
        equals = [equals];
      }
      // blind all values in each `equal`
      query.equals = await Promise.all(equals.map(async equal => {
        const result = {};
        const blinded = await this._buildBlindAttributes({hmac, equal});
        for(const {name, value} of blinded) {
          result[name] = value;
        }
        return result;
      }));
    } else if(has !== undefined) {
      // normalize to array
      if(!Array.isArray(has)) {
        has = [has];
      }
      // blind every attribute name in `has`
      query.has = (await this._buildBlindAttributes({hmac, has}))
        .map(({name}) => name);
    }
    return query;
  }

  /**
   * Blinds a Uint8Array of bytes using the given HMAC API.
   *
   * @param {object} hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Uint8Array} data - The value to blind.
   *
   * @returns {Promise<string>} - Resolves to the blinded value.
   */
  async _blindData(hmac, data) {
    // convert value to Uint8Array and hash it
    const signature = await this._cachedHmac({hmac, data});
    if(typeof signature === 'string') {
      // presume base64url-encoded
      return signature;
    }
    // base64url-encode Uint8Array signature
    return base64url.encode(signature);
  }

  /**
   * Blinds a hashed attribute (compound or simple) using the given HMAC API.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {object} options.hashedAttribute - The attribute with `name`,
   *   `value`, and optional `unique` property; `name` and `value` MUST be
   *   Uint8Arrays.
   *
   * @returns {Promise<object>} - Resolves to an object
   *   `{name, value, unique?}`.
   */
  async _blindHashedAttribute({hmac, hashedAttribute}) {
    // salt values with key to prevent cross-key leakage
    const saltedValue = await sha256(
      _joinHashes([hashedAttribute.name, hashedAttribute.value]));
    const [name, value] = await Promise.all([
      this._blindData(hmac, hashedAttribute.name),
      this._blindData(hmac, saltedValue)
    ]);
    const blindAttribute = {name, value};
    if(hashedAttribute.unique) {
      blindAttribute.unique = true;
    }
    return blindAttribute;
  }

  async _buildBlindAttributes({hmac, doc, equal, has}) {
    const hashedAttributes = [];

    // get all matching indexes and corresponding attribute values
    const {simpleMatches, compoundMatches, attributeValues} =
      this._getMatchingIndexes({doc, equal, has});

    // compute and store all hashed attributes in parallel
    const hashedAttributeMap = new Map();
    const hashPromises = [];
    for(const [name, valueSet] of attributeValues.entries()) {
      // create a hashed set for each attribute name; it will hold the
      // hashed attribute associated with each name+value pair
      const hashedSet = new Set();
      hashedAttributeMap.set(name, hashedSet);
      for(const value of valueSet) {
        // use an IIFE to push a promise onto `hashPromises` to await all
        // promises in parallel and within IIFE add the resolved hashed
        // attribute to the current attribute's `hashedSet`
        hashPromises.push((async () => {
          hashedSet.add(await this._hashAttribute({hmac, name, value}));
        })());
      }
    }
    await Promise.all(hashPromises);

    // add all matching simple index hashed attributes and track simple
    // attributes to avoid duplicating entries when processing compound
    // indexes
    const simpleAttributes = new Set();
    for(const {attribute: name, unique} of simpleMatches) {
      const hashedSet = hashedAttributeMap.get(name);
      for(const hashed of hashedSet) {
        hashedAttributes.push({...hashed, unique});
      }
      simpleAttributes.add(name);
    }

    // compute and add all matching compound index hashed attributes
    const compoundPromises = [];
    for(const {attributes: names, unique} of compoundMatches) {
      /* Note: For each matching index, there are some number of matching
      attributes that need to be combinatorially spread. For example, for this
      index: `['content.a', 'content.b', 'content.c']`, there may be multiple
      values for each attribute such as `A` values for `content.a`, `B` values
      for `content.b`, and `C` values for `content.c`. Each combination these
      values will ultimately produce a new blinded attribute to add to `entry`.
      Combinations must also include partial ones, e.g., combinations of
      values for `content.a` alone as well as values for `content.a` and
      `content.b` without `content.c`. */
      const combinations = [];
      let previous = [[]];
      for(const name of names) {
        const hashedSet = hashedAttributeMap.get(name);
        if(!hashedSet) {
          // no values for current attribute name; no more entries to produce
          break;
        }
        // produce a new combination for every `hashed` value and every
        // combination from the previous attribute
        const next = [];
        for(const hashed of hashedSet) {
          for(const combination of previous) {
            next.push([...combination, hashed]);
          }
        }
        combinations.push(...next);
        previous = next;
      }

      // now generate entries from every combination
      for(const combination of combinations) {
        // skip generating an entry for this combination if it has just the
        // first attribute and an entry for it was already added
        if(combination.length === 1 && simpleAttributes.has(names[0])) {
          continue;
        }

        // use an IIFE to push a promise onto `compoundPromises` to await all
        // promises in parallel and within IIFE return hashed attribute to
        // blind and add to `entry` below
        compoundPromises.push((async () => {
          const attribute = await this._hashCompoundAttribute({
            hashedAttributes: combination
          });
          // an encrypted attribute is only unique for a compound index when
          // it contains a value for every attribute in the index
          attribute.unique = unique &&
            (combination.length === names.length);
          return attribute;
        })());
      }
    }
    hashedAttributes.push(...await Promise.all(compoundPromises));

    // blind all hashed attributes and return them
    return Promise.all(hashedAttributes.map(async hashedAttribute =>
      this._blindHashedAttribute({hmac, hashedAttribute})));
  }

  _getMatchingIndexes({doc, equal, has} = {}) {
    // build a map of `attribute name => set of values` whilst matching
    const attributeValues = new Map();
    let matchFn;
    if(doc) {
      // build a map of `attribute name => set of values` whilst matching
      // against the document
      matchFn = ({attribute}) => {
        return this._matchDocument({attribute, attributeValues, doc});
      };
    } else {
      // any attribute in `equal` or `has` entry is a match
      let attributes;
      if(equal) {
        attributes = Object.keys(equal);
        for(const [name, value] of Object.entries(equal)) {
          attributeValues.set(name, new Set([value]));
        }
      } else {
        attributes = has;
        for(const name of has) {
          // use dummy value of `true`; values will not be used in a `has`
          // query; note that this could be optimized to avoid the unnecessary
          // blinding of values in the future with more complex code
          attributeValues.set(name, new Set([true]));
        }
      }
      matchFn = ({attribute}) => attributes.includes(attribute);
    }
    const result = this._matchIndexes({matchFn});
    return {...result, attributeValues};
  }

  /**
   * Hashes a single attribute, converting its name and value into a hashed
   * name and hashed value.
   *
   * @param {object} options - The options to use.
   * @param {string} options.name - A name associated with a value.
   * @param {any} options.value - The value associated with the name for the
   *   attribute.
   *
   * @returns {Promise<object>} - Resolves to an object `{name, value}`.
   */
  async _hashAttribute({name, value}) {
    // canonicalize value to get consistent representation and hash
    value = canonicalize(value);
    const [hashedName, hashedValue] = await Promise.all(
      [_hashString(name), _hashString(value)]);
    return {name: hashedName, value: hashedValue};
  }

  /**
   * Builds a hashed compound attribute from an array of hashed attributes
   * via the given HMAC API.
   *
   * @param {object} options - The options to use.
   * @param {Array} options.hashedAttributes - The hashed attributes that
   *   comprise the compound index.
   * @param {number} [options.length=options.hashedAttributes.length] - The
   *   number of hashed attributes to go into the compound attribute
   *   (<= `hashedAttributes.length`).
   *
   * @returns {Promise<string>} - Resolves to the hashed compound attribute.
   */
  async _hashCompoundAttribute({
    hashedAttributes, length = hashedAttributes.length
  }) {
    const selection = length === hashedAttributes.length ?
      hashedAttributes : hashedAttributes.slice(0, length);
    const nameInput = _joinHashes(selection.map(x => x.name));
    const valueInput = _joinHashes(selection.map(x => x.value));
    const [name, value] = await Promise.all(
      [sha256(nameInput), sha256(valueInput)]);
    return {name, value};
  }

  _matchIndexes({matchFn} = {}) {
    // any simple index that has a value defined for its attribute is a match
    const simpleMatches = [];
    for(const [attribute, unique] of this.indexes.entries()) {
      if(matchFn({attribute})) {
        simpleMatches.push({attribute, unique});
      }
    }

    // any compound index that has a value defined for its first attribute is a
    // match; continue to process consecutive attributes whilst at least one
    // value per consecutive attribute is defined
    const compoundMatches = [];
    for(const index of this.compoundIndexes.values()) {
      let first = true;
      const {attributes} = index;
      for(const attribute of attributes) {
        if(!matchFn({attribute})) {
          // consecutive value not defined
          break;
        }
        if(first) {
          first = false;
          compoundMatches.push(index);
        }
      }
    }

    return {simpleMatches, compoundMatches};
  }

  _matchDocument({attribute, attributeValues, doc}) {
    // get attribute value from document
    const value = this._dereferenceAttribute({attribute, doc});
    if(value === undefined) {
      return false;
    }

    // get set of values
    let valueSet = attributeValues.get(attribute);
    if(!valueSet) {
      attributeValues.set(attribute, valueSet = new Set());
    }

    // add each value in an array as a separate attribute value
    if(Array.isArray(value)) {
      value.forEach(valueSet.add, valueSet);
    } else {
      valueSet.add(value);
    }

    return true;
  }

  _parseAttribute(attribute) {
    const keys = split(attribute);
    if(keys.length === 0) {
      throw new Error(
        `Invalid attribute "${attribute}"; it must be of the form ` +
        '"content.foo.bar".');
    }
    // ensure prefix is valid
    if(!ATTRIBUTE_PREFIXES.includes(keys[0])) {
      throw new Error(
        'Attribute "${attribute}" must be prefixed with one of the ' +
        `following: ${ATTRIBUTE_PREFIXES.join(', ')}`);
    }
    return keys;
  }

  _dereferenceAttribute({attribute, keys, doc}) {
    keys = keys || this._parseAttribute(attribute);
    let value = doc;
    while(keys.length > 0) {
      if(!(value && typeof value === 'object')) {
        return undefined;
      }
      const key = keys.shift();
      value = value[key];
      if(Array.isArray(value)) {
        // there are more keys, so recurse into array
        return value
          .map(v => this._dereferenceAttribute({keys: keys.slice(), doc: v}))
          .filter(v => v !== undefined);
      }
    }
    return value;
  }

  async _prewarmCache({attributes, hmac}) {
    const promises = [];
    const compound = [];
    for(const [i, name] of attributes.entries()) {
      const hashed = await _hashString(name);
      compound.push(hashed);
      const data = i === 0 ? hashed : await sha256(_joinHashes(compound));
      promises.push(this._cachedHmac({hmac, data}));
    }
    return Promise.all(promises);
  }

  async _cachedHmac({hmac, data}) {
    return this._cache.memoize({
      key: `${encodeURIComponent(hmac.id)}:${base64url.encode(data)}`,
      fn: () => hmac.sign({data})
    });
  }
}

function _assertHmac(hmac) {
  if(!(hmac && typeof hmac === 'object' && typeof hmac.id === 'string' &&
    typeof hmac.sign === 'function' && typeof hmac.verify === 'function')) {
    throw new TypeError(
      '"hmac" must be an object with "id", "sign", and "verify" properties.');
  }
}

async function _hashString(str) {
  return sha256(new TextEncoder().encode(str));
}

// `hashes` is an array of Uint8Arrays, each MUST have the same length
function _joinHashes(hashes) {
  if(hashes.length === 0) {
    return new Uint8Array(0);
  }

  const joined = new Uint8Array(hashes.length * hashes[0].length);
  let offset = 0;
  for(const hash of hashes) {
    joined.set(hash, offset);
    offset += hash.length;
  }

  return joined;
}
