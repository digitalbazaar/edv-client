/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
import uuid from 'uuid-random';
import {validateSchema} from './validator';

export class MockStorage {
  constructor({server}) {
    this.edvs = new Map();
    this.zcaps = new Map();
    this.referenceEdvs = new Map();
    this.documents = new Map();
    this.revocations = new Map();

    const baseUrl = 'http://localhost:9876';
    const root = '/edvs';
    const routes = this.routes = {
      edvs: `${baseUrl}${root}`,
      edv: `${baseUrl}${root}/:edvId`,
      documents: `${baseUrl}${root}/:edvId/documents`,
      query: `${baseUrl}${root}/:edvId/query`,
      authorizations: `${baseUrl}${root}/:edvId/authorizations`,
      revocations: `${baseUrl}${root}/:edvId/revocations`,
    };

    // this handles enableCapability post requests.
    server.post(routes.authorizations, request => {
      const capability = JSON.parse(request.requestBody);
      if(!capability) {
        throw new TypeError('"capability" is required');
      }
      if(!capability.id) {
        throw new TypeError('"capability.id" is required');
      }
      if(typeof capability.id !== 'string') {
        throw new TypeError('"capability.id" must be a string');
      }
      if(!capability['@context']) {
        throw new TypeError('"capability[@context]" is required');
      }
      if(!capability.invoker) {
        throw new TypeError('"capability.invoker" is required');
      }
      if(!capability.parentCapability) {
        throw new TypeError('"capability.parentCapability" is required');
      }
      this.zcaps.set(capability.id, capability);
      return [201, {json: true}, capability];
    });

    // this handles revokeCapability post requests.
    server.post(routes.revocations, request => {
      const capability = JSON.parse(request.requestBody);

      // FIXME: headers should not be nested like this, see issue #37
      const {headers} = request.headers;
      if(!headers.authorization) {
        throw new TypeError('An http-signature header is required.');
      }

      if(!capability) {
        throw new TypeError('"capability" is required');
      }
      if(!capability.id) {
        throw new TypeError('"capability.id" is required');
      }
      if(typeof capability.id !== 'string') {
        throw new TypeError('"capability.id" must be a string');
      }
      if(!capability['@context']) {
        throw new TypeError('"capability[@context]" is required');
      }
      if(!capability.invoker) {
        throw new TypeError('"capability.invoker" is required');
      }
      if(!capability.parentCapability) {
        throw new TypeError('"capability.parentCapability" is required');
      }
      this.revocations.set(capability.id, capability);
      return [201, {json: true}, capability];
    });

    // create a new edv
    server.post(routes.edvs, request => {
      const config = JSON.parse(request.requestBody);
      validateSchema({payload: config});
      // TODO: validate `config`
      config.id = `${baseUrl}${root}/${uuid()}`;
      const edv = {
        config,
        documents: new Map(),
        indexes: new Map()
      };
      this.edvs.set(config.id, edv);
      this.mapDocumentHandlers({server, edv});
      if(config.referenceId) {
        const key = _getReferenceKey(config.controller, config.referenceId);
        const refEdv = this.referenceEdvs.get(key);
        if(refEdv) {
          return [409];
        }
        this.referenceEdvs.set(key, edv);
      }
      const location = config.id;
      return [201, {location, json: true}, config];
    });

    // get edvs by query
    server.get(routes.edvs, request => {
      const {controller, referenceId} = request.queryParams;
      if(!referenceId) {
        // query for all edvs controlled by controller not implemented yet
        // TODO: implement
        return [500, {json: true}, new Error('Not implemented.')];
      }
      const key = _getReferenceKey(controller, referenceId);
      const refEdv = this.referenceEdvs.get(key);
      if(!refEdv) {
        return [200, {json: true}, []];
      }
      return [200, {json: true}, [refEdv.config]];
    });

    // get an edv
    server.get(routes.edv, request => {
      const edvId = request.route;
      const edv = this.edvs.get(edvId);
      if(!edv) {
        return [404];
      }
      return [200, {json: true}, edv.config];
    });

    // insert a document into an edv
    server.post(routes.documents, request => {
      const idx = request.route.lastIndexOf('/documents');
      const edvId = request.route.substr(0, idx);
      const edv = this.edvs.get(edvId);
      if(!edv) {
        // edv does not exist
        return [404];
      }

      const doc = JSON.parse(request.requestBody);
      if(edv.documents.has(doc.id)) {
        return [409];
      }

      try {
        this.store({edv, doc, create: true});
      } catch(e) {
        return [409];
      }
      const location = `${edvId}/documents/${doc.id}`;
      return [201, {location}];
    });

    // query an edv
    server.post(routes.query, request => {
      const idx = request.route.lastIndexOf('/query');
      const edvId = request.route.substr(0, idx);
      const edv = this.edvs.get(edvId);
      if(!edv) {
        // edv does not exist
        return [404];
      }

      const query = JSON.parse(request.requestBody);
      const index = edv.indexes.get(query.index);
      if(!index) {
        // index does not exist
        return [404];
      }

      // build results
      const results = [];
      if(query.equals) {
        for(const equals of query.equals) {
          let matches = null;
          for(const key in equals) {
            const value = equals[key];
            const docs = this.find(
              {index: index.equals, key: key + '=' + value});
            if(!matches) {
              // first result
              matches = docs;
            } else {
              // remove any docs from `matches` that are not in `docs`
              matches = matches.filter(x => docs.includes(x));
              if(matches.length === 0) {
                break;
              }
            }
          }
          (matches || []).forEach(x => {
            if(!results.includes(x)) {
              results.push(x);
            }
          });
        }
      }

      if(query.has) {
        let matches = null;
        for(const key of query.has) {
          const docs = this.find({index: index.has, key});
          if(!matches) {
            // first result
            matches = docs;
          } else {
            // remove any docs from `matches` that are not in `docs`
            matches = matches.filter(x => docs.includes(x));
            if(matches.length === 0) {
              break;
            }
          }
        }
        results.push(...(matches || []));
      }

      return [200, {json: true}, results];
    });
  }

  store({edv, doc, create = false}) {
    if(create) {
      // check uniqueness constraint
      for(const entry of doc.indexed) {
        const index = edv.indexes.get(entry.hmac.id);
        if(!index) {
          continue;
        }
        for(const attribute of entry.attributes) {
          if(!attribute.unique) {
            continue;
          }
          const key = attribute.name + '=' + attribute.value;
          if(index.equals.has(key)) {
            throw new Error('Duplicate error.');
          }
        }
      }
    }
    const oldDoc = edv.documents.get(doc.id);
    if(oldDoc) {
      // remove old doc from indexes on update.
      this.unindex({edv, doc: oldDoc});
    }
    edv.documents.set(doc.id, doc);
    for(const entry of doc.indexed) {
      let index = edv.indexes.get(entry.hmac.id);
      if(!index) {
        index = {
          equals: new Map(),
          has: new Map()
        };
        edv.indexes.set(entry.hmac.id, index);
      }
      for(const attribute of entry.attributes) {
        this.addToIndex({
          index: index.equals,
          key: attribute.name + '=' + attribute.value,
          doc,
          unique: attribute.unique
        });
        this.addToIndex({
          index: index.has,
          key: attribute.name,
          doc
        });
      }
    }
  }

  addToIndex({index, key, doc, unique = false}) {
    let docSet = index.get(key);
    if(!docSet) {
      docSet = new Set();
      index.set(key, docSet);
    }
    if(unique) {
      docSet.clear();
    }
    docSet.add(doc);
  }

  unindex({edv, doc}) {
    for(const entry of doc.indexed) {
      const index = edv.indexes.get(entry.hmac.id);
      for(const attribute of entry.attributes) {
        this.removeFromIndex({
          index: index.equals,
          key: attribute.name + '=' + attribute.value
        });
        this.removeFromIndex({
          index: index.has,
          key: attribute.name
        });
      }
    }
  }

  removeFromIndex({index, key}) {
    const docSet = index.get(key);
    if(docSet) {
      index.delete(key);
    }
  }

  find({index, key}) {
    const docSet = index.get(key);
    if(!docSet) {
      return [];
    }
    return [...docSet];
  }

  mapDocumentHandlers({server, edv}) {
    const route = `${edv.config.id}/documents/:docId`;

    function getDocId(route) {
      const dir = '/documents/';
      const idx = route.lastIndexOf(dir) + dir.length;
      return route.substr(idx);
    }

    // update a document
    server.post(route, request => {
      const docId = getDocId(request.route);
      const doc = JSON.parse(request.requestBody);
      if(docId !== doc.id) {
        return [400];
      }
      this.store({edv, doc});
      return [204];
    });

    // get a document
    server.get(route, request => {
      const docId = getDocId(request.route);
      const doc = edv.documents.get(docId);
      if(!doc) {
        return [404];
      }
      return [200, {json: true}, doc];
    });

    // delete a document
    server.delete(route, request => {
      const docId = getDocId(request.route);
      if(!edv.documents.has(docId)) {
        return [404];
      }
      const doc = edv.documents.get(docId);
      this.unindex({edv, doc});
      edv.documents.delete(docId);
      return [204];
    });
  }
}

function _getReferenceKey(controller, referenceId) {
  return `${encodeURIComponent(controller)}:${encodeURIComponent(referenceId)}`;
}
