var EntityQuery = (function () {
  /**
  An EntityQuery instance is used to query entities either from a remote datasource or from a local {{#crossLink "EntityManager"}}{{/crossLink}}.

  EntityQueries are immutable - this means that all EntityQuery methods that return an EntityQuery actually create a new EntityQuery.  This means that
  EntityQueries can be 'modified' without affecting any current instances.

  @class EntityQuery
  **/

  /**
  @example
      var query = new EntityQuery("Customers")

  Usually this constructor will be followed by calls to filtering, ordering or selection methods
  @example
      var query = new EntityQuery("Customers")
          .where("CompanyName", "startsWith", "C")
          .orderBy("Region");

  @method <ctor> EntityQuery
  @param [resourceName] {String}
  **/
  var ctor = function EntityQuery(resourceName) {
    if (resourceName != null && !__isString(resourceName)) {
      return fromJSON(this, resourceName);
    }
    
    this.resourceName = resourceName;
    this.fromEntityType = null;
    this.wherePredicate = null;
    this.orderByClause = null;
    this.selectClause = null;
    this.skipCount = null;
    this.takeCount = null;
    this.expandClause = null;
    this.parameters = {};
    this.inlineCountEnabled = false;
    this.noTrackingEnabled = false;
    // default is to get queryOptions and dataService from the entityManager.
    // this.queryOptions = new QueryOptions();
    // this.dataService = new DataService();
    this.entityManager = null;

  };
  var proto = ctor.prototype;
  proto._$typeName = "EntityQuery";
  
  
  /**
  The resource name used by this query.

  __readOnly__
  @property resourceName {String}
  **/

  /**
  The entityType that is associated with the 'from' clause ( resourceName) of the query.  This is only guaranteed to be be set AFTER the query
  has been executed because it depends on the MetadataStore associated with the EntityManager that the query was executed against.
  This value may be null if the entityType cannot be associated with a resourceName.

  __readOnly__
  @property fromEntityType {EntityType}
  **/

  /**
  The entityType that will be returned by this query. This property will only be set if the 'toType' method was called.

  __readOnly__
  @property resultEntityType {EntityType}
  **/

  /**
  The 'where' predicate used by this query.

  __readOnly__
  @property wherePredicate {Predicate}
  **/

  /**
  The {{#crossLink "OrderByClause"}}{{/crossLink}} used by this query.

  __readOnly__
  @property orderByClause {OrderByClause}
  **/

  /**
  The number of entities to 'skip' for this query.

  __readOnly__
  @property skipCount {Integer}
  **/

  /**
  The number of entities to 'take' for this query.

  __readOnly__
  @property takeCount {Integer}
  **/

  /**
  Any additional parameters that were added to the query via the 'withParameters' method.

  __readOnly__
  @property parameters {Object}
  **/

  /**
  The {{#crossLink "QueryOptions"}}{{/crossLink}} for this query.

  __readOnly__
  @property queryOptions {QueryOptions}
  **/

  /**
  The {{#crossLink "EntityManager"}}{{/crossLink}} for this query. This may be null and can be set via the 'using' method.

  __readOnly__
  @property entityManager {EntityManager}
  **/

  /**
  Specifies the resource to query for this EntityQuery.
  @example
      var query = new EntityQuery()
          .from("Customers");
  is the same as
  @example
      var query = new EntityQuery("Customers");
  @method from
  @param resourceName {String} The resource to query.
  @return {EntityQuery}
  @chainable
  **/
  proto.from = function (resourceName) {
    // TODO: think about allowing entityType as well
    assertParam(resourceName, "resourceName").isString().check();
    return clone(this, "resourceName", resourceName);
  };
  
  /**
  This is a static version of the "from" method and it creates a 'base' entityQuery for the specified resource name.
  @example
      var query = EntityQuery.from("Customers");
  is the same as
  @example
      var query = new EntityQuery("Customers");
  @method from
  @static
  @param resourceName {String} The resource to query.
  @return {EntityQuery}
  @chainable
  **/
  ctor.from = function (resourceName) {
    assertParam(resourceName, "resourceName").isString().check();
    return new EntityQuery(resourceName);
  };
  
  /**
  Specifies the top level EntityType that this query will return.  Only needed when a query returns a json result that does not include type information.
  @example
      var query = new EntityQuery()
        .from("MyCustomMethod")
        .toType("Customer")

  @method toType
  @param entityType {String|EntityType} The top level entityType that this query will return.  This method is only needed when a query returns a json result that
  does not include type information.  If the json result consists of more than a simple entity or array of entities, consider using a JsonResultsAdapter instead.
  @return {EntityQuery}
  @chainable
  **/
  proto.toType = function (entityType) {
    assertParam(entityType, "entityType").isString().or().isInstanceOf(EntityType).check();
    return clone(this, "resultEntityType", entityType);
  };
  
  
  /**
  Returns a new query with an added filter criteria; Can be called multiple times which means to 'and' with any existing
  Predicate or can be called with null to clear all predicates.
  @example
      var query = new EntityQuery("Customers")
                .where("CompanyName", "startsWith", "C");
  This can also be expressed using an explicit {{#crossLink "FilterQueryOp"}}{{/crossLink}} as
  @example
      var query = new EntityQuery("Customers")
          .where("CompanyName", FilterQueryOp.StartsWith, "C");
  or a preconstructed {{#crossLink "Predicate"}}{{/crossLink}} may be used
  @example
      var pred = new Predicate("CompanyName", FilterQueryOp.StartsWith, "C");
      var query = new EntityQuery("Customers").where(pred);
  Predicates are often useful when you want to combine multiple conditions in a single filter, such as
  @example
      var pred = Predicate.create("CompanyName", "startswith", "C").and("Region", FilterQueryOp.Equals, null);
      var query = new EntityQuery("Customers")
        .where(pred);
  @example
  More complicated queries can make use of nested property paths
  @example
      var query = new EntityQuery("Products")
        .where("Category.CategoryName", "startswith", "S");
  or OData functions - A list of valid OData functions can be found within the {{#crossLink "Predicate"}}{{/crossLink}} documentation.
  @example
      var query = new EntityQuery("Customers")
        .where("toLower(CompanyName)", "startsWith", "c");
  or to be even more baroque
  @example
      var query = new EntityQuery("Customers")
        .where("toUpper(substring(CompanyName, 1, 2))", FilterQueryOp.Equals, "OM");
  @method where
  @param predicate {Predicate|property|property path, operator, value} Can be either

    - a single {{#crossLink "Predicate"}}{{/crossLink}}

    - or the parameters to create a 'simple' Predicate

    - a property name, a property path with '.' as path seperators or a property expression {String}
    - an operator {FilterQueryOp|String} Either a  {{#crossLink "FilterQueryOp"}}{{/crossLink}} or it's string representation. Case is ignored
    when if a string is provided and any string that matches one of the FilterQueryOp aliases will be accepted.
    - a value {Object} - This will be treated as either a property expression or a literal depending on context.  In general,
    if the value can be interpreted as a property expression it will be, otherwise it will be treated as a literal.
    In most cases this works well, but you can also force the interpretation by making the value argument itself an object with a 'value' property and an 'isLiteral' property set to either true or false.
    Breeze also tries to infer the dataType of any literal based on context, if this fails you can force this inference by making the value argument an object with a 'value' property and a 'dataType'property set
    to one of the breeze.DataType enumeration instances.
    - or a null or undefined ( this causes any existing where clause to be removed)

  @return {EntityQuery}
  @chainable
  **/
  proto.where = function (wherePredicate) {
    if (wherePredicate != null) {
      wherePredicate = Predicate.create(__arraySlice(arguments));
      if (this.fromEntityType) wherePredicate._validate(this.fromEntityType);
      if (this.wherePredicate) {
        wherePredicate = this.wherePredicate.and(wherePredicate);
      }
    }
    return clone(this, "wherePredicate", wherePredicate);
  };

  /**
  Returns a new query that orders the results of the query by property name.  By default sorting occurs is ascending order, but sorting in descending order is supported as well.
  OrderBy clauses may be chained.
  @example
      var query = new EntityQuery("Customers")
        .orderBy("CompanyName");

  or to sort across multiple properties
  @example
      var query = new EntityQuery("Customers")
        .orderBy("Region, CompanyName");

  Nested property paths are also supported
  @example
      var query = new EntityQuery("Products")
        .orderBy("Category.CategoryName");

  Sorting in descending order is supported via the addition of ' desc' to the end of any property path.
  @example
      var query = new EntityQuery("Customers")
        .orderBy("CompanyName desc");

  or
  @example
      var query = new EntityQuery("Customers")
        .orderBy("Region desc, CompanyName desc");
  @method orderBy
  @param propertyPaths {String|Array of String} A comma-separated (',') string of property paths or an array of property paths.
  Each property path can optionally end with " desc" to force a descending sort order. If 'propertyPaths' is either null or omitted then all ordering is removed.
  @param isDescending {Boolean} - If specified, overrides all of the embedded 'desc' tags in the previously specified property paths.
  @return {EntityQuery}
  @chainable
  **/
  proto.orderBy = function (propertyPaths, isDescending) {
    // propertyPaths: can pass in create("A.X,B") or create("A.X desc, B") or create("A.X desc,B", true])
    // isDesc parameter trumps isDesc in propertyName.

    var orderByClause = propertyPaths == null ? null : new OrderByClause(normalizePropertyPaths(propertyPaths), isDescending);
    if (this.orderByClause && orderByClause) {
      orderByClause = new OrderByClause([this.orderByClause, orderByClause]);
    }
    return clone(this, "orderByClause", orderByClause);
  }
  
  /**
  Returns a new query that orders the results of the query by property name in descending order.
  @example
      var query = new EntityQuery("Customers")
        .orderByDesc("CompanyName");

  or to sort across multiple properties
  @example
      var query = new EntityQuery("Customers")
        .orderByDesc("Region, CompanyName");

  Nested property paths are also supported
  @example
      var query = new EntityQuery("Products")
        .orderByDesc("Category.CategoryName");

  @method orderByDesc
  @param propertyPaths {String|Array of String} A comma-separated (',') string of property paths or an array of property paths.
  If 'propertyPaths' is either null or omitted then all ordering is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.orderByDesc = function (propertyPaths) {
    return this.orderBy(propertyPaths, true);
  };
  
  /**
  Returns a new query that selects a list of properties from the results of the original query and returns the values of just these properties. This
  will be referred to as a projection.
  If the result of this selection "projection" contains entities, these entities will automatically be added to EntityManager's cache and will
  be made 'observable'.
  Any simple properties, i.e. strings, numbers or dates within a projection will not be cached are will NOT be made 'observable'.

  @example
  Simple data properties can be projected
  @example
      var query = new EntityQuery("Customers")
        .where("CompanyName", "startsWith", "C")
        .select("CompanyName");
  This will return an array of objects each with a single "CompanyName" property of type string.
  A similar query could return a navigation property instead
  @example
      var query = new EntityQuery("Customers")
        .where("CompanyName", "startsWith", "C")
        .select("Orders");
  where the result would be an array of objects each with a single "Orders" property that would itself be an array of "Order" entities.
  Composite projections are also possible:
  @example
      var query = new EntityQuery("Customers")
        .where("CompanyName", "startsWith", "C")
        .select("CompanyName, Orders");
  As well as projections involving nested property paths
  @example
      var query = EntityQuery("Orders")
        .where("Customer.CompanyName", "startsWith", "C")
        .select("Customer.CompanyName, Customer, OrderDate");
  @method select
  @param propertyPaths {String|Array of String} A comma-separated (',') string of property paths or an array of property paths.
  If 'propertyPaths' is either null or omitted then any existing projection on the query is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.select = function (propertyPaths) {
    var selectClause = propertyPaths == null ? null : new SelectClause(normalizePropertyPaths(propertyPaths));
    return clone(this, "selectClause", selectClause);
  };
  
  /**
  Returns a new query that skips the specified number of entities when returning results.
  Any existing 'skip' can be cleared by calling 'skip' with no arguments.
  @example
      var query = new EntityQuery("Customers")
        .where("CompanyName", "startsWith", "C")
        .skip(5);
  @method skip
  @param count {Number} The number of entities to return. If omitted or null any existing skip count on the query is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.skip = function (count) {
    assertParam(count, "count").isOptional().isNumber().check();
    return clone(this, "skipCount", (count == null) ? null : count);
  };
  
  /**
  Returns a new query that returns only the specified number of entities when returning results. - Same as 'take'.
  Any existing 'top' can be cleared by calling 'top' with no arguments.
  @example
      var query = new EntityQuery("Customers")
        .top(5);
  @method top
  @param count {Number} The number of entities to return.
  If 'count' is either null or omitted then any existing 'top' count on the query is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.top = function (count) {
    return this.take(count);
  };
  
  /**
  Returns a new query that returns only the specified number of entities when returning results - Same as 'top'.
  Any existing take can be cleared by calling take with no arguments.
  @example
      var query = new EntityQuery("Customers")
        .take(5);
  @method take
  @param count {Number} The number of entities to return.
  If 'count' is either null or omitted then any existing 'take' count on the query is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.take = function (count) {
    assertParam(count, "count").isOptional().isNumber().check();
    return clone(this, "takeCount", (count == null) ? null : count);
  };
  
  /**
  Returns a new query that will return related entities nested within its results. The expand method allows you to identify related entities, via navigation property
  names such that a graph of entities may be retrieved with a single request. Any filtering occurs before the results are 'expanded'.
  @example
      var query = new EntityQuery("Customers")
        .where("CompanyName", "startsWith", "C")
        .expand("Orders");
  will return the filtered customers each with its "Orders" properties fully resolved.
  Multiple paths may be specified by separating the paths by a ','
  @example
      var query = new EntityQuery("Orders")
        .expand("Customer, Employee")
  and nested property paths my be specified as well
  @example
      var query = new EntityQuery("Orders")
        .expand("Customer, OrderDetails, OrderDetails.Product")
  @method expand
  @param propertyPaths {String|Array of String} A comma-separated list of navigation property names or an array of navigation property names. Each Navigation Property name can be followed
  by a '.' and another navigation property name to enable identifying a multi-level relationship.
  If 'propertyPaths' is either null or omitted then any existing 'expand' clause on the query is removed.
  @return {EntityQuery}
  @chainable
  **/
  proto.expand = function (propertyPaths) {
    var expandClause = propertyPaths == null ? null : new ExpandClause(normalizePropertyPaths(propertyPaths));
    return clone(this, "expandClause", expandClause);
  };
  
  /**
  Returns a new query that includes a collection of parameters to pass to the server.
  @example
      var query = EntityQuery.from("EmployeesFilteredByCountryAndBirthdate")
        .withParameters({ BirthDate: "1/1/1960", Country: "USA" });
   
  will call the 'EmployeesFilteredByCountryAndBirthdate' method on the server and pass in 2 parameters. This
  query will be uri encoded as
  @example
      {serviceApi}/EmployeesFilteredByCountryAndBirthdate?birthDate=1%2F1%2F1960&country=USA

  Parameters may also be mixed in with other query criteria.
  @example
      var query = EntityQuery.from("EmployeesFilteredByCountryAndBirthdate")
        .withParameters({ BirthDate: "1/1/1960", Country: "USA" })
        .where("LastName", "startsWith", "S")
        .orderBy("BirthDate");

  @method withParameters
  @param parameters {Object} A parameters object where the keys are the parameter names and the values are the parameter values.
  @return {EntityQuery}
  @chainable
  **/
  proto.withParameters = function (parameters) {
    assertParam(parameters, "parameters").isObject().check();
    return clone(this, "parameters", parameters);
  };
  
  /**
  Returns a query with the 'inlineCount' capability either enabled or disabled.  With 'inlineCount' enabled, an additional 'inlineCount' property
  will be returned with the query results that will contain the number of entities that would have been returned by this
  query with only the 'where'/'filter' clauses applied, i.e. without any 'skip'/'take' operators applied. For local queries this clause is ignored.

  @example
      var query = new EntityQuery("Customers")
        .take(20)
        .orderBy("CompanyName")
        .inlineCount(true);
  will return the first 20 customers as well as a count of all of the customers in the remote store.

  @method inlineCount
  @param enabled {Boolean=true} Whether or not inlineCount capability should be enabled. If this parameter is omitted, true is assumed.
  @return {EntityQuery}
  @chainable
  **/
  proto.inlineCount = function (enabled) {
    assertParam(enabled, "enabled").isBoolean().isOptional().check();
    enabled = (enabled === undefined) ? true : !!enabled;
    return clone(this, "inlineCountEnabled", enabled);
  };

  proto.useNameOnServer = function(usesNameOnServer) {
    assertParam(usesNameOnServer, "usesNameOnServer").isBoolean().isOptional().check();
    usesNameOnServer = (usesNameOnServer === undefined) ? true : !!usesNameOnServer;
    return clone(this, "usesNameOnServer", usesNameOnServer);
  }
  
  /**
  Returns a query with the 'noTracking' capability either enabled or disabled.  With 'noTracking' enabled, the results of this query
  will not be coerced into entities but will instead look like raw javascript projections. i.e. simple javascript objects.

  @example
      var query = new EntityQuery("Customers")
        .take(20)
        .orderBy("CompanyName")
        .noTracking(true);

  @method noTracking
  @param enabled {Boolean=true} Whether or not the noTracking capability should be enabled. If this parameter is omitted, true is assumed.
  @return {EntityQuery}
  @chainable
  **/
  proto.noTracking = function (enabled) {
    assertParam(enabled, "enabled").isBoolean().isOptional().check();
    enabled = (enabled === undefined) ? true : !!enabled;
    return clone(this, "noTrackingEnabled", enabled);
  };
  
  /**
  Returns a copy of this EntityQuery with the specified {{#crossLink "EntityManager"}}{{/crossLink}}, {{#crossLink "DataService"}}{{/crossLink}},
  {{#crossLink "JsonResultsAdapter"}}{{/crossLink}}, {{#crossLink "MergeStrategy"}}{{/crossLink}} or {{#crossLink "FetchStrategy"}}{{/crossLink}} applied.
  @example
      // 'using' can be used to return a new query with a specified EntityManager.
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders")
        .using(em);
  or with a specified {{#crossLink "MergeStrategy"}}{{/crossLink}}
  @example
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders")
        .using(MergeStrategy.PreserveChanges);
  or with a specified {{#crossLink "FetchStrategy"}}{{/crossLink}}
  @example
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders")
        .using(FetchStrategy.FromLocalCache);
  
  @method using
  @param obj {EntityManager|QueryOptions|DataService|MergeStrategy|FetchStrategy|JsonResultsAdapter|config object} The object to update in creating a new EntityQuery from an existing one.
  @return {EntityQuery}
  @chainable
  **/
  proto.using = function (obj) {
    if (!obj) return this;
    var eq = clone(this);
    processUsing(eq, {
      entityManager: null,
      dataService: null,
      queryOptions: null,
      fetchStrategy: function (eq, val) {
        eq.queryOptions = (eq.queryOptions || new QueryOptions()).using(val)
      },
      mergeStrategy: function (eq, val) {
        eq.queryOptions = (eq.queryOptions || new QueryOptions()).using(val)
      },
      jsonResultsAdapter: function (eq, val) {
        eq.dataService = (eq.dataService || new DataService()).using({ jsonResultsAdapter: val })
      }
    }, obj);
    return eq;
  };
  
  /**
  Executes this query.  This method requires that an EntityManager has been previously specified via the "using" method.
  @example
  This method can be called using a 'promises' syntax ( recommended)
  @example
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders").using(em);
      query.execute().then( function(data) {
          ... query results processed here
      }).fail( function(err) {
          ... query failure processed here
      });
  or with callbacks
  @example
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders").using(em);
      query.execute(
        function(data) {
                    var orders = data.results;
                    ... query results processed here
                },
        function(err) {
                    ... query failure processed here
                });
  Either way this method is the same as calling the EntityManager 'execute' method.
  @example
      var em = new EntityManager(serviceName);
      var query = new EntityQuery("Orders");
      em.executeQuery(query).then( function(data) {
         var orders = data.results;
          ... query results processed here
      }).fail( function(err) {
         ... query failure processed here
      });

  @method execute
  @async

  @param callback {Function} Function called on success.

  successFunction([data])
  @param [callback.data] {Object}
  @param callback.data.results {Array of Entity}
  @param callback.data.query {EntityQuery} The original query
  @param callback.data.httpResponse {HttpResponse} The HttpResponse returned from the server.
  @param callback.data.inlineCount {Integer} Only available if 'inlineCount(true)' was applied to the query.  Returns the count of
  items that would have been returned by the query before applying any skip or take operators, but after any filter/where predicates
  would have been applied.
  @param callback.data.retrievedEntities {Array of Entity} All entities returned by the query.  Differs from results when .expand() is used.

  @param errorCallback {Function} Function called on failure.

  failureFunction([error])
  @param [errorCallback.error] {Error} Any error that occured wrapped into an Error object.
  @param [errorCallback.error.query] The query that caused the error.
  @param [errorCallback.error.httpResponse] {HttpResponse} The raw XMLHttpRequest returned from the server.

  @return {Promise}
  **/
  proto.execute = function (callback, errorCallback) {
    if (!this.entityManager) {
      throw new Error("An EntityQuery must have its EntityManager property set before calling 'execute'");
    }
    return this.entityManager.executeQuery(this, callback, errorCallback);
  };
  
  /**
  Executes this query against the local cache.  This method requires that an EntityManager have been previously specified via the "using" method.
  @example
      // assume em is an entityManager already filled with order entities;
      var query = new EntityQuery("Orders").using(em);
      var orders = query.executeLocally();

  Note that calling this method is the same as calling {{#crossLink "EntityManager/executeQueryLocally"}}{{/crossLink}}.

  @method executeLocally
  **/
  proto.executeLocally = function () {
    if (!this.entityManager) {
      throw new Error("An EntityQuery must have its EntityManager property set before calling 'executeLocally'");
    }
    return this.entityManager.executeQueryLocally(this);
  };
  
  proto.toJSON = function () {
    return this.toJSONExt();
  }
  
  proto.toJSONExt = function (context) {
    context = context || {};
    context.entityType = context.entityType || this.fromEntityType;
    context.propertyPathFn = context.toNameOnServer ? context.entityType.clientPropertyPathToServer.bind(context.entityType) : __identity;
    
    var that = this;
    
    var toJSONExtFn = function (v) {
      return v ? v.toJSONExt(context) : undefined;
    };
    return __toJson(this, {
      "from,resourceName": null,
      "toType,resultEntityType": function (v) {
        // resultEntityType can be either a string or an entityType
        return v ? (__isString(v) ? v : v.name) : undefined;
      },
      "where,wherePredicate": toJSONExtFn,
      "orderBy,orderByClause": toJSONExtFn,
      "select,selectClause": toJSONExtFn,
      "expand,expandClause": toJSONExtFn,
      "skip,skipCount": null,
      "take,takeCount": null,
      parameters: function (v) {
        return __isEmpty(v) ? undefined : v;
      },
      "inlineCount,inlineCountEnabled": false,
      "noTracking,noTrackingEnabled": false,
      queryOptions: null
    });

  }
  
  function fromJSON(eq, json) {
    __toJson(json, {
      "resourceName,from": null,
      // just the name comes back and will be resolved later
      "resultEntityType,toType": null,
      "wherePredicate,where": function (v) {
        return v ? new Predicate(v) : undefined;
      },
      "orderByClause,orderBy": function (v) {
        return v ? new OrderByClause(v) : undefined;
      },
      "selectClause,select": function (v) {
        return v ? new SelectClause(v) : undefined;
      },
      "expandClause,expand": function (v) {
        return v ? new ExpandClause(v) : undefined;
      },
      "skipCount,skip": null,
      "takeCount,take": null,
      parameters: function (v) {
        return __isEmpty(v) ? undefined : v;
      },
      "inlineCountEnabled,inlineCount": false,
      "noTrackingEnabled,noTracking": false,
      queryOptions: function (v) {
        return v ? QueryOptions.fromJSON(v) : undefined;
      }
    }, eq);
    return eq;
  }
  
  /**
  Static method that creates an EntityQuery that will allow 'requerying' an entity or a collection of entities by primary key. This can be useful
  to force a requery of selected entities, or to restrict an existing collection of entities according to some filter.

  Works for a single entity or an array of entities of the SAME type.
  Does not work for an array of entities of different types.

  @example
      // assuming 'customers' is an array of 'Customer' entities retrieved earlier.
      var customersQuery = EntityQuery.fromEntities(customers);
  The resulting query can, of course, be extended
  @example
      // assuming 'customers' is an array of 'Customer' entities retrieved earlier.
      var customersQuery = EntityQuery.fromEntities(customers)
        .where("Region", FilterQueryOp.NotEquals, null);
  Single entities can requeried as well.
  @example
      // assuming 'customer' is a 'Customer' entity retrieved earlier.
      var customerQuery = EntityQuery.fromEntities(customer);
  will create a query that will return an array containing a single customer entity.
  @method fromEntities
  @static
  @param entities {Entity|Array of Entity} The entities for which we want to create an EntityQuery.
  @return {EntityQuery}
  @chainable
  **/
  ctor.fromEntities = function (entities) {
    assertParam(entities, "entities").isEntity().or().isNonEmptyArray().isEntity().check();
    if (!Array.isArray(entities)) {
      entities = __arraySlice(arguments);
    }
    var firstEntity = entities[0];
    var type = firstEntity.entityType;
    if (entities.some(function(e){
      return e.entityType !== type;
    })) {
      throw new Error("All 'fromEntities' must be the same type; at least one is not of type " +
        type.name);
    }
    var q = new EntityQuery(type.defaultResourceName);
    var preds = entities.map(function (entity) {
      return buildPredicate(entity);
    });
    var pred = Predicate.or(preds);
    q = q.where(pred);
    var em = firstEntity.entityAspect.entityManager;
    if (em) {
      q = q.using(em);
    }
    return q;
  };
  
  /**
  Creates an EntityQuery for the specified {{#crossLink "EntityKey"}}{{/crossLink}}.
  @example
      var empType = metadataStore.getEntityType("Employee");
      var entityKey = new EntityKey(empType, 1);
      var query = EntityQuery.fromEntityKey(entityKey);
  or
  @example
      // 'employee' is a previously queried employee
      var entityKey = employee.entityAspect.getKey();
      var query = EntityQuery.fromEntityKey(entityKey);
  @method fromEntityKey
  @static
  @param entityKey {EntityKey} The {{#crossLink "EntityKey"}}{{/crossLink}} for which a query will be created.
  @return {EntityQuery}
  @chainable
  **/
  ctor.fromEntityKey = function (entityKey) {
    assertParam(entityKey, "entityKey").isInstanceOf(EntityKey).check();
    var q = new EntityQuery(entityKey.entityType.defaultResourceName);
    var pred = buildKeyPredicate(entityKey);
    q = q.where(pred).toType(entityKey.entityType);
    return q;
  };
  
  /**
  Creates an EntityQuery for the specified entity and {{#crossLink "NavigationProperty"}}{{/crossLink}}.
  @example
      // 'employee' is a previously queried employee
      var ordersNavProp = employee.entityType.getProperty("Orders");
      var query = EntityQuery.fromEntityNavigation(employee, ordersNavProp);
  will return a query for the "Orders" of the specified 'employee'.
  @method fromEntityNavigation
  @static
  @param entity {Entity} The Entity whose navigation property will be queried.
  @param navigationProperty {NavigationProperty|String} The {{#crossLink "NavigationProperty"}}{{/crossLink}} or name of the NavigationProperty to be queried.
  @return {EntityQuery}
  @chainable
  **/
  ctor.fromEntityNavigation = function (entity, navigationProperty) {
    assertParam(entity, "entity").isEntity().check();
    var navProperty = entity.entityType._checkNavProperty(navigationProperty);
    var q = new EntityQuery(navProperty.entityType.defaultResourceName);
    var pred = buildNavigationPredicate(entity, navProperty);
    q = q.where(pred);
    var em = entity.entityAspect.entityManager;
    return em ? q.using(em) : q;
  };
  
  // protected methods
  
  proto._getFromEntityType = function (metadataStore, throwErrorIfNotFound) {
    // Uncomment next two lines if we make this method public.
    // assertParam(metadataStore, "metadataStore").isInstanceOf(MetadataStore).check();
    // assertParam(throwErrorIfNotFound, "throwErrorIfNotFound").isBoolean().isOptional().check();
    var entityType = this.fromEntityType;
    if (entityType) return entityType;
    
    var resourceName = this.resourceName;
    if (!resourceName) {
      throw new Error("There is no resourceName for this query");
    }
    
    if (metadataStore.isEmpty()) {
      if (throwErrorIfNotFound) {
        throw new Error("There is no metadata available for this query. " +
            "Are you querying the local cache before you've fetched metadata?");
      } else {
        return null;
      }
    }
    
    var entityTypeName = metadataStore.getEntityTypeNameForResourceName(resourceName);
    if (entityTypeName) {
      entityType = metadataStore._getEntityType(entityTypeName);
    } else {
      entityType = this._getToEntityType(metadataStore, true);
    }
    
    if (!entityType) {
      if (throwErrorIfNotFound) {
        throw new Error(__formatString("Cannot find an entityType for resourceName: '%1'. " 
            + " Consider adding an 'EntityQuery.toType' call to your query or " 
            + "calling the MetadataStore.setEntityTypeForResourceName method to register an entityType for this resourceName.", resourceName));
      } else {
        return null;
      }
    }
    
    this.fromEntityType = entityType;
    return entityType;

  };
  
  proto._getToEntityType = function (metadataStore, skipFromCheck) {
    // skipFromCheck is to avoid recursion if called from _getFromEntityType;
    if (this.resultEntityType instanceof EntityType) {
      return this.resultEntityType;
    } else if (this.resultEntityType) {
      // resultEntityType is a string
      this.resultEntityType = metadataStore._getEntityType(this.resultEntityType, false);
      return this.resultEntityType;
    } else {
      // resolve it, if possible, via the resourceName
      // do not cache this value in this case
      // cannot determine the resultEntityType if a selectClause is present.
      return skipFromCheck ? null : (!this.selectClause) && this._getFromEntityType(metadataStore, false);
    }
  };
  
  // for testing
  proto._toUri = function (em) {
    var ds = DataService.resolve([em.dataService]);
    return ds.uriBuilder.buildUri(this, em.metadataStore);
  }
  
  // private functions
  
  function clone(that, propName, value) {
    // immutable queries mean that we don't need to clone if no change in value.
    if (propName) {
      if (that[propName] === value) return that;
    }
    // copying QueryOptions is safe because they are are immutable;
    var copy = __extend(new EntityQuery(), that, [
      "resourceName",
      "fromEntityType",
      "wherePredicate",
      "orderByClause",
      "selectClause",
      "skipCount",
      "takeCount",
      "expandClause",
      "inlineCountEnabled",
      "noTrackingEnabled",
      "usesNameOnServer",
      "queryOptions",
      "entityManager",
      "dataService",
      "resultEntityType"
    ]);
    copy.parameters = __extend({}, that.parameters);
    if (propName) {
      copy[propName] = value;
    }
    return copy;
  }
  
  function processUsing(eq, map, value, propertyName) {
    var typeName = value._$typeName || (value.parentEnum && value.parentEnum.name);
    var key = typeName && typeName.substr(0, 1).toLowerCase() + typeName.substr(1);
    if (propertyName && key != propertyName) {
      throw new Error("Invalid value for property: " + propertyName);
    }
    if (key) {
      var fn = map[key];
      if (fn === undefined) {
        throw new Error("Invalid config property: " + key);
      } else if (fn === null) {
        eq[key] = value;
      } else {
        fn(eq, value);
      }
    } else {
      __objectForEach(value, function (propName, val) {
        processUsing(eq, map, val, propName)
      });
    }
  }
  
  function normalizePropertyPaths(propertyPaths) {
    assertParam(propertyPaths, "propertyPaths").isOptional().isString().or().isArray().isString().check();
    if (typeof propertyPaths === 'string') {
      propertyPaths = propertyPaths.split(",");
    }
    
    propertyPaths = propertyPaths.map(function (pp) {
      return pp.trim();
    });
    return propertyPaths;
  }
  
  function buildPredicate(entity) {
    var entityType = entity.entityType;
    var predParts = entityType.keyProperties.map(function (kp) {
      return Predicate.create(kp.name, FilterQueryOp.Equals, entity.getProperty(kp.name));
    });
    var pred = Predicate.and(predParts);
    return pred;
  }
  
  function buildKeyPredicate(entityKey) {
    var keyProps = entityKey.entityType.keyProperties;
    var preds = __arrayZip(keyProps, entityKey.values, function (kp, v) {
      return Predicate.create(kp.name, FilterQueryOp.Equals, v);
    });
    var pred = Predicate.and(preds);
    return pred;
  }
  
  function buildNavigationPredicate(entity, navigationProperty) {
    if (navigationProperty.isScalar) {
      if (navigationProperty.foreignKeyNames.length === 0) return null;
      var relatedKeyValues = navigationProperty.foreignKeyNames.map(function (fkName) {
        return entity.getProperty(fkName);
      });
      var entityKey = new EntityKey(navigationProperty.entityType, relatedKeyValues);
      return buildKeyPredicate(entityKey);
    } else {
      var inverseNp = navigationProperty.inverse;
      var foreignKeyNames = inverseNp ? inverseNp.foreignKeyNames : navigationProperty.invForeignKeyNames;
      if (foreignKeyNames.length === 0) return null;
      var keyValues = entity.entityAspect.getKey().values;
      var predParts = __arrayZip(foreignKeyNames, keyValues, function (fkName, kv) {
        return Predicate.create(fkName, FilterQueryOp.Equals, kv);
      });
      return Predicate.and(predParts);
    }
  }
  
  return ctor;
})();

var FilterQueryOp = (function () {
  /**
   FilterQueryOp is an 'Enum' containing all of the valid  {{#crossLink "Predicate"}}{{/crossLink}}
   filter operators for an {{#crossLink "EntityQuery"}}{{/crossLink}}.

   @class FilterQueryOp
   @static
   **/
  var aEnum = new Enum("FilterQueryOp");
  /**
   Aliases: "eq", "=="
   @property Equals {FilterQueryOp}
   @final
   @static
   **/
  aEnum.Equals = aEnum.addSymbol({ operator: "eq" });
  /**
   Aliases: "ne", "!="
   @property NotEquals {FilterQueryOp}
   @final
   @static
   **/
  aEnum.NotEquals = aEnum.addSymbol({ operator: "ne" });
  /**
   Aliases: "gt", ">"
   @property GreaterThan {FilterQueryOp}
   @final
   @static
   **/
  aEnum.GreaterThan = aEnum.addSymbol({ operator: "gt" });
  /**
   Aliases: "lt", "<"
   @property LessThan {FilterQueryOp}
   @final
   @static
   **/
  aEnum.LessThan = aEnum.addSymbol({ operator: "lt" });
  /**
   Aliases: "ge", ">="
   @property GreaterThanOrEqual {FilterQueryOp}
   @final
   @static
   **/
  aEnum.GreaterThanOrEqual = aEnum.addSymbol({ operator: "ge" });
  /**
   Aliases: "le", "<="
   @property LessThanOrEqual {FilterQueryOp}
   @final
   @static
   **/
  aEnum.LessThanOrEqual = aEnum.addSymbol({ operator: "le" });
  /**
   String operation: Is a string a substring of another string.
   Aliases: "substringof"
   @property Contains {FilterQueryOp}
   @final
   @static
   **/
  aEnum.Contains = aEnum.addSymbol({ operator: "contains" });
  /**
   @property StartsWith {FilterQueryOp}
   @final
   @static
   **/
  aEnum.StartsWith = aEnum.addSymbol({ operator: "startswith" });
  /**
   @property EndsWith {FilterQueryOp}
   @final
   @static
   **/
  aEnum.EndsWith = aEnum.addSymbol({ operator: "endswith" });
  
  /**
   Aliases: "some"
   @property Any {FilterQueryOp}
   @final
   @static
   **/
  aEnum.Any = aEnum.addSymbol({ operator: "any" });
  
  /**
   Aliases: "every"
   @property All {FilterQueryOp}
   @final
   @static
   **/
  aEnum.All = aEnum.addSymbol({ operator: "all" });
  
  aEnum.IsTypeOf = aEnum.addSymbol({ operator: "isof" });
  
  aEnum.resolveSymbols();

  return aEnum;
})();

var BooleanQueryOp = (function () {
  var aEnum = new Enum("BooleanQueryOp");
  aEnum.And = aEnum.addSymbol({ operator: "and" });
  aEnum.Or = aEnum.addSymbol({ operator: "or" });
  aEnum.Not = aEnum.addSymbol({ operator: "not" });
  
  aEnum.resolveSymbols();

  return aEnum;
})();

/*
 An OrderByClause is a description of the properties and direction that the result
 of a query should be sorted in.  OrderByClauses are immutable, which means that any
 method that would modify an OrderByClause actually returns a new OrderByClause.

 For example for an Employee object with properties of 'Company' and 'LastName' the following would be valid expressions:

 var obc = new OrderByClause("Company.CompanyName, LastName")
 or
 var obc = new OrderByClause("Company.CompanyName desc, LastName")
 or
 var obc = new OrderByClause("Company.CompanyName, LastName", true);
 @class OrderByClause
 */
var OrderByClause = (function () {
  
  var ctor = function (propertyPaths, isDesc) {

    if (propertyPaths.length > 1) {
      // you can also pass in an array of orderByClauses
      if (propertyPaths[0] instanceof OrderByClause) {
        this.items = Array.prototype.concat.apply(propertyPaths[0].items, propertyPaths.slice(1).map(__pluck("items")) );
        return;
      }
      var items = propertyPaths.map(function (pp) {
        return new OrderByItem(pp, isDesc);
      });
    } else {
      var items = [new OrderByItem(propertyPaths[0], isDesc)];
    }
    this.items = items;
  };
  var proto = ctor.prototype;
  
  proto.validate = function (entityType) {
    if (entityType == null || entityType.isAnonymous) return;
    this.items.forEach(function (item) {
      item.validate(entityType)
    });
  };


  
  proto.getComparer = function (entityType) {
    var orderByFuncs = this.items.map(function (obc) {
      return obc.getComparer(entityType);
    });
    return function (entity1, entity2) {
      for (var i = 0; i < orderByFuncs.length; i++) {
        var result = orderByFuncs[i](entity1, entity2);
        if (result !== 0) {
          return result;
        }
      }
      return 0;
    };
  };
  
  proto.toJSONExt = function (context) {
    return this.items.map(function (item) {
      return context.propertyPathFn(item.propertyPath) + (item.isDesc ? " desc" : "");
    });
  };
  
  var OrderByItem = function (propertyPath, isDesc) {
    if (!(typeof propertyPath === 'string')) {
      throw new Error("propertyPath is not a string");
    }
    propertyPath = propertyPath.trim();
    
    var parts = propertyPath.split(' ');
    // parts[0] is the propertyPath; [1] would be whether descending or not.
    if (parts.length > 1 && isDesc !== true && isDesc !== false) {
      isDesc = __stringStartsWith(parts[1].toLowerCase(), "desc");
      if (!isDesc) {
        // isDesc is false but check to make sure its intended.
        var isAsc = __stringStartsWith(parts[1].toLowerCase(), "asc");
        if (!isAsc) {
          throw new Error("the second word in the propertyPath must begin with 'desc' or 'asc'");
        }

      }
    }
    this.propertyPath = parts[0];
    this.isDesc = isDesc;
  };
  
  var itemProto = OrderByItem.prototype;
  
  itemProto.validate = function (entityType) {
    if (entityType == null || entityType.isAnonymous) return;
    // will throw an exception on bad propertyPath
    this.lastProperty = entityType.getProperty(this.propertyPath, true);
  };
  
  itemProto.getComparer = function (entityType) {
    if (!this.lastProperty) this.validate(entityType);
    if (this.lastProperty) {
      var propDataType = this.lastProperty.dataType;
      var isCaseSensitive = this.lastProperty.parentType.metadataStore.localQueryComparisonOptions.isCaseSensitive;
    }
    var propertyPath = this.propertyPath;
    var isDesc = this.isDesc;
    
    return function (entity1, entity2) {
      var value1 = getPropertyPathValue(entity1, propertyPath);
      var value2 = getPropertyPathValue(entity2, propertyPath);
      var dataType = propDataType || (value1 && DataType.fromValue(value1)) || DataType.fromValue(value2);
      if (dataType === DataType.String) {
        if (isCaseSensitive) {
          value1 = value1 || "";
          value2 = value2 || "";
        } else {
          value1 = (value1 || "").toLowerCase();
          value2 = (value2 || "").toLowerCase();
        }
      } else {
        var normalize = DataType.getComparableFn(dataType);
        value1 = normalize(value1);
        value2 = normalize(value2);
      }
      if (value1 === value2) {
        return 0;
      } else if (value1 > value2 || value2 === undefined) {
        return isDesc ? -1 : 1;
      } else {
        return isDesc ? 1 : -1;
      }
    };
  };
  
  return ctor;
})();

// Not exposed
var SelectClause = (function () {
  
  var ctor = function (propertyPaths) {
    this.propertyPaths = propertyPaths;
    this._pathNames = propertyPaths.map(function (pp) {
      return pp.replace(".", "_");
    });
  };
  var proto = ctor.prototype;
  
  proto.validate = function (entityType) {
    if (entityType == null || entityType.isAnonymous) return; // can't validate yet
    // will throw an exception on bad propertyPath
    this.propertyPaths.forEach(function (path) {
      entityType.getProperty(path, true);
    });
  };
  
  proto.toFunction = function (/* config */) {
    var that = this;
    return function (entity) {
      var result = {};
      that.propertyPaths.forEach(function (path, i) {
        result[that._pathNames[i]] = getPropertyPathValue(entity, path);
      });
      return result;
    };
  };
  
  proto.toJSONExt = function (context) {
    return this.propertyPaths.map(function (pp) {
      return context.propertyPathFn(pp);
    })
  };
  
  return ctor;
})();

// Not exposed
var ExpandClause = (function () {
  
  // propertyPaths is an array of strings.
  var ctor = function (propertyPaths) {
    this.propertyPaths = propertyPaths;
  };
  var proto = ctor.prototype;
  
  proto.toJSONExt = function (context) {
    return this.propertyPaths.map(function (pp) {
      return context.propertyPathFn(pp);
    })
  };
  
  return ctor;
})();

// used by EntityQuery and Predicate
function getPropertyPathValue(obj, propertyPath) {
  var properties = Array.isArray(propertyPath) ? propertyPath : propertyPath.split(".");
  if (properties.length === 1) {
    return obj.getProperty(propertyPath);
  } else {
    var nextValue = obj;
    // hack use of some to perform mapFirst operation.
    properties.some(function (prop) {
      nextValue = nextValue.getProperty(prop);
      return nextValue == null;
    });
    return nextValue;
  }
}

// expose
breeze.FilterQueryOp = FilterQueryOp;
breeze.EntityQuery = EntityQuery;

// Not documented - only exposed for testing purposes
breeze.OrderByClause = OrderByClause;

