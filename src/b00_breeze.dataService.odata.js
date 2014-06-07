(function (factory) {
    if (breeze) {
        factory(breeze);
    } else if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "breeze"
        factory(require("breeze"));
    } else if (typeof define === "function" && define["amd"] && !breeze) {
        // AMD anonymous module with hard-coded dependency on "breeze"
        define(["breeze"], factory);
    }
}(function(breeze) {
    "use strict";    
    var core = breeze.core;
 
    var MetadataStore = breeze.MetadataStore;
    var JsonResultsAdapter = breeze.JsonResultsAdapter;
    var DataProperty = breeze.DataProperty;
    
    var OData;
    
    var ctor = function () {
        this.name = "OData";
    };

    var fn = ctor.prototype; // minifies better (as seen in jQuery)

    fn.initialize = function () {
        OData = core.requireLib("OData", "Needed to support remote OData services");
        OData.jsonHandler.recognizeDates = true;
    };

    // The default, no-op implementation of a "ChangeRequestInterceptor" ctor 
    // that can tweak the 'requests' object both as it is built and when it is completed
    // by a concrete DataServiceAdapater.
    //
    // Applications can specify an alternative constructor with a different implementation
    // enabling them to change aspects of the 'requests' object 
    // without having to write their own DataService adapters.
    // 
    // Instantiated and called entirely within the 'createChangeRequests' method.
    //
    // Applications that define an overriding interceptor should follow this pattern.
    // - accept the 'saveContext' and 'saveBundle' and as the first two parameters.
    // - instantiate an object that implements the methods shown here.
    // - use 'saveBundle' and 'saveContext' captures in those methods.    
    fn.ChangeRequestInterceptor = function (saveContext, saveBundle){
        // Method: getRequest
        // Prepare and return the change request for an entity-to-be-saved
        // Called for each entity-to-be-saved
        // Parameters:
        //    'entity' is the manager's cached entity-to-be-saved 
        //    'request' is the change request as prepared so far, before interception
        //    'index' is the index of this entity in the array of original entities-to-be-saved.
        // This interceptor is free to do as it pleases with these inputs
        // but it must return something.
        this.getRequest = function (request, entity, index){return request;};

        // Method: done
        // Last chance to change anything about the 'changeRequests' object
        // after it has been built with requests for all of the entities-to-be-saved.
        // Returns void.
        // Called just before the changeRequests object is posted to the server
        this.done = function(requests) {};  
    }

    fn._createChangeRequestInterceptor = function(saveContext, saveBundle){
        var isFn = __isFunction;
        var CRI = this.ChangeRequestInterceptor;
        var pre = this.name + " DataServiceAdapter's ChangeRequestInterceptor";
        var post = " is missing or not a function.";
        if (isFn(CRI)){
            var interceptor = new CRI(saveContext, saveBundle);
            if (!isFn(interceptor.getRequest)) {
                throw new Error(pre + '.getRequest' + post);
            }
            if (!isFn(interceptor.done)) {
                throw new Error(pre + '.done' + post);
            }
            return interceptor;
        }
        throw new Error(pre + post);
    }

    fn.executeQuery = function (mappingContext) {
    
        var deferred = Q.defer();
        var url = mappingContext.getUrl();
        
        OData.read({
                requestUri: url,
                headers: { "DataServiceVersion": "2.0" }
            },
            function (data, response) {
                var inlineCount;
                if (data.__count) {
                    // OData can return data.__count as a string
                    inlineCount = parseInt(data.__count, 10);
                }
                return deferred.resolve({ results: data.results, inlineCount: inlineCount });
            },
            function (error) {
                return deferred.reject(createError(error, url));
            }
        );
        return deferred.promise;
    };
    

    fn.fetchMetadata = function (metadataStore, dataService) {

        var deferred = Q.defer();

        var serviceName = dataService.serviceName;
        var url = dataService.makeUrl('$metadata');
        
        //OData.read({
        //    requestUri: url,
        //    headers: {
        //        "Accept": "application/json",
        //    }
        //},
        OData.read(url,
            function (data) {
                // data.dataServices.schema is an array of schemas. with properties of 
                // entityContainer[], association[], entityType[], and namespace.
                if (!data || !data.dataServices) {
                    var error = new Error("Metadata query failed for: " + url);
                    return deferred.reject(error);
                }
                var csdlMetadata = data.dataServices;

                // might have been fetched by another query
                if (!metadataStore.hasMetadataFor(serviceName)) {
                    try {
                        metadataStore.importMetadata(csdlMetadata);
                    } catch(e) {
                        return deferred.reject(new Error("Metadata query failed for " + url + "; Unable to process returned metadata: " + e.message));
                    }

                    metadataStore.addDataService(dataService);
                }

                return deferred.resolve(csdlMetadata);

            }, function (error) {
                var err = createError(error, url);
                err.message = "Metadata query failed for: " + url + "; " + (err.message || "");
                return deferred.reject(err);
            },
            OData.metadataHandler
        );

        return deferred.promise;

    };

    fn.getRoutePrefix = function(dataService){ return ''; /* see webApiODataCtor */}

    fn.saveChanges = function (saveContext, saveBundle) {
        var adapter = saveContext.adapter = this;
        var deferred = Q.defer();
        var helper = saveContext.entityManager.helper;
        saveContext.routePrefix = this.getRoutePrefix(saveContext.dataService);
        var url = saveContext.dataService.makeUrl("$batch");

        var requestData = createChangeRequests(saveContext, saveBundle);
        var tempKeys = saveContext.tempKeys;
        var contentKeys = saveContext.contentKeys;

        OData.request({
            headers : { "DataServiceVersion": "2.0" } ,
            requestUri: url,
            method: "POST",
            data: requestData
        }, function (data, response) {
            var entities = [];
            var keyMappings = [];
            var saveResult = { entities: entities, keyMappings: keyMappings };
            data.__batchResponses.forEach(function(br) {
                br.__changeResponses.forEach(function (cr) {
                    var response = cr.response || cr;
                    var statusCode = response.statusCode;
                    if ((!statusCode) || statusCode >= 400) {
                        return deferred.reject(createError(cr, url));
                    }
                    
                    var contentId = cr.headers["Content-ID"];
                    
                    var rawEntity = cr.data;
                    if (rawEntity) {
                        var tempKey = tempKeys[contentId];
                        if (tempKey) {
                            var entityType = tempKey.entityType;
                            if (entityType.autoGeneratedKeyType !== AutoGeneratedKeyType.None) {
                                var tempValue = tempKey.values[0];
                                var realKey = entityType.getEntityKeyFromRawEntity(rawEntity, DataProperty.getRawValueFromServer);
                                var keyMapping = { entityTypeName: entityType.name, tempValue: tempValue, realValue: realKey.values[0] };
                                keyMappings.push(keyMapping);
                            }
                        }
                        entities.push(rawEntity);
                    } else {
                        var origEntity = contentKeys[contentId];
                        entities.push(origEntity);
                    }
                });
            });
            return deferred.resolve(saveResult);
        }, function (err) {
            return deferred.reject(createError(err, url));
        }, OData.batchHandler);

        return deferred.promise;

    };
 
    fn.jsonResultsAdapter = new JsonResultsAdapter({
        name: "OData_default",

        visitNode: function (node, mappingContext, nodeContext) {
            var result = {};
            if (node == null) return result;
            var metadata = node.__metadata;
            if (metadata != null) {
                // TODO: may be able to make this more efficient by caching of the previous value.
                var entityTypeName = MetadataStore.normalizeTypeName(metadata.type);
                var et = entityTypeName && mappingContext.entityManager.metadataStore.getEntityType(entityTypeName, true);
                // if (et && et._mappedPropertiesCount === Object.keys(node).length - 1) {
                if (et && et._mappedPropertiesCount <= Object.keys(node).length - 1) {
                    result.entityType = et;
                    var baseUri = mappingContext.dataService.serviceName;
                    var uriKey = metadata.uri || metadata.id;
                    if (core.stringStartsWith(uriKey, baseUri)) {
                        uriKey = uriKey.substring(baseUri.length);
                    }
                    result.extraMetadata = {
                        uriKey: uriKey,
                        etag: metadata.etag
                    }
                }
            }
            // OData v3 - projection arrays will be enclosed in a results array
            if (node.results) {
                result.node = node.results;
            }

            var propertyName = nodeContext.propertyName;
            result.ignore = node.__deferred != null || propertyName === "__metadata" ||
                // EntityKey properties can be produced by EDMX models
                (propertyName === "EntityKey" && node.$type && core.stringStartsWith(node.$type, "System.Data"));
            return result;
        }
        
    });

    function transformValue(prop, val ) {
        if (prop.isUnmapped) return undefined;
        if (prop.dataType === DataType.DateTimeOffset) {
            // The datajs lib tries to treat client dateTimes that are defined as DateTimeOffset on the server differently
            // from other dateTimes. This fix compensates before the save.
            val = val && new Date(val.getTime() - (val.getTimezoneOffset() * 60000));
        } else if (prop.dataType.quoteJsonOData) {
            val = val != null ? val.toString() : val;
        }
        return val;
    }

    function createChangeRequests(saveContext, saveBundle) {
        var changeRequestInterceptor = saveContext.adapter._createChangeRequestInterceptor(saveContext, saveBundle);
        var changeRequests = [];
        var tempKeys = [];
        var contentKeys = [];
        var entityManager = saveContext.entityManager;
        var helper = entityManager.helper;
        var id = 0;
        var routePrefix = saveContext.routePrefix;

        saveBundle.entities.forEach(function (entity, index) {
            var aspect = entity.entityAspect;
            id = id + 1; // we are deliberately skipping id=0 because Content-ID = 0 seems to be ignored.
            var request = { headers: { "Content-ID": id, "DataServiceVersion": "2.0" } };
            contentKeys[id] = entity;
            if (aspect.entityState.isAdded()) {
                request.requestUri = routePrefix + entity.entityType.defaultResourceName;
                request.method = "POST";
                request.data = helper.unwrapInstance(entity, transformValue);
                tempKeys[id] = aspect.getKey();
            } else if (aspect.entityState.isModified()) {
                updateDeleteMergeRequest(request, aspect, routePrefix);
                request.method = "MERGE";
                request.data = helper.unwrapChangedValues(entity, entityManager.metadataStore, transformValue);
                // should be a PATCH/MERGE
            } else if (aspect.entityState.isDeleted()) {
                updateDeleteMergeRequest(request, aspect, routePrefix);
                request.method = "DELETE";
            } else {
                return;
            }
            request = changeRequestInterceptor.getRequest(request, entity, index);
            changeRequests.push(request);
        });
        saveContext.contentKeys = contentKeys;
        saveContext.tempKeys = tempKeys;
        changeRequestInterceptor.done(changeRequests);
        return {
            __batchRequests: [{
                __changeRequests: changeRequests
            }]
        };

    }

    function updateDeleteMergeRequest(request, aspect, routePrefix) {
        var uriKey;
        var extraMetadata = aspect.extraMetadata;
        if (extraMetadata == null) {
            uriKey = getUriKey(aspect);
            aspect.extraMetadata = {
                uriKey: uriKey
            }
        } else {
            uriKey = extraMetadata.uriKey;
            if (extraMetadata.etag) {
                request.headers["If-Match"] = extraMetadata.etag;
            }
        }
        request.requestUri = routePrefix + uriKey;

    }

    function getUriKey(aspect) {
        var entityType = aspect.entity.entityType;
        var resourceName = entityType.defaultResourceName;
        var kps = entityType.keyProperties;
        var uriKey = resourceName + "(";
        if (kps.length === 1) {
            uriKey = uriKey + fmtProperty(kps[0], aspect) + ")";
        } else {
            var delim = "";
            kps.forEach(function(kp) {
                uriKey = uriKey + delim + kp.nameOnServer + "=" + fmtProperty(kp, aspect);
                delim = ",";
            });
            uriKey = uriKey + ")";
        }
        return uriKey;
    }

    function fmtProperty(prop, aspect) {
        return prop.dataType.fmtOData(aspect.getPropertyValue(prop.name));
    }
   
    function createError(error, url) {
        // OData errors can have the message buried very deeply - and nonobviously
        // this code is tricky so be careful changing the response.body parsing.
        var result = new Error();
        var response = error && error.response;
        if (!response) {
            // in case DataJS returns "No handler for this data"
            result.message = error;
            result.statusText = error;
            return result;
        }
        result.message = response.statusText;
        result.statusText = response.statusText;
        result.status = response.statusCode;
        // non std
        if (url) result.url = url;
        result.body = response.body;
        if (response.body) {
            var nextErr;
            try {
                var body = JSON.parse(response.body);
                result.body = body;
                // OData v3 logic
                if (body['odata.error']) {
                    body = body['odata.error'];
                }
                var msg = "";
                do {
                    nextErr = body.error || body.innererror;
                    if (!nextErr) msg = msg + getMessage(body);
                    nextErr = nextErr || body.internalexception;
                    body = nextErr || body;
                } while (nextErr);
                if (msg.length > 0) {
                    result.message = msg;
                }
            } catch (e) {

            }
        }
        return result;
    }

    function getMessage(body) {
        var msg = body.message || "";
        return ((typeof (msg) === "string") ? msg : msg.value) + "; ";
    }

    breeze.config.registerAdapter("dataService", ctor);


    var webApiODataCtor = function () {
        this.name = "webApiOData";
    }

    breeze.core.extend(webApiODataCtor.prototype, fn);

    webApiODataCtor.prototype.getRoutePrefix = function(dataService){
        // Get the routePrefix from a Web API OData service name.
        // Web API OData requires inclusion of the routePrefix in the Uri of a batch subrequest
        // By convention, Breeze developers add the Web API OData routePrefix to the end of the serviceName
        // e.g. the routePrefix in 'http://localhost:55802/odata/' is 'odata/'
        var segments = dataService.serviceName.split('/');
        var last = segments.length-1 ;
        var routePrefix = segments[last] || segments[last-1];
        routePrefix = routePrefix ? routePrefix += '/' : '';
        return routePrefix;
    };

    breeze.config.registerAdapter("dataService", webApiODataCtor);

}));