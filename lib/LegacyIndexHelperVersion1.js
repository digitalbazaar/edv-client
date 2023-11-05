/*!
 * Copyright (c) 2019-2023 Digital Bazaar, Inc. All rights reserved.
 */
import * as base64url from 'base64url-universal';
import canonicalize from 'canonicalize';
import {sha256} from './util.js';
import split from 'split-string';

const ATTRIBUTE_PREFIXES = ['content', 'meta'];

export class LegacyIndexHelperVersion1 {
  /**
   * Creates a new LegacyIndexHelperVersion1 instance that can be used to blind
   * EDV document attributes to enable indexing.
   *
   * This is a legacy version that builds version 1 blinded attributes; it
   * should only be used when migrating old blinded attributes.
   *
   * @returns {LegacyIndexHelperVersion1} A LegacyIndexHelperVersion1 instance.
   */
  constructor() {
    this.indexes = new Map();
    this.compoundIndexes = new Map();
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
   */
  ensureIndex({attribute, unique = false} = {}) {
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
   * Blinds a single attribute using the given HMAC API.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {string} options.key - A key associated with a value.
   * @param {any} options.value - The value associated with the key for the
   *   attribute.
   *
   * @returns {Promise<object>} - Resolves to an object `{name, value}`.
   */
  async _blindAttribute({hmac, key, value}) {
    // salt values with key to prevent cross-key leakage
    value = canonicalize({key: value});
    const [blindedName, blindedValue] = await Promise.all(
      [this._blindString(hmac, key), this._blindString(hmac, value)]);
    return {name: blindedName, value: blindedValue};
  }

  /**
   * Builds a blind compound attribute from an array of blind attributes
   * via the given HMAC API.
   *
   * @param {object} options - The options to use.
   * @param {object} options.hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Array} options.blindAttributes - The blind attributes that
   *   comprise the compound index.
   * @param {number} [options.length=options.blindAttributes.length] - The
   *   number of blind attributes to go into the compound attribute
   *   (<= `blindAttributes.length`).
   *
   * @returns {Promise<string>} - Resolves to the blinded compound attribute.
   */
  async _blindCompoundAttribute({
    hmac, blindAttributes, length = blindAttributes.length
  }) {
    const selection = length === blindAttributes.length ?
      blindAttributes : blindAttributes.slice(0, length);
    const nameInput = selection.map(x => x.name).join(':');
    const valueInput = selection.map(x => x.value).join(':');
    const [name, value] = await Promise.all([
      this._blindString(hmac, nameInput),
      this._blindString(hmac, valueInput)
    ]);
    return {name, value};
  }

  /**
   * Blinds a string using the given HMAC API.
   *
   * @param {object} hmac - An HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {string} value - The value to blind.
   *
   * @returns {Promise<string>} - Resolves to the blinded value.
   */
  async _blindString(hmac, value) {
    // convert value to Uint8Array and hash it
    const data = await sha256(new TextEncoder().encode(value));
    const signature = await hmac.sign({data});
    if(typeof signature === 'string') {
      // presume base64url-encoded
      return signature;
    }
    // base64url-encode Uint8Array signature
    return base64url.encode(signature);
  }

  async _buildBlindAttributes({hmac, doc, equal, has}) {
    const result = [];

    // get all matching indexes and corresponding attribute values
    const {simpleMatches, compoundMatches, attributeValues} =
      this._getMatchingIndexes({doc, equal, has});

    // compute and store all blinded attributes in parallel
    const blindedAttributes = new Map();
    const blindPromises = [];
    for(const [attribute, valueSet] of attributeValues.entries()) {
      // create a blinded set for each attribute name; it will hold the
      // blinded attribute associated with each attribute+value pair
      const blindedSet = new Set();
      blindedAttributes.set(attribute, blindedSet);
      for(const v of valueSet) {
        // use an IIFE to push a promise onto `blindPromises` to await all
        // promises in parallel and within IIFE add the resolved blinded
        // attribute to the current attribute's `blindedSet`
        blindPromises.push((async () => {
          blindedSet.add(await this._blindAttribute(
            {hmac, key: attribute, value: v}));
        })());
      }
    }
    await Promise.all(blindPromises);

    // add all matching simple index blinded attributes and track simple
    // attributes to avoid duplicating entries when processing compound
    // indexes
    const simpleAttributes = new Set();
    for(const {attribute, unique} of simpleMatches) {
      const blindedSet = blindedAttributes.get(attribute);
      for(const blinded of blindedSet) {
        result.push({...blinded, unique});
      }
      simpleAttributes.add(attribute);
    }

    // compute and add all matching compound index blinded attributes
    const compoundPromises = [];
    for(const {attributes, unique} of compoundMatches) {
      /* Note: For each matching index, there are some number of matching
      attributes that need to be combinatorially spread. For example, for this
      index: `['content.a', 'content.b', 'content.c']`, there may be multiple
      values for each attribute such as `A` values for `content.a`, `B` values
      for `content.b`, and `C` values for `content.c`. Each combination these
      values will produce a new blinded attribute to add to `entry`.
      Combinations must also include partial ones, e.g., combinations of
      values for `content.a` alone as well as values for `content.a` and
      `content.b` without `content.c`. */
      const combinations = [];
      let previous = [[]];
      for(const attribute of attributes) {
        const blindedSet = blindedAttributes.get(attribute);
        if(!blindedSet) {
          // no values for current attribute, so no more entries to produce
          break;
        }
        // produce a new combination for every `blinded` value and every
        // combination from the previous attribute
        const next = [];
        for(const blinded of blindedSet) {
          for(const combination of previous) {
            next.push([...combination, blinded]);
          }
        }
        combinations.push(...next);
        previous = next;
      }

      // now generate entries from every combination
      for(const combination of combinations) {
        // skip generating an entry for this combination if it has just the
        // first attribute and an entry for it was already added
        if(combination.length === 1 && simpleAttributes.has(attributes[0])) {
          continue;
        }

        // use an IIFE to push a promise onto `compoundPromises` to await all
        // promises in parallel and within IIFE return blinded attribute to
        // add to `entry` below
        compoundPromises.push((async () => {
          const attribute = await this._blindCompoundAttribute({
            hmac, blindAttributes: combination
          });
          // an encrypted attribute is only unique for a compound index when
          // it contains a value for every attribute in the index
          attribute.unique = unique &&
            (combination.length === attributes.length);
          return attribute;
        })());
      }
    }
    result.push(...await Promise.all(compoundPromises));

    return result;
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
}

function _assertHmac(hmac) {
  if(!(hmac && typeof hmac === 'object' && typeof hmac.id === 'string' &&
    typeof hmac.sign === 'function' && typeof hmac.verify === 'function')) {
    throw new TypeError(
      '"hmac" must be an object with "id", "sign", and "verify" properties.');
  }
}
