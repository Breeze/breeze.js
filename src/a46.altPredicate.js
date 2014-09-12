var AltPredicate = (function () {

    var Predicate = function () {
        if (arguments.length == 1) {
            var arg = arguments[0];
            if (Array.isArray(arg)) {
                return createPredicateFromArray(arg);
            } else if (typeof arguments[0] == 'string') {
                return new ODataPredicate(arg);
            } else {
                return createPredicateFromObject(arg);
            }
        } else {
            return createPredicateFromArray(Array.prototype.slice.call(arguments, 0));
        }
    };
    // so you can either say new Predicate(a, b, c) or Predicate.create(a, b, c);
    Predicate.create = Predicate;

    var createPredicateFromArray = function (arr) {
        // TODO: assert that length of the array should be 3 ( maybe 2)
        // Needs to handle:
        //      Predicate.create("freigt", ">", 100");
        //      Predicate.create("orders", "any", "freight",  ">", 950);
        var json = {};
        var value = {};
        json[arr[0]] = value;
        var op = arr[1];
        op = op.operator || op;
        if (arr.length == 3) {
            value[op] = arr[2];
        } else {
            value[op] = createPredicateFromArray(arr.splice(2));
        }
        return createPredicateFromObject(json);
    };

    var createPredicateFromObject = function (obj) {
        if (obj instanceof BasePredicate) return obj;
        
        if (typeof obj != 'object') {
            throw new Error("Unable to convert to a QueryNode: " + obj);
        }
        var keys = Object.keys(obj);
        if (keys.length != 1) {
            throw new Error("Unable to convert to a QueryNode ( object should only have a single key) " + obj);
        }
        var key = keys[0];
        var value = obj[key];
        if (AndOrPredicate.prototype.aliasMap[key]) {
            return new AndOrPredicate(key, value);
        } else if (UnaryPredicate.prototype.aliasMap[key]) {
            return new UnaryPredicate(key, value);  
        } else {
            var expr = key;
            if (typeof value != 'object') {
                throw new Error("Unable to convert to a query predicate: " + value);
            }
            keys = Object.keys(value);
            if (keys.length != 1) {
                throw new Error("Unable to convert to a query predicate ( argument should be an object with a single property): " + obj);
            }
            var op = keys[0];
            var exprOrNode = value[op];
            if (AnyAllPredicate.prototype.aliasMap[op]) {
                return new AnyAllPredicate(op, expr, exprOrNode);
            } else {
                return new BinaryPredicate(op, expr, exprOrNode);
            }
        }
    }
    
    var BasePredicate = (function() {
        var ctor = function (map) {
            var aliasMap = {};
            for (var key in map) {
                var value = map[key];
                value.key = key;
                // if not otherwise defined
                if (!value.odataOperator) value.odataOperator = key;
                aliasMap[key] = value;
                // always support the key with a $ in front
                aliasMap["$" + key] = value;
                value.aliases && value.aliases.forEach(function (alias) {
                    aliasMap[alias] = value;
                });
            }
            this.aliasMap = aliasMap;
        }
        var proto = ctor.prototype;

        proto.or = function(pred) {
            var realPred = Predicate(pred);
            return new AndOrPredicate("or", [this, realPred]);
        };
        
        proto.and = function (pred) {
            var realPred = Predicate(pred);
            return new AndOrPredicate("and", [this, realPred]);
        };

        proto._resolveOp = function (op) {
            var result;
            if (typeof (op) == 'string') {
                result = this.aliasMap[op];
            } else if (op.operator) {
                // handles if op is a FilterQueryOp;
                result = this.aliasMap[op.name];
            }
            if (!result) {
                throw new Error("Unable to resolve operator: " + op);
            }
            return result;
        };
        return ctor;
    })();

    var ODataPredicate = (function() {
        var ctor = function(odataExpr) {
            this.odataExpr = odataExpr;
        };
        ctor.prototype = new BasePredicate({});
    })(); 

    var UnaryPredicate = (function(op, node) {
        var ctor = function(op, node) {
            this.op = this._resolveOp(op);
            this.node = Predicate(node);
        };
        ctor.prototype = new BasePredicate({
            'not': {}
        });
        var proto = ctor.prototype;
        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.node.validate(entityType);
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            this.validate(entityType);
            switch (this.op.key) {
                case "not": 
                    var func = node.toFunction(entityType);
                    return function(entity) {
                        return !func(entity);
                    };
                default:
                    throw new Error("Invalid unary operator:" + this.op.key);
            }
        };

        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            return this.op.odataOperator + " " + "(" + this.node.toODataFragment(entityType, prefix) + ")";
        };

        proto.toString = function () {
            return this.op.odataOperator + " " + "(" + this.node.toString() + ")";
        };

        return ctor;
    })();

    var BinaryPredicate = (function() {
        var ctor = function (op, expr1, expr2) {
            this.op = this._resolveOp(op);
            this.expr1Source = expr1;
            this.expr2Source = expr2;
            // this.expr1 and this.expr2 won't be
            // determined until validate is run
        };

        ctor.create = function(obj) {
            if (typeof obj != 'object') {
                throw new Error("Unable to convert to a query predicate: " + obj);
            }
            var keys = Object.keys(obj);
            if (keys.length != 1) {
                throw new Error("Unable to convert to a query predicate ( argument should be an object with a single property): " + obj);
            }
            var key = keys[0];
            var value = obj[key];
            var expr1 = key;
            var valueKeys = Object.keys(value);
            if (valueKeys.length != 1) {
                throw new Error("Unable to convert to a query predicate ( argument should be an object with single property with a value that is also an object with a single property): " + node);
            }
            var op = valueKeys[0];
            var expr2 = value[op];
            return new BinaryPredicate(op, expr1, expr2);
        }

        var proto = ctor.prototype = new BasePredicate({
            'eq': {
                aliases: ["=="]
            },
            'ne': {
                aliases: ["!="]
            },
            'lt': {
                aliases: ["<" ]
            },
            'le': {
                aliases: ["<=", "lte"]
            },
            'gt': {
                aliases: [">"]
            },
            'ge': {
                aliases: [">=", "gte"]
            },
            'startsWith': {
                isFunction: true
            },
            'endsWith': {
                isFunction: true
            },
            'substringof': {
                aliases: ["contains"],
                isFunction: true
            }
        });


        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.expr1 = createExpr(this.expr1Source, entityType);
            if (this.expr1 == null) {
                throw new Error("Unable to validate 1st expression: " + this.expr1Source);
            }
            this.expr2 = createExpr(this.expr2Source, entityType);
            if (this.expr2 == null) {
                throw new Error("Unable to validate 2nd expression: " + this.expr2Source);
            }
            
            // TODO: think about passing expr1.dataType into createExpr
            this.expr2.dataType = this.expr1.dataType;

            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            if (this._odataExpr) {
                throw new Error("OData predicate expressions cannot be interpreted locally");
            }
            this.validate(entityType);

            var dataType = this.expr1.dataType || this.expr2.dataType;
            var predFn = getPredicateFn(entityType, this.op, dataType);
            var v1Fn = this.expr1.jsFn;

            var v2Fn = this.expr2.jsFn;
            return function (entity) {
                return predFn(v1Fn(entity), v2Fn(entity));
            };
        };

        proto.toODataFragment = function (entityType, prefix) {
            if (this._odataExpr) {
                return this._odataExpr;
            }
            this.validate(entityType);

            var v1Expr = this.expr1.toODataFragment(entityType);
            if (prefix) {
                v1Expr = prefix + "/" + v1Expr;
            }

            BasePredicate._next += 1;
            prefix = "x" + BasePredicate._next;
            
            var v2Expr = this.expr2.toODataFragment(entityType);
            var op = this.op;
            if (op.isFunction) {
                if (op.key == "substringof") {
                    return op.odataOperator + "(" + v2Expr + "," + v1Expr + ") eq true";
                } else {
                    return op.odataOperator + "(" + v1Expr + "," + v2Expr + ") eq true";
                }
            } else {
                return v1Expr + " " + op.odataOperator + " " + v2Expr;
            }

        };

        proto.toString = function () {
            return __formatString("{%1} %2 {%3}", this._propertyOrExpr, this._filterQueryOp.operator, this._value);
        };

        function getPredicateFn(entityType, op, dataType) {
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
                    predFn = function (v1, v2) { return mc(v1) > mc(v2); };
                    break;
                case 'ge':
                    predFn = function (v1, v2) { return mc(v1) >= mc(v2); };
                    break;
                case 'lt':
                    predFn = function (v1, v2) { return mc(v1) < mc(v2); };
                    break;
                case 'le':
                    predFn = function (v1, v2) { return mc(v1) <= mc(v2); };
                    break;
                case 'startsWith':
                    predFn = function (v1, v2) { return stringStartsWith(v1, v2, lqco); };
                    break;
                case 'endsWith':
                    predFn = function (v1, v2) { return stringEndsWith(v1, v2, lqco); };
                    break;
                case 'contains':
                    predFn = function (v1, v2) { return stringContains(v1, v2, lqco); };
                    break;
                default:
                    throw new Error("Unknown operator: " + op.key);

            }
            return predFn;
        }

        function getComparableFn(dataType) {
            if (dataType && dataType.isDate) {
                // dates don't perform equality comparisons properly 
                return function (value) { return value && value.getTime(); };
            } else if (dataType === DataType.Time) {
                // durations must be converted to compare them
                return function (value) { return value && __durationToSeconds(value); };
            } else {
                return function (value) { return value; };
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
    
        return ctor;
    })();

    var AndOrPredicate = (function() {
        var ctor = function(op, nodes) {
            this.op = this._resolveOp(op);
            // TODO: assert that nodes is an array
            this.nodes = nodes.map(function(node) {
                return Predicate(node);
            });
        };
        var proto = ctor.prototype = new BasePredicate({
            'and': {},
            'or': {}
        });

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.nodes.every(function (node) {
                node.validate(entityType);
            });
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            return createFunction(entityType, this.op, this.nodes);
        };
        
        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            var result = this.nodes.map(function (node) {
                return "(" + node.toODataFragment(entityType, prefix) + ")";
            }).join(" " + this.op.odataOperator + " ");
            return result;
        };

        proto.toString = function () {
            var result = this.nodes.map(function (node) {
                return "(" + node.toString() + ")";
            }).join(" " + this.op.odataOperator + " ");
            return result;
        };

        function createFunction(entityType, op, nodes) {
            var funcs = nodes.map(function (node) { return node.toFunction(entityType); });
            switch (op.key) {
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
        }
        
        return ctor;

    })();

    var AnyAllPredicate = function() {
        var ctor = function (op, expr, node) {
            this.op = this._resolveOp(op);
            this.exprSource = expr;
            // this.expr will not be resolved until validate is called
            this.node = Predicate(node);
        };
        ctor.prototype = new BasePredicate({
           'any': {},
           'all': {}
        });
        var proto = ctor.prototype;

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.expr = createExpr(this.exprSource, entityType);
            this.node.validate(this.expr.dataType);
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            this.validate(entityType);
            var v1Fn = this.expr1.jsFn;
            var predFn = getPredicateFn(op);
            var fn2 = this.node.toFunction(this.expr.dataType);
            return function (entity) {
                return predFn(v1Fn(entity), fn2);
            };
        };

        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            var v1Expr = this.expr.toODataFragment(entityType);
            if (prefix) {
                v1Expr = prefix + "/" + v1Expr;
            } 

            BasePredicate._next += 1;
            prefix = "x" + BasePredicate._next;
            
            return v1Expr + "/" + this.op.odataOperator + "(" + prefix + ": " + this.node.toODataFragment(this.expr.dataType, prefix) + ")";
        };

        proto.toString = function () {
            return __formatString("{%1} %2 {%3}", this.expr.toString(), this.op.odataOperator, this.node.toString());
        };

        function getPredicateFn(op) {
            switch (op.key) {
                case "any":
                    return function(v1, v2) { return v1.some(function(v) { return v2(v); }); };
                case "all":
                    return function(v1, v2) { return v1.every(function(v) { return v2(v); }); };
                default:
                    throw new Error("Unknown operator: " + op.key);
            }
        }

        return ctor;

    }();

    var LitExpr = (function() {
        var ctor = function(value, isQuoted, dataType) {
            this.value = value;
            this.unquotedValue = (isQuoted) ?
                value.substr(1, value.length - 2) :
                value;
            this.dataType = dataType;
        };
        var proto = ctor.prototype;

        proto.validate = function (entityType) {
            return;
        }

        proto.jsFn = function (entity) { return this.unquotedValue; };

        proto.toODataFragment = function() {
            return this.dataType.fmtOData(this.value);
        }

        proto.toString = function() {
            return this.value;
        }
        return ctor;
    })();

    var PropExpr = (function() {
        var ctor = function(propertyPath) {
            this.propertyPath = propertyPath;
            this.jsFn = createPropFunction(propertyPath);
            // this.dataType resolved after validate;
        };
        var proto = ctor.prototype;

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            if (entityType.isAnonymous) return;
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
            this._validatedEntityType = entityType;
        }

        proto.toODataFragment = function (entityType) {
            this.validate(entityType);
            return entityType._clientPropertyPathToServer(this.propertyPath);
        }
        
        proto.toString = function () {
            return this.propertyPath;
        };

        function createPropFunction(propertyPath) {
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
        }
        return ctor;
    })();

    var FnExpr = (function () {

        var ctor = function (fnName, exprArgs) {
            this.fnName = fnName;
            this.exprArgs = exprArgs;
            var qf = funcMap[fnName];
            if (qf == null) {
                throw new Error("Unknown function: " + fnName);
            }
            this.localFn = qf.fn;
            this.dataType = qf.dataType;
        };
        var proto = ctor.prototype;

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.exprArgs.forEach(function (expr) {
                expr.validate(entityType);
            });
            this._validatedEntityType = entityType;
        }

        proto.jsFn = function (entity) {
            var values = this.exprArgs.map(function (expr) {
                var value = expr.jsFn(entity);
                return value;
            });
            var result = this.localFn.apply(null, values);
            return result;
        };

        proto.toODataFragment = function (entityType) {
            this.validate(entityType);
            var frags = this.exprArgs.map(function (expr) {
                return expr.toODataFragment(entityType);
            });
            var result = this.fnName + "(" + frags.join(",") + ")";
            return result;
        }
        
        proto.toString = function () {
            var args = this.exprArgs.map(function (expr) {
                return expr.toString();
            });
            var uri = this.fnName + "(" + args.join(",") + ")";
            return uri;
        };

        var funcMap = ctor.funcMap = {

            toupper: { fn: function (source) { return source.toUpperCase(); }, dataType: DataType.String },
            tolower: { fn: function (source) { return source.toLowerCase(); }, dataType: DataType.String },
            substring: { fn: function (source, pos, length) { return source.substring(pos, length); }, dataType: DataType.String },
            substringof: { fn: function (find, source) { return source.indexOf(find) >= 0; }, dataType: DataType.Boolean },
            length: { fn: function (source) { return source.length; }, dataType: DataType.Int32 },
            trim: { fn: function (source) { return source.trim(); }, dataType: DataType.String },
            concat: { fn: function (s1, s2) { return s1.concat(s2); }, dataType: DataType.String },
            replace: { fn: function (source, find, replace) { return source.replace(find, replace); }, dataType: DataType.String },
            startswith: { fn: function (source, find) { return __stringStartsWith(source, find); }, dataType: DataType.Boolean },
            endswith: { fn: function (source, find) { return __stringEndsWith(source, find); }, dataType: DataType.Boolean },
            indexof: { fn: function (source, find) { return source.indexOf(find); }, dataType: DataType.Int32 },
            round: { fn: function (source) { return Math.round(source); }, dataType: DataType.Int32 },
            ceiling: { fn: function (source) { return Math.ceil(source); }, dataType: DataType.Int32 },
            floor: { fn: function (source) { return Math.floor(source); }, dataType: DataType.Int32 },
            second: { fn: function (source) { return source.getSeconds(); }, dataType: DataType.Int32 },
            minute: { fn: function (source) { return source.getMinutes(); }, dataType: DataType.Int32 },
            day: { fn: function (source) { return source.getDate(); }, dataType: DataType.Int32 },
            month: { fn: function (source) { return source.getMonth() + 1; }, dataType: DataType.Int32 },
            year: { fn: function (source) { return source.getFullYear(); }, dataType: DataType.Int32 }
        };

        return ctor;
    })();

    var RX_IDENTIFIER = /^[a-z_][\w.$]*$/i;
    // comma delimited expressions ignoring commas inside of quotes.
    var RX_COMMA_DELIM1 = /('[^']*'|[^,]+)/g;
    var RX_COMMA_DELIM2 = /("[^"]*"|[^,]+)/g;


    function createExpr(source, entityType) {
        if (typeof source !== 'string') {
            return new LitExpr(source, false, DataType.fromValue(source));            
        }
        var regex = /\([^()]*\)/;
        var m;
        var tokens = [];
        var i = 0;
        while (m = regex.exec(source)) {
            var token = m[0];
            tokens.push(token);
            var repl = ":" + i++;
            source = source.replace(token, repl);
        }

        var expr = parseExpr(source, tokens, entityType);
        expr.validate(entityType);
        return expr;
    }

    function parseExpr(source, tokens, entityType) {
        var parts = source.split(":");
        if (parts.length === 1) {
            return parseLitOrPropExpr(parts[0], entityType);
        } else {
            return parseFnExpr(parts, tokens, entityType);
        }
    }

    function parseLitOrPropExpr(value, entityType) {
        value = value.trim();
        // value is either a string, a quoted string, a number, a bool value, or a date
        // if a string ( not a quoted string) then this represents a property name ( 1st ) or a lit string ( 2nd)
        var firstChar = value.substr(0, 1);
        var isQuoted = (firstChar === "'" || firstChar === '"') && value.length > 1 && value.substr(value.length - 1) === firstChar;
        if (isQuoted) {
            return new LitExpr(value, true, DataType.String);
        } else {
            var mayBeIdentifier = RX_IDENTIFIER.test(value);
            if (mayBeIdentifier) {
                if (entityType.getProperty(value, false) != null) {
                    return new PropExpr(value);
                } 
            } 
            return new LitExpr(value, false, DataType.String);
        }
    }

    function parseFnExpr(parts, tokens, entityType) {
        try {
            this.fnName = parts[0].trim().toLowerCase();

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

breeze.AltPredicate = AltPredicate;

