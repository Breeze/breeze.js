var Predicate = (function () {
    
    var Predicate = function () {
        if (arguments.length == 1) {
            // 3 possibilities: 
            //      Predicate(aPredicate)
            //      Predicate([ aPredicate ])
            //      Predicate(["freight", ">", 100"])
            //      Predicate( "freight gt 100" }  // odata string
            //      Predicate( { freight: { ">": 100 } })
            var arg = arguments[0];
            if (Array.isArray(arg)) {
                if (arg.length == 1) {
                    // recurse
                    return Predicate(arg[0]);
                } else {
                    return createPredicateFromArray(arg);
                }
            } else if (arg instanceof BasePredicate) {
                return arg;
            } else if (typeof arg == 'string') {
                return new ODataPredicate(arg);
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
    Predicate.create = Predicate;

    Predicate.and = function () {
        return new AndOrPredicate("and", __arraySlice(arguments));
    }
    
    Predicate.or = function () {
        return new AndOrPredicate("or", __arraySlice(arguments));
    }
    
    var createPredicateFromArray = function (arr) {
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

    var createPredicateFromObject = function (obj) {
        if (obj instanceof BasePredicate) return obj;
        
        if (typeof obj != 'object') {
            throw new Error("Unable to convert to a Predicate: " + obj);
        }
        var keys = Object.keys(obj);
        var preds = keys.map(function(key) {
            return createPredicateFromKeyValue(key, obj[key]);
        });
        return (preds.length === 1) ? preds[0] : new AndOrPredicate("and", preds);
    }
    
    function createPredicateFromKeyValue(key, value) {

        // { and: [a,b] } key='and', value = {a,b}
        if (AndOrPredicate.prototype._resolveOp(key, true)) {
            return new AndOrPredicate(key, value);
        }

        // { not: a }  key= 'not', value = a
        if (UnaryPredicate.prototype._resolveOp(key, true)) {
            return new UnaryPredicate(key, value);  
        } 
        
        if ((typeof value !== 'object') || value == null || __isDate(value)) {
            return new BinaryPredicate("==", key, value);
        }

        var expr = key;
        var keys = Object.keys(value);
        var preds = keys.map(function(op) {
            
            // { a: { any: b } op = 'any', expr=a, exprOrPred = b
            if (AnyAllPredicate.prototype._resolveOp(op, true)) {
                return new AnyAllPredicate(op, expr, value[op]);
            }

            // { a: { ">": b }} op = ">", expr=a, exprOrPred = b
            if (BinaryPredicate.prototype._resolveOp(op, true)) {
                return new BinaryPredicate(op, expr, value[op]);
            }

            throw new Error("Unable to resolve predicate for operator: " + op + " and value: " + value[op]);

        });

        return (preds.length === 1) ? preds[0] : new AndOrPredicate("and", preds);
    
    }
    
    var BasePredicate = (function() {
        var ctor = function (map) {
            var aliasMap = {};
            for (var key in map) {
                var value = map[key];
                // if not otherwise defined
                if (!value.odataOperator) value.odataOperator = key;
                var aliasKey = key.toLowerCase();
                value.key = aliasKey;
                aliasMap[aliasKey] = value;
                // always support the key with a $ in front
                aliasMap["$" + aliasKey] = value;
                value.aliases && value.aliases.forEach(function (alias) {
                    aliasMap[alias.toLowerCase()] = value;
                });
            }
            this.aliasMap = aliasMap;
        }
        
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
        
        proto._resolveOp = function (op, okIfNotFound) {
            op = op.operator || op;
            var result = this.aliasMap[op.toLowerCase()];           
            if (!result && !okIfNotFound) {
                throw new Error("Unable to resolve operator: " + op);
            }
            return result;
        };
        
        proto.toJSON = function() {
            
        }

        return ctor;
    })();

    var ODataPredicate = (function() {
        var ctor = function(odataExpr) {
            this.odataExpr = odataExpr;
        };
        var proto = ctor.prototype = new BasePredicate({});

        proto.validate = function(entityType) { };
        
        proto.toFunction = function (entityType) {
            throw new Error("Cannot execute an OData expression against the local cache: " + this.odataExpr);
        };
        
        proto.toString = proto.toODataFragment = function (entityType, prefix) {
            return this.odataExpr;
        };
        
        return ctor;
    })(); 

    var UnaryPredicate = (function() {
        var ctor = function(op, pred) {
            this.op = this._resolveOp(op);
            this.pred = Predicate(pred);
        };
        var proto = ctor.prototype = new BasePredicate({
            'not': { aliases: [ '!' ] }
        });
        
        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.pred.validate(entityType);
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            this.validate(entityType);
            switch (this.op.key) {
                case "not": 
                    var func = this.pred.toFunction(entityType);
                    return function(entity) {
                        return !func(entity);
                    };
                default:
                    throw new Error("Invalid unary operator:" + this.op.key);
            }
        };

        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            return this.op.odataOperator + " " + "(" + this.pred.toODataFragment(entityType, prefix) + ")";
        };
        
        proto.toJSON = function () {
            var json = {};
            json["$" + this.op.key] = this.pred.toJSON();
        }


        proto.toString = function () {
            return this.op.odataOperator + " " + "(" + this.pred.toString() + ")";
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
            'startswith': {
                isFunction: true
            },
            'endswith': {
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
            if (this.expr1 instanceof LitExpr) {
                // lhs must be either a property or a function.
                throw new Error("Not a valid property or function predicate expression: " + this.expr1Source);
            }
            if (entityType.isAnonymous) {
                // with an anonymous entity type expr1 will always be a Prop of FnExpr and expr2 will always be literal.
                this.expr2 = new LitExpr(this.expr2Source, DataType.fromValue(this.expr2Source));
            } else {
                this.expr2 = createExpr(this.expr2Source, entityType);
                if (this.expr2 == null) {
                    throw new Error("Unable to validate 2nd expression: " + this.expr2Source);
                }
            }

            
            if (this.expr1.dataType != DataType.Undefined) {
                this.expr2.dataType = this.expr1.dataType;
            } else {
                this.expr1.dataType = this.expr2.dataType;
            }

            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {

            this.validate(entityType);

            var dataType = this.expr1.dataType || this.expr2.dataType;
            var predFn = getPredicateFn(entityType, this.op, dataType);
            var v1Fn = this.expr1.toFunction();
            var v2Fn = this.expr2.toFunction();
            return function (entity) {
                return predFn(v1Fn(entity), v2Fn(entity));
            };
        };

        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);

            var v1Expr = this.expr1.toODataFragment(entityType);
            if (prefix) {
                v1Expr = prefix + "/" + v1Expr;
            }
           
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
        
        proto.toJSON = function () {
            var json = {};
            if (this.op.key === "eq") {
                json[this.expr1Source] = this.expr2Source;
            } else {
                var value = {};
                json[this.expr1Source] = value;
                value["$" + this.op.key] = this.expr2Source;
                //if (this.expr2 == null) {
                //    // TODO: need to rework this.
                //    this.validate(null);
                //}
                // value["$" + this.op.key] = this.expr2.toJSON();
                
            }
            return json;
        }

        proto.toString = function () {
            return __formatString("{%1} %2 {%3}", this.expr1Source, this.op.odataOperator, this.expr2Source);
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
                case 'startswith':
                    predFn = function (v1, v2) { return stringStartsWith(v1, v2, lqco); };
                    break;
                case 'endswith':
                    predFn = function (v1, v2) { return stringEndsWith(v1, v2, lqco); };
                    break;
                case 'substringof':
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
        var ctor = function(op, preds) {
            this.op = this._resolveOp(op);
            if (preds.length == 1 && Array.isArray(preds[0])) {
                preds = preds[0];
            }
            this.preds = preds.filter(function(pred) {
                return pred != null;
            }).map(function(pred) {
                return Predicate(pred);
            });
        };

        var proto = ctor.prototype = new BasePredicate({
                'and': { aliases: [ '&&' ] },
                'or':  { aliases: [ '||' ] }
        });

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.preds.every(function (pred) {
                pred.validate(entityType);
            });
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            return createFunction(entityType, this.op, this.preds);
        };
        
        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            var result = this.preds.map(function (pred) {
                return "(" + pred.toODataFragment(entityType, prefix) + ")";
            }).join(" " + this.op.odataOperator + " ");
            return result;
        };
        
        
        proto.toJSON = function () {
            var json = {};
            var value = this.preds.map(function(pred) {
                return pred.toJSON();
            });
            json["$" + this.op.key] = value;
            return json;
        }
        
        proto.toString = function () {
            var result = this.preds.map(function (pred) {
                return "(" + pred.toString() + ")";
            }).join(" " + this.op.odataOperator + " ");
            return result;
        };

        function createFunction(entityType, op, preds) {
            var funcs = preds.map(function (pred) { return pred.toFunction(entityType); });
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

    var AnyAllPredicate = function () {

        var ctor = function (op, expr, pred) {
            this.op = this._resolveOp(op);
            this.exprSource = expr;
            // this.expr will not be resolved until validate is called
            this.pred = Predicate(pred);
        };

        var proto = ctor.prototype = new BasePredicate({
           'any': { aliases: ["some"]},
           'all': { aliases: ["every"] }
        });

        proto.validate = function (entityType) {
            if (this._validatedEntityType === entityType) return;
            this.expr = createExpr(this.exprSource, entityType);
            this.pred.validate(this.expr.dataType);
            this._validatedEntityType = entityType;
        };

        proto.toFunction = function (entityType) {
            this.validate(entityType);
            var v1Fn = this.expr.toFunction();
            var predFn = getPredicateFn(this.op);
            var fn2 = this.pred.toFunction(this.expr.dataType);
            return function (entity) {
                return predFn(v1Fn(entity), fn2);
            };
        };

        proto.toODataFragment = function (entityType, prefix) {
            this.validate(entityType);
            var v1Expr = this.expr.toODataFragment(entityType);
            if (prefix) {
                v1Expr = prefix + "/" + v1Expr;
                prefix = "x" + (parseInt(prefix.substring(1)) + 1);
            } else {
                prefix = "x1";
            }
            
            return v1Expr + "/" + this.op.odataOperator + "(" + prefix + ": " + this.pred.toODataFragment(this.expr.dataType, prefix) + ")";
        };
        
        proto.toJSON = function () {
            var json = {};
            var value = {};
            value["$" + this.op.key] = this.pred.toJSON();
            json[exprSource] = value;
            return json;
        }

        proto.toString = function () {
            return __formatString("{%1} %2 {%3}", this.expr.toString(), this.op.odataOperator, this.pred.toString());
        };

        function getPredicateFn(op) {
            switch (op.key) {
                case "any":
                    return function(v1, v2) { return v1.some(function(v)  { return v2(v); }); };
                case "all":
                    return function(v1, v2) { return v1.every(function(v) { return v2(v); }); };
                default:
                    throw new Error("Unknown operator: " + op.key);
            }
        }

        return ctor;

    }();

    var LitExpr = (function () {

        var ctor = function(value, dataType) {
            this.value = value;
            this.dataType = dataType;
        };
        var proto = ctor.prototype;
        
        proto.validate = function (entityType) {
            return;
        }
        
        proto.toFunction = function () {
            var value = this.value;
            return function (entity) { return value; };
        }

        proto.toODataFragment = function() {
            return this.dataType.fmtOData(this.value);
        }
        
        proto.toJSON = function () {
            return value;
        }

        proto.toString = function() {
            return this.value;
        }

        return ctor;
    })();

    var PropExpr = (function () {

        var ctor = function(propertyPath) {
            this.propertyPath = propertyPath;
            this.dataType = DataType.Undefined;
            // this.dataType resolved after validate ( if not on an anon type }
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
        
        proto.toFunction = function () {
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
        }
        
        proto.toJSON = function () {
            return this.propertyPath;
        }
        
        proto.toString = function () {
            return this.propertyPath;
        };
        
        return ctor;
    })();

    var FnExpr = (function() {

        var ctor = function(fnName, exprArgs) {
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


        proto.validate = function(entityType) {
            if (this._validatedEntityType === entityType) return;
            this.exprArgs.forEach(function(expr) {
                expr.validate(entityType);
            });
            this._validatedEntityType = entityType;
        }

        proto.toFunction = function () {
            var that = this;
            return function(entity) {
                var values = that.exprArgs.map(function(expr) {
                    var value = expr.toFunction()(entity);
                    return value;
                });
                var result = that.localFn.apply(null, values);
                return result;
            }
        };
    

        proto.toODataFragment = function (entityType) {
            this.validate(entityType);
            var frags = this.exprArgs.map(function (expr) {
                return expr.toODataFragment(entityType);
            });
            var result = this.fnName + "(" + frags.join(",") + ")";
            return result;
        }
        
        proto.toJSON = function () {
            var frags = this.exprArgs.map(function (expr) {
                return expr.toJSON();
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
    // comma delimited expressions ignoring commas inside of both single and double quotes.
    var RX_COMMA_DELIM1 = /('[^']*'|[^,]+)/g;
    var RX_COMMA_DELIM2 = /("[^"]*"|[^,]+)/g;
    var DELIM = String.fromCharCode(191);

    function createExpr(source, entityType) {
        if (typeof source !== 'string') {
            if (source != null && source.isLiteral) {
                source = source.value;
            }
            return new LitExpr(source, DataType.fromValue(source));
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
            return new LitExpr(unquotedValue, DataType.String);
        } else {
            if (entityType.isAnonymous) {
                // this fork will only be reached for an anon type on the LHS of an BinaryPredicate
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

