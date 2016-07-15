﻿/**
@module breeze
**/

var DataService = (function () {
  
  /**
  A DataService instance is used to encapsulate the details of a single 'service'; this includes a serviceName, a dataService adapterInstance,
  and whether the service has server side metadata.

  You can construct an EntityManager with either a serviceName or a DataService instance, if you use a serviceName then a DataService
  is constructed for you.  (It can also be set via the EntityManager.setProperties method).

  The same applies to the MetadataStore.fetchMetadata method, i.e. it takes either a serviceName or a DataService instance.

  Each metadataStore contains a list of DataServices, each accessible via its ‘serviceName’.
  ( see MetadataStore.getDataService and MetadataStore.addDataService).  The ‘addDataService’ method is called internally
  anytime a MetadataStore.fetchMetadata call occurs with a new dataService ( or service name).
  @class DataService
  **/

  /**
  DataService constructor

  @example
      var dataService = new DataService({
          serviceName: altServiceName,
          hasServerMetadata: false
      });

      var metadataStore = new MetadataStore({
          namingConvention: NamingConvention.camelCase
      });

      return new EntityManager({
          dataService: dataService,
          metadataStore: metadataStore
      });

  @method <ctor> DataService
  @param config {Object}
  @param config.serviceName {String} The name of the service.
  @param [config.adapterName] {String} The name of the dataServiceAdapter to be used with this service.
  @param [config.uriBuilderName] {String} The name of the uriBuilder to be used with this service.
  @param [config.hasServerMetadata] {bool} Whether the server can provide metadata for this service.
  @param [config.jsonResultsAdapter] {JsonResultsAdapter}  The JsonResultsAdapter used to process the results of any query against this service.
  @param [config.useJsonp] {Boolean}  Whether to use JSONP when making a 'get' request against this service.
  **/
  var ctor = function DataService(config) {
    // this.uriBuilder = uriBuilderForOData;
    updateWithConfig(this, config);
  };
  var proto = ctor.prototype;
  proto._$typeName = "DataService";
  
  /**
  The serviceName for this DataService.

  __readOnly__
  @property serviceName {String}
  **/

  /**
  The adapter name for the dataServiceAdapter to be used with this service.

  __readOnly__
  @property adapterName {String}
  **/

  /**
  The "dataService" adapter implementation instance associated with this EntityManager.

  __readOnly__
  @property adapterInstance {an instance of the "dataService" adapter interface}
  **/

  /**
  Whether the server can provide metadata for this service.

  __readOnly__
  @property hasServerMetadata {Boolean}
  **/

  /**
  The JsonResultsAdapter used to process the results of any query against this DataService.

  __readOnly__
  @property jsonResultsAdapter {JsonResultsAdapter}
  **/

  /**
  Whether to use JSONP when performing a 'GET' request against this service.

  __readOnly__
  @property useJsonP {Boolean}
  **/

  /**
  Returns a copy of this DataService with the specified properties applied.
  @method using
  @param config {Configuration Object} The object to apply to create a new DataService.
  @return {DataService}
  @chainable
  **/
  proto.using = function (config) {
    if (!config) return this;
    var result = new DataService(this);
    return updateWithConfig(result, config);
  };
  
  ctor.resolve = function (dataServices) {
    // final defaults
    dataServices.push({
      hasServerMetadata: true,
      useJsonp: false
    });
    var ds = new DataService(__resolveProperties(dataServices,
        ["serviceName", "adapterName", "uriBuilderName", "hasServerMetadata", "jsonResultsAdapter", "useJsonp"]));
    
    if (!ds.serviceName) {
      throw new Error("Unable to resolve a 'serviceName' for this dataService");
    }
    ds.adapterInstance = ds.adapterInstance || __config.getAdapterInstance("dataService", ds.adapterName);
    ds.jsonResultsAdapter = ds.jsonResultsAdapter || ds.adapterInstance.jsonResultsAdapter;
    ds.uriBuilder = ds.uriBuilder || __config.getAdapterInstance("uriBuilder", ds.uriBuilderName);
    return ds;
  };
  
  function updateWithConfig(obj, config) {
    if (config) {
      assertConfig(config)
          .whereParam("serviceName").isOptional()
          .whereParam("adapterName").isString().isOptional()
          .whereParam("uriBuilderName").isString().isOptional()
          .whereParam("hasServerMetadata").isBoolean().isOptional()
          .whereParam("jsonResultsAdapter").isInstanceOf(JsonResultsAdapter).isOptional()
          .whereParam("useJsonp").isBoolean().isOptional()
          .applyAll(obj);
      obj.serviceName = obj.serviceName && DataService._normalizeServiceName(obj.serviceName);
      obj.adapterInstance = obj.adapterName && __config.getAdapterInstance("dataService", obj.adapterName);
      obj.uriBuilder = obj.uriBuilderName && __config.getAdapterInstance("uriBuilder", obj.uriBuilderName);
    }
    return obj;
  }
  
  ctor._normalizeServiceName = function (serviceName) {
    serviceName = serviceName.trim();
    if (serviceName.substr(-1) !== "/") {
      return serviceName + '/';
    } else {
      return serviceName;
    }
  };
  
  proto.toJSON = function () {
    // don't use default value here - because we want to be able to distinguish undefined props for inheritence purposes.
    return __toJson(this, {
      serviceName: null,
      adapterName: null,
      uriBuilderName: null,
      hasServerMetadata: null,
      jsonResultsAdapter: function (v) {
        return v && v.name;
      },
      useJsonp: null
    });
  };
  
  ctor.fromJSON = function (json) {
    json.jsonResultsAdapter = __config._fetchObject(JsonResultsAdapter, json.jsonResultsAdapter);
    return new DataService(json);
  };

  /**
   Returns a url for this dataService with the specified suffix. This method handles dataService names either
   with or without trailing '/'s.
   @method qualifyUrl
   @param suffix {String} The resulting url.
   @return {a Url string}
   **/
  proto.qualifyUrl = function (suffix) {
    var url = this.serviceName;
    // remove any trailing "/"
    if (core.stringEndsWith(url, "/")) {
      url = url.substr(0, url.length - 1);
    }
    // ensure that it ends with "/" + suffix
    suffix = "/" + suffix;
    if (!core.stringEndsWith(url, suffix)) {
      url = url + suffix;
    }
    return url;
  };
  
  return ctor;
})();

var JsonResultsAdapter = (function () {
  /**
  A JsonResultsAdapter instance is used to provide custom extraction and parsing logic on the json results returned by any web service.
  This facility makes it possible for breeze to talk to virtually any web service and return objects that will be first class 'breeze' citizens.

  @class JsonResultsAdapter
  **/

  /**
  JsonResultsAdapter constructor

  @example
      //
      var jsonResultsAdapter = new JsonResultsAdapter({
          name: "test1e",
          extractResults: function(json) {
              return json.results;
          },
          visitNode: function(node, mappingContext, nodeContext) {
              var entityType = normalizeTypeName(node.$type);
              var propertyName = nodeContext.propertyName;
              var ignore = propertyName && propertyName.substr(0, 1) === "$";

              return {
                  entityType: entityType,
                  nodeId: node.$id,
                  nodeRefId: node.$ref,
                  ignore: ignore,
                  passThru: false // default
              };
          }
      });

      var dataService = new DataService( {
              serviceName: "breeze/foo",
              jsonResultsAdapter: jsonResultsAdapter
      });

      var entityManager = new EntityManager( {
          dataService: dataService
      });

  @method <ctor> JsonResultsAdapter
  @param config {Object}
  @param config.name {String} The name of this adapter.  This name is used to uniquely identify and locate this instance when an 'exported' JsonResultsAdapter is later imported.
  @param [config.extractResults] {Function} Called once per query operation to extract the 'payload' from any json received over the wire.
  This method has a default implementation which to simply return the "results" property from any json returned as a result of executing the query.
  @param [config.extractSaveResults] {Function} Called once per save operation to extract the entities from any json received over the wire.  Must return an array.
  This method has a default implementation which to simply return the "entities" property from any json returned as a result of executing the save.
  @param [config.extractKeyMappings] {Function} Called once per save operation to extract the key mappings from any json received over the wire.  Must return an array.
  This method has a default implementation which to simply return the "keyMappings" property from any json returned as a result of executing the save.
  @param config.visitNode {Function} A visitor method that will be called on each node of the returned payload.
  **/
  var ctor = function JsonResultsAdapter(config) {
    if (arguments.length !== 1) {
      throw new Error("The JsonResultsAdapter ctor should be called with a single argument that is a configuration object.");
    }
    
    assertConfig(config)
        .whereParam("name").isNonEmptyString()
        .whereParam("extractResults").isFunction().isOptional().withDefault(extractResultsDefault)
        .whereParam("extractSaveResults").isFunction().isOptional().withDefault(extractSaveResultsDefault)
        .whereParam("extractKeyMappings").isFunction().isOptional().withDefault(extractKeyMappingsDefault)
        .whereParam("visitNode").isFunction()
        .applyAll(this);
    __config._storeObject(this, proto._$typeName, this.name);
  };
  
  var proto = ctor.prototype;
  proto._$typeName = "JsonResultsAdapter";
  
  function extractResultsDefault(data) {
    return data.results;
  }

  function extractSaveResultsDefault(data) {
    return data.entities || data.Entities || [];
  }

  function extractKeyMappingsDefault(data) {
    return data.keyMappings || data.KeyMappings || [];
  }

  return ctor;
})();

breeze.DataService = DataService;
breeze.JsonResultsAdapter = JsonResultsAdapter;


