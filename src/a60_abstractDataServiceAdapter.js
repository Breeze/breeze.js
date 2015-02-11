breeze.AbstractDataServiceAdapter = (function () {

  var ajaxImpl;

  var ctor = function () {
  };

  var proto = ctor.prototype; // minifies better (as seen in jQuery)

  proto.checkForRecomposition = function (interfaceInitializedArgs) {
    if (interfaceInitializedArgs.interfaceName === "ajax" && interfaceInitializedArgs.isDefault) {
      this.initialize();
    }
  };

  proto.initialize = function () {
    ajaxImpl = breeze.config.getAdapterInstance("ajax");

    // don't cache 'ajax' because then we would need to ".bind" it, and don't want to because of brower support issues.
    if (ajaxImpl && ajaxImpl.ajax) {
      return;
    }
    throw new Error("Unable to find ajax adapter for dataservice adapter '" + (this.name || '') + "'.");
  };

  proto.fetchMetadata = function (metadataStore, dataService) {
    var serviceName = dataService.serviceName;
    var url = dataService.qualifyUrl("Metadata");

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
        } catch (e) {
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

  proto.executeQuery = function (mappingContext) {
    var adapter = mappingContext.adapter = this;
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
          var results = data && (data.results || data.Results);
          if (results) {
            rData = { results: results, inlineCount: data.inlineCount || data.InlineCount, httpResponse: httpResponse };
          } else {
            rData = { results: data, httpResponse: httpResponse };
          }

          deferred.resolve(rData);
        } catch (e) {
          if (e instanceof Error) {
            deferred.reject(e);
          } else {
            handleHttpError(deferred, httpResponse);
          }
        }

      },
      error: function (httpResponse) {
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

  proto.saveChanges = function (saveContext, saveBundle) {
    var adapter = saveContext.adapter = this;
    var deferred = Q.defer();
    saveBundle = adapter._prepareSaveBundle(saveContext, saveBundle);
    var bundle = JSON.stringify(saveBundle);

    var url = saveContext.dataService.qualifyUrl(saveContext.resourceName);

    ajaxImpl.ajax({
      type: "POST",
      url: url,
      dataType: 'json',
      contentType: "application/json",
      data: bundle,
      success: function (httpResponse) {
        httpResponse.saveContext = saveContext;
        var data = httpResponse.data;
        if (data.Errors || data.errors) {
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

  proto._prepareSaveBundle = function (/*saveContext, saveBundle*/) {
    // The implementor should call _createChangeRequestInterceptor
    throw new Error("Need a concrete implementation of _prepareSaveBundle");
  };

  /**
   Returns a constructor function for a "ChangeRequestInterceptor"
   that can tweak the saveBundle both as it is built and when it is completed
   by a concrete DataServiceAdapater.

   Initialized with a default, no-op implementation that developers can replace with a
   substantive implementation that changes the individual entity change requests
   or aspects of the entire 'saveBundle' without having to write their own DataService adapters.

   @example
   var adapter = breeze.config.getAdapterInstance('dataService');
   adapter.changeRequestInterceptor = function (saveContext, saveBundle) {
        this.getRequest = function (request, entity, index) {
            // alter the request that the adapter prepared for this entity
            // based on the entity, saveContext, and saveBundle
            // e.g., add a custom header or prune the originalValuesMap
            return request;
        };
        this.done = function (requests) {
            // alter the array of requests representing the entire change-set
            // based on the saveContext and saveBundle
        };
    }
   @method changeRequestInterceptor
   @param saveContext {Object} The BreezeJS "context" for the save operation.
   @param saveBundle {Object} Contains the array of entities-to-be-saved (AKA, the entity change-set).
   @return {Function} Constructor for a "ChangeRequestInterceptor".
   **/
  proto.changeRequestInterceptor = DefaultChangeRequestInterceptor;

  //This is a default, no-op implementation that developers can replace.
  function DefaultChangeRequestInterceptor(saveContext, saveBundle) {
    /**
     Prepare and return the save data for an entity change-set.

     The adapter calls this method for each entity in the change-set,
     after it has prepared a "change request" for that object.

     The method can do anything to the request but it must return a valid, non-null request.
     @example
     this.getRequest = function (request, entity, index) {
            // alter the request that the adapter prepared for this entity
            // based on the entity, saveContext, and saveBundle
            // e.g., add a custom header or prune the originalValuesMap
            return request;
        };
     @method getRequest
     @param request {Object} The object representing the adapter's request to save this entity.
     @param entity {Entity} The entity-to-be-save as it is in cache
     @param index {Integer} The zero-based index of this entity in the change-set array
     @return {Function} The potentially revised request.
     **/
    this.getRequest = function (request, entity, index) {
      return request;
    };

    /**
     Last chance to change anything about the 'requests' array
     after it has been built with requests for all of the entities-to-be-saved.

     The 'requests' array is the same as 'saveBundle.entities' in many implementations

     This method can do anything to the array including add and remove requests.
     It's up to you to ensure that server will accept the requests array data as valid.

     Returned value is ignored.
     @example
     this.done = function (requests) {
            // alter the array of requests representing the entire change-set
            // based on the saveContext and saveBundle
        };
     @method done
     @param requests {Array of Object} The adapter's array of request for this changeset.
     **/
    this.done = function (requests) {
    };
  }

  proto._createChangeRequestInterceptor = function (saveContext, saveBundle) {
    var adapter = saveContext.adapter;
    var cri = adapter.changeRequestInterceptor;
    var isFn = __isFunction;

    if (isFn(cri)) {
      var pre = adapter.name + " DataServiceAdapter's ChangeRequestInterceptor";
      var post = " is missing or not a function.";
      var interceptor = new cri(saveContext, saveBundle);
      if (!isFn(interceptor.getRequest)) {
        throw new Error(pre + '.getRequest' + post);
      }
      if (!isFn(interceptor.done)) {
        throw new Error(pre + '.done' + post);
      }
      return interceptor;
    } else {
      return new DefaultChangeRequestInterceptor(saveContext, saveBundle);
    }
  }

  proto._prepareSaveResult = function (/* saveContext, data */) {
    throw new Error("Need a concrete implementation of _prepareSaveResult");
  };

  proto.jsonResultsAdapter = new JsonResultsAdapter({
    name: "noop",

    visitNode: function (/* node, mappingContext, nodeContext */) {
      return {};
    }

  });

  function handleHttpError(deferred, httpResponse, messagePrefix) {
    var err = createError(httpResponse);
    proto._catchNoConnectionError(err);
    if (messagePrefix) {
      err.message = messagePrefix + "; " + err.message;
    }
    return deferred.reject(err);
  }


  function createError(httpResponse) {
    var err = new Error();
    err.httpResponse = httpResponse;
    err.status = httpResponse.status;

    var errObj = httpResponse.data;

    if (!errObj) {
      err.message = httpResponse.error && httpResponse.error.toString();
      return err;
    }

    // some ajax providers will convert errant result into an object ( angular), others will not (jQuery)
    // if not do it here.
    if (typeof errObj === "string") {
      try {
        errObj = JSON.parse(errObj);
      } catch (e) {
        // sometimes httpResponse.data is just the error message itself
        err.message = errObj;
        return err;
      }
    }

    var saveContext = httpResponse.saveContext;

    // if any of the follow properties exist the source is .NET
    var tmp = errObj.Message || errObj.ExceptionMessage || errObj.EntityErrors || errObj.Errors;
    var isDotNet = !!tmp;
    var message, entityErrors;
    if (!isDotNet) {
      message = errObj.message;
      entityErrors = errObj.errors || errObj.entityErrors;
    } else {
      var tmp = errObj;
      do {
        // .NET exceptions can provide both ExceptionMessage and Message but ExceptionMethod if it
        // exists has a more detailed message.
        message = tmp.ExceptionMessage || tmp.Message;
        tmp = tmp.InnerException;
      } while (tmp);
      // .EntityErrors will only occur as a result of an EntityErrorsException being deliberately thrown on the server
      entityErrors = errObj.Errors || errObj.EntityErrors;
      entityErrors = entityErrors && entityErrors.map(function (e) {
        return {
          errorName: e.ErrorName,
          entityTypeName: MetadataStore.normalizeTypeName(e.EntityTypeName),
          keyValues: e.KeyValues,
          propertyName: e.PropertyName,
          errorMessage: e.ErrorMessage
        };
      });
    }

    if (saveContext && entityErrors) {
      var propNameFn = saveContext.entityManager.metadataStore.namingConvention.serverPropertyNameToClient;
      entityErrors.forEach(function (e) {
        e.propertyName = e.propertyName && propNameFn(e.propertyName);
      });
      err.entityErrors = entityErrors
    }

    err.message = message || "Server side errors encountered - see the entityErrors collection on this object for more detail";
    return err;
  }

  // Put this at the bottom of your http error analysis
  proto._catchNoConnectionError = function (err) {
    if (err.status == 0 && err.message == null) {
      err.message = "HTTP response status 0 and no message.  " +
          "Likely did not or could not reach server. Is the server running?";
    }
  }

  return ctor;

})();
