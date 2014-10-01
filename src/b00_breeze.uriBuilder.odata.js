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
      return wherePredicate.visit(toODataFragmentVisitor, { entityType: entityType});
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

  breeze.Predicate.prototype.toODataFragment = function(config) {
    return this.visit(toODataFragmentVisitor, config);
  }

  // toODataFragment visitor
  var toODataFragmentVisitor = (function () {
    var visitor = {

      passthruPredicate: function () {
        return this.value;
      },

      unaryPredicate: function (context, predVal) {
        return odataOpFrom(this) + " " + "(" + predVal + ")";
      },

      binaryPredicate: function (context, expr1Val, expr2Val) {
        var prefix = context.prefix;
        if (prefix) {
          expr1Val = prefix + "/" + expr1Val
        }

        var odataOp = odataOpFrom(this);

        if (this.op.isFunction) {
          if (odataOp == "substringof") {
            return odataOp + "(" + expr2Val + "," + expr1Val + ") eq true";
          } else {
            return odataOp + "(" + expr1Val + "," + expr2Val + ") eq true";
          }
        } else {
          return expr1Val + " " + odataOp + " " + expr2Val;
        }
      },

      andOrPredicate: function (context, predVals) {
        var result = predVals.map(function (predVal) {
          return "(" + predVal + ")";
        }).join(" " + odataOpFrom(this) + " ");
        return result;
      },

      anyAllPredicate: function (context, exprVal, predVal) {
        var prefix = context.prefix;
        if (prefix) {
          exprVal = prefix + "/" + exprVal;
          prefix = "x" + (parseInt(prefix.substring(1)) + 1);
        } else {
          prefix = "x1";
        }
        // can't use predVal because of prefix logic below.
        var newContext = breeze.core.extend({}, context);
        newContext.entityType = this.expr.dataType;
        newContext.prefix = prefix;
        var newPredVal = this.pred.visit(context.visitor, newContext)
        return exprVal + "/" + odataOpFrom(this) + "(" + prefix + ": " + newPredVal + ")";
      },

      litExpr: function () {
        return this.dataType.fmtOData(this.value);
      },

      propExpr: function (context) {
        var entityType = context.entityType;
        // '/' is the OData path delimiter
        return entityType ? entityType.clientPropertyPathToServer(this.propertyPath, "/") : this.propertyPath;
      },

      fnExpr: function (context, exprVals) {
        return this.fnName + "(" + exprVals.join(",") + ")";
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





