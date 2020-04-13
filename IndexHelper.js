/*!
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {TextEncoder} from './util.js';
import split from 'split-string';

const ATTRIBUTE_PREFIXES = ['content', 'meta'];

export class IndexHelper {
  /**
   * Creates a new IndexHelper instance that can be used to blind EDV
   * document attributes to enable indexing.
   *
   * @return {IndexHelper}.
   */
  constructor() {
    this.indexes = new Map();
    this.compoundIndexes = new Map();
  }

  /**
   * Ensures that future documents inserted or updated using this Edv
   * instance will be indexed according to the given attribute, provided that
   * they contain that attribute. Compound indexes can be specified by
   * providing an array for `attribute`.
   *
   * @param {Object} options - The options to use.
   * @param {string|Array} options.attribute the attribute name or an array of
   *   attribute names to create a unique compound index.
   * @param {boolean} [options.unique=false] `true` if the index should be
   *   considered unique, `false` if not.
   */
  ensureIndex({attribute, unique = false}) {
    let attributes = attribute;
    if(!Array.isArray(attribute)) {
      attributes = [attribute];
    }
    if(!(attributes.length > 0 &&
      attributes.every(x => typeof x === 'string'))) {
      throw new TypeError(
        '"attribute" must be a string or an array of strings.');
    }

    // parse attributes to ensure validity and add a non-unique index for every
    // attribute, taking care not to overwrite an existing unique index...
    // ... this ensures that `has` queries will work on all attributes even
    // if they are only participants in compound indexes
    attributes.forEach(attr => {
      this._parseAttribute(attr);
      if(!this.indexes.has(attr)) {
        this.indexes.set(attr, false);
      }
    });

    if(attributes.length === 1) {
      // if index is not compound but unique, ensure it is marked as unique
      if(unique) {
        this.indexes.set(attributes[0], unique);
      }
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
   * @param {Object} options - The options to use.
   * @param {Object} options.hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Object} options.doc the document to create the indexable entry for.
   *
   * @return {Promise<Object>} resolves to the new indexable entry.
   */
  async createEntry({hmac, doc}) {
    _assertHmac(hmac);

    const {compoundIndexes, indexes} = this;
    const entry = {
      hmac: {
        id: hmac.id,
        type: hmac.type
      }
    };

    // ensure current iteration/version matches doc's
    entry.sequence = doc.sequence;

    // build a map of attribute name to blinded attribute for all
    // indexes (singular and compound)
    const blindMap = new Map();

    // blind all attributes that are part of any simple index
    const blindOps = [];
    for(const [attribute, unique] of indexes.entries()) {
      let value = this._dereferenceAttribute({attribute, doc});
      if(value === undefined) {
        continue;
      }
      if(!Array.isArray(value)) {
        value = [value];
      }
      for(const v of value) {
        blindOps.push((async () => {
          const blinded = await this._blindAttribute(
            {hmac, key: attribute, value: v});
          blindMap.set(attribute, blinded);
          return {...blinded, unique};
        })());
      }
    }

    // get all blinded attribute and value pairs
    entry.attributes = await Promise.all(blindOps);

    // build compound attributes (for every attribute after the first in the
    // compound index, hash attribute names and values together)
    const compoundOps = [];
    for(const {attributes, unique} of compoundIndexes.values()) {
      // get blinded attributes involved in the compound index, noting that
      // the document may not have every attribute, so it only participates
      // in the index up until an "undefined" attribute is encountered
      const blindAttributes = [];
      for(const attr of attributes) {
        const blinded = blindMap.get(attr);
        if(blinded) {
          blindAttributes.push(blinded);
        } else {
          break;
        }
      }
      for(let i = 1; i < blindAttributes.length; ++i) {
        compoundOps.push((async () => {
          const attribute = await this._blindCompoundAttribute(
            {hmac, blindAttributes, length: i + 1});
          // intentionally check `attributes.length` here not
          // `blindAttributes.length`, uniqueness is defined by the full
          // compound index and will not be set if the document only has
          // some attributes in the compound index, not all
          attribute.unique = unique && (i === attributes.length - 1);
          return attribute;
        })());
      }
    }
    entry.attributes.push(...await Promise.all(compoundOps));

    return entry;
  }

  /**
   * Returns a shallow copy of the array of indexed entries for the given
   * document where any existing entry matching the HMAC associated with this
   * instance is updated to include the current document attributes. If no
   * existing entry is found, a new entry is appended to the shallow copy
   * prior to its return.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Object} options.doc the document to create or update an indexable
   *   entry for.
   *
   * @return {Promise<Array>} resolves to the updated array of indexable
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
   * @param {Object} options - The options to use.
   * @param {Object} options.hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Object|Array} [options.equals] an object with key-value attribute
   *   pairs to match or an array of such objects.
   * @param {string|Array} [options.has] a string with an attribute name to
   *   match or an array of such strings.
   *
   * @return {Promise<Object>} resolves to the built query.
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
      // blind `equals`
      if(!Array.isArray(equals)) {
        equals = [equals];
      }
      const {compoundIndexes} = this;
      query.equals = await Promise.all(equals.map(async equal => {
        const result = {};

        // blind all attributes and then determine whether to submit them
        // as compound attributes or not based on any compoound indexes set
        const blindMap = new Map();
        const blinded = await Promise.all(
          Object.entries(equal).map(async ([key, value]) => {
            const attribute = await this._blindAttribute({hmac, key, value});
            blindMap.set(key, attribute);
            return attribute;
          }));

        // build compound attributes and track which attributes were used
        // in a compound index so they will not be used in a simple index
        const used = new Set();
        const compoundOps = [];
        for(const {attributes} of compoundIndexes.values()) {
          const blindAttributes = [];
          for(const attr of attributes) {
            const blindAttr = blindMap.get(attr);
            if(blindAttr) {
              blindAttributes.push(blindAttr);
            } else {
              break;
            }
          }
          // if fewer than two attributes are present, then only a simple
          // index can be used, skip
          if(blindAttributes.length < 2) {
            continue;
          }
          // mark all attributes in the compound index as used
          blindAttributes.forEach(({name}) => used.add(name));
          // create max length compound attribute
          compoundOps.push((async () => {
            const attribute = await this._blindCompoundAttribute(
              {hmac, blindAttributes, length: blindAttributes.length});
            result[attribute.name] = attribute.value;
          })());
        }
        await Promise.all(compoundOps);

        // add any blinded attributes not used in a compound index
        for(const {name, value} of blinded) {
          if(!used.has(name)) {
            result[name] = value;
          }
        }

        return result;
      }));
    } else if(has !== undefined) {
      // blind `has`
      if(!Array.isArray(has)) {
        has = [has];
      }
      query.has = await Promise.all(
        has.map(key => this._blindString(hmac, key)));
    }
    return query;
  }

  /**
   * Blinds a single attribute using the given HMAC API.
   *
   * @param {Object} options - The options to use.
   * @param {Object} options.hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {string} options.key a key associated with a value.
   * @param {Any} options.value the value associated with the key for the
   *   attribute.
   *
   * @return {Promise<Object>} resolves to an object `{name, value}`.
   */
  async _blindAttribute({hmac, key, value}) {
    // salt values with key to prevent cross-key leakage
    value = JSON.stringify({key: value});
    const [blindedName, blindedValue] = await Promise.all(
      [this._blindString(hmac, key), this._blindString(hmac, value)]);
    return {name: blindedName, value: blindedValue};
  }

  /**
   * Builds a blind compound attribute from an array of blind attributes
   * via the given HMAC API.
   *
   * @param {Object} hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {Array} blindAttributes the blind attributes that comprise the
   *   compound index.
   * @param {Number} length the number of blind attributes to go into the
   *   compound attribute (<= `blindAttributes.length`).
   *
   * @return {Promise<String>} resolves to the blinded compound attribute.
   */
  async _blindCompoundAttribute({hmac, blindAttributes, length}) {
    const selection = blindAttributes.slice(0, length);
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
   * @param {Object} hmac an HMAC API with `id`, `sign`, and `verify`
   *   properties.
   * @param {string} value the value to blind.
   *
   * @return {Promise<String>} resolves to the blinded value.
   */
  async _blindString(hmac, value) {
    // convert value to Uint8Array
    const data = new TextEncoder().encode(value);
    return hmac.sign({data});
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
