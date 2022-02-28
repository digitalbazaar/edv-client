/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import uuid from 'uuid-random';
import {validateSchema} from './validator';

export const BASE_URL = 'https://localhost:9876';

export class MockStorage {
  constructor({server}) {
    this.edvs = new Map();
    this.zcaps = new Map();
    this.referenceEdvs = new Map();
    this.documents = new Map();
    this.revocations = new Map();
    this.chunks = new Map();

    const baseUrl = BASE_URL;
    const root = '/edvs';
    const routes = this.routes = {
      edvs: `${baseUrl}${root}`,
      edv: `${baseUrl}${root}/:edvId`,
      documents: `${baseUrl}${root}/:edvId/documents`,
      query: `${baseUrl}${root}/:edvId/query`,
      revocations: `${baseUrl}${root}/:edvId/zcaps/revocations/:zcapId`,
      chunk: `${baseUrl}${root}/:edvId/documents/:id/chunks/:chunkIndex`,
    };

    // this handles revokeCapability post requests.
    server.post(routes.revocations, request => {
      const {json: capability} = JSON.parse(request.requestBody);

      const {headers} = request;
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
      return [201, undefined, capability];
    });

    // create a new edv
    server.post(routes.edvs, request => {
      const {json: config} = JSON.parse(request.requestBody);
      validateSchema({payload: config});
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
          return [409, undefined];
        }
        this.referenceEdvs.set(key, edv);
      }
      const location = config.id;
      return [201, new Map([['location', location]]), config];
    });

    // get edvs by query
    server.get(routes.edvs, request => {
      const {controller, referenceId} = request.queryParams;
      if(!referenceId) {
        // query for all edvs controlled by controller not implemented yet
        // TODO: implement
        return [500, undefined, new Error('Not implemented.')];
      }
      const key = _getReferenceKey(controller, referenceId);
      const refEdv = this.referenceEdvs.get(key);
      if(!refEdv) {
        return [200, undefined, []];
      }
      return [200, undefined, [refEdv.config]];
    });

    // post a chunk
    server.post(routes.chunk, request => {
      const chunk = JSON.parse(request.requestBody);
      const key = request.route;
      this.chunks.set(key, chunk);
      return [204, undefined];
    });

    // get a chunk
    server.get(routes.chunk, request => {
      const key = request.route;
      const chunk = this.chunks.get(key);
      if(!chunk) {
        return [404, {json: true}];
      }
      return [200, undefined, chunk.json];
    });

    // get an edv
    server.get(routes.edv, request => {
      const edvId = request.route;
      const edv = this.edvs.get(edvId);
      if(!edv) {
        return [404, undefined];
      }
      return [200, undefined, edv.config];
    });

    // insert a document into an edv
    server.post(routes.documents, request => {
      const idx = request.route.lastIndexOf('/documents');
      const edvId = request.route.substr(0, idx);
      const edv = this.edvs.get(edvId);
      if(!edv) {
        // edv does not exist
        return [404, undefined];
      }

      const {json: doc} = JSON.parse(request.requestBody);
      if(edv.documents.has(doc.id)) {
        return [409, undefined];
      }

      try {
        this.store({edv, doc, create: true});
      } catch(e) {
        return [409, undefined];
      }
      const location = `${edvId}/documents/${doc.id}`;
      return [201, new Map([['location', location]]), undefined];
    });

    // query an edv
    server.post(routes.query, request => {
      const idx = request.route.lastIndexOf('/query');
      const edvId = request.route.substr(0, idx);
      const edv = this.edvs.get(edvId);
      if(!edv) {
        // edv does not exist
        return [404, undefined];
      }

      const {json: query} = JSON.parse(request.requestBody);
      const index = edv.indexes.get(query.index);
      if(!index) {
        // index does not exist
        return [404, undefined];
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
      if(query.count === true) {
        return [200, undefined, {count: results.length}];
      }

      const {limit} = query;
      const result = {documents: results};
      if(limit !== undefined) {
        result.hasMore = results.length > limit;
        if(result.hasMore) {
          result.documents.length = limit;
        }
      }
      return [200, undefined, result];
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
      const {json: doc} = JSON.parse(request.requestBody);
      if(docId !== doc.id) {
        return [400, undefined];
      }
      this.store({edv, doc});
      return [204, undefined];
    });

    // get a document
    server.get(route, request => {
      const docId = getDocId(request.route);
      const doc = edv.documents.get(docId);
      if(!doc) {
        return [404, undefined];
      }
      return [200, undefined, doc];
    });
  }
}

function _getReferenceKey(controller, referenceId) {
  return `${encodeURIComponent(controller)}:${encodeURIComponent(referenceId)}`;
}
