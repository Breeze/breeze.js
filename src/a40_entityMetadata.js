/**
@module breeze
**/

// Get the promises library called Q
// define a quick failing version if not found.
var Q = core.requireLib("Q;q");

if (!Q) {
  // No Q.js! Substitute a placeholder Q which always fails
  // Should be replaced by the app via breeze.config.setQ
  // For example, see Breeze Labs "breeze.angular"
  Q = function () {
    var eMsg = 'Q is undefined. Are you missing Q.js? See https://github.com/kriskowal/q';
    throw new Error(eMsg);
  }

  // all Q methods called by Breeze should fail
  Q.defer = Q.resolve = Q.reject = Q;
}

/**
 (Re)set Q with a promises implementation suitable for Breeze internal use.  Note: This API is likely to change.
 @method setQ
 @param q {Object} - a  "thenable" promises implementation like Q.js with the API that Breeze requires internally.
 @param [q.defer] {Function} A function returning a deferred.
 @param [q.resolve] {Function} A function returning a resolved promise.
 @param [q.reject] {Function} A function returning a rejected promise.
 **/
breeze.config.setQ = function (q) {
  breeze.Q = Q = q;
}
breeze.Q = Q; // Todo: consider a "safer" way for apps to get breeze's Q. 


var MetadataStore = (function () {

  /**
  An instance of the MetadataStore contains all of the metadata about a collection of {{#crossLink "EntityType"}}{{/crossLink}}'s.
  MetadataStores may be shared across {{#crossLink "EntityManager"}}{{/crossLink}}'s.  If an EntityManager is created without an
  explicit MetadataStore, the MetadataStore from the MetadataStore.defaultInstance property will be used.
  @class MetadataStore
  **/

  var __id = 0;

  /**
  Constructs a new MetadataStore.
  @example
      var ms = new MetadataStore();
  The store can then be associated with an EntityManager
  @example
      var entityManager = new EntityManager( {
          serviceName: "breeze/NorthwindIBModel", 
          metadataStore: ms 
      });
  or for an existing EntityManager
  @example
      // Assume em1 is an existing EntityManager
      em1.setProperties( { metadataStore: ms });
  @method <ctor> MetadataStore
  @param [config] {Object} Configuration settings .
  @param [config.namingConvention=NamingConvention.defaultInstance] {NamingConvention} NamingConvention to be used in mapping property names
  between client and server. Uses the NamingConvention.defaultInstance if not specified.
  @param [config.localQueryComparisonOptions=LocalQueryComparisonOptions.defaultInstance] {LocalQueryComparisonOptions} The LocalQueryComparisonOptions to be
  used when performing "local queries" in order to match the semantics of queries against a remote service.
  @param [config.serializerFn] A function that is used to mediate the serialization of instances of this type.
  **/
  var ctor = function MetadataStore(config) {
    config = config || { };
    assertConfig(config)
        .whereParam("namingConvention").isOptional().isInstanceOf(NamingConvention).withDefault(NamingConvention.defaultInstance)
        .whereParam("localQueryComparisonOptions").isOptional().isInstanceOf(LocalQueryComparisonOptions).withDefault(LocalQueryComparisonOptions.defaultInstance)
        .whereParam("serializerFn").isOptional().isFunction()
        .applyAll(this);
    this.dataServices = []; // array of dataServices;
    this._resourceEntityTypeMap = {}; // key is resource name - value is qualified entityType name
    this._structuralTypeMap = {}; // key is qualified structuraltype name - value is structuralType. ( structural = entityType or complexType).
    this._shortNameMap = {}; // key is shortName, value is qualified name - does not need to be serialized.
    this._ctorRegistry = {}; // key is either short or qual type name - value is ctor;
    this._incompleteTypeMap = {}; // key is entityTypeName; value is array of nav props
    this._incompleteComplexTypeMap = {}; // key is complexTypeName; value is array of complexType props
    this._id = __id++;
    this.metadataFetched = new Event("metadataFetched", this);

  };
  var proto = ctor.prototype;
  proto._$typeName = "MetadataStore";
  Event.bubbleEvent(proto, null);
  ctor.ANONTYPE_PREFIX = "_IB_";


  // needs to be made avail to breeze.dataService.xxx files
  ctor.normalizeTypeName = __memoize(function (rawTypeName) {
    return rawTypeName && parseTypeName(rawTypeName).typeName;
  });
  // for debugging use the line below instead.
  //ctor.normalizeTypeName = function (rawTypeName) { return parseTypeName(rawTypeName).typeName; };

  /**
  An {{#crossLink "Event"}}{{/crossLink}} that fires after a MetadataStore has completed fetching metadata from a remote service.

  @example
      var ms = myEntityManager.metadataStore;
      ms.metadataFetched.subscribe(function(args) {
              var metadataStore = args.metadataStore;
              var dataService = args.dataService;
          });
      });

  @event metadataFetched
  @param metadataStore {MetadataStore} The MetadataStore into which the metadata was fetched.
  @param dataService {DataService} The DataService that metadata was fetched from.
  @param rawMetadata {Object} The raw metadata returned from the service. (It will have already been processed by this point).
  @readOnly
  **/

  /**
  General purpose property set method
  @example
      // assume em1 is an EntityManager containing a number of existing entities.

      em1.metadataStore.setProperties( {
          version: "6.1.3",
          serializerFn: function(prop, value) {
          return (prop.isUnmapped) ? undefined : value;
          }
      )};
  @method setProperties
  @param config [object]
  @param [config.name] {String} A name for the collection of metadata in this store.
  @param [config.serializerFn] A function that is used to mediate the serialization of instances of this type.
  **/
  proto.setProperties = function (config) {
    assertConfig(config)
        .whereParam("name").isString().isOptional()
        .whereParam("serializerFn").isFunction().isOptional()
        .applyAll(this);
  };

  /**
  Adds a DataService to this MetadataStore. If a DataService with the same serviceName is already
  in the MetadataStore an exception will be thrown.
  @method addDataService
  @param dataService {DataService} The DataService to add
  @param [shouldOverwrite=false] {Boolean} Permit overwrite of existing DataService rather than throw exception
  **/
  proto.addDataService = function (dataService, shouldOverwrite) {
    assertParam(dataService, "dataService").isInstanceOf(DataService).check();
    assertParam(shouldOverwrite, "shouldOverwrite").isBoolean().isOptional().check();
    var ix = this._getDataServiceIndex(dataService.serviceName);
    if (ix >= 0) {
      if (!!shouldOverwrite) {
        this.dataServices[ix] = dataService;
      } else {
        throw new Error("A dataService with this name '" + dataService.serviceName + "' already exists in this MetadataStore");
      }
    } else {
      this.dataServices.push(dataService);
    }
  };

  proto._getDataServiceIndex = function (serviceName) {
    return __arrayIndexOf(this.dataServices, function (ds) {
      return ds.serviceName === serviceName;
    });
  };

  /**
  Adds an EntityType to this MetadataStore.  No additional properties may be added to the EntityType after its has
  been added to the MetadataStore.
  @method addEntityType
  @param structuralType {EntityType|ComplexType} The EntityType or ComplexType to add
  **/
  proto.addEntityType = function (structuralType) {
    if (!(structuralType instanceof EntityType || structuralType instanceof ComplexType)) {
      structuralType = structuralType.isComplexType ? new ComplexType(structuralType) : new EntityType(structuralType);
    }

    if (!structuralType.isComplexType) {
      if (structuralType.baseTypeName && !structuralType.baseEntityType) {
        var baseEntityType = this._getEntityType(structuralType.baseTypeName, true);
        structuralType._updateFromBase(baseEntityType);
      }
      if (structuralType.keyProperties.length === 0 && !structuralType.isAbstract) {
        throw new Error("Unable to add " + structuralType.name +
            " to this MetadataStore.  An EntityType must have at least one property designated as a key property - See the 'DataProperty.isPartOfKey' property.");
      }
    }

    structuralType.metadataStore = this;
    // don't register anon types
    if (!structuralType.isAnonymous) {
      if (this._structuralTypeMap[structuralType.name]) {
        throw new Error("Type " + structuralType.name + " already exists in this MetadataStore.");
      }

      this._structuralTypeMap[structuralType.name] = structuralType;
      this._shortNameMap[structuralType.shortName] = structuralType.name;
    }

    structuralType.getProperties().forEach(function (property) {
      structuralType._updateNames(property);
      if (!property.isUnmapped) {
        structuralType._mappedPropertiesCount++;
      }
    });

    structuralType._updateCps();

    if (!structuralType.isComplexType) {
      structuralType._updateNps();
      // give the type it's base's resource name if it doesn't have its own.
      var defResourceName = structuralType.defaultResourceName || (structuralType.baseEntityType && structuralType.baseEntityType.defaultResourceName);
      if (defResourceName && !this.getEntityTypeNameForResourceName(defResourceName)) {
        this.setEntityTypeForResourceName(defResourceName, structuralType.name);
      }
      structuralType.defaultResourceName = defResourceName;
      // check if this structural type's name, short version or qualified version has a registered ctor.
      structuralType.getEntityCtor();
    }

  };

  /**
  The  {{#crossLink "NamingConvention"}}{{/crossLink}} associated with this MetadataStore.

  __readOnly__
  @property namingConvention {NamingConvention}
  **/

  /**
  Exports this MetadataStore to a serialized string appropriate for local storage.   This operation is also called
  internally when exporting an EntityManager.
  @example
      // assume ms is a previously created MetadataStore
      var metadataAsString = ms.exportMetadata();
      window.localStorage.setItem("metadata", metadataAsString);
      // and later, usually in a different session imported
      var metadataFromStorage = window.localStorage.getItem("metadata");
      var newMetadataStore = new MetadataStore();
      newMetadataStore.importMetadata(metadataFromStorage);
  @method exportMetadata
  @return {String} A serialized version of this MetadataStore that may be stored locally and later restored.
  **/
  proto.exportMetadata = function () {
    var result = JSON.stringify({
      "metadataVersion": breeze.metadataVersion,
      "name": this.name,
      "namingConvention": this.namingConvention.name,
      "localQueryComparisonOptions": this.localQueryComparisonOptions.name,
      "dataServices": this.dataServices,
      "structuralTypes": __objectMap(this._structuralTypeMap),
      "resourceEntityTypeMap": this._resourceEntityTypeMap
    }, null, __config.stringifyPad);
    return result;
  };

  /**
  Imports a previously exported serialized MetadataStore into this MetadataStore.
  @example
      // assume ms is a previously created MetadataStore
      var metadataAsString = ms.exportMetadata();
      window.localStorage.setItem("metadata", metadataAsString);
      // and later, usually in a different session
      var metadataFromStorage = window.localStorage.getItem("metadata");
      var newMetadataStore = new MetadataStore();
      newMetadataStore.importMetadata(metadataFromStorage);
  @method importMetadata
  @param exportedMetadata {String|JSON Object} A previously exported MetadataStore.
  @param [allowMerge] {Boolean} Allows custom metadata to be merged into existing metadata types.
  @return {MetadataStore} This MetadataStore.
  @chainable
  **/
  proto.importMetadata = function (exportedMetadata, allowMerge) {
    assertParam(allowMerge, "allowMerge").isOptional().isBoolean().check();
    this._deferredTypes = {};
    var json = (typeof (exportedMetadata) === "string") ? JSON.parse(exportedMetadata) : exportedMetadata;

    if (json.schema) {
      var parser = this.csdlMetadataParser || breeze.CsdlMetadataParser;
      return parser.parse.call(parser, this, json.schema, json.altMetadata);
    }

    if (json.metadataVersion && json.metadataVersion !== breeze.metadataVersion) {
      var msg = __formatString("Cannot import metadata with a different 'metadataVersion' (%1) than the current 'breeze.metadataVersion' (%2) ",
          json.metadataVersion, breeze.metadataVersion);
      throw new Error(msg);
    }

    var ncName = json.namingConvention;
    var lqcoName = json.localQueryComparisonOptions;
    if (this.isEmpty()) {
      this.namingConvention = __config._fetchObject(NamingConvention, ncName) || this.namingConvention;
      this.localQueryComparisonOptions = __config._fetchObject(LocalQueryComparisonOptions, lqcoName) || this.localQueryComparisonOptions;
    } else {
      if (ncName && this.namingConvention.name !== ncName) {
        throw new Error("Cannot import metadata with a different 'namingConvention' from the current MetadataStore");
      }
      if (lqcoName && this.localQueryComparisonOptions.name !== lqcoName) {
        throw new Error("Cannot import metadata with different 'localQueryComparisonOptions' from the current MetadataStore");
      }
    }

    var that = this;

    //noinspection JSHint
    json.dataServices && json.dataServices.forEach(function (ds) {
      ds = DataService.fromJSON(ds);
      that.addDataService(ds, true);
    });
    var structuralTypeMap = this._structuralTypeMap;

    json.structuralTypes && json.structuralTypes.forEach(function (stype) {
      structuralTypeFromJson(that, stype, allowMerge);
    });
    __extend(this._resourceEntityTypeMap, json.resourceEntityTypeMap);
    __extend(this._incompleteTypeMap, json.incompleteTypeMap);

    return this;
  };

  /**
  Creates a new MetadataStore from a previously exported serialized MetadataStore
  @example
      // assume ms is a previously created MetadataStore
      var metadataAsString = ms.exportMetadata();
      window.localStorage.setItem("metadata", metadataAsString);
      // and later, usually in a different session
      var metadataFromStorage = window.localStorage.getItem("metadata");
      var newMetadataStore = MetadataStore.importMetadata(metadataFromStorage);
  @method importMetadata
  @static
  @param exportedString {String} A previously exported MetadataStore.
  @return {MetadataStore} A new MetadataStore.

  **/
  ctor.importMetadata = function (exportedString) {
    var ms = new MetadataStore();
    ms.importMetadata(exportedString);
    return ms;
  };

  /**
  Returns whether Metadata has been retrieved for a specified service name.
  @example
      // Assume em1 is an existing EntityManager.
      if (!em1.metadataStore.hasMetadataFor("breeze/NorthwindIBModel"))) {
          // do something interesting
      }
  @method hasMetadataFor
  @param serviceName {String} The service name.
  @return {Boolean}
  **/
  proto.hasMetadataFor = function (serviceName) {
    return !!this.getDataService(serviceName);
  };

  /**
  Returns the DataService for a specified service name
  @example
      // Assume em1 is an existing EntityManager.
      var ds = em1.metadataStore.getDataService("breeze/NorthwindIBModel");
      var adapterName = ds.adapterName; // may be null

  @method getDataService
  @param serviceName {String} The service name.
  @return {DataService}
  **/
  proto.getDataService = function (serviceName) {
    assertParam(serviceName, "serviceName").isString().check();

    serviceName = DataService._normalizeServiceName(serviceName);
    return __arrayFirst(this.dataServices, function (ds) {
      return ds.serviceName === serviceName;
    });
  };

  /**
  Fetches the metadata for a specified 'service'. This method is automatically called
  internally by an EntityManager before its first query against a new service.

  @example
  Usually you will not actually process the results of a fetchMetadata call directly, but will instead
  ask for the metadata from the EntityManager after the fetchMetadata call returns.
  @example
      var ms = new MetadataStore();
      // or more commonly
      // var ms = anEntityManager.metadataStore;
      ms.fetchMetadata("breeze/NorthwindIBModel").then(function(rawMetadata) {
            // do something with the metadata
      }).fail(function(exception) {
          // handle exception here
      });
  @method fetchMetadata
  @async
  @param dataService {DataService|String}  Either a DataService or just the name of the DataService to fetch metadata for.

  @param [callback] {Function} Function called on success.

  successFunction([data])
  @param [callback.data] {rawMetadata}

  @param [errorCallback] {Function} Function called on failure.

  failureFunction([error])
  @param [errorCallback.error] {Error} Any error that occured wrapped into an Error object.

  @return {Promise} Promise
  **/
  proto.fetchMetadata = function (dataService, callback, errorCallback) {
    try {
      assertParam(dataService, "dataService").isString().or().isInstanceOf(DataService).check();
      assertParam(callback, "callback").isFunction().isOptional().check();
      assertParam(errorCallback, "errorCallback").isFunction().isOptional().check();

      if (typeof dataService === "string") {
        // use the dataService with a matching name or create a new one.
        dataService = this.getDataService(dataService) || new DataService({ serviceName: dataService });
      }

      dataService = DataService.resolve([dataService]);


      if (this.hasMetadataFor(dataService.serviceName)) {
        throw new Error("Metadata for a specific serviceName may only be fetched once per MetadataStore. ServiceName: " + dataService.serviceName);
      }
      var that = this;
      return dataService.adapterInstance.fetchMetadata(this, dataService).then(function (rawMetadata) {
        that.metadataFetched.publish({ metadataStore: that, dataService: dataService, rawMetadata: rawMetadata });
        if (callback) callback(rawMetadata);
        return Q.resolve(rawMetadata);
      }, function (error) {
        if (errorCallback) errorCallback(error);
        return Q.reject(error);
      });
    } catch (e) {
      return Q.reject(e);
    }
  };


  /**
  Used to register a constructor for an EntityType that is not known via standard Metadata discovery;
  i.e. an unmapped type.

  @method trackUnmappedType
  @param entityCtor {Function} The constructor for the 'unmapped' type.
  @param [interceptor] {Function} A function
  **/
  proto.trackUnmappedType = function (entityCtor, interceptor) {
    assertParam(entityCtor, "entityCtor").isFunction().check();
    assertParam(interceptor, "interceptor").isFunction().isOptional().check();
    // TODO: think about adding this to the MetadataStore.
    var entityType = new EntityType(this);
    entityType._setCtor(entityCtor, interceptor);
  };

  /**
  Provides a mechanism to register a 'custom' constructor to be used when creating new instances
  of the specified entity type.  If this call is not made, a default constructor is created for
  the entity as needed.
  This call may be made before or after the corresponding EntityType has been discovered via
  Metadata discovery.
  @example
      var Customer = function () {
              this.miscData = "asdf";
          };
      Customer.prototype.doFoo() {
              ...
          }
      // assume em1 is a preexisting EntityManager;
      em1.metadataStore.registerEntityTypeCtor("Customer", Customer);
      // any queries or EntityType.create calls from this point on will call the Customer constructor
      // registered above.
  @method registerEntityTypeCtor
  @param structuralTypeName {String} The name of the EntityType or ComplexType.
  @param aCtor {Function}  The constructor for this EntityType or ComplexType; may be null if all you want to do is set the next parameter.
  @param [initFn] {Function} A function or the name of a function on the entity that is to be executed immediately after the entity has been created
  and populated with any initial values.
  initFn(entity)
  @param initFn.entity {Entity} The entity being created or materialized.
  @param [noTrackingFn] {Function} A function that is executed immediately after a noTracking entity has been created and whose return
  value will be used in place of the noTracking entity.
  @param noTrackingFn.entity {Object}
  @param noTrackingFn.entityType {EntityType} The entityType that the 'entity' parameter would be if we were tracking
  **/
  proto.registerEntityTypeCtor = function (structuralTypeName, aCtor, initFn, noTrackingFn) {
    assertParam(structuralTypeName, "structuralTypeName").isString().check();
    assertParam(aCtor, "aCtor").isFunction().isOptional().check();
    assertParam(initFn, "initFn").isOptional().isFunction().or().isString().check();
    assertParam(noTrackingFn, "noTrackingFn").isOptional().isFunction().check();

    var qualifiedTypeName = getQualifiedTypeName(this, structuralTypeName, false);
    var typeName = qualifiedTypeName || structuralTypeName;

    if (aCtor) {
      if (aCtor._$typeName && aCtor._$typeName != typeName) {
        console.warn("Registering a constructor for " + typeName + " that is already used for " + aCtor._$typeName + ".");
      }
      aCtor._$typeName = typeName;
    }

    this._ctorRegistry[typeName] = { ctor: aCtor, initFn: initFn, noTrackingFn: noTrackingFn };
    if (qualifiedTypeName) {
      var stype = this._structuralTypeMap[qualifiedTypeName];
      stype && stype.getCtor(true); // this will complete the registration if avail now.
    }

  };

  /**
  Returns whether this MetadataStore contains any metadata yet.
  @example
      // assume em1 is a preexisting EntityManager;
      if (em1.metadataStore.isEmpty()) {
          // do something interesting
      }
  @method isEmpty
  @return {Boolean}
  **/
  proto.isEmpty = function () {
    return __isEmpty(this._structuralTypeMap);
  };

  /**
  Returns an  {{#crossLink "EntityType"}}{{/crossLink}} or a {{#crossLink "ComplexType"}}{{/crossLink}} given its name.
  @example
      // assume em1 is a preexisting EntityManager
      var odType = em1.metadataStore.getEntityType("OrderDetail");
  or to throw an error if the type is not found
  @example
      var badType = em1.metadataStore.getEntityType("Foo", false);
      // badType will not get set and an exception will be thrown.
  @method getEntityType
  @param structuralTypeName {String}  Either the fully qualified name or a short name may be used. If a short name is specified and multiple types share
  that same short name an exception will be thrown.
  @param [okIfNotFound=false] {Boolean} Whether to throw an error if the specified EntityType is not found.
  @return {EntityType|ComplexType} The EntityType. ComplexType or 'undefined' if not not found.
  **/
  proto.getEntityType = function (structuralTypeName, okIfNotFound) {
    assertParam(structuralTypeName, "structuralTypeName").isString().check();
    assertParam(okIfNotFound, "okIfNotFound").isBoolean().isOptional().check(false);
    return this._getEntityType(structuralTypeName, okIfNotFound);
  };

  proto._getEntityType = function (typeName, okIfNotFound) {
    var qualTypeName = getQualifiedTypeName(this, typeName, false);
    var type = this._structuralTypeMap[qualTypeName];
    if (!type) {
      if (okIfNotFound) return null;
      var msg = __formatString("Unable to locate a 'Type' by the name: '%1'. Be sure to execute a query or call fetchMetadata first.", typeName);
      throw new Error(msg);

    }
    if (type.length) {
      var typeNames = type.join(",");
      throw new Error("There are multiple types with this 'shortName': " + typeNames);
    }
    return type;
  };

  /**
  Returns an array containing all of the  {{#crossLink "EntityType"}}{{/crossLink}}s or {{#crossLink "ComplexType"}}{{/crossLink}}s in this MetadataStore.
  @example
      // assume em1 is a preexisting EntityManager
      var allTypes = em1.metadataStore.getEntityTypes();
  @method getEntityTypes
  @return {Array of EntityType|ComplexType}
  **/
  proto.getEntityTypes = function () {
    return getTypesFromMap(this._structuralTypeMap);
  };

  proto.getIncompleteNavigationProperties = function () {
    return __objectMap(this._incompleteTypeMap, function (key, value) {
      return value;
    });
  };

  /**
  Returns a fully qualified entityTypeName for a specified resource name.  The reverse of this operation
  can be obtained via the  {{#crossLink "EntityType"}}{{/crossLink}} 'defaultResourceName' property
  @method getEntityTypeNameForResourceName
  @param resourceName {String}
  **/
  proto.getEntityTypeNameForResourceName = function (resourceName) {
    assertParam(resourceName, "resourceName").isString().check();
    return this._resourceEntityTypeMap[resourceName];
  };

  /**
  Associates a resourceName with an entityType.

  This method is only needed in those cases where multiple resources return the same
  entityType.  In this case Metadata discovery will only determine a single resource name for
  each entityType.
  @method setEntityTypeForResourceName
  @param resourceName {String}
  @param entityTypeOrName {EntityType|String} If passing a string either the fully qualified name or a short name may be used. If a short name is specified and multiple types share
  that same short name an exception will be thrown. If the entityType has not yet been discovered then a fully qualified name must be used.
  **/
  proto.setEntityTypeForResourceName = function (resourceName, entityTypeOrName) {
    assertParam(resourceName, "resourceName").isString().check();
    assertParam(entityTypeOrName, "entityTypeOrName").isInstanceOf(EntityType).or().isString().check();

    var entityTypeName;
    if (entityTypeOrName instanceof EntityType) {
      entityTypeName = entityTypeOrName.name;
    } else {
      entityTypeName = getQualifiedTypeName(this, entityTypeOrName, true);
    }

    this._resourceEntityTypeMap[resourceName] = entityTypeName;
    var entityType = this._getEntityType(entityTypeName, true);
    if (entityType && !entityType.defaultResourceName) {
      entityType.defaultResourceName = resourceName;
    }
  };


  // protected methods

  proto._checkEntityType = function (entity) {
    if (entity.entityType) return;
    var typeName = entity.prototype._$typeName;
    if (!typeName) {
      throw new Error("This entity has not been registered. See the MetadataStore.registerEntityTypeCtor method");
    }
    var entityType = this._getEntityType(typeName);
    if (entityType) {
      entity.entityType = entityType;
    }
  };

  function getTypesFromMap(typeMap) {
    var types = [];
    for (var key in typeMap) {
      var value = typeMap[key];
      // skip 'shortName' entries
      if (key === value.name) {
        types.push(typeMap[key]);
      }
    }
    return types;
  }

  function structuralTypeFromJson(metadataStore, json, allowMerge) {
    var typeName = qualifyTypeName(json.shortName, json.namespace);
    var stype = metadataStore._getEntityType(typeName, true);
    if (stype) {
      if (allowMerge) {
        return mergeStructuralType(stype, json);
      } else {
        // allow it but don't replace anything.
        return stype;
      }
    }
    var config = {
      shortName: json.shortName,
      namespace: json.namespace,
      isAbstract: json.isAbstract,
      autoGeneratedKeyType: AutoGeneratedKeyType.fromName(json.autoGeneratedKeyType),
      defaultResourceName: json.defaultResourceName,
      custom: json.custom
    };

    stype = json.isComplexType ? new ComplexType(config) : new EntityType(config);

    // baseType may not have been imported yet so we need to defer handling this type until later.
    if (json.baseTypeName) {
      stype.baseTypeName = json.baseTypeName;
      var baseEntityType = metadataStore._getEntityType(json.baseTypeName, true);
      if (baseEntityType) {
        completeStructuralTypeFromJson(metadataStore, json, stype, baseEntityType);
      } else {
        __getArray(metadataStore._deferredTypes, json.baseTypeName).push({ json: json, stype: stype });

      }
    } else {
      completeStructuralTypeFromJson(metadataStore, json, stype);
    }

    // stype may or may not have been added to the metadataStore at this point.
    return stype;
  }

  function mergeStructuralType(stype, json) {
    if (json.custom) {
      stype.custom = json.custom;
    }

    mergeProps(stype, json.dataProperties);
    mergeProps(stype, json.navigationProperties);
    return stype;
  }

  function mergeProps(stype, jsonProps) {
    if (!jsonProps) return;
    jsonProps.forEach(function (jsonProp) {
      var propName = jsonProp.name;
      if (!propName) {
        if (jsonProp.nameOnServer) {
          propName = stype.metadataStore.namingConvention.serverPropertyNameToClient(jsonProp.nameOnServer, {});
        } else {
          throw new Error("Unable to complete 'importMetadata' - cannot locate a 'name' or 'nameOnServer' for one of the imported property nodes");
        }
      }
      if (jsonProp.custom) {
        var prop = stype.getProperty(propName, true);
        prop.custom = jsonProp.custom;
      }
    });
  }

  function completeStructuralTypeFromJson(metadataStore, json, stype) {

    // validators from baseType work because validation walks thru base types
    // so no need to copy down.
    if (json.validators) {
      stype.validators = json.validators.map(Validator.fromJSON);
    }


    json.dataProperties.forEach(function (dp) {
      stype._addPropertyCore(DataProperty.fromJSON(dp));
    });


    var isEntityType = !json.isComplexType;
    if (isEntityType) {
      //noinspection JSHint
      json.navigationProperties && json.navigationProperties.forEach(function (np) {
        stype._addPropertyCore(NavigationProperty.fromJSON(np));
      });
    }

    metadataStore.addEntityType(stype);

    var deferredTypes = metadataStore._deferredTypes;
    var deferrals = deferredTypes[stype.name];
    if (deferrals) {
      deferrals.forEach(function (d) {
        completeStructuralTypeFromJson(metadataStore, d.json, d.stype);
      });
      delete deferredTypes[stype.name];
    }
  }

  function getQualifiedTypeName(metadataStore, structTypeName, throwIfNotFound) {
    if (isQualifiedTypeName(structTypeName)) return structTypeName;
    var result = metadataStore._shortNameMap[structTypeName];
    if (!result && throwIfNotFound) {
      throw new Error("Unable to locate 'entityTypeName' of: " + structTypeName);
    }
    return result;
  }

  return ctor;
})();

var EntityType = (function () {
  /**
  Container for all of the metadata about a specific type of Entity.
  @class EntityType
  **/
  var __nextAnonIx = 0;


  /**
  @example
      var entityType = new EntityType( {
          shortName: "person",
          namespace: "myAppNamespace"
      });
  @method <ctor> EntityType
  @param config {Object|MetadataStore} Configuration settings or a MetadataStore.  If this parameter is just a MetadataStore
  then what will be created is an 'anonymous' type that will never be communicated to or from the server. It is purely for
  client side use and will be given an automatically generated name. Normally, however, you will use a configuration object.
  @param config.shortName {String}
  @param [config.namespace=""] {String}
  @param [config.baseTypeName] {String}
  @param [config.isAbstract=false] {Boolean}
  @param [config.autoGeneratedKeyType] {AutoGeneratedKeyType}
  @param [config.defaultResourceName] {String}
  @param [config.dataProperties] {Array of DataProperties}
  @param [config.navigationProperties] {Array of NavigationProperties}
  @param [config.serializerFn] A function that is used to mediate the serialization of instances of this type.
  @param [config.custom] {Object}
  **/
  var ctor = function EntityType(config) {
    if (arguments.length > 1) {
      throw new Error("The EntityType ctor has a single argument that is either a 'MetadataStore' or a configuration object.");
    }
    if (config._$typeName === "MetadataStore") {
      this.metadataStore = config;
      this.shortName = "Anon_" + (++__nextAnonIx);
      this.namespace = "";
      this.isAnonymous = true;
    } else {
      assertConfig(config)
          .whereParam("shortName").isNonEmptyString()
          .whereParam("namespace").isString().isOptional().withDefault("")
          .whereParam("baseTypeName").isString().isOptional()
          .whereParam("isAbstract").isBoolean().isOptional().withDefault(false)
          .whereParam("autoGeneratedKeyType").isEnumOf(AutoGeneratedKeyType).isOptional().withDefault(AutoGeneratedKeyType.None)
          .whereParam("defaultResourceName").isNonEmptyString().isOptional().withDefault(null)
          .whereParam("dataProperties").isOptional()
          .whereParam("navigationProperties").isOptional()
          .whereParam("serializerFn").isOptional().isFunction()
          .whereParam("custom").isOptional()
          .applyAll(this);
    }

    this.name = qualifyTypeName(this.shortName, this.namespace);

    // the defaultResourceName may also be set up either via metadata lookup or first query or via the 'setProperties' method
    this.dataProperties = [];
    this.navigationProperties = [];
    this.complexProperties = [];
    this.keyProperties = [];
    this.foreignKeyProperties = [];
    this.inverseForeignKeyProperties = [];
    this.concurrencyProperties = [];
    this.unmappedProperties = []; // will be updated later.
    this.validators = [];
    this.warnings = [];
    this._mappedPropertiesCount = 0;
    this.subtypes = [];
    // now process any data/nav props
    addProperties(this, config.dataProperties, DataProperty);
    addProperties(this, config.navigationProperties, NavigationProperty);
  };
  var proto = ctor.prototype;
  var parseRawValue = DataType.parseRawValue;
  proto._$typeName = "EntityType";
  ctor.qualifyTypeName = qualifyTypeName;

  /**
  The {{#crossLink "MetadataStore"}}{{/crossLink}} that contains this EntityType

  __readOnly__
  @property metadataStore {MetadataStore}
  **/

  /**
  The DataProperties (see {{#crossLink "DataProperty"}}{{/crossLink}}) associated with this EntityType.

  __readOnly__
  @property dataProperties {Array of DataProperty}
  **/

  /**
  The NavigationProperties  (see {{#crossLink "NavigationProperty"}}{{/crossLink}}) associated with this EntityType.

  __readOnly__
  @property navigationProperties {Array of NavigationProperty}
  **/

  /**
  The DataProperties for this EntityType that contain instances of a ComplexType (see {{#crossLink "ComplexType"}}{{/crossLink}}).

  __readOnly__
  @property complexProperties {Array of DataProperty}
  **/

  /**
  The DataProperties associated with this EntityType that make up it's {{#crossLink "EntityKey"}}{{/crossLink}}.

  __readOnly__
  @property keyProperties {Array of DataProperty}
  **/

  /**
  The DataProperties associated with this EntityType that are foreign key properties.

  __readOnly__
  @property foreignKeyProperties {Array of DataProperty}
  **/

  /**
  The DataProperties associated with this EntityType that are concurrency properties.

  __readOnly__
  @property concurrencyProperties {Array of DataProperty}
  **/

  /**
  The DataProperties associated with this EntityType that are not mapped to any backend datastore. These are effectively free standing
  properties.

  __readOnly__
  @property unmappedProperties {Array of DataProperty}
  **/

  /**
  The default resource name associated with this EntityType.  An EntityType may be queried via a variety of 'resource names' but this one
  is used as the default when no resource name is provided.  This will occur when calling {{#crossLink "EntityAspect/loadNavigationProperty"}}{{/crossLink}}
  or when executing any {{#crossLink "EntityQuery"}}{{/crossLink}} that was created via an {{#crossLink "EntityKey"}}{{/crossLink}}.

  __readOnly__
  @property defaultResourceName {String}
  **/

  /**
  The fully qualified name of this EntityType.

  __readOnly__
  @property name {String}
  **/

  /**
  The short, unqualified, name for this EntityType.

  __readOnly__
  @property shortName {String}
  **/

  /**
  The namespace for this EntityType.

  __readOnly__
  @property namespace {String}
  **/

  /**
  The base EntityType (if any) for this EntityType.

  __readOnly__
  @property baseEntityType {EntityType}
  **/

  /**
  Whether this EntityType is abstract.

  __readOnly__
  @property isAbstract {boolean}
  **/

  /**
  The {{#crossLink "AutoGeneratedKeyType"}}{{/crossLink}} for this EntityType.

  __readOnly__
  @property autoGeneratedKeyType {AutoGeneratedKeyType}
  @default AutoGeneratedKeyType.None
  **/

  /**
  The entity level validators associated with this EntityType. Validators can be added and
  removed from this collection.

  __readOnly__
  @property validators {Array of Validator}
  **/

  /**
  A free form object that can be used to define any custom metadata for this EntityType.

  __readOnly__
  @property custom {Object}
  **/

  /**
  General purpose property set method
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      custType.setProperties( {
          autoGeneratedKeyType: AutoGeneratedKeyType.Identity;
          defaultResourceName: "CustomersAndIncludedOrders"
      )};
  @method setProperties
  @param config [object]
  @param [config.autogeneratedKeyType] {AutoGeneratedKeyType}
  @param [config.defaultResourceName] {String}
  @param [config.serializerFn] A function that is used to mediate the serialization of instances of this type.
  @param [config.custom] {Object}
  **/
  proto.setProperties = function (config) {
    assertConfig(config)
        .whereParam("autoGeneratedKeyType").isEnumOf(AutoGeneratedKeyType).isOptional()
        .whereParam("defaultResourceName").isString().isOptional()
        .whereParam("serializerFn").isFunction().isOptional()
        .whereParam("custom").isOptional()
        .applyAll(this);
    if (config.defaultResourceName) {
      this.defaultResourceName = config.defaultResourceName;
    }
  };

  /**
  Returns whether this type is a subtype of a specified type.

  @method isSubtypeOf
  @param entityType [EntityType]
  **/
  proto.isSubtypeOf = function (entityType) {
    assertParam(entityType, "entityType").isInstanceOf(EntityType).check();
    var baseType = this;
    do {
      if (baseType === entityType) return true;
      baseType = baseType.baseEntityType;
    } while (baseType);
    return false;
  };

  /**
  Returns an array containing this type and any/all subtypes of this type down thru the hierarchy.

  @method getSelfAndSubtypes
  **/
  proto.getSelfAndSubtypes = function () {
    var result = [this];
    this.subtypes.forEach(function (st) {
      var subtypes = st.getSelfAndSubtypes();
      result.push.apply(result, subtypes);
    });
    return result;
  };

  proto.getAllValidators = function () {
    var result = this.validators.slice(0);
    var bt = this.baseEntityType;
    while (bt) {
      result.push.apply(result, bt.validators);
      bt = bt.baseEntityType;
    }
    ;
    return result;
  }

  /**
  Adds a  {{#crossLink "DataProperty"}}{{/crossLink}} or a {{#crossLink "NavigationProperty"}}{{/crossLink}} to this EntityType.
  @example
      // assume myEntityType is a newly constructed EntityType.
      myEntityType.addProperty(dataProperty1);
      myEntityType.addProperty(dataProperty2);
      myEntityType.addProperty(navigationProperty1);
  @method addProperty
  @param property {DataProperty|NavigationProperty}
  **/
  proto.addProperty = function (property) {
    assertParam(property, "property").isInstanceOf(DataProperty).or().isInstanceOf(NavigationProperty).check();

    // true is 2nd arg to force resolve of any navigation properties.
    return this._addPropertyCore(property, true);
  };

  proto._updateFromBase = function (baseEntityType) {
    this.baseEntityType = baseEntityType;
    if (this.autoGeneratedKeyType === AutoGeneratedKeyType.None) {
      this.autoGeneratedKeyType = baseEntityType.autoGeneratedKeyType;
    }

    baseEntityType.dataProperties.forEach(function (dp) {
      var newDp = new DataProperty(dp);
      // don't need to copy validators becaue we will walk the hierarchy to find them
      newDp.validators = [];
      newDp.baseProperty = dp;
      this._addPropertyCore(newDp);
    }, this);
    baseEntityType.navigationProperties.forEach(function (np) {
      var newNp = new NavigationProperty(np);
      // don't need to copy validators becaue we will walk the hierarchy to find them
      newNp.validators = [];
      newNp.baseProperty = np;
      this._addPropertyCore(newNp);
    }, this);
    baseEntityType.subtypes.push(this);
  }

  proto._addPropertyCore = function (property, shouldResolve) {
    if (this.isFrozen) {
      throw new Error("The '" + this.name + "' EntityType/ComplexType has been frozen. You can only add properties to an EntityType/ComplexType before any instances of that type have been created and attached to an entityManager.");
    }
    var parentType = property.parentType;
    if (parentType) {
      if (parentType !== this) {
        throw new Error("This property: " + property.name + " has already been added to " + property.parentType.name);
      } else {
        // adding the same property more than once to the same entityType is just ignored.
        return this;
      }
    }
    property.parentType = this;
    var ms = this.metadataStore;
    if (property.isDataProperty) {
      this._addDataProperty(property);
    } else {
      this._addNavigationProperty(property);
      // metadataStore can be undefined if this entityType has not yet been added to a MetadataStore.
      if (shouldResolve && ms) {
        tryResolveNp(property, ms);
      }
    }
    // unmapped properties can be added AFTER entityType has already resolved all property names.
    if (ms && !(property.name && property.nameOnServer)) {
      updateClientServerNames(ms.namingConvention, property, "name");
    }
    // props can be added after entity prototype has already been wrapped.
    if (ms && this._extra) {
      if (this._extra.alreadyWrappedProps) {
        var proto = this._ctor.prototype;
        __modelLibraryDef.getDefaultInstance().initializeEntityPrototype(proto);
      }
    }
    return this;
  };

  /**
  Create a new entity of this type.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var cust1 = custType.createEntity();
      em1.addEntity(cust1);
  @method createEntity
  @param [initialValues] {Config object} - Configuration object of the properties to set immediately after creation.
  @return {Entity} The new entity.
  **/
  proto.createEntity = function (initialValues) {
    // ignore the _$eref once the entity is attached to an entityManager.
    if (initialValues && initialValues._$eref && !initialValues._$eref.entityAspect.entityManager) return initialValues._$eref;

    var instance = this._createInstanceCore();

    if (initialValues) {
      // only assign an _eref if the object is fully "keyed"
      if (this.keyProperties.every(function (kp) {
        return initialValues[kp.name] != null;
      })) {
        initialValues._$eref = instance;
      }
      ;

      this._updateTargetFromRaw(instance, initialValues, getRawValueFromConfig);

      this.navigationProperties.forEach(function (np) {
        var relatedEntity;
        var val = initialValues[np.name];
        if (val != undefined) {
          var navEntityType = np.entityType;
          if (np.isScalar) {
            relatedEntity = val.entityAspect ? val : navEntityType.createEntity(val);
            instance.setProperty(np.name, relatedEntity);
          } else {
            var relatedEntities = instance.getProperty(np.name);
            val.forEach(function (v) {
              relatedEntity = v.entityAspect ? v : navEntityType.createEntity(v);
              relatedEntities.push(relatedEntity);
            });
          }
        }
      });
    }

    this._initializeInstance(instance);
    return instance;
  };

  function getRawValueFromConfig(rawEntity, dp) {
    // 'true' fork can happen if an initializer contains an actaul instance of an already created complex object.
    return (rawEntity.entityAspect || rawEntity.complexAspect) ? rawEntity.getProperty(dp.name) : rawEntity[dp.name];
  }

  proto._createInstanceCore = function () {
    var aCtor = this.getEntityCtor();
    var instance = new aCtor();
    new EntityAspect(instance);
    return instance;
  };

  proto._initializeInstance = function (instance) {
    if (this.baseEntityType) {
      this.baseEntityType._initializeInstance(instance);
    }
    var initFn = this.initFn;
    if (initFn) {
      if (typeof initFn === "string") {
        initFn = instance[initFn];
      }
      initFn(instance);
    }
    this.complexProperties && this.complexProperties.forEach(function (cp) {
      var ctInstance = instance.getProperty(cp.name);
      if (Array.isArray(ctInstance)) {
        ctInstance.forEach(function (ctInst) {
          cp.dataType._initializeInstance(ctInst);
        });
      } else {
        cp.dataType._initializeInstance(ctInstance);
      }
    });
    // not needed for complexObjects
    if (instance.entityAspect) {
      instance.entityAspect._initialized = true;
    }
  };

  /**
  Returns the constructor for this EntityType.
  @method getCtor ( or obsolete getEntityCtor)
  @return {Function} The constructor for this EntityType.
  **/
  proto.getCtor = proto.getEntityCtor = function (forceRefresh) {
    if (this._ctor && !forceRefresh) return this._ctor;

    var ctorRegistry = this.metadataStore._ctorRegistry;
    var r = ctorRegistry[this.name] || ctorRegistry[this.shortName] || {};
    var aCtor = r.ctor || this._ctor;

    var ctorType = aCtor && aCtor.prototype && (aCtor.prototype.entityType || aCtor.prototype.complexType);
    if (ctorType && ctorType.metadataStore !== this.metadataStore) {
      // We can't risk a mismatch between the ctor and the type info in a specific metadatastore
      // because modelLibraries rely on type info to intercept ctor properties
      throw new Error("Cannot register the same constructor for " + this.name + " in different metadata stores.  Please define a separate constructor for each metadata store.");
    }


    if (r.ctor && forceRefresh) {
      this._extra = undefined;
    }

    if (!aCtor) {
      var createCtor = __modelLibraryDef.getDefaultInstance().createCtor;
      aCtor = createCtor ? createCtor(this) : createEmptyCtor(this);
    }

    this.initFn = r.initFn;
    this.noTrackingFn = r.noTrackingFn;

    aCtor.prototype._$typeName = this.name;
    this._setCtor(aCtor);
    return aCtor;
  };

  function createEmptyCtor(type) {
    var name = type.name.replace(/\W/g, '_');
    return Function('return function '+name+'(){}')();
  }

  // May make public later.
  proto._setCtor = function (aCtor, interceptor) {

    var instanceProto = aCtor.prototype;

    // place for extra breeze related data
    this._extra = this._extra || {};

    var instance = new aCtor();
    calcUnmappedProperties(this, instance);

    if (this._$typeName === "EntityType") {
      // insure that all of the properties are on the 'template' instance before watching the class.
      instanceProto.entityType = this;
    } else {
      instanceProto.complexType = this;
    }

    // defaultPropertyInterceptor is a 'global' (but internal to breeze) function;
    instanceProto._$interceptor = interceptor || defaultPropertyInterceptor;
    __modelLibraryDef.getDefaultInstance().initializeEntityPrototype(instanceProto);
    this._ctor = aCtor;
  };

  /**
  Adds either an entity or property level validator to this EntityType.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var countryProp = custType.getProperty("Country");
      var valFn = function (v) {
              if (v == null) return true;
              return (core.stringStartsWith(v, "US"));
          };
      var countryValidator = new Validator("countryIsUS", valFn,
      { displayName: "Country", messageTemplate: "'%displayName%' must start with 'US'" });
      custType.addValidator(countryValidator, countryProp);
  This is the same as adding an entity level validator via the 'validators' property of DataProperty or NavigationProperty
  @example
      countryProp.validators.push(countryValidator);
  Entity level validators can also be added by omitting the 'property' parameter.
  @example
      custType.addValidator(someEntityLevelValidator);
  or
  @example
      custType.validators.push(someEntityLevelValidator);
  @method addValidator
  @param validator {Validator} Validator to add.
  @param [property] Property to add this validator to.  If omitted, the validator is assumed to be an
  entity level validator and is added to the EntityType's 'validators'.
  **/
  proto.addValidator = function (validator, property) {
    assertParam(validator, "validator").isInstanceOf(Validator).check();
    assertParam(property, "property").isOptional().isString().or().isEntityProperty().check();
    if (property) {
      if (typeof (property) === 'string') {
        property = this.getProperty(property, true);
      }
      property.validators.push(validator);
    } else {
      this.validators.push(validator);
    }
  };

  /**
  Returns all of the properties ( dataProperties and navigationProperties) for this EntityType.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var arrayOfProps = custType.getProperties();
  @method getProperties
  @return {Array of DataProperty|NavigationProperty} Array of Data and Navigation properties.
  **/
  proto.getProperties = function () {
    return this.dataProperties.concat(this.navigationProperties);
  };

  /**
  Returns all of the property names ( for both dataProperties and navigationProperties) for this EntityType.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var arrayOfPropNames = custType.getPropertyNames();
  @method getPropertyNames
  @return {Array of String}
  **/
  proto.getPropertyNames = function () {
    return this.getProperties().map(__pluck('name'));
  };

  /**
  Returns a data property with the specified name or null.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var customerNameDataProp = custType.getDataProperty("CustomerName");
  @method getDataProperty
  @param propertyName {String}
  @return {DataProperty} Will be null if not found.
  **/
  proto.getDataProperty = function (propertyName) {
    return __arrayFirst(this.dataProperties, __propEq('name', propertyName));
  };

  /**
  Returns a navigation property with the specified name or null.
  @example
      // assume em1 is an EntityManager containing a number of existing entities.
      var custType = em1.metadataStore.getEntityType("Customer");
      var customerOrdersNavProp = custType.getDataProperty("Orders");
  @method getNavigationProperty
  @param propertyName {String}
  @return {NavigationProperty} Will be null if not found.
  **/
  proto.getNavigationProperty = function (propertyName) {
    return __arrayFirst(this.navigationProperties, __propEq('name', propertyName));
  };

  /**
  Returns either a DataProperty or a NavigationProperty with the specified name or null.

  This method also accepts a '.' delimited property path and will return the 'property' at the
  end of the path.
  @example
      var custType = em1.metadataStore.getEntityType("Customer");
      var companyNameProp = custType.getProperty("CompanyName");
  This method can also walk a property path to return a property
  @example
      var orderDetailType = em1.metadataStore.getEntityType("OrderDetail");
      var companyNameProp2 = orderDetailType.getProperty("Order.Customer.CompanyName");
      // companyNameProp === companyNameProp2
  @method getProperty
  @param propertyPath {String}
  @param [throwIfNotFound=false] {Boolean} Whether to throw an exception if not found.
  @return {DataProperty|NavigationProperty} Will be null if not found.
  **/
  proto.getProperty = function (propertyPath, throwIfNotFound) {
    var props = this.getPropertiesOnPath(propertyPath, false, throwIfNotFound);
    return props ? props[props.length - 1] : null;
  };

  proto.getPropertiesOnPath = function(propertyPath, useServerName, throwIfNotFound) {
    throwIfNotFound = throwIfNotFound || false;
    var propertyNames = (Array.isArray(propertyPath)) ? propertyPath : propertyPath.trim().split('.');

    var ok = true;
    var parentType = this;
    var key = useServerName ? "nameOnServer" : "name";
    var props = propertyNames.map(function (propName) {
      var prop = __arrayFirst(parentType.getProperties(), __propEq(key, propName));
      if (prop) {
        parentType = prop.isNavigationProperty ? prop.entityType : prop.dataType;
      } else if (throwIfNotFound) {
        throw new Error("unable to locate property: " + propName + " on entityType: " + parentType.name);
      } else {
        ok = false;
      }
      return prop;
    });
    return ok ? props : null;
  }

  proto.clientPropertyPathToServer = function(propertyPath, delimiter) {
    var delimiter = delimiter || '.';
    var propNames;
    if (this.isAnonymous) {
      var fn = this.metadataStore.namingConvention.clientPropertyNameToServer;
      propNames = propertyPath.split(".").map(function (propName) {
        return fn(propName);
      });
    } else {
      propNames = this.getPropertiesOnPath(propertyPath, false, true).map(function(prop) {
        return prop.nameOnServer;
      });
    }
    return propNames.join(delimiter);
  }

  proto.getEntityKeyFromRawEntity = function (rawEntity, rawValueFn) {
    var keyValues = this.keyProperties.map(function (dp) {
      var val = rawValueFn(rawEntity, dp);
      return parseRawValue(val, dp.dataType);
    });
    return new EntityKey(this, keyValues);
  };

  proto._updateTargetFromRaw = function (target, raw, rawValueFn) {
    // called recursively for complex properties
    this.dataProperties.forEach(function (dp) {
      if (!dp.isSettable) return;
      var rawVal = rawValueFn(raw, dp);
      if (rawVal === undefined) return;
      var dataType = dp.dataType; // this will be a complexType when dp is a complexProperty
      var oldVal;
      if (dp.isComplexProperty) {
        if (rawVal === null) return; // rawVal may be null in nosql dbs where it was never defined for the given row.
        oldVal = target.getProperty(dp.name);
        if (dp.isScalar) {
          dataType._updateTargetFromRaw(oldVal, rawVal, rawValueFn);
        } else {
          if (Array.isArray(rawVal)) {
            var newVal = rawVal.map(function (rawCo) {
              var newCo = dataType._createInstanceCore(target, dp);
              dataType._updateTargetFromRaw(newCo, rawCo, rawValueFn);
              dataType._initializeInstance(newCo);
              return newCo;
            });
            if (!__arrayEquals(oldVal, newVal, coEquals)) {
              // clear the old array and push new objects into it.
              oldVal.length = 0;
              newVal.forEach(function (nv) {
                oldVal.push(nv);
              });
            }
          } else {
            oldVal.length = 0;
          }
        }
      } else {
        var val;
        if (dp.isScalar) {
          var newVal = parseRawValue(rawVal, dataType);
          target.setProperty(dp.name, newVal);
        } else {
          oldVal = target.getProperty(dp.name);
          if (Array.isArray(rawVal)) {
            // need to compare values
            var newVal = rawVal.map(function (rv) {
              return parseRawValue(rv, dataType);
            });
            if (!__arrayEquals(oldVal, newVal)) {
              // clear the old array and push new objects into it.
              oldVal.length = 0;
              newVal.forEach(function (nv) {
                oldVal.push(nv);
              });
            }
          } else {
            oldVal.length = 0;
          }

        }
      }
    });

    // if merging from an import then raw will have an entityAspect or a complexAspect
    var rawAspect = raw.entityAspect || raw.complexAspect;
    if (rawAspect) {
      var targetAspect = target.entityAspect || target.complexAspect;
      if (rawAspect.originalValuesMap) {
        targetAspect.originalValues = rawAspect.originalValuesMap;
      }
      if (rawAspect.extraMetadata) {
        targetAspect.extraMetadata = rawAspect.extraMetadata;
      }
    }
  }

  function coEquals(co1, co2) {
    var dataProps = co1.complexAspect.parentProperty.dataType.dataProperties;
    var areEqual = dataProps.every(function (dp) {
      if (!dp.isSettable) return true;
      var v1 = co1.getProperty(dp.name);
      var v2 = co2.getProperty(dp.name);
      if (dp.isComplexProperty) {
        return coEquals(v1, v2);
      } else {
        var dataType = dp.dataType; // this will be a complexType when dp is a complexProperty
        return (v1 === v2 || (dataType && dataType.normalize && v1 && v2 && dataType.normalize(v1) === dataType.normalize(v2)));
      }
    });
    return areEqual;
  }

  /**
  Returns a string representation of this EntityType.
  @method toString
  @return {String}
  **/
  proto.toString = function () {
    return this.name;
  };

  proto.toJSON = function () {
    return __toJson(this, {
      shortName: null,
      namespace: null,
      baseTypeName: null,
      isAbstract: false,
      autoGeneratedKeyType: null, // do not suppress default value
      defaultResourceName: null,
      dataProperties: localPropsOnly,
      navigationProperties: localPropsOnly,
      validators: null,
      custom: null
    });
  };

  function localPropsOnly(props) {
    return props.filter(function (prop) {
      return prop.baseProperty == null;
    });
  }



  proto._updateNames = function (property) {
    var nc = this.metadataStore.namingConvention;
    updateClientServerNames(nc, property, "name");

    if (property.isNavigationProperty) {
      updateClientServerNames(nc, property, "foreignKeyNames");
      updateClientServerNames(nc, property, "invForeignKeyNames");

      // these will get set later via _updateNps
      // this.inverse
      // this.entityType
      // this.relatedDataProperties
      //    dataProperty.relatedNavigationProperty
      //    dataProperty.inverseNavigationProperty
    }
  };



  function updateClientServerNames(nc, parent, clientPropName) {
    var serverPropName = clientPropName + "OnServer";
    var clientName = parent[clientPropName];
    if (clientName && clientName.length) {
      // if (parent.isUnmapped) return;
      var serverNames = __toArray(clientName).map(function (cName) {
        var sName = nc.clientPropertyNameToServer(cName, parent);
        var testName = nc.serverPropertyNameToClient(sName, parent);
        if (cName !== testName) {
          throw new Error("NamingConvention for this client property name does not roundtrip properly:" + cName + "-->" + testName);
        }
        return sName;
      });
      parent[serverPropName] = Array.isArray(clientName) ? serverNames : serverNames[0];
    } else {
      var serverName = parent[serverPropName];
      if ((!serverName) || serverName.length === 0) return;
      var clientNames = __toArray(serverName).map(function (sName) {
        var cName = nc.serverPropertyNameToClient(sName, parent);
        var testName = nc.clientPropertyNameToServer(cName, parent);
        if (sName !== testName) {
          throw new Error("NamingConvention for this server property name does not roundtrip properly:" + sName + "-->" + testName);
        }
        return cName;
      });
      parent[clientPropName] = Array.isArray(serverName) ? clientNames : clientNames[0];
    }
  }

  proto._checkNavProperty = function (navigationProperty) {
    if (navigationProperty.isNavigationProperty) {
      if (navigationProperty.parentType !== this) {
        throw new Error(__formatString("The navigationProperty '%1' is not a property of entity type '%2'",
            navigationProperty.name, this.name));
      }
      return navigationProperty;
    }

    if (typeof (navigationProperty) === 'string') {
      var np = this.getProperty(navigationProperty);
      if (np && np.isNavigationProperty) return np;
    }
    throw new Error("The 'navigationProperty' parameter must either be a NavigationProperty or the name of a NavigationProperty");
  };

  proto._addDataProperty = function (dp) {

    this.dataProperties.push(dp);

    if (dp.isPartOfKey) {
      this.keyProperties.push(dp);
    }

    if (dp.isComplexProperty) {
      this.complexProperties.push(dp);
    }

    if (dp.concurrencyMode && dp.concurrencyMode !== "None") {
      this.concurrencyProperties.push(dp);
    }

    if (dp.isUnmapped) {
      this.unmappedProperties.push(dp);
    }

  };

  proto._addNavigationProperty = function (np) {

    this.navigationProperties.push(np);

    if (!isQualifiedTypeName(np.entityTypeName)) {
      np.entityTypeName = qualifyTypeName(np.entityTypeName, this.namespace);
    }
  };

  proto._updateCps = function () {
    var metadataStore = this.metadataStore;
    var incompleteTypeMap = metadataStore._incompleteComplexTypeMap;
    this.complexProperties.forEach(function (cp) {
      if (cp.complexType) return;
      if (!resolveCp(cp, metadataStore)) {
        __getArray(incompleteTypeMap, cp.complexTypeName).push(cp);
      }
    });

    if (this.isComplexType) {
      (incompleteTypeMap[this.name] || []).forEach(function (cp) {
        resolveCp(cp, metadataStore);
      });
      delete incompleteTypeMap[this.name];
    }
  };

  function resolveCp(cp, metadataStore) {
    var complexType = metadataStore._getEntityType(cp.complexTypeName, true);
    if (!complexType) return false;
    if (!(complexType instanceof ComplexType)) {
      throw new Error("Unable to resolve ComplexType with the name: " + cp.complexTypeName + " for the property: " + property.name);
    }
    cp.dataType = complexType;
    cp.defaultValue = null;
    return true;
  }

  proto._updateNps = function () {
    var metadataStore = this.metadataStore;

    // resolve all navProps for this entityType
    this.navigationProperties.forEach(function (np) {
      tryResolveNp(np, metadataStore);
    });
    var incompleteTypeMap = metadataStore._incompleteTypeMap;
    // next resolve all navProp that point to this entityType.
    (incompleteTypeMap[this.name] || []).forEach(function (np) {
      tryResolveNp(np, metadataStore);
    });
    // every navProp that pointed to this type should now be resolved
    delete incompleteTypeMap[this.name];
  };

  function tryResolveNp(np, metadataStore) {
    if (np.entityType) return true;

    var entityType = metadataStore._getEntityType(np.entityTypeName, true);
    if (entityType) {
      np.entityType = entityType;
      np._resolveNp();
      // don't bother removing - _updateNps will do it later.
      // __arrayRemoveItem(incompleteNps, np, false);
    } else {
      var incompleteNps = __getArray(metadataStore._incompleteTypeMap, np.entityTypeName);
      __arrayAddItemUnique(incompleteNps, np);
    }
    return !!entityType;
  }

  function calcUnmappedProperties(stype, instance) {
    var metadataPropNames = stype.getPropertyNames();
    var modelLib = __modelLibraryDef.getDefaultInstance();
    var trackablePropNames = modelLib.getTrackablePropertyNames(instance);
    trackablePropNames.forEach(function (pn) {
      if (metadataPropNames.indexOf(pn) === -1) {
        var val = instance[pn];
        try {
          if (typeof val == "function") val = val();
        } catch (e) {
        }
        var dt = DataType.fromValue(val);
        var newProp = new DataProperty({
          name: pn,
          dataType: dt,
          isNullable: true,
          isUnmapped: true
        });
        newProp.isSettable = __isSettable(instance, pn);
        if (stype.subtypes) {
          stype.getSelfAndSubtypes().forEach(function (st) {
            st._addPropertyCore(new DataProperty(newProp));
          });
        } else {
          stype._addPropertyCore(newProp);
        }
      }
    });
  }

  return ctor;
})();

var ComplexType = (function () {
  /**
  Container for all of the metadata about a specific type of Complex object.
  @class ComplexType
  **/

  /**
  @example
      var complexType = new ComplexType( {
          shortName: "address",
          namespace: "myAppNamespace"
      });
  @method <ctor> ComplexType
  @param config {Object} Configuration settings
  @param config.shortName {String}
  @param [config.namespace=""] {String}
  @param [config.dataProperties] {Array of DataProperties}
  @param [config.custom] {Object}
  **/
  var ctor = function ComplexType(config) {
    if (arguments.length > 1) {
      throw new Error("The ComplexType ctor has a single argument that is a configuration object.");
    }

    assertConfig(config)
        .whereParam("shortName").isNonEmptyString()
        .whereParam("namespace").isString().isOptional().withDefault("")
        .whereParam("dataProperties").isOptional()
        .whereParam("isComplexType").isOptional().isBoolean()   // needed because this ctor can get called from the addEntityType method which needs the isComplexType prop
        .whereParam("custom").isOptional()
        .applyAll(this);

    this.name = qualifyTypeName(this.shortName, this.namespace);
    this.isComplexType = true;
    this.dataProperties = [];
    this.complexProperties = [];
    this.validators = [];
    this.concurrencyProperties = [];
    this.unmappedProperties = [];
    this.navigationProperties = []; // not yet supported
    this.keyProperties = []; // may be used later to enforce uniqueness on arrays of complextypes.

    addProperties(this, config.dataProperties, DataProperty);
  };
  var proto = ctor.prototype;
  /**
  The DataProperties (see {{#crossLink "DataProperty"}}{{/crossLink}}) associated with this ComplexType.

  __readOnly__
  @property dataProperties {Array of DataProperty}
  **/

  /**
  The DataProperties for this ComplexType that contain instances of a ComplexType (see {{#crossLink "ComplexType"}}{{/crossLink}}).

  __readOnly__
  @property complexProperties {Array of DataProperty}
  **/

  /**
  The DataProperties associated with this ComplexType that are not mapped to any backend datastore. These are effectively free standing
  properties.

  __readOnly__
  @property unmappedProperties {Array of DataProperty}
  **/

  /**
  The fully qualifed name of this ComplexType.

  __readOnly__
  @property name {String}
  **/

  /**
  The short, unqualified, name for this ComplexType.

  __readOnly__
  @property shortName {String}
  **/

  /**
  The namespace for this ComplexType.

  __readOnly__
  @property namespace {String}
  **/

  /**
  The entity level validators associated with this ComplexType. Validators can be added and
  removed from this collection.

  __readOnly__
  @property validators {Array of Validator}
  **/

  /**
  A free form object that can be used to define any custom metadata for this ComplexType.

  __readOnly__
  @property custom {Object}
  **/

  /**
  General purpose property set method
  @example
      // assume em1 is an EntityManager
      var addresstType = em1.metadataStore.getEntityType("Address");
      addressType.setProperties( {
          custom: { foo: 7, bar: "test" }
      });
  @method setProperties
  @param config [object]
  @param [config.custom] {Object}
  **/
  proto.setProperties = function (config) {
    assertConfig(config)
        .whereParam("custom").isOptional()
        .applyAll(this);
  };

  proto.getAllValidators = function () {
    // ComplexType inheritance is not YET supported.
    return this.validators;
  }

  /**
  Creates a new non-attached instance of this ComplexType.
  @method createInstance
  @param initialValues {Object} Configuration object containing initial values for the instance.
  **/
  // This method is actually the EntityType.createEntity method renamed 
  proto._createInstanceCore = function (parent, parentProperty) {
    var aCtor = this.getCtor();
    var instance = new aCtor();
    new ComplexAspect(instance, parent, parentProperty);
    // initialization occurs during either attach or in createInstance call.
    return instance;
  };


  proto.addProperty = function (dataProperty) {
    assertParam(dataProperty, "dataProperty").isInstanceOf(DataProperty).check();
    return this._addPropertyCore(dataProperty);
  };

  proto.getProperties = function () {
    return this.dataProperties;
  };

  /**
  See  {{#crossLink "EntityType.addValidator"}}{{/crossLink}}
  @method addValidator
  @param validator {Validator} Validator to add.
  @param [property] Property to add this validator to.  If omitted, the validator is assumed to be an
  entity level validator and is added to the EntityType's 'validators'.
  **/

  /**
  See  {{#crossLink "EntityType.getProperty"}}{{/crossLink}}
  @method getProperty
  **/

  /**
  See  {{#crossLink "EntityType.getPropertyNames"}}{{/crossLink}}
  @method getPropertyNames
  **/

  /**
  See  {{#crossLink "EntityType.getEntityCtor"}}{{/crossLink}}
  @method getCtor
  **/

  // copy entityType methods onto complexType
  proto = __extend(proto, EntityType.prototype, [
    "addValidator",
    "getProperty",
    "getPropertiesOnPath",
    "getPropertyNames",
    "_addPropertyCore",
    "_addDataProperty",
    "_updateNames",
    "_updateCps",
    "_initializeInstance",
    "_updateTargetFromRaw",
    "_setCtor"
  ]);

  // note the name change.
  proto.createInstance = EntityType.prototype.createEntity;  // name change
  proto.getCtor = EntityType.prototype.getEntityCtor;


  proto.toJSON = function () {
    return __toJson(this, {
      shortName: null,
      namespace: null,
      isComplexType: null,
      dataProperties: null,
      validators: null,
      custom: null
    });
  };


  proto._$typeName = "ComplexType";

  return ctor;
})();

var DataProperty = (function () {

  /**
  A DataProperty describes the metadata for a single property of an  {{#crossLink "EntityType"}}{{/crossLink}} that contains simple data.

  Instances of the DataProperty class are constructed automatically during Metadata retrieval. However it is also possible to construct them
  directly via the constructor.
  @class DataProperty
  **/

  /**
  @example
      var lastNameProp = new DataProperty( {
          name: "lastName",
          dataType: DataType.String,
          isNullable: true,
          maxLength: 20
      });
      // assuming personEntityType is a newly constructed EntityType
      personEntityType.addProperty(lastNameProperty);
  @method <ctor> DataProperty
  @param config {configuration Object}
  @param [config.name] {String}  The name of this property.
  @param [config.nameOnServer] {String} Same as above but the name is that defined on the server.
  Either this or the 'name' above must be specified. Whichever one is specified the other will be computed using
  the NamingConvention on the MetadataStore associated with the EntityType to which this will be added.
  @param [config.dataType=DataType.String] {DataType}
  @param [config.complexTypeName] {String}
  @param [config.isNullable=true] {Boolean}
  @param [config.isScalar=true] {Boolean}
  @param [config.defaultValue] {Any}
  @param [config.isPartOfKey=false] {Boolean}
  @param [config.isUnmapped=false] {Boolean}
  @param [config.concurrencyMode] {String}
  @param [config.maxLength] {Integer} Only meaningfull for DataType.String
  @param [config.validators] {Array of Validator}
  @param [config.custom] {Object}
  **/
  var ctor = function DataProperty(config) {
    assertConfig(config)
        .whereParam("name").isString().isOptional()
        .whereParam("nameOnServer").isString().isOptional()
        .whereParam("dataType").isEnumOf(DataType).isOptional().or().isString().or().isInstanceOf(ComplexType)
        .whereParam("complexTypeName").isOptional()
        .whereParam("isNullable").isBoolean().isOptional().withDefault(true)
        .whereParam("isScalar").isOptional().withDefault(true)// will be false for some NoSQL databases.
        .whereParam("defaultValue").isOptional()
        .whereParam("isPartOfKey").isBoolean().isOptional()
        .whereParam("isUnmapped").isBoolean().isOptional()
        .whereParam("isSettable").isBoolean().isOptional().withDefault(true)
        .whereParam("concurrencyMode").isString().isOptional()
        .whereParam("maxLength").isNumber().isOptional()
        .whereParam("validators").isInstanceOf(Validator).isArray().isOptional().withDefault([])
        .whereParam("displayName").isOptional()
        .whereParam("enumType").isOptional()
        .whereParam("rawTypeName").isOptional() // occurs with undefined datatypes
        .whereParam("custom").isOptional()
        .applyAll(this);
    var hasName = !!(this.name || this.nameOnServer);
    if (!hasName) {
      throw new Error("A DataProperty must be instantiated with either a 'name' or a 'nameOnServer' property");
    }
    // name/nameOnServer is resolved later when a metadataStore is available.

    if (this.complexTypeName) {
      this.isComplexProperty = true;
      this.dataType = null;
    } else if (typeof(this.dataType) === "string") {
      var dt = DataType.fromName(this.dataType);
      if (!dt) {
        throw new Error("Unable to find a DataType enumeration by the name of: " + this.dataType);
      }
      this.dataType = dt;
    } else if (!this.dataType) {
      this.dataType = DataType.String;
    }

    // == as opposed to === is deliberate here.
    if (this.defaultValue == null) {
      if (this.isNullable) {
        this.defaultValue = null;
      } else {
        if (this.isComplexProperty) {
          // what to do? - shouldn't happen from EF - but otherwise ???
        } else if (this.dataType === DataType.Binary) {
          this.defaultValue = "AAAAAAAAJ3U="; // hack for all binary fields but value is specifically valid for timestamp fields - arbitrary valid 8 byte base64 value.
        } else {
          this.defaultValue = this.dataType.defaultValue;
          // cannot be too harsh, if it is not defined type, there is no way we can know the default value
          if (this.defaultValue === null && this.dataType.name !== 'Undefined') {
            throw new Error("A nonnullable DataProperty cannot have a null defaultValue. Name: " + (this.name || this.nameOnServer));
          }
        }
      }
    } else if (this.dataType.isNumeric) {
      // in case the defaultValue comes in as a string ( which it does in EF6).
      if (typeof (this.defaultValue) === "string") {
        this.defaultValue = parseFloat(this.defaultValue);
      }
    }

    if (this.isComplexProperty) {
      this.isScalar = this.isScalar == null || this.isScalar === true;
    }

  };
  var proto = ctor.prototype;
  proto._$typeName = "DataProperty";

  ctor.getRawValueFromServer = function (rawEntity, dp) {
    if (dp.isUnmapped) {
      return rawEntity[dp.nameOnServer || dp.name];
    } else {
      var val = rawEntity[dp.nameOnServer];
      return val !== undefined ? val : dp.defaultValue;
    }
  }

  ctor.getRawValueFromClient = function (rawEntity, dp) {
    var val = rawEntity[dp.name];
    return val !== undefined ? val : dp.defaultValue;
  }


  /**
  The name of this property

  __readOnly__
  @property name {String}
  **/

  /**
  The display name of this property

  __readOnly__
  @property displayName {String} 
  **/
  
  /**
  The name of this property on the server

  __readOnly__
  @property nameOnServer {String} 
  **/
  
  /**
  The parent type that this property belongs to - will be either a {{#crossLink "EntityType"}}{{/crossLink}} or a {{#crossLink "ComplexType"}}{{/crossLink}}.

  __readOnly__
  @property parentType {EntityType|ComplexType}
  **/

  /**
  The {{#crossLink "DataType"}}{{/crossLink}} of this property.

  __readOnly__
  @property dataType {DataType}
  **/

  /**
  The name of the {{#crossLink "ComplexType"}}{{/crossLink}} associated with this property; may be null.

  __readOnly__
  @property complexTypeName {String}
  **/

  /**
  Whether the contents of this property is an instance of a {{#crossLink "ComplexType"}}{{/crossLink}}.

  __readOnly__
  @property isComplexProperty {bool}
  **/

  /**
  Whether this property is nullable.

  __readOnly__
  @property isNullable {Boolean}
  **/

  /**
  Whether this property is scalar (i.e., returns a single value).

  __readOnly__
  @property isScalar {Boolean}
  **/

  /**
  Property on the base type that this property is inherited from. Will be null if the property is not on the base type.

  __readOnly__
  @property baseProperty {DataProperty}
  **/

  /**
  Whether this property is a 'key' property.

  __readOnly__
  @property isPartOfKey {Boolean}
  **/

  /**
  Whether this property is an 'unmapped' property.

  __readOnly__
  @property isUnmapped {Boolean}
  **/

  /**
  __Describe this__

  __readOnly__
  @property concurrencyMode {String}
  **/

  /**
  The maximum length for the value of this property.

  __readOnly__
  @property maxLength {Number}
  **/

  /**
  The {{#crossLink "Validator"}}{{/crossLink}}s that are associated with this property. Validators can be added and
  removed from this collection.

  __readOnly__
  @property validators {Array of Validator}
  **/

  /**
  The default value for this property.

  __readOnly__
  @property defaultValue {any}
  **/

  /**
  The navigation property related to this property.  Will only be set if this is a foreign key property.

  __readOnly__
  @property relatedNavigationProperty {NavigationProperty}
  **/

  /**
  A free form object that can be used to define any custom metadata for this DataProperty.

  __readOnly__
  @property custom {Object}
  **/

  /**
  Is this a DataProperty? - always true here
  Allows polymorphic treatment of DataProperties and NavigationProperties.

  __readOnly__
  @property isDataProperty {Boolean}
  **/

  /**
  Is this a NavigationProperty? - always false here
  Allows polymorphic treatment of DataProperties and NavigationProperties.

  __readOnly__
  @property isNavigationProperty {Boolean}
  **/

  proto.isDataProperty = true;
  proto.isNavigationProperty = false;

  proto.resolveProperty = function (propName) {
    var result = this[propName];
    var baseProp = this.baseProperty;
    while (result == undefined && baseProp != null) {
      result = baseProp[propName];
      baseProp = baseProp.baseProperty;
    }
    return result;
  }

  proto.formatName = function () {
    return this.parentType.name + "--" + this.name;
  }


  /**
  General purpose property set method
  @example
      // assume em1 is an EntityManager
      var prop = myEntityType.getProperty("myProperty");
      prop.setProperties( {
          custom: { foo: 7, bar: "test" }
      });
  @method setProperties
  @param config [object]
  @param [config.custom] {Object}
  **/
  proto.setProperties = function (config) {
    assertConfig(config)
        .whereParam("displayName").isOptional()
        .whereParam("custom").isOptional()
        .applyAll(this);
  };

  proto.getAllValidators = function () {
    var validators = this.validators.slice(0);
    var baseProp = this.baseProperty;
    while (baseProp) {
      validators.push.apply(validators, baseProp.validators);
      baseProp = baseProp.baseProperty;
    }
    return validators;
  }

  proto.toJSON = function () {
    // do not serialize dataTypes that are complexTypes
    return __toJson(this, {
      name: null,
      dataType: function (v) {
        return (v && v.parentEnum) ? v.name : undefined;
      }, // do not serialize dataTypes that are complexTypes
      complexTypeName: null,
      isNullable: true,
      defaultValue: null,
      isPartOfKey: false,
      isUnmapped: false,
      isSettable: true,
      concurrencyMode: null,
      maxLength: null,
      validators: null,
      displayName: null,
      enumType: null,
      rawTypeName: null,
      isScalar: true,
      custom: null
    });
  };

  ctor.fromJSON = function (json) {
    json.dataType = DataType.fromName(json.dataType);
    // Parse default value into correct data type. (dateTime instances require extra work to deserialize properly.)
    if (json.defaultValue && json.dataType && json.dataType.parse) {
      json.defaultValue = json.dataType.parse(json.defaultValue, typeof json.defaultValue);
    }

    if (json.validators) {
      json.validators = json.validators.map(Validator.fromJSON);
    }

    return new DataProperty(json);
  };

  return ctor;
})();

var NavigationProperty = (function () {

  /**
  A NavigationProperty describes the metadata for a single property of an  {{#crossLink "EntityType"}}{{/crossLink}} that return instances of other EntityTypes.

  Instances of the NavigationProperty class are constructed automatically during Metadata retrieval.   However it is also possible to construct them
  directly via the constructor.
  @class NavigationProperty
  **/

  /**
  @example
      var homeAddressProp = new NavigationProperty( {
          name: "homeAddress",
          entityTypeName: "Address:#myNamespace",
          isScalar: true,
          associationName: "address_person",
          foreignKeyNames: ["homeAddressId"]
      });
      var homeAddressIdProp = new DataProperty( {
          name: "homeAddressId"
          dataType: DataType.Integer
      });
      // assuming personEntityType is a newly constructed EntityType
      personEntityType.addProperty(homeAddressProp);
      personEntityType.addProperty(homeAddressIdProp);
  @method <ctor> NavigationProperty
  @param config {configuration Object}
  @param [config.name] {String}  The name of this property.
  @param [config.nameOnServer] {String} Same as above but the name is that defined on the server.
  Either this or the 'name' above must be specified. Whichever one is specified the other will be computed using
  the NamingConvention on the MetadataStore associated with the EntityType to which this will be added.
  @param config.entityTypeName {String} The fully qualified name of the type of entity that this property will return.  This type
  need not yet have been created, but it will need to get added to the relevant MetadataStore before this EntityType will be 'complete'.
  The entityType name is constructed as: {shortName} + ":#" + {namespace}
  @param [config.isScalar=true] {Boolean}
  @param [config.associationName] {String} A name that will be used to connect the two sides of a navigation. May be omitted for unidirectional navigations.
  @param [config.foreignKeyNames] {Array of String} An array of foreign key names. The array is needed to support the possibility of multipart foreign keys.
  Most of the time this will be a single foreignKeyName in an array.
  @param [config.foreignKeyNamesOnServer] {Array of String} Same as above but the names are those defined on the server. Either this or 'foreignKeyNames' must
  be specified, if there are foreignKeys. Whichever one is specified the other will be computed using
  the NamingConvention on the MetadataStore associated with the EntityType to which this will be added.
  @param [config.validators] {Array of Validator}
  **/
  var ctor = function NavigationProperty(config) {
    assertConfig(config)
        .whereParam("name").isString().isOptional()
        .whereParam("nameOnServer").isString().isOptional()
        .whereParam("entityTypeName").isString()
        .whereParam("isScalar").isBoolean().isOptional().withDefault(true)
        .whereParam("associationName").isString().isOptional()
        .whereParam("foreignKeyNames").isArray().isString().isOptional().withDefault([])
        .whereParam("foreignKeyNamesOnServer").isArray().isString().isOptional().withDefault([])
        .whereParam("invForeignKeyNames").isArray().isString().isOptional().withDefault([])
        .whereParam("invForeignKeyNamesOnServer").isArray().isString().isOptional().withDefault([])
        .whereParam("validators").isInstanceOf(Validator).isArray().isOptional().withDefault([])
        .whereParam("displayName").isOptional()
        .whereParam("custom").isOptional()
        .applyAll(this);
    var hasName = !!(this.name || this.nameOnServer);

    if (!hasName) {
      throw new Error("A Navigation property must be instantiated with either a 'name' or a 'nameOnServer' property");
    }
  };
  var proto = ctor.prototype;
  proto._$typeName = "NavigationProperty";

  /**
  The {{#crossLink "EntityType"}}{{/crossLink}} that this property belongs to. ( same as parentEntityType).
  __readOnly__
  @property parentType {EntityType}
  **/

  /**
  The {{#crossLink "EntityType"}}{{/crossLink}} that this property belongs to.
  __readOnly__
  @property parentEntityType {EntityType}
  **/

  /**
  The name of this property

  __readOnly__
  @property name {String}
  **/

  /**
  The display name of this property

  __readOnly__
  @property displayName {String} 
  **/
  
  /**
  The name of this property on the server

  __readOnly__
  @property nameOnServer {String} 
  **/
  
  /**
  The {{#crossLink "EntityType"}}{{/crossLink}} returned by this property.

  __readOnly__
  @property entityType {EntityType}
  **/

  /**
  Whether this property returns a single entity or an array of entities.

  __readOnly__
  @property isScalar {Boolean}
  **/

  /**
  Property on the base type that this property is inherited from. Will be null if the property is not on the base type.

  __readOnly__
  @property baseProperty {NavigationProperty}
  **/

  /**
  The name of the association to which that this property belongs.  This associationName will be shared with this
  properties 'inverse'.

  __readOnly__
  @property associationName {String}
  **/

  /**
  The names of the foreign key DataProperties associated with this NavigationProperty. There will usually only be a single DataProperty associated
  with a Navigation property except in the case of entities with multipart keys.

  __readOnly__
  @property foreignKeyNames {Array of String}
  **/

  /**
  The 'foreign key' DataProperties associated with this NavigationProperty. There will usually only be a single DataProperty associated
  with a Navigation property except in the case of entities with multipart keys.

  __readOnly__
  @property relatedDataProperties {Array of DataProperty}
  **/

  /**
  The inverse of this NavigationProperty.  The NavigationProperty that represents a navigation in the opposite direction
  to this NavigationProperty.

  __readOnly__
  @property inverse {NavigationProperty}
  **/

  /**
  The {{#crossLink "Validator"}}{{/crossLink}}s that are associated with this property. Validators can be added and
  removed from this collection.

  __readOnly__
  @property validators {Array of Validator}
  **/

  /**
  A free form object that can be used to define any custom metadata for this NavigationProperty.

  __readOnly__
  @property custom {Object}
  **/

  /**
  Is this a DataProperty? - always false here
  Allows polymorphic treatment of DataProperties and NavigationProperties.

  __readOnly__
  @property isDataProperty {Boolean}
  **/

  /**
  Is this a NavigationProperty? - always true here
  Allows polymorphic treatment of DataProperties and NavigationProperties.

  __readOnly__
  @property isNavigationProperty {Boolean}
  **/

  proto.isDataProperty = false;
  proto.isNavigationProperty = true;

  __extend(proto, DataProperty.prototype, [
    "formatName", "getAllValidators", "resolveProperty"
  ]);

  /**
  General purpose property set method
  @example
      // assume myEntityType is an EntityType
      var prop = myEntityType.getProperty("myProperty");
      prop.setProperties( {
          custom: { foo: 7, bar: "test" }
      });
  @method setProperties
  @param config [object]
  @param [config.inverse] {String}
  @param [config.custom] {Object}
  **/
  proto.setProperties = function (config) {
    if (!this.parentType) {
      throw new Error("Cannot call NavigationProperty.setProperties until the parent EntityType of the NavigationProperty has been set.");
    }
    var inverse = config.inverse;
    if (inverse) delete config.inverse;
    assertConfig(config)
        .whereParam("displayName").isOptional()
        .whereParam("foreignKeyNames").isArray().isString().isOptional().withDefault([])
        .whereParam("invForeignKeyNames").isArray().isString().isOptional().withDefault([])
        .whereParam("custom").isOptional()
        .applyAll(this);
    this.parentType._updateNames(this);

    this._resolveNp();
    if (inverse) {
      this.setInverse(inverse);
    }

  };

  proto.setInverse = function (inverseNp) {
    var invNp;
    if (typeof (inverseNp) === "string") {
      invNp = this.entityType.getNavigationProperty(inverseNp);
    } else {
      invNp = inverseNp;
    }

    if (!invNp) {
      throw throwSetInverseError(this, "Unable to find inverse property: " + invNpName);
    }
    if (this.inverse || invNp.inverse) {
      throwSetInverseError(this, "It has already been set on one side or the other.");
    }
    if (invNp.entityType != this.parentType) {
      throwSetInverseError(this, invNp.formatName + " is not a valid inverse property for this.");
    }
    if (this.associationName) {
      invNp.associationName = this.associationName;
    } else {
      if (!invNp.associationName) {
        invNp.associationName = this.formatName() + "_" + invNp.formatName();
      }
      this.associationName = invNp.associationName;
    }
    this._resolveNp();
    invNp._resolveNp();
  };

  // In progress - will be used for manual metadata config
  proto.createInverse = function (config) {

    if (!this.entityType) {
      throwCreateInverseError(this, "has not yet been defined.");
    }
    if (this.entityType.isFrozen) {
      throwCreateInverseError(this, "is frozen.");
    }
    var metadataStore = this.entityType.metadataStore;
    if (metadataStore == null) {
      throwCreateInverseError(this, "has not yet been added to the metadataStore.");
    }

    config.entityTypeName = this.parentEntityType.name;
    config.associationName = this.associationName;
    var invNp = new NavigationProperty(config);
    this.parentEntityType.addNavigationProperty(invNp);
    return invNp;
  };

  function throwSetInverseError(np, message) {
    throw new Error("Cannot set the inverse property for: " + np.formatName() + ". " + message);
  }

  function throwCreateInverseError(np, message) {
    throw new Error("Cannot create inverse for: " + np.formatName() + ". The entityType for this navigation property " + message);
  }

  proto.toJSON = function () {
    return __toJson(this, {
      name: null,
      entityTypeName: null,
      isScalar: null,
      associationName: null,
      validators: null,
      displayName: null,
      foreignKeyNames: null,
      invForeignKeyNames: null,
      custom: null
    });
  };

  ctor.fromJSON = function (json) {
    if (json.validators) {
      json.validators = json.validators.map(Validator.fromJSON);
    }
    return new NavigationProperty(json);
  };

  proto._resolveNp = function () {
    var np = this;
    var entityType = np.entityType;
    var invNp = __arrayFirst(entityType.navigationProperties, function (altNp) {
      // Can't do this because of possibility of comparing a base class np with a subclass altNp.
      // return altNp.associationName === np.associationName
      //    && altNp !== np;
      // So use this instead.
      return altNp.associationName === np.associationName &&
          (altNp.name !== np.name || altNp.entityTypeName !== np.entityTypeName);
    });
    np.inverse = invNp;
    //if (invNp && invNp.inverse == null) {
    //    invNp._resolveNp();
    //}
    if (!invNp) {
      // unidirectional 1-n relationship
      np.invForeignKeyNames.forEach(function (invFkName) {
        var fkProp = entityType.getDataProperty(invFkName);
        if (!fkProp) {
          throw new Error("EntityType '" + np.entityTypeName + "' has no foreign key matching '" + invFkName + "'");
        }
        var invEntityType = np.parentType;
        fkProp.inverseNavigationProperty = __arrayFirst(invEntityType.navigationProperties, function (np2) {
          return np2.invForeignKeyNames && np2.invForeignKeyNames.indexOf(fkProp.name) >= 0 && np2.entityType === fkProp.parentType;
        });
        __arrayAddItemUnique(entityType.foreignKeyProperties, fkProp);
      });
    }

    resolveRelated(np);
  }

  // sets navigation property: relatedDataProperties and dataProperty: relatedNavigationProperty
  function resolveRelated(np) {

    var fkNames = np.foreignKeyNames;
    if (fkNames.length === 0) return;

    var parentEntityType = np.parentType;
    var fkProps = fkNames.map(function (fkName) {
      return parentEntityType.getDataProperty(fkName);
    });
    var fkPropCollection = parentEntityType.foreignKeyProperties;

    fkProps.forEach(function (dp) {
      __arrayAddItemUnique(fkPropCollection, dp);
      dp.relatedNavigationProperty = np;
      // now update the inverse
      __arrayAddItemUnique(np.entityType.inverseForeignKeyProperties, dp);
      if (np.relatedDataProperties) {
        __arrayAddItemUnique(np.relatedDataProperties, dp);
      } else {
        np.relatedDataProperties = [dp];
      }
    });
  }

  return ctor;
})();

var AutoGeneratedKeyType = (function () {
  /**
  AutoGeneratedKeyType is an 'Enum' containing all of the valid states for an automatically generated key.
  @class AutoGeneratedKeyType
  @static
  @final
  **/
  var ctor = new Enum("AutoGeneratedKeyType");
  /**
  This entity does not have an autogenerated key.
  The client must set the key before adding the entity to the EntityManager
  @property None {AutoGeneratedKeyType}
  @final
  @static
  **/
  ctor.None = ctor.addSymbol();
  /**
  This entity's key is an Identity column and is set by the backend database.
  Keys for new entities will be temporary until the entities are saved at which point the keys will
  be converted to their 'real' versions.
  @property Identity {AutoGeneratedKeyType}
  @final
  @static
  **/
  ctor.Identity = ctor.addSymbol();
  /**
  This entity's key is generated by a KeyGenerator and is set by the backend database.
  Keys for new entities will be temporary until the entities are saved at which point the keys will
  be converted to their 'real' versions.
  @property KeyGenerator {AutoGeneratedKeyType}
  @final
  @static
  **/
  ctor.KeyGenerator = ctor.addSymbol();
  ctor.resolveSymbols();

  return ctor;
})();

// mixin methods
(function () {

  var proto = Param.prototype;

  proto.isEntity = function () {
    return this._addContext({
      fn: isEntity,
      msg: " must be an entity"
    });
  };

  function isEntity(context, v) {
    if (v == null) return false;
    return (v.entityType !== undefined);
  }

  proto.isEntityProperty = function () {
    return this._addContext({
      fn: isEntityProperty,
      msg: " must be either a DataProperty or a NavigationProperty"
    });
  };

  function isEntityProperty(context, v) {
    if (v == null) return false;
    return (v.isDataProperty || v.isNavigationProperty);
  }
})();

// functions shared between classes related to Metadata

function parseTypeName(entityTypeName) {
  if (!entityTypeName) {
    return null;
  }

  var typeParts = entityTypeName.split(":#");
  if (typeParts.length > 1) {
    return makeTypeHash(typeParts[0], typeParts[1]);
  }

  if (__stringStartsWith(entityTypeName, MetadataStore.ANONTYPE_PREFIX)) {
    var typeHash = makeTypeHash(entityTypeName);
    typeHash.isAnonymous = true
    return typeHash;
  }
  var entityTypeNameNoAssembly = entityTypeName.split(",")[0];
  var typeParts = entityTypeNameNoAssembly.split(".");
  if (typeParts.length > 1) {
    var shortName = typeParts[typeParts.length - 1];
    var namespaceParts = typeParts.slice(0, typeParts.length - 1);
    var ns = namespaceParts.join(".");
    return makeTypeHash(shortName, ns);
  } else {
    return makeTypeHash(entityTypeName);
  }
}

function makeTypeHash(shortName, namespace) {
  return {
    shortTypeName: shortName,
    namespace: namespace,
    typeName: qualifyTypeName(shortName, namespace)
  };
}

function isQualifiedTypeName(entityTypeName) {
  return entityTypeName.indexOf(":#") >= 0;
}

function qualifyTypeName(shortName, namespace) {
  if (namespace && namespace.length > 0) {
    return shortName + ":#" + namespace;
  } else {
    return shortName;
  }
}

// Used by both ComplexType and EntityType
function addProperties(entityType, propObj, ctor) {

  if (!propObj) return;
  if (Array.isArray(propObj)) {
    propObj.forEach(entityType._addPropertyCore.bind(entityType));
  } else if (typeof (propObj) === 'object') {
    for (var key in propObj) {
      if (__hasOwnProperty(propObj, key)) {
        var value = propObj[key];
        value.name = key;
        var prop = new ctor(value);
        entityType._addPropertyCore(prop);
      }
    }
  } else {
    throw new Error("The 'dataProperties' or 'navigationProperties' values must be either an array of data/nav properties or an object where each property defines a data/nav property");
  }
}

breeze.MetadataStore = MetadataStore;
breeze.EntityType = EntityType;
breeze.ComplexType = ComplexType;
breeze.DataProperty = DataProperty;
breeze.NavigationProperty = NavigationProperty;
breeze.AutoGeneratedKeyType = AutoGeneratedKeyType;



