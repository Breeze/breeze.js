var Predicate = (function () {
  
  var Predicate = (function () {
    /**
    Used to define a 'where' predicate for an EntityQuery.  Predicates are immutable, which means that any
    method that would modify a Predicate actually returns a new Predicate.
    @class Predicate
    **/

    /**
    Predicate constructor
    @example
        var p1 = new Predicate("CompanyName", "StartsWith", "B");
        var query = new EntityQuery("Customers").where(p1); 
    or
    @example
        var p2 = new Predicate("Region", FilterQueryOp.Equals, null);
        var query = new EntityQuery("Customers").where(p2);
    @method <ctor> Predicate
    @param property {String} A property name, a nested property name or an expression involving a property name.
    @param operator {FilterQueryOp|String}
    @param value {Object} - This will be treated as either a property expression or a literal depending on context.  In general,
    if the value can be interpreted as a property expression it will be, otherwise it will be treated as a literal.
    In most cases this works well, but you can also force the interpretation by making the value argument itself an object with a 'value'
    property and an 'isLiteral' property set to either true or false.  Breeze also tries to infer the dataType of any
    literal based on context, if this fails you can force this inference by making the value argument an object with a
    'value' property and a 'dataType' property set to one of the breeze.DataType enumeration instances.
    **/

    var ctor = function () {
      // empty ctor is used by all subclasses.
      if (arguments.length === 0) return;
      if (arguments.length === 1) {
        // 3 possibilities:
        //      Predicate(aPredicate)
        //      Predicate([ aPredicate ])
        //      Predicate(["freight", ">", 100"])
        //      Predicate( "freight gt 100" }  // passthru ( i.e. maybe an odata string)
        //      Predicate( { freight: { ">": 100 } })
        var arg = arguments[0];
        if (Array.isArray(arg)) {
          if (arg.length === 1) {
            // recurse
            return Predicate(arg[0]);
          } else {
            return createPredicateFromArray(arg);
          }
        } else if (arg instanceof Predicate) {
          return arg;
        } else if (typeof arg == 'string') {
          return new PassthruPredicate(arg);
        } else {
          return createPredicateFromObject(arg);
        }
      } else {
        // 2 possibilities
        //      Predicate("freight", ">", 100");
        //      Predicate("orders", "any", "freight",  ">", 950);
        return createPredicateFromArray(Array.prototype.slice.call(arguments, 0));
      }
    };
    var proto = ctor.prototype;
    
    /**
    Same as using the ctor.
    @example
        // so 
        var p = Predicate.create(a, b, c);
        // is the same as 
        var p = new Predicate(a, b, c); 
    
    @method create
    @param property {String} A property name, a nested property name or an expression involving a property name.
    @param operator {FilterQueryOp|String}
    @param value {Object} - This will be treated as either a property expression or a literal depending on context.  In general,
    if the value can be interpreted as a property expression it will be, otherwise it will be treated as a literal.
    In most cases this works well, but you can also force the interpretation by making the value argument itself an object with a 'value'
    property and an 'isLiteral' property set to either true or false.  Breeze also tries to infer the dataType of any
    literal based on context, if this fails you can force this inference by making the value argument an object with a
    'value' property and a 'dataType' property set to one of the breeze.DataType enumeration instances.

    @static
    **/
    ctor.create = ctor;
    
    /**
    Creates a 'composite' Predicate by 'and'ing a set of specified Predicates together.
    @example
        var dt = new Date(88, 9, 12);
        var p1 = Predicate.create("OrderDate", "ne", dt);
        var p2 = Predicate.create("ShipCity", "startsWith", "C");
        var p3 = Predicate.create("Freight", ">", 100);
        var newPred = Predicate.and(p1, p2, p3);
    or
    @example
        var preds = [p1, p2, p3];
        var newPred = Predicate.and(preds);
    @method and
    @param predicates* {multiple Predicates|Array of Predicate} Any null or undefined values passed in will be automatically filtered out before constructing the composite predicate.
    @static
    **/
    ctor.and = function () {
      var pred = new AndOrPredicate("and", __arraySlice(arguments));
      // return undefined if empty
      return pred.op && pred;
    };
    
    /**
    Creates a 'composite' Predicate by 'or'ing a set of specified Predicates together.
    @example
        var dt = new Date(88, 9, 12);
        var p1 = Predicate.create("OrderDate", "ne", dt);
        var p2 = Predicate.create("ShipCity", "startsWith", "C");
        var p3 = Predicate.create("Freight", ">", 100);
        var newPred = Predicate.or(p1, p2, p3);
    or
    @example
        var preds = [p1, p2, p3];
        var newPred = Predicate.or(preds);
    @method or
    @param predicates* {multiple Predicates|Array of Predicate} Any null or undefined values passed in will be automatically filtered out before constructing the composite predicate.
    @static
    **/
    ctor.or = function () {
      var pred = new AndOrPredicate("or", __arraySlice(arguments));
      return pred.op && pred;
    };
    
    /**
    Creates a 'composite' Predicate by 'negating' a specified predicate.
    @example
        var p1 = Predicate.create("Freight", "gt", 100);
        var not_p1 = Predicate.not(p1);
    This can also be accomplished using the 'instance' version of the 'not' method
    @example
        var not_p1 = p1.not();
    Both of which would be the same as
    @example
        var not_p1 = Predicate.create("Freight", "le", 100);
    @method not
    @param predicate {Predicate}
    @static
    **/
    ctor.not = function (pred) {
      return pred.not();
    };

    ctor.extendBinaryPredicateFn = function(opMap, visitorFn ) {
      var baseVisitorFn = toFunctionVisitor.binaryPredicate;
      for (var op in (opMap || {})) {
        var config = opMap[op];
        config.visitorFn = visitorFn;
        updateAliasMap(BinaryPredicate.prototype.aliasMap, op, opMap[op])
      }
      if (!toFunctionVisitor.isExtended) {
        toFunctionVisitor.binaryPredicate = function (context, expr1Val, expr2Val) {
          var visitorFn = this.aliasMap[this.op.key].visitorFn;
          if (visitorFn) {
            return visitorFn(context, expr1Val, expr2Val);
          } else {
            return baseVisitorFn(context, expr1Val, expr2Val);
          }
        }
        toFunctionVisitor.isExtended = true;
      }
    };


    /**
    'And's this Predicate with one or more other Predicates and returns a new 'composite' Predicate
    @example
        var dt = new Date(88, 9, 12);
        var p1 = Predicate.create("OrderDate", "ne", dt);
        var p2 = Predicate.create("ShipCity", "startsWith", "C");
        var p3 = Predicate.create("Freight", ">", 100);
        var newPred = p1.and(p2, p3);
    or
    @example
        var preds = [p2, p3];
        var newPred = p1.and(preds);
    The 'and' method is also used to write "fluent" expressions
    @example
        var p4 = Predicate.create("ShipCity", "startswith", "F")
          .and("Size", "gt", 2000);
    @method and
    @param predicates* {multiple Predicates|Array of Predicate} Any null or undefined values passed in will be automatically filtered out before constructing the composite predicate.
    **/
    proto.and = function () {
      return new AndOrPredicate("and", argsForAndOrPredicates(this, arguments));
    };
    
    /**
    'Or's this Predicate with one or more other Predicates and returns a new 'composite' Predicate
    @example
        var dt = new Date(88, 9, 12);
        var p1 = Predicate.create("OrderDate", "ne", dt);
        var p2 = Predicate.create("ShipCity", "startsWith", "C");
        var p3 = Predicate.create("Freight", ">", 100);
        var newPred = p1.or(p2, p3);
    or
    @example
        var preds = [p2, p3];
        var newPred = p1.or(preds);
    The 'or' method is also used to write "fluent" expressions
    @example
        var p4 = Predicate.create("ShipCity", "startswith", "F")
          .or("Size", "gt", 2000);
    @method or
    @param predicates* {multiple Predicates|Array of Predicate} Any null or undefined values passed in will be automatically filtered out before constructing the composite predicate.
    **/
    proto.or = function () {
      return new AndOrPredicate("or", argsForAndOrPredicates(this, arguments));
    };
    
    /**
    Returns the 'negated' version of this Predicate
    @example
        var p1 = Predicate.create("Freight", "gt", 100);
        var not_p1 = p1.not();
    This can also be accomplished using the 'static' version of the 'not' method
    @example
        var p1 = Predicate.create("Freight", "gt", 100);
        var not_p1 = Predicate.not(p1);
    which would be the same as
    @example
        var not_p1 = Predicate.create("Freight", "le", 100);
    @method not
    **/
    proto.not = function () {
      return new UnaryPredicate("not", this);
    };
    
    //
    proto.toJSON = function () {
      // toJSON ( part of js standard - takes a single parameter
      // that is either "" or the name of the property being serialized.
      return this.toJSONExt({ entityType: this._entityType });
    }

    proto.toJSONExt = function(context) {
      return this.visit(context, toJSONVisitor);
    }

    proto.toFunction = function(context) {
      return this.visit(context, toFunctionVisitor);
    }

    proto.toString = function () {
      return JSON.stringify(this);
    };

    proto.visit = function(context, visitor) {
      if (__isEmpty(context)) {
        context = { entityType: null };
      } else if (context instanceof EntityType) {
        context = { entityType: context };
      } else if (!__hasOwnProperty(context, "entityType")) {
        throw new Error("All visitor methods must be called with a context object containing at least an 'entityType' property");
      }

      if (visitor) {
        context.visitor = visitor;
      } else {
        visitor = context.visitor;
      }
      var fn = visitor[this.visitorMethodName];
      if (fn == null) {
        throw new Error("Unable to locate method: " + this.visitorMethodName + " on visitor");
      }


      var entityType = context.entityType;
      // don't both validating if already done so ( or if no _validate method
      if (this._validate && entityType == null || this._entityType !== entityType) {
        // don't need to capture return value because validation fn doesn't have one.
        this._validate(entityType, context.usesNameOnServer);
        this._entityType = entityType;
      }

      // args = context, arg1, args2, ...
      var args = Array.prototype.slice.call(arguments, 1);
      return fn.call(this, context);
    }

    proto._initialize = function (visitorMethodName,  opMap) {
      this.visitorMethodName = visitorMethodName;
      var aliasMap = this.aliasMap = {};
      for (var op in (opMap || {})) {
        updateAliasMap(aliasMap, op, opMap[op])
      }
    };

    function argsForAndOrPredicates(obj, args) {
      var preds = args[0];
      if (preds instanceof Predicate) {
        preds = __arraySlice(args);
      } else if (!Array.isArray(preds)) {
        preds = [Predicate(__arraySlice(args))];
      }
      return [obj].concat(preds);
    }
    
    function updateAliasMap(aliasMap, op, config) {
      var key = op.toLowerCase();
      config.key = key;
      aliasMap[key] = config;

      config.aliases && config.aliases.forEach(function (alias) {
        aliasMap[alias.toLowerCase()] = config;
      });
    }
    
    proto._resolveOp = function (op, okIfNotFound) {
      op = op.operator || op;
      var result = this.aliasMap[op.toLowerCase()];
      if (!result && !okIfNotFound) {
        throw new Error("Unable to resolve operator: " + op);
      }
      return result;
    };
    
    function createPredicateFromArray(arr) {
      // TODO: assert that length of the array should be > 3
      // Needs to handle:
      //      [ "freight", ">", 100"];
      //      [ "orders", "any", "freight",  ">", 950 ]
      //      [ "orders", "and", anotherPred ]
      //      [ "orders", "and", [ "freight, ">", 950 ]
      var json = {};
      var value = {};
      json[arr[0]] = value;
      var op = arr[1];
      op = op.operator || op;  // incoming op will be either a string or a FilterQueryOp
      if (arr.length == 3) {
        value[op] = arr[2];
      } else {
        value[op] = createPredicateFromArray(arr.splice(2));
      }
      return createPredicateFromObject(json);
    };
    
    function createPredicateFromObject(obj) {
      if (obj instanceof Predicate) return obj;
      
      if (typeof obj != 'object') {
        throw new Error("Unable to convert to a Predicate: " + obj);
      }
      var keys = Object.keys(obj);
      var preds = keys.map(function (key) {
        return createPredicateFromKeyValue(key, obj[key]);
      });
      return (preds.length === 1) ? preds[0] : new AndOrPredicate("and", preds);
    }
    
    function createPredicateFromKeyValue(key, value) {
      // { and: [a,b] } key='and', value = [a,b]
      if (AndOrPredicate.prototype._resolveOp(key, true)) {
        return new AndOrPredicate(key, value);
      }
      
      // { not: a }  key= 'not', value = a
      if (UnaryPredicate.prototype._resolveOp(key, true)) {
        return new UnaryPredicate(key, value);
      }

      if ((typeof value !== 'object') || value == null || __isDate(value)) {
        // { foo: bar } key='foo', value = bar ( where bar is a literal i.e. a string, a number, a boolean or a date.
        return new BinaryPredicate("eq", key, value);
      } else if (__hasOwnProperty(value, 'value')) {
        // { foo: { value: bar, dataType: xxx} } key='foo', value = bar ( where bar is an object representing a literal
        return new BinaryPredicate("eq", key, value);
      }
      
      if (Array.isArray(value)) {
        throw new Error("Unable to resolve predicate after the phrase: " + key);
      }
      
      var expr = key;
      var keys = Object.keys(value);
      var preds = keys.map(function (op) {
        
        // { a: { any: b } op = 'any', expr=a, value[op] = b
        if (AnyAllPredicate.prototype._resolveOp(op, true)) {
          return new AnyAllPredicate(op, expr, value[op]);
        }
        
        if (BinaryPredicate.prototype._resolveOp(op, true)) {
          // { a: { ">": b }} op = ">", expr=a, value[op] = b
          return new BinaryPredicate(op, expr, value[op]);
        } else if (__hasOwnProperty(value[op], 'value')) {
          // { a: { ">": { value: b, dataType: 'Int32' }} expr = a value[op] = { value: b, dataType: 'Int32' }
          return new BinaryPredicate("eq", expr, value[op]);
        }
        
        var msg = __formatString("Unable to resolve predicate after the phrase: '%1' for operator: '%2'  and value: '%3'", expr, op, value[op]);
        throw new Error(msg);

      });
      
      return (preds.length === 1) ? preds[0] : new AndOrPredicate("and", preds);
    }

    return ctor;
  })();
  
  var PassthruPredicate = (function () {
    var ctor = function PassthruPredicate(value) {
      this.value = value;
    };
    var proto = ctor.prototype = new Predicate();
    proto._initialize('passthruPredicate');

    proto._validate = __noop;

    return ctor;
  })();
  
  var UnaryPredicate = (function () {
    var ctor = function UnaryPredicate(op, pred) {
      this.op = this._resolveOp(op);
      this.pred = Predicate(pred);
    };
    
    var proto = ctor.prototype = new Predicate();
    proto._initialize('unaryPredicate', {
      'not': { aliases: [ '!', '~' ] }
    });

    proto._validate = function(entityType, usesNameOnServer) {
      this.pred._validate(entityType, usesNameOnServer);
    };

    return ctor;
  })();
  
  var BinaryPredicate = (function () {
    var ctor = function BinaryPredicate(op, expr1, expr2) {
      // 5 public props op, expr1Source, expr2Source, expr1, expr2
      this.op = this._resolveOp(op);
      this.expr1Source = expr1;
      this.expr2Source = expr2;
      // this.expr1 and this.expr2 won't be
      // determined until validate is run
    };
    
    var proto = ctor.prototype = new Predicate();
    proto._initialize('binaryPredicate', {
      'eq': {
        aliases: ["==", "equals" ]
      },
      'ne': {
        aliases: ["!=", "~=", "notequals" ]
      },
      'lt': {
        aliases: ["<", "lessthan" ]
      },
      'le': {
        aliases: ["<=", "lessthanorequal" ]
      },
      'gt': {
        aliases: [">", "greaterthan"]
      },
      'ge': {
        aliases: [">=", "greaterthanorequal" ]
      },
      'startswith': {
        isFunction: true
      },
      'endswith': {
        isFunction: true
      },
      'contains': {
        aliases: ["substringof"],
        isFunction: true
      },
      'in': {

      }
    });


    proto._validate = function(entityType, usesNameOnServer) {
      var expr1Context = { entityType: entityType, usesNameOnServer: usesNameOnServer };
      this.expr1 = createExpr(this.expr1Source, expr1Context);
      if (this.expr1 == null) {
        throw new Error("Unable to validate 1st expression: " + this.expr1Source);
      }
      if (this.expr1 instanceof LitExpr) {
        // lhs must be either a property or a function.
        throw new Error("The left hand side of a binary predicate cannot be a literal expression, it must be a valid property or functional predicate expression: " + this.expr1Source);
      }

      if (this.op.key == 'in' && !Array.isArray(this.expr2Source)) {
        throw new Error("The 'in' operator requires that its right hand argument be an array");
      }
      var expr2Context = __extend(expr1Context, { isRHS: true, dataType: this.expr1.dataType });
      this.expr2 = createExpr(this.expr2Source, expr2Context );
      if (this.expr2 == null) {
        throw new Error("Unable to validate 2nd expression: " + this.expr2Source);
      }

      if (this.expr1.dataType == null) {
        this.expr1.dataType = this.expr2.dataType;
      }
    }

    return ctor;
  })();
  
  var AndOrPredicate = (function () {
    // two public props: op, preds
    var ctor = function AndOrPredicate(op, preds) {
      this.op = this._resolveOp(op);
      if (preds.length == 1 && Array.isArray(preds[0])) {
        preds = preds[0];
      }
      this.preds = preds.filter(function (pred) {
        return pred != null;
      }).map(function (pred) {
        return Predicate(pred);
      });
      if (this.preds.length == 0) {
        // marker for an empty predicate
        this.op = null;
      }
      if (this.preds.length == 1) {
        return this.preds[0];
      }
    };
    
    var proto = ctor.prototype = new Predicate();
    proto._initialize("andOrPredicate", {
      'and': { aliases: [ '&&' ] },
      'or': { aliases: [ '||' ] }
    });

    proto._validate = function(entityType, usesNameOnServer) {
      this.preds.every(function (pred) {
        pred._validate(entityType, usesNameOnServer);
      });
    }

    return ctor;
  })();
  
  var AnyAllPredicate = (function () {
    // 4 public props: op, exprSource, expr, pred
    var ctor = function AnyAllPredicate(op, expr, pred) {
      this.op = this._resolveOp(op);
      this.exprSource = expr;
      // this.expr will not be resolved until validate is called
      this.pred = Predicate(pred);
    };
    
    var proto = ctor.prototype = new Predicate();
    proto._initialize("anyAllPredicate", {
      'any': { aliases: ['some'] },
      'all': { aliases: ["every"] }
    });

    proto._validate = function(entityType, usesNameOnServer) {
      this.expr = createExpr(this.exprSource, { entityType: entityType, usesNameOnServer: usesNameOnServer });
      // can't really know the predicateEntityType unless the original entity type was known.
      if (entityType == null || entityType.isAnonymous) {
        this.expr.dataType = null;
      }
      this.pred._validate(this.expr.dataType, usesNameOnServer);
    }

    return ctor;
  })();

  var PredicateExpression = function (visitorMethodName) {
    this.visitorMethodName = visitorMethodName;
    // give expressions the Predicate prototype method
    this.visit = Predicate.prototype.visit;
    // default impls - may be overridden
    this._validate = __noop;
  }

  var LitExpr = (function () {
    // 2 public props: value, dataType
    var ctor = function LitExpr(value, dataType, hasExplicitDataType) {
      // dataType may come is an a string
      dataType = resolveDataType(dataType);
      // if the DataType comes in as Undefined this means
      // that we should NOT attempt to parse it but just leave it alone
      // for now - this is usually because it is part of a Func expr.
      dataType = dataType || DataType.fromValue(value);

      if (dataType && dataType.parse) {
        if (Array.isArray(value)) {
          this.value = value.map(function(v) { return dataType.parse(v, typeof v) });
        } else {
          this.value = dataType.parse(value, typeof value);
        }
      } else {
        this.value = value;
      }
      this.dataType = dataType;
      this.hasExplicitDataType = hasExplicitDataType;
    };
    var proto = ctor.prototype = new PredicateExpression('litExpr');
    proto.toString = function() {
      return " LitExpr - value: " + this.value.toString() + " dataType: " + this.dataType.toString();
    };

    function resolveDataType(dataType) {
      if (dataType == null) return dataType;
      if (DataType.contains(dataType)) {
        return dataType;
      }
      if (__isString(dataType)) {
        var dt = DataType.fromName(dataType);
        if (dt) return dt;
        throw new Error("Unable to resolve a dataType named: " + dataType);
      }
      
      throw new Error("The dataType parameter passed into this literal expression is not a 'DataType'" + dataType);
    }
    
    return ctor;
  })();
  
  var PropExpr = (function () {
    // two public props: propertyPath, dateType
    var ctor = function PropExpr(propertyPath) {
      this.propertyPath = propertyPath;
      //this.dataType = DataType.Undefined;
      // this.dataType resolved after validate ( if not on an anon type }
    };
    var proto = ctor.prototype = new PredicateExpression('propExpr');
    proto.toString = function() {
      return " PropExpr - " + this.propertyPath;
    };

    proto._validate = function(entityType, usesNameOnServer) {

      if (entityType == null || entityType.isAnonymous) return;
      var props = entityType.getPropertiesOnPath(this.propertyPath, usesNameOnServer, false);

      if (!props) {
        var msg = __formatString("Unable to resolve propertyPath.  EntityType: '%1'   PropertyPath: '%2'", entityType.name, this.propertyPath);
        throw new Error(msg);
      }
      // get the last property
      var prop = props[props.length - 1];
      if (prop.isDataProperty) {
        this.dataType = prop.dataType;
      } else {
        this.dataType = prop.entityType;
      }
    }

    return ctor;
  })();
  
  var FnExpr = (function () {
    
    var ctor = function FnExpr(fnName, exprs) {
      // 4 public props: fnName, exprs, localFn, dataType
      this.fnName = fnName;
      this.exprs = exprs;
      var qf = _funcMap[fnName];
      if (qf == null) {
        throw new Error("Unknown function: " + fnName);
      }
      this.localFn = qf.fn;
      this.dataType = qf.dataType;
    };
    var proto = ctor.prototype = new PredicateExpression('fnExpr');

    proto.toString = function() {
      var exprStr = this.exprs.map(function(expr) {
        expr.toString();
      }).toString();
      return "FnExpr - " + this.fnName + "(" + exprStr + ")";
    };

    proto._validate = function(entityType, usesNameOnServer) {
      this.exprs.forEach(function (expr) {
        expr._validate(entityType, usesNameOnServer);
      });
    };

    // TODO: add dataTypes for the args next - will help to infer other dataTypes.
    var _funcMap = ctor.funcMap = {
      toupper: {
        fn: function (source) {
          return source.toUpperCase();
        }, dataType: DataType.String
      },
      tolower: {
        fn: function (source) {
          return source.toLowerCase();
        }, dataType: DataType.String
      },
      substring: {
        fn: function (source, pos, length) {
          return source.substring(pos, length);
        }, dataType: DataType.String
      },
      substringof: {
        fn: function (find, source) {
          return source.indexOf(find) >= 0;
        }, dataType: DataType.Boolean
      },
      length: {
        fn: function (source) {
          return source.length;
        }, dataType: DataType.Int32
      },
      trim: {
        fn: function (source) {
          return source.trim();
        }, dataType: DataType.String
      },
      concat: {
        fn: function (s1, s2) {
          return s1.concat(s2);
        }, dataType: DataType.String
      },
      replace: {
        fn: function (source, find, replace) {
          return source.replace(find, replace);
        }, dataType: DataType.String
      },
      startswith: {
        fn: function (source, find) {
          return __stringStartsWith(source, find);
        }, dataType: DataType.Boolean
      },
      endswith: {
        fn: function (source, find) {
          return __stringEndsWith(source, find);
        }, dataType: DataType.Boolean
      },
      indexof: {
        fn: function (source, find) {
          return source.indexOf(find);
        }, dataType: DataType.Int32
      },
      round: {
        fn: function (source) {
          return Math.round(source);
        }, dataType: DataType.Int32
      },
      ceiling: {
        fn: function (source) {
          return Math.ceil(source);
        }, dataType: DataType.Int32
      },
      floor: {
        fn: function (source) {
          return Math.floor(source);
        }, dataType: DataType.Int32
      },
      second: {
        fn: function (source) {
          return source.getSeconds();
        }, dataType: DataType.Int32
      },
      minute: {
        fn: function (source) {
          return source.getMinutes();
        }, dataType: DataType.Int32
      },
      day: {
        fn: function (source) {
          return source.getDate();
        }, dataType: DataType.Int32
      },
      month: {
        fn: function (source) {
          return source.getMonth() + 1;
        }, dataType: DataType.Int32
      },
      year: {
        fn: function (source) {
          return source.getFullYear();
        }, dataType: DataType.Int32
      }
    };
    
    return ctor;
  })();

  var RX_IDENTIFIER = /^[a-z_][\w.$]*$/i;
  // comma delimited expressions ignoring commas inside of both single and double quotes.
  var RX_COMMA_DELIM1 = /('[^']*'|[^,]+)/g;
  var RX_COMMA_DELIM2 = /("[^"]*"|[^,]+)/g;
  var DELIM = String.fromCharCode(191);

  function createExpr(source, exprContext) {
    var entityType = exprContext.entityType;

    // the right hand side of an 'in' clause
    if (Array.isArray(source)) {
      if (!exprContext.isRHS) {
        throw new Error("Array expressions are only permitted on the right hand side of a BinaryPredicate");
      }
      return new LitExpr(source, exprContext.dataType);
    }

    if (!__isString(source)) {
      if (source != null && __isObject(source) && !source.toISOString) { 
        // source is an object but not a Date-like thing such as a JS or MomentJS Date
        if (source.value === undefined) {
          throw new Error("Unable to resolve an expression for: " + source + " on entityType: " + entityType.name);
        }
        if (source.isProperty) {
          return new PropExpr(source.value);
        } else {
          // we want to insure that any LitExpr created this way is tagged with 'hasExplicitDataType: true'
          // because we want to insure that if we roundtrip thru toJSON that we don't
          // accidentally reinterpret this node as a PropExpr.
          // return new LitExpr(source.value, source.dataType || context.dataType, !!source.dataType);
          return new LitExpr(source.value, source.dataType || exprContext.dataType, true);
        }
      } else {
        return new LitExpr(source, exprContext.dataType);
      }
    }

    if (exprContext.isRHS) {
      if (entityType == null || entityType.isAnonymous) {
        // if entityType is unknown then assume that the rhs is a literal
        return new LitExpr(source, exprContext.dataType);
      } else {
        return parseLitOrPropExpr(source, exprContext);
      }
    } else {
      var regex = /\([^()]*\)/;
      var m;
      var tokens = [];
      var i = 0;
      while (m = regex.exec(source)) {
        var token = m[0];
        tokens.push(token);
        var repl = DELIM + i++;
        source = source.replace(token, repl);
      }

      var expr = parseExpr(source, tokens, exprContext);
      expr._validate(entityType, exprContext.usesNameOnServer);
      return expr;
    }
  }

  function parseExpr(source, tokens, exprContext) {
    var parts = source.split(DELIM);
    if (parts.length === 1) {
      return parseLitOrPropExpr(parts[0], exprContext);
    } else {
      return parseFnExpr(source, parts, tokens, exprContext);
    }
  }

  function parseLitOrPropExpr(value, exprContext) {
    value = value.trim();
    // value is either a string, a quoted string, a number, a bool value, or a date
    // if a string ( not a quoted string) then this represents a property name ( 1st ) or a lit string ( 2nd)
    var firstChar = value.substr(0, 1);
    var isQuoted = (firstChar === "'" || firstChar === '"') && value.length > 1 && value.substr(value.length - 1) === firstChar;
    if (isQuoted) {
      var unquotedValue = value.substr(1, value.length - 2);
      return new LitExpr(unquotedValue, exprContext.dataType || DataType.String);
    } else {
      var entityType = exprContext.entityType;
      // TODO: get rid of isAnonymous below when we get the chance.
      if (entityType == null || entityType.isAnonymous) {
        // this fork will only be reached on the LHS of an BinaryPredicate -
        // a RHS expr cannot get here with an anon type
        return new PropExpr(value);
      } else {
        var mayBeIdentifier = RX_IDENTIFIER.test(value);
        if (mayBeIdentifier) {
          // if (entityType.getProperty(value, false) != null) {
          if (entityType.getPropertiesOnPath(value, exprContext.usesNameOnServer, false) != null) {
            return new PropExpr(value);
          }
        }
      }
      // we don't really know the datatype here because even though it comes in as a string
      // its usually a string BUT it might be a number  i.e. the "1" or the "2" from an expr
      // like "toUpper(substring(companyName, 1, 2))"
      return new LitExpr(value, exprContext.dataType);
    }
  }

  function parseFnExpr(source, parts, tokens, exprContext) {
    try {
      var fnName = parts[0].trim().toLowerCase();

      var argSource = tokens[parts[1]].trim();
      if (argSource.substr(0, 1) === "(") {
        argSource = argSource.substr(1, argSource.length - 2);
      }
      var commaMatchStr = source.indexOf("'") >= 0 ? RX_COMMA_DELIM1 : RX_COMMA_DELIM2;
      var args = argSource.match(commaMatchStr);
      var newContext = __extend({}, exprContext);
      // a dataType of Undefined on a context basically means not to try parsing
      // the value if the expr is a literal
      newContext.dataType = DataType.Undefined;
      newContext.isFnArg = true;
      var exprs = args.map(function (a) {
        return parseExpr(a, tokens, newContext);
      });
      return new FnExpr(fnName, exprs);
    } catch (e) {
      return null;
    }
  }

  var toFunctionVisitor =  (function () {
    var visitor = {

      passthruPredicate: function () {
        throw new Error("Cannot execute an PassthruPredicate expression against the local cache: " + this.value);
      },
      
      unaryPredicate: function (context) {
        var predFn = this.pred.visit(context);
        switch (this.op.key) {
          case "not":
            return function (entity) {
              return !predFn(entity);
            };
          default:
            throw new Error("Invalid unary operator:" + this.op.key);
        }
      },
      
      binaryPredicate: function (context) {
        var expr1Fn = this.expr1.visit(context);
        var expr2Fn = this.expr2.visit(context);
        var dataType = this.expr1.dataType || this.expr2.dataType;
        var lqco = context.entityType.metadataStore.localQueryComparisonOptions;
        var predFn = getBinaryPredicateFn(this, dataType, lqco);
        if (predFn == null) {
          throw new Error("Invalid binaryPredicate operator:" + this.op.key);
        }
        return function (entity) {
          return predFn(expr1Fn(entity), expr2Fn(entity));
        };
      },
      
      andOrPredicate: function (context) {
        var predFns = this.preds.map(function(pred) {
          return pred.visit(context);
        });
        switch (this.op.key) {
          case "and":
            return function (entity) {
              var result = predFns.reduce(function (prev, cur) {
                return prev && cur(entity);
              }, true);
              return result;
            };
          case "or":
            return function (entity) {
              var result = predFns.reduce(function (prev, cur) {
                return prev || cur(entity);
              }, false);
              return result;
            };
          default:
            throw new Error("Invalid boolean operator:" + op.key);
        }
      },
      
      anyAllPredicate: function (context) {
        var exprFn = this.expr.visit(context);
        var newContext = __extend({}, context);
        newContext.entityType = this.expr.dataType;
        var predFn = this.pred.visit(newContext);
        var anyAllPredFn = getAnyAllPredicateFn(this.op);
        return function (entity) {
          return anyAllPredFn(exprFn(entity), predFn);
        };
      },
      
      litExpr: function () {
        var value = this.value;
        return function (entity) {
          return value;
        };
      },
      
      propExpr: function () {
        var propertyPath = this.propertyPath;
        var properties = propertyPath.split('.');
        if (properties.length === 1) {
          return function (entity) {
            return entity.getProperty(propertyPath);
          };
        } else {
          return function (entity) {
            return getPropertyPathValue(entity, properties);
          };
        }
      },
      
      fnExpr: function (context) {
        var exprFns = this.exprs.map(function(expr) {
          return expr.visit(context);
        });
        var that = this;
        return function (entity) {
          var values = exprFns.map(function (exprFn) {
            var value = exprFn(entity);
            return value;
          });
          var result = that.localFn.apply(null, values);
          return result;
        }
      }

    };

    function getAnyAllPredicateFn(op) {
      switch (op.key) {
        case "any":
          return function (v1, v2) {
            return v1.some(function (v) {
              return v2(v);
            });
          };
        case "all":
          return function (v1, v2) {
            return v1.every(function (v) {
              return v2(v);
            });
          };
        default:
          throw new Error("Unknown operator: " + op.key);
      }
    }

    function getBinaryPredicateFn(binaryPredicate, dataType, lqco) {
      var op = binaryPredicate.op;
      var mc = DataType.getComparableFn(dataType);
      var predFn;
      switch (op.key) {
        case 'eq':
          predFn = function (v1, v2) {
            if (v1 && typeof v1 === 'string') {
              return stringEquals(v1, v2, lqco);
            } else {
              return mc(v1) == mc(v2);
            }
          };
          break;
        case 'ne':
          predFn = function (v1, v2) {
            if (v1 && typeof v1 === 'string') {
              return !stringEquals(v1, v2, lqco);
            } else {
              return mc(v1) != mc(v2);
            }
          };
          break;
        case 'gt':
          predFn = function (v1, v2) {
            return mc(v1) > mc(v2);
          };
          break;
        case 'ge':
          predFn = function (v1, v2) {
            return mc(v1) >= mc(v2);
          };
          break;
        case 'lt':
          predFn = function (v1, v2) {
            return mc(v1) < mc(v2);
          };
          break;
        case 'le':
          predFn = function (v1, v2) {
            return mc(v1) <= mc(v2);
          };
          break;
        case 'startswith':
          predFn = function (v1, v2) {
            return stringStartsWith(v1, v2, lqco);
          };
          break;
        case 'endswith':
          predFn = function (v1, v2) {
            return stringEndsWith(v1, v2, lqco);
          };
          break;
        case 'contains':
          predFn = function (v1, v2) {
            return stringContains(v1, v2, lqco);
          };
          break;
        case 'in':
          predFn = function (v1, v2) {
            v1 = mc(v1);
            v2 = v2.map(function(v) { return mc(v) });
            return v2.indexOf(v1) >= 0;
          };
          break;
        default:
          return null;
      }
      return predFn;
    }

    function stringEquals(a, b, lqco) {
      if (b == null) return false;
      if (typeof b !== 'string') {
        b = b.toString();
      }
      if (lqco.usesSql92CompliantStringComparison) {
        a = (a || "").trim();
        b = (b || "").trim();
      }
      if (!lqco.isCaseSensitive) {
        a = (a || "").toLowerCase();
        b = (b || "").toLowerCase();
      }
      return a === b;
    }
    
    function stringStartsWith(a, b, lqco) {
      if (!lqco.isCaseSensitive) {
        a = (a || "").toLowerCase();
        b = (b || "").toLowerCase();
      }
      return __stringStartsWith(a, b);
    }
    
    function stringEndsWith(a, b, lqco) {
      if (!lqco.isCaseSensitive) {
        a = (a || "").toLowerCase();
        b = (b || "").toLowerCase();
      }
      return __stringEndsWith(a, b);
    }
    
    function stringContains(a, b, lqco) {
      if (!lqco.isCaseSensitive) {
        a = (a || "").toLowerCase();
        b = (b || "").toLowerCase();
      }
      return a.indexOf(b) >= 0;
    }
    
    return visitor;
  }());

  var toJSONVisitor = (function () {
    var visitor = {

      passthruPredicate: function () {
        return this.value;
      },
      
      unaryPredicate: function (context) {
        var predVal = this.pred.visit(context);
        var json = {};
        json[this.op.key] = predVal;
        return json;
      },
      
      binaryPredicate: function (context) {
        var expr1Val = this.expr1.visit(context);
        var expr2Val = this.expr2.visit(context);
        var json = {};
        if (this.expr2 instanceof PropExpr) {
          expr2Val = { value: expr2Val, isProperty: true };
        }
        if (this.op.key === "eq") {
          json[expr1Val] = expr2Val;
        } else {
          var value = {};
          json[expr1Val] = value;
          value[this.op.key] = expr2Val;
        }
        return json;
      },
      
      andOrPredicate: function (context) {
        var predVals = this.preds.map(function(pred) {
          return pred.visit(context);
        });
        var json;
        // normalizeAnd clauses if possible.
        // passthru predicate will appear as string and their 'ands' can't be 'normalized'
        if (this.op.key === 'and' && predVals.length === 2 && !predVals.some(__isString)) {
          // normalize 'and' clauses - will return null if can't be combined.
          json = predVals.reduce(combine);
        }
        if (json == null) {
          json = {};
          json[this.op.key] = predVals;
        }
        return json;
      },
      
      anyAllPredicate: function (context) {
        var exprVal = this.expr.visit(context);
        var newContext = __extend({}, context);
        newContext.entityType = this.expr.dataType;
        var predVal = this.pred.visit(newContext);
        var json = {};
        var value = {};
        value[this.op.key] = predVal;
        json[exprVal] = value;
        return json;
      },
      
      litExpr: function (context) {
        if (this.hasExplicitDataType || context.useExplicitDataType) {
          return { value: this.value, dataType: this.dataType.name }
        } else {
          return this.value;
        }
      },
      
      propExpr: function (context) {
        if (context.toNameOnServer) {
          return context.entityType.clientPropertyPathToServer(this.propertyPath);
        } else {
          return this.propertyPath;
        }
      },
      
      fnExpr: function (context) {
        var exprVals = this.exprs.map(function(expr) {
          return expr.visit(context);
        });
        return this.fnName + "(" + exprVals.join(",") + ")";
      }
    };
    
    function combine(j1, j2) {
      var ok = Object.keys(j2).every(function (key) {
        if (j1.hasOwnProperty(key)) {
          if (typeof (j2[key]) != 'object') {
            // exit and indicate that we can't combine
            return false;
          }
          if (combine(j1[key], j2[key]) == null) {
            return false;
          }
        } else {
          j1[key] = j2[key];
        }
        return true;
      });
      return ok ? j1 : null;
    }
    
    return visitor;
  }());

  
  return Predicate;

})();

breeze.Predicate = Predicate;

