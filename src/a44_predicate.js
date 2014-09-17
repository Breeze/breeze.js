var Predicate = (function () {

  var Predicate = (function () {

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
    // so you can either say new Predicate(a, b, c) or Predicate.create(a, b, c);
    ctor.create = ctor;

    ctor.and = function () {
      return new AndOrPredicate("and", __arraySlice(arguments));
    }

    ctor.or = function () {
      return new AndOrPredicate("or", __arraySlice(arguments));
    }

    ctor.attachVisitor = function (visitor) {
      var fnName = visitor.fnName;

      Object.keys(visitor).forEach(function (key) {
        var lcKey = key.toLowerCase();
        if (lcKey == "fnname") return;
        var proto = _nodeMap[lcKey];
        if (proto == null) {
          throw new Error("Unable to locate a visitor node for: " + key + " on visitor: " + fnName);
        }
        // add function to the Predicate or Expr node.
        var fn = wrapValidation( visitor[key]);
        proto[fnName] = fn;
      });
    };

    var _nodeMap = {};

    ctor._registerProto = function(name, proto, validateFn) {
      _nodeMap[name.toLowerCase()] = proto;
      // perf improvement so that we don't keep revalidating
      proto.validate = validateFn ? cacheValidation(validateFn) : __noop;
    };

    var proto = ctor.prototype;

    proto.and = function () {
      var pred = Predicate(__arraySlice(arguments));
      return new AndOrPredicate("and", [this, pred]);
    };

    proto.or = function () {
      var pred = Predicate(__arraySlice(arguments));
      return new AndOrPredicate("or", [this, pred]);
    };

    proto.not = function () {
      return new UnaryPredicate("not", this);
    };

    proto.toString = function() {
      // this._entityType may be null
      return JSON.stringify(this.toJSON( {entityType: this._entityType }));
    };

    proto._initialize = function (name, validateFn, map) {
      ctor._registerProto(name, this, validateFn);
      var aliasMap = {};
      for (var key in (map || {})) {
        var value = map[key];

        var aliasKey = key.toLowerCase();
        value.key = aliasKey;
        aliasMap[aliasKey] = value;

        value.aliases && value.aliases.forEach(function (alias) {
          aliasMap[alias.toLowerCase()] = value;
        });
      }
      this.aliasMap = aliasMap;
    };

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

      // { foo: bar } key='foo', value = bar ( where bar is a literal i.e. a string, a number, a boolean or a date.
      if ((typeof value !== 'object') || value == null || __isDate(value)) {
        return new BinaryPredicate("==", key, value);
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

        // { a: { ">": b }} op = ">", expr=a, value[op] = b
        if (BinaryPredicate.prototype._resolveOp(op, true)) {
          return new BinaryPredicate(op, expr, value[op]);
        }

        throw new Error("Unable to resolve predicate after the phrase: " + expr + " for operator: " + op + " and value: " + value[op]);

      });

      return (preds.length === 1) ? preds[0] : new AndOrPredicate("and", preds);
    }

    function wrapValidation(fn) {
      return function (config) {
        if (!__hasOwnProperty(config, "entityType")) {
          throw new Error("All visitor methods must be called with a config object containing at least an 'entityType' property");
        }
        // don't need to capture return value because validation fn doesn't have one.
        this.validate(config.entityType);
        return fn.apply(this, arguments);
      }
    }

    function cacheValidation(fn) {
      return function(entityType) {
        // don't both rerunning the validation if its already been run for this entityType
        // but always run it for a null or undefined type
        if (entityType && this._entityType === entityType) return;
        // don't need to capture return value because validation fn doesn't have one.
        fn.call(this, entityType);
        this._entityType = entityType;
      }
    }

    return ctor;
  })();

  var PassthruPredicate = (function () {
    var ctor = function (value) {
      this.value = value;
    };
    var proto = ctor.prototype = new Predicate();
    proto._initialize('PassthruPredicate');

    return ctor;
  })();

  var UnaryPredicate = (function () {
    var ctor = function (op, pred) {
      this.op = this._resolveOp(op);
      this.pred = Predicate(pred);
    };

    var proto = ctor.prototype = new Predicate();
    proto._initialize('UnaryPredicate', validate, {
      'not': { aliases: [ '!', '~' ] }
    });

    function validate(entityType) {
      this.pred.validate(entityType);
    };

    return ctor;
  })();

  var BinaryPredicate = (function () {
    var ctor = function (op, expr1, expr2) {
      // 5 public props op, expr1Source, expr2Source, expr1, expr2
      this.op = this._resolveOp(op);
      this.expr1Source = expr1;
      this.expr2Source = expr2;
      // this.expr1 and this.expr2 won't be
      // determined until validate is run
    };

    var proto = ctor.prototype = new Predicate();
    proto._initialize('BinaryPredicate', validate, {
      'eq': {
        aliases: ["=="]
      },
      'ne': {
        aliases: ["!=", '~=']
      },
      'lt': {
        aliases: ["<" ]
      },
      'le': {
        aliases: ["<=" ]
      },
      'gt': {
        aliases: [">"]
      },
      'ge': {
        aliases: [">=" ]
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
      }
    });

    function validate(entityType) {
      this.expr1 = createExpr(this.expr1Source, entityType);
      if (this.expr1 == null) {
        throw new Error("Unable to validate 1st expression: " + this.expr1Source);
      }
      if (this.expr1 instanceof LitExpr) {
        // lhs must be either a property or a function.
        throw new Error("The left hand side of a binary predicate cannot be a literal expression, it must be a valid property or functional predicate expression: " + this.expr1Source);
      }

      this.expr2 = createExpr(this.expr2Source, entityType, true);
      if (this.expr2 == null) {
        throw new Error("Unable to validate 2nd expression: " + this.expr2Source);
      }

      if (this.expr1.dataType != DataType.Undefined) {
        this.expr2.dataType = this.expr1.dataType;
      } else {
        this.expr1.dataType = this.expr2.dataType;
      }
    }

    return ctor;
  })();

  var AndOrPredicate = (function () {
    // two public props: op, preds
    var ctor = function (op, preds) {
      this.op = this._resolveOp(op);
      if (preds.length == 1 && Array.isArray(preds[0])) {
        preds = preds[0];
      }
      this.preds = preds.filter(function (pred) {
        return pred != null;
      }).map(function (pred) {
        return Predicate(pred);
      });
    };

    var proto = ctor.prototype = new Predicate();
    proto._initialize("AndOrPredicate", validate, {
      'and': { aliases: [ '&&' ] },
      'or': { aliases: [ '||' ] }
    });

    function validate(entityType) {
      this.preds.every(function (pred) {
        pred.validate(entityType);
      });
    }


    return ctor;
  })();

  var AnyAllPredicate = (function () {
    // 4 public props: op, exprSource, expr, pred
    var ctor = function (op, expr, pred) {
      this.op = this._resolveOp(op);
      this.exprSource = expr;
      // this.expr will not be resolved until validate is called
      this.pred = Predicate(pred);
    };

    var proto = ctor.prototype = new Predicate();
    proto._initialize("AnyAllPredicate", validate, {
      'any': { aliases: ['some']},
      'all': { aliases: ["every"] }
    });

    function validate(entityType) {
      this.expr = createExpr(this.exprSource, entityType);
      this.pred.validate(this.expr.dataType);
    }

    return ctor;
  })();

  var LitExpr = (function () {
    // 2 public props: value, dataType
    var ctor = function (value, dataType) {
      this.value = value;
      dataType = resolveDataType(dataType);
      this.hasExplicitDataType = dataType != null && dataType != DataType.Undefined;
      this.dataType = dataType || DataType.fromValue(value);
    };
    var proto = ctor.prototype;
    Predicate._registerProto('LitExpr', proto);

    function resolveDataType(dataType) {
      if (dataType == null) return dataType;
      if (DataType.contains(dataType)) {
        return dataType;
      }
      if ( __isString(dataType)) {
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
    var ctor = function (propertyPath) {
      this.propertyPath = propertyPath;
      this.dataType = DataType.Undefined;
      // this.dataType resolved after validate ( if not on an anon type }
    };
    var proto = ctor.prototype;
    Predicate._registerProto('PropExpr', proto, validate);

    function validate(entityType) {
      if (entityType == null || entityType.isAnonymous) return;
      var prop = entityType.getProperty(this.propertyPath, true);
      if (!prop) {
        var msg = __formatString("Unable to resolve propertyPath.  EntityType: '%1'   PropertyPath: '%2'", entityType.name, this.propertyPath);
        throw new Error(msg);
      }
      if (prop.isDataProperty) {
        this.dataType = prop.dataType;
      } else {
        this.dataType = prop.entityType;
      }
    }

    return ctor;
  })();

  var FnExpr = (function () {

    var ctor = function (fnName, exprArgs) {
      // 4 public props: fnNamee, exprArgs, localFn, dataType
      this.fnName = fnName;
      this.exprArgs = exprArgs;
      var qf = _funcMap[fnName];
      if (qf == null) {
        throw new Error("Unknown function: " + fnName);
      }
      this.localFn = qf.fn;
      this.dataType = qf.dataType;
    };
    var proto = ctor.prototype;
    Predicate._registerProto('FnExpr', proto, validate);

    function validate(entityType) {
      this.exprArgs.forEach(function (expr) {
        expr.validate(entityType);
      });
    }

    var _funcMap = ctor.funcMap = {
      toupper: { fn: function (source) {
        return source.toUpperCase();
      }, dataType: DataType.String },
      tolower: { fn: function (source) {
        return source.toLowerCase();
      }, dataType: DataType.String },
      substring: { fn: function (source, pos, length) {
        return source.substring(pos, length);
      }, dataType: DataType.String },
      substringof: { fn: function (find, source) {
        return source.indexOf(find) >= 0;
      }, dataType: DataType.Boolean },
      length: { fn: function (source) {
        return source.length;
      }, dataType: DataType.Int32 },
      trim: { fn: function (source) {
        return source.trim();
      }, dataType: DataType.String },
      concat: { fn: function (s1, s2) {
        return s1.concat(s2);
      }, dataType: DataType.String },
      replace: { fn: function (source, find, replace) {
        return source.replace(find, replace);
      }, dataType: DataType.String },
      startswith: { fn: function (source, find) {
        return __stringStartsWith(source, find);
      }, dataType: DataType.Boolean },
      endswith: { fn: function (source, find) {
        return __stringEndsWith(source, find);
      }, dataType: DataType.Boolean },
      indexof: { fn: function (source, find) {
        return source.indexOf(find);
      }, dataType: DataType.Int32 },
      round: { fn: function (source) {
        return Math.round(source);
      }, dataType: DataType.Int32 },
      ceiling: { fn: function (source) {
        return Math.ceil(source);
      }, dataType: DataType.Int32 },
      floor: { fn: function (source) {
        return Math.floor(source);
      }, dataType: DataType.Int32 },
      second: { fn: function (source) {
        return source.getSeconds();
      }, dataType: DataType.Int32 },
      minute: { fn: function (source) {
        return source.getMinutes();
      }, dataType: DataType.Int32 },
      day: { fn: function (source) {
        return source.getDate();
      }, dataType: DataType.Int32 },
      month: { fn: function (source) {
        return source.getMonth() + 1;
      }, dataType: DataType.Int32 },
      year: { fn: function (source) {
        return source.getFullYear();
      }, dataType: DataType.Int32 }
    };

    return ctor;
  })();

  // toFunction visitor
  Predicate.attachVisitor(function() {
    var visitor = {
      fnName: "toFunction",

      passthruPredicate: function () {
        throw new Error("Cannot execute an PassthruPredicate expression against the local cache: " + this.value);
      },

      unaryPredicate: function (config) {
        switch (this.op.key) {
          case "not":
            var func = this.pred.toFunction(config);
            return function (entity) {
              return !func(entity);
            };
          default:
            throw new Error("Invalid unary operator:" + this.op.key);
        }
      },

      binaryPredicate: function (config) {
        var dataType = this.expr1.dataType || this.expr2.dataType;
        var predFn = getBinaryPredicateFn(config.entityType, this.op, dataType);
        var v1Fn = this.expr1.toFunction(config);
        var v2Fn = this.expr2.toFunction(config);
        return function (entity) {
          return predFn(v1Fn(entity), v2Fn(entity));
        };
      },

      andOrPredicate: function (config) {
        var funcs = this.preds.map(function (pred) {
          return pred.toFunction(config);
        });
        switch (this.op.key) {
          case "and":
            return function (entity) {
              var result = funcs.reduce(function (prev, cur) {
                return prev && cur(entity);
              }, true);
              return result;
            };
          case "or":
            return function (entity) {
              var result = funcs.reduce(function (prev, cur) {
                return prev || cur(entity);
              }, false);
              return result;
            };
          default:
            throw new Error("Invalid boolean operator:" + op.key);
        }
      },

      anyAllPredicate: function (config) {
        var v1Fn = this.expr.toFunction(config);

        var predFn = getAnyAllPredicateFn(this.op);

        var newConfig = __extend({}, config);
        newConfig.entityType = this.expr.dataType;
        var fn2 = this.pred.toFunction(newConfig);

        return function (entity) {
          return predFn(v1Fn(entity), fn2);
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

      fnExpr:  function (config) {
        var that = this;
        return function (entity) {
          var values = that.exprArgs.map(function (expr) {
            var value = expr.toFunction(config)(entity);
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

    function getBinaryPredicateFn(entityType, op, dataType) {
      var lqco = entityType.metadataStore.localQueryComparisonOptions;
      var mc = getComparableFn(dataType);
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
        default:
          throw new Error("Unknown operator: " + op.key);

      }
      return predFn;
    }

    function getComparableFn(dataType) {
      if (dataType && dataType.isDate) {
        // dates don't perform equality comparisons properly
        return function (value) {
          return value && value.getTime();
        };
      } else if (dataType === DataType.Time) {
        // durations must be converted to compare them
        return function (value) {
          return value && __durationToSeconds(value);
        };
      } else {
        return function (value) {
          return value;
        };
      }
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

  // toODataFragment visitor
  Predicate.attachVisitor(function() {
    var visitor = {
      fnName: "toODataFragment",

      passthruPredicate: function () {
        return this.value;
      },

      unaryPredicate: function (config) {
        return odataOpFrom(this) + " " + "(" + this.pred.toODataFragment(config) + ")";
      },

      binaryPredicate: function (config) {
        var v1Expr = this.expr1.toODataFragment(config);
        var prefix = config.prefix;
        if (prefix) {
          v1Expr = prefix + "/" + v1Expr;
        }

        var v2Expr = this.expr2.toODataFragment(config);

        var odataOp = odataOpFrom(this);

        if (this.op.isFunction) {
          if (odataOp == "substringof") {
            return odataOp + "(" + v2Expr + "," + v1Expr + ") eq true";
          } else {
            return odataOp + "(" + v1Expr + "," + v2Expr + ") eq true";
          }
        } else {
          return v1Expr + " " + odataOp + " " + v2Expr;
        }
      },

      andOrPredicate: function (config) {
        if (this.preds.length === 0) return;
        var result = this.preds.map(function (pred) {
          return "(" + pred.toODataFragment(config) + ")";
        }).join(" " + odataOpFrom(this) + " ");
        return result;
      },

      anyAllPredicate: function (config) {
        var v1Expr = this.expr.toODataFragment(config);

        var prefix = config.prefix;
        if (prefix) {
          v1Expr = prefix + "/" + v1Expr;
          prefix = "x" + (parseInt(prefix.substring(1)) + 1);
        } else {
          prefix = "x1";
        }
        var newConfig = __extend({}, config);
        newConfig.entityType = this.expr.dataType;
        newConfig.prefix = prefix;
        return v1Expr + "/" + odataOpFrom(this) + "(" + prefix + ": " + this.pred.toODataFragment(newConfig) + ")";
      },

      litExpr:  function () {
        return this.dataType.fmtOData(this.value);
      },

      propExpr:  function (config) {
        var entityType = config.entityType;
        return entityType ? entityType._clientPropertyPathToServer(this.propertyPath) : this.propertyPath;
      },

      fnExpr: function (config) {
        var frags = this.exprArgs.map(function (expr) {
          return expr.toODataFragment(config);
        });
        return this.fnName + "(" + frags.join(",") + ")";
      }
    };

    var _operatorMap = {
      'contains': 'substringof'
      // ops where op.key === odataOperator
      // not
      // eq, ne, gt, ge, lt, le,
      // any, all, and, or
      // startswith, endswith
    }

    function odataOpFrom(node) {
      var op = node.op.key;
      var odataOp = _operatorMap[op];
      return odataOp || op;
    }

    return visitor;
  }());

  // toJSON visitor
  Predicate.attachVisitor(function() {
    var visitor = {
      fnName: "toJSON",

      passthruPredicate: function () {
        return this.value;
      },

      unaryPredicate: function (config) {
        var json = {};
        json[this.op.key] = this.pred.toJSON(config);
        return json;
      },

      binaryPredicate: function (config) {
        var json = {};
        if (this.op.key === "eq") {
          json[this.expr1Source] = this.expr2.toJSON(config);
        } else {
          var value = {};
          json[this.expr1Source] = value;
          value[this.op.key] = this.expr2.toJSON(config);
        }
        return json;
      },

      andOrPredicate: function (config) {
        var json;
        var jsonValues = this.preds.map(function (pred) {
          return pred.toJSON(config);
        });
        // passthru predicate will appear as string and their 'ands' can't be 'normalized'
        if (this.op.key == 'or' || jsonValues.some(__isString)) {
          json = {};
          json[this.op.key] = jsonValues;
        } else {
          // normalize 'and' clauses
          json = jsonValues.reduce(combine);
        }
        return json;
      },

      anyAllPredicate: function (config) {
        var json = {};
        var value = {};

        var newConfig = __extend({}, config);
        newConfig.entityType = this.expr.dataType;
        value[this.op.key] = this.pred.toJSON(newConfig);
        json[this.exprSource] = value;
        return json;
      },

      litExpr: function (config) {
        if (this.hasExplicitDataType || config.useExplicitDataType) {
          return { value: this.value, dataType: this.dataType.name }
        } else {
          return this.value;
        }
      },

      propExpr: function (config) {
        if (config.toServer) {
          var entityType = config.entityType;
          return entityType ? entityType._clientPropertyPathToServer(this.propertyPath) : this.propertyPath;
        } else {
          return this.propertyPath;
        }
      },
      fnExpr: function (config) {
        var frags = this.exprArgs.map(function (expr) {
          return expr.toJSON(config);
        });
        return this.fnName + "(" + frags.join(",") + ")";
      }
    };

    function combine(j1, j2) {
      Object.keys(j2).forEach(function (key) {
        if (j1.hasOwnProperty(key)) {
          combine(j1[key], j2[key]);
        } else {
          j1[key] = j2[key];
        }
      })
      return j1;
    }

    return visitor;
  }());



  var RX_IDENTIFIER = /^[a-z_][\w.$]*$/i;
  // comma delimited expressions ignoring commas inside of both single and double quotes.
  var RX_COMMA_DELIM1 = /('[^']*'|[^,]+)/g;
  var RX_COMMA_DELIM2 = /("[^"]*"|[^,]+)/g;
  var DELIM = String.fromCharCode(191);

  function createExpr(source, entityType, is2ndExpr) {
    if (!__isString(source)) {
      if (source != null && __isObject(source) && (!__isDate(source))) {
        if (source.value === undefined) {
          throw new Error("Unable to resolve an expression for: " + source + " on entityType: " + entityType.name);
        }
        if (source.isProperty) {
          return new PropExpr(source.value);
        } else {
          // we want to insure that any LitExpr created this way is tagged with 'hasExplicitDataType: true'
          // because we want to insure that if we roundtrip thru toJSON that we don't
          // accidently reinterpret this node as a PropExpr.
          return new LitExpr(source.value, source.dataType || DataType.fromValue(source.value));
        }
      } else {
        return new LitExpr(source);
      }
    }

    // TODO: get rid of isAnonymous below when we get the chance.
    if (is2ndExpr && (entityType == null || entityType.isAnonymous)) {
      return new LitExpr(source )
    }

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

    var expr = parseExpr(source, tokens, entityType);
    expr.validate(entityType);
    return expr;
  }

  function parseExpr(source, tokens, entityType) {
    var parts = source.split(DELIM);
    if (parts.length === 1) {
      return parseLitOrPropExpr(parts[0], entityType);
    } else {
      return parseFnExpr(source, parts, tokens, entityType);
    }
  }

  function parseLitOrPropExpr(value, entityType) {
    value = value.trim();
    // value is either a string, a quoted string, a number, a bool value, or a date
    // if a string ( not a quoted string) then this represents a property name ( 1st ) or a lit string ( 2nd)
    var firstChar = value.substr(0, 1);
    var isQuoted = (firstChar === "'" || firstChar === '"') && value.length > 1 && value.substr(value.length - 1) === firstChar;
    if (isQuoted) {
      var unquotedValue = value.substr(1, value.length - 2);
      return new LitExpr(unquotedValue);
    } else {
      // TODO: get rid of isAnonymous below when we get the chance.
      if (entityType == null || entityType.isAnonymous) {
        // this fork will only be reached on the LHS of an BinaryPredicate -
        // a RHS expr cannot get here.
        return new PropExpr(value);
      } else {
        var mayBeIdentifier = RX_IDENTIFIER.test(value);
        if (mayBeIdentifier) {
          if (entityType.getProperty(value, false) != null) {
            return new PropExpr(value);
          }
        }
      }
      // we don't really know the datatype here because even though it comes in as a string
      // its usually a string BUT it might be a number  i.e. the "1" or the "2" from an expr
      // like "toUpper(substring(companyName, 1, 2))"
      return new LitExpr(value, DataType.Undefined);
    }
  }

  function parseFnExpr(source, parts, tokens, entityType) {
    try {
      var fnName = parts[0].trim().toLowerCase();

      var argSource = tokens[parts[1]].trim();
      if (argSource.substr(0, 1) === "(") {
        argSource = argSource.substr(1, argSource.length - 2);
      }
      var commaMatchStr = source.indexOf("'") >= 0 ? RX_COMMA_DELIM1 : RX_COMMA_DELIM2;
      var args = argSource.match(commaMatchStr);
      var exprArgs = args.map(function (a) {
        return parseExpr(a, tokens, entityType);
      });
      return new FnExpr(fnName, exprArgs);
    } catch (e) {
      return null;
    }
  }

  return Predicate;

})();

breeze.Predicate = Predicate;

