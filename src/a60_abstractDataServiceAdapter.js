breeze.AbstractDataServiceAdapter = (function () {
    
    var ajaxImpl;
    
    var ctor = function () { };

    var fn = ctor.prototype; // minifies better (as seen in jQuery)

    fn.checkForRecomposition = function (interfaceInitializedArgs) {
        if (interfaceInitializedArgs.interfaceName === "ajax" && interfaceInitializedArgs.isDefault) {
            this.initialize();
        }
    };
    
    fn.initialize = function () {
        ajaxImpl = breeze.config.getAdapterInstance("ajax");

        // don't cache 'ajax' because then we would need to ".bind" it, and don't want to because of brower support issues. 
        if (ajaxImpl && ajaxImpl.ajax) { return; }
        throw new Error("Unable to find ajax adapter for dataservice adapter '"+(this.name||'')+"'.");
    };

    fn.fetchMetadata = function (metadataStore, dataService) {
        var serviceName = dataService.serviceName;
        var url = dataService.makeUrl("Metadata");
        
        var deferred = Q.defer();

        ajaxImpl.ajax({
            type: "GET",
            url: url,
            dataType: 'json',
            success: function (httpResponse) {
                
                // might have been fetched by another query
                if (metadataStore.hasMetadataFor(serviceName)) {
                    return deferred.resolve("already fetched");
                }
                var data = httpResponse.data;
                try {
                    var metadata = typeof (data) === "string" ? JSON.parse(data) : data;
                    metadataStore.importMetadata(metadata);
                } catch(e) {
                    var errMsg = "Unable to either parse or import metadata: " + e.message;
                    return handleHttpError(deferred, httpResponse, "Metadata query failed for: " + url + ". " + errMsg);
                }

                // import may have brought in the service.
                if (!metadataStore.hasMetadataFor(serviceName)) {
                    metadataStore.addDataService(dataService);
                }

                return deferred.resolve(metadata);
                
            },
            error: function (httpResponse) {
                handleHttpError(deferred, httpResponse, "Metadata query failed for: " + url);
            }
        });
        return deferred.promise;
    };

    fn.executeQuery = function (mappingContext) {

        var deferred = Q.defer();
        var url = mappingContext.getUrl();

        var params = {
            type: "GET",
            url: url,
            params: mappingContext.query.parameters,
            dataType: 'json',
            success: function (httpResponse) {
                var data = httpResponse.data;
                try {
                    var rData;
                    if (data && data.Results) {
                        rData = { results: data.Results, inlineCount: data.InlineCount, httpResponse: httpResponse };
                    } else {
                        rData = { results: data, httpResponse: httpResponse };
                    }
                    
                    deferred.resolve(rData);
                } catch (e) {
                    if (e instanceof Error) {
                        deferred.reject(e);
                    } else {
                        handleHttpError(httpResponse);
                    }
                }

            },
            error: function(httpResponse) {
                handleHttpError(deferred, httpResponse);
            }
        };
        if (mappingContext.dataService.useJsonp) {
            params.dataType = 'jsonp';
            params.crossDomain = true;
        }
        ajaxImpl.ajax(params);
        return deferred.promise;
    };

    fn.saveChanges = function (saveContext, saveBundle) {
        var adapter = saveContext.adapter = this;     
        var deferred = Q.defer();
        saveBundle = adapter._prepareSaveBundle(saveContext, saveBundle);
        var bundle = JSON.stringify(saveBundle);
        
        var url = saveContext.dataService.makeUrl(saveContext.resourceName);

        ajaxImpl.ajax({
            type: "POST",
            url: url,
            dataType: 'json',
            contentType: "application/json",
            data: bundle,
            success: function (httpResponse) {
                var data = httpResponse.data;
                httpResponse.saveContext = saveContext;
                var entityErrors = data.Errors || data.errors;
                if (entityErrors) {
                    handleHttpError(deferred, httpResponse);
                } else {
                    var saveResult = adapter._prepareSaveResult(saveContext, data);
                    saveResult.httpResponse = httpResponse;
                    deferred.resolve(saveResult);
                }
                
            },
            error: function (httpResponse) {
                httpResponse.saveContext = saveContext;
                handleHttpError(deferred, httpResponse);
            }
        });

        return deferred.promise;
    };

    fn._prepareSaveBundle = function(/*saveContext, saveBundle*/) {
        // The implementor should create and call the concrete adapter's ChangeRequestInterceptor
        throw new Error("Need a concrete implementation of _prepareSaveBundle");
    };

    // The default, no-op implementation of a "ChangeRequestInterceptor" ctor 
    // that can tweak the saveBundle both as it is built and when it is completed
    // by a concrete DataServiceAdapater.
    //
    // Applications can specify an alternative constructor with a different implementation
    // enabling them to change aspects of the 'saveBundle' or the individual change requests 
    // without having to write their own DataService adapters.
    //
    // Applications that define an overriding interceptor should follow this pattern.
    // - accept the 'saveContext' and 'saveBundle' and as the first two parameters.
    // - instantiate an object that implements the methods shown here.
    // - use 'saveBundle' and 'saveContext' captures in those methods.
    fn.ChangeRequestInterceptor = function (saveContext, saveBundle){
        // Method: getRequest
        // Prepare and return the save data for an entity-to-be-saved
        // Called for each entity-to-be-saved
        // Parameters:
        //    'request' is the entity save data as prepared by the adapter before interception        
        //    'entity' is the manager's cached entity-to-be-saved 
        //    'index' is the index of this entity in the array of original entities-to-be-saved.
        // This interceptor is free to do as it pleases with these inputs
        // but it must return something.
        this.getRequest = function (request, entity, index){return request;};

        // Method: done
        // Last chance to change anything about the 'requests' object
        // after it has been built with requests for all of the entities-to-be-saved.        
        // 'requests' is the same as 'saveBundle.entities' in many implementations
        // Returns void.
        // Called just before the saveBundle is serialized for posting to the server
        this.done = function(requests) {};    
    }

    fn._createChangeRequestInterceptor = function(saveContext, saveBundle){
        var adapter = saveContext.adapter;
        var isFn = __isFunction;
        var CRI = adapter.ChangeRequestInterceptor;
        var pre = adapter.name + " DataServiceAdapter's ChangeRequestInterceptor";
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

    fn._prepareSaveResult = function (/* saveContext, data */) {
        throw new Error("Need a concrete implementation of _prepareSaveResult");
    };
    
    fn.jsonResultsAdapter = new JsonResultsAdapter( {
        name: "noop",
        
        visitNode: function (/* node, mappingContext, nodeContext */) {
            return {};
        }

    });
   
    function handleHttpError(deferred, httpResponse, messagePrefix) {
        var err = createHttpError(httpResponse);
        if (messagePrefix) {
            err.message = messagePrefix + "; " + err.message;
        }
        return deferred.reject(err);
    };

    function createHttpError(httpResponse) {
        var err = new Error();
        err.httpResponse = httpResponse;
        err.status = httpResponse.status;
        var errObj = httpResponse.data;
        // some ajax providers will convert errant result into an object ( angular), others will not (jQuery)
        // if not do it here.
        if (typeof errObj === "string") {
            try {
                errObj = JSON.parse(errObj);
            } catch (e) { };
        }
        
        if (errObj) {
            var entityErrors = errObj.EntityErrors || errObj.entityErrors || errObj.Errors || errObj.errors;
            if (entityErrors && httpResponse.saveContext) {
                processEntityErrors(err, entityErrors, httpResponse.saveContext);
            } else {
                err.message = extractInnerMessage(errObj);
            }
        } else {
            err.message = httpResponse.error && httpResponse.error.toString();
        }
        fn._catchNoConnectionError(err);
        return err;
    };

    // Put this at the bottom of your http error analysis
    fn._catchNoConnectionError = function (err){
        if (err.status == 0 && err.message == null){
            err.message = "HTTP response status 0 and no message. " +
            "Likely did not or could not reach server. Is the server running?";
        }
    }

    function extractInnerMessage(errObj) {
        while (errObj.InnerException) {
            errObj = errObj.InnerException;
        }
        return errObj.ExceptionMessage || errObj.Message || errObj.toString();
    }

    function processEntityErrors(err, entityErrors, saveContext) {
        err.message = "Server side errors encountered - see the entityErrors collection on this object for more detail";
        var propNameFn = saveContext.entityManager.metadataStore.namingConvention.serverPropertyNameToClient;
        err.entityErrors = entityErrors.map(function (e) {
            return {
                errorName: e.ErrorName,
                entityTypeName: MetadataStore.normalizeTypeName(e.EntityTypeName),
                keyValues: e.KeyValues,
                propertyName: e.PropertyName && propNameFn(e.PropertyName),
                errorMessage: e.ErrorMessage
            };
        });

    }
    
    return ctor;

})();
