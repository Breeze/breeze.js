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
}(function (breeze) {
  "use strict";
  var EntityType = breeze.EntityType;

  var ctor = function() {
    this.name = "odata";
  };
  var proto = ctor.prototype;

  proto.initialize = function() {};

  proto.buildUri = function (entityQuery, metadataStore) {
    // force entityType validation;
    var entityType = entityQuery._getFromEntityType(metadataStore, false);
    if (!entityType) {
      // anonymous type but still has naming convention info avail
      entityType = new EntityType(metadataStore);
    }

    var queryOptions = {};
    queryOptions["$filter"] = toWhereODataFragment(entityQuery.wherePredicate);
    queryOptions["$orderby"] = toOrderByODataFragment(entityQuery.orderByClause);

    if (entityQuery.skipCount) {
      queryOptions["$skip"] = entityQuery.skipCount;
    }

    if (entityQuery.takeCount != null) {
      queryOptions["$top"] = entityQuery.takeCount;
    }

    queryOptions["$expand"] = toExpandODataFragment(entityQuery.expandClause);
    queryOptions["$select"] = toSelectODataFragment(entityQuery.selectClause);

    if (entityQuery.inlineCountEnabled) {
      queryOptions["$inlinecount"] = "allpages";
    }

    var qoText = toQueryOptionsString(queryOptions);
    return entityQuery.resourceName + qoText;

    // private methods to this func.

    function toWhereODataFragment(wherePredicate) {
      if (!wherePredicate) return;
      // validation occurs inside of the toODataFragment call here.
      return wherePredicate.toODataFragment({ entityType: entityType});
    }

    function toOrderByODataFragment(orderByClause) {
      if (!orderByClause) return;
      orderByClause.validate(entityType);
      var strings = orderByClause.items.map(function (item) {
        return entityType.clientPropertyPathToServer(item.propertyPath, "/") + (item.isDesc ? " desc" : "");
      });
      // should return something like CompanyName,Address/City desc
      return strings.join(',');
    };

    function toSelectODataFragment(selectClause) {
      if (!selectClause) return;
      selectClause.validate(entityType);
      var frag = selectClause.propertyPaths.map(function (pp) {
        return  entityType.clientPropertyPathToServer(pp, "/");
      }).join(",");
      return frag;
    };

    function toExpandODataFragment(expandClause) {
      if (!expandClause) return;
      // no validate on expand clauses currently.
      // expandClause.validate(entityType);
      var frag = expandClause.propertyPaths.map(function (pp) {
        return entityType.clientPropertyPathToServer(pp, "/");
      }).join(",");
      return frag;
    };

    function toQueryOptionsString(queryOptions) {
      var qoStrings = [];
      for (var qoName in queryOptions) {
        var qoValue = queryOptions[qoName];
        if (qoValue !== undefined) {
          if (qoValue instanceof Array) {
            qoValue.forEach(function (qov) {
              qoStrings.push(qoName + "=" + encodeURIComponent(qov));
            });
          } else {
            qoStrings.push(qoName + "=" + encodeURIComponent(qoValue));
          }
        }
      }

      if (qoStrings.length > 0) {
        return "?" + qoStrings.join("&");
      } else {
        return "";
      }
    }
  };




  // toODataFragment visitor
  breeze.Predicate.attachVisitor(function () {
    var visitor = {
      config: { fnName: "toODataFragment"   },

      passthruPredicate: function () {
        return this.value;
      },

      unaryPredicate: function (context) {
        return odataOpFrom(this) + " " + "(" + this.pred.toODataFragment(context) + ")";
      },

      binaryPredicate: function (context) {
        var v1Expr = this.expr1.toODataFragment(context);
        var prefix = context.prefix;
        if (prefix) {
          v1Expr = prefix + "/" + v1Expr;
        }

        var v2Expr = this.expr2.toODataFragment(context);

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

      andOrPredicate: function (context) {
        var result = this.preds.map(function (pred) {
          return "(" + pred.toODataFragment(context) + ")";
        }).join(" " + odataOpFrom(this) + " ");
        return result;
      },

      anyAllPredicate: function (context) {
        var v1Expr = this.expr.toODataFragment(context);

        var prefix = context.prefix;
        if (prefix) {
          v1Expr = prefix + "/" + v1Expr;
          prefix = "x" + (parseInt(prefix.substring(1)) + 1);
        } else {
          prefix = "x1";
        }
        var newConfig = breeze.core.extend({}, context);
        newConfig.entityType = this.expr.dataType;
        newConfig.prefix = prefix;
        return v1Expr + "/" + odataOpFrom(this) + "(" + prefix + ": " + this.pred.toODataFragment(newConfig) + ")";
      },

      litExpr: function () {
        return this.dataType.fmtOData(this.value);
      },

      propExpr: function (context) {
        var entityType = context.entityType;
        // '/' is the OData path delimiter
        return entityType ? entityType.clientPropertyPathToServer(this.propertyPath, "/") : this.propertyPath;
      },

      fnExpr: function (context) {
        var frags = this.exprArgs.map(function (expr) {
          return expr.toODataFragment(context);
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

  breeze.config.registerAdapter("uriBuilder", ctor);

}));





