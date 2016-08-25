/**
 * Consider merge code from : https://github.com/metavine/breezejs-odata4-adapter/blob/master/breezeOdataV4Adapter.js
 * 
 * which is the results of:
 * 
 *  Michael and Travis Schettler 
 */
(function (factory) {
  if (typeof breeze === "object") {
    factory(breeze);
  } else if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
    // CommonJS or Node: hard-coded dependency on "breeze"
    factory(require("breeze-client"));
  } else if (typeof define === "function" && define["amd"]) {
    // AMD anonymous module with hard-coded dependency on "breeze"
    define(["breeze"], factory);
  }
}(function (breeze) {
    "use strict";
    var core = breeze.core;

    var DataType = {};
    core.extend(DataType, breeze.DataType);

    function fmtFloatV4(val) {
        if (val === null) return null;
        if (typeof val === "string") {
            val = parseFloat(val);
        }
        return val;
    }

    function fmtDateTimeV4(val) {
        if (val === null) return null;
        try {
            return val.toISOString();
        } catch (e) {
            throwError("'%1' is not a valid dateTime", val);
        }
    }

    function fmtDateTimeOffsetV4(val) {
        if (val === null) return null;
        try {
            return val.toISOString();
        } catch (e) {
            throwError("'%1' is not a valid dateTime", val);
        }
    }

    function fmtTimeV4(val) {
        if (val === null) return null;
        if (!core.isDuration(val)) {
            throwError("'%1' is not a valid ISO 8601 duration", val);
        }
        return val;
    }

    function fmtGuidV4(val) {
        if (val === null) return null;
        if (!core.isGuid(val)) {
            throwError("'%1' is not a valid guid", val);
        }
        return val;
    }

    function throwError(msg, val) {
        msg = core.formatString(msg, val);
        throw new Error(msg);
    }

    DataType.Int64.fmtOData = fmtFloatV4;
    DataType.Decimal.fmtOData = fmtFloatV4;
    DataType.Double.fmtOData = fmtFloatV4;
    DataType.DateTime.fmtOData = fmtDateTimeV4;
    DataType.DateTimeOffset.fmtOData = fmtDateTimeOffsetV4;
    DataType.Time.fmtOData = fmtTimeV4;
    DataType.Guid.fmtOData = fmtGuidV4;

  // OData v2 / v3 adapter
  var odataAdapterCtor = breeze.config.getAdapter("dataService", "odata");
  // OData 4 adapter
  var odata4Ctor = function () {
      this.name = "OData4";
      this.DataType = DataType;
  };

  breeze.core.extend(odata4Ctor.prototype, odataAdapterCtor.prototype);
  odata4Ctor.prototype.initialize = function () {
      if (!window.odatajs) {
          breeze.core.requireLib(breeze.odatajsLib || "odatajs", "Needed to support remote OData v4 services");
      }
      this.OData = window.odatajs.oData;
  };

  odata4Ctor.prototype.headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;odata.metadata=minimal',
      "Odata-Version": "4.0",
      "OData-MaxVersion": "4.0",
      "Prefer": "odata.allow-entityreferences"
  };
  breeze.config.registerAdapter("dataService", odata4Ctor);

}));

// Now override that parser

var CsdlMetadataParserCtorV3 = breeze.CsdlMetadataParser;

var CsdlMetadataParserV4Ctor = function () {
  this.version = 4;
};

breeze.core.extend(CsdlMetadataParserV4Ctor.prototype, breeze.csdlMetadataParser);

CsdlMetadataParserV4Ctor.prototype.parseCsdlNavProperty = function (entityType, csdlProperty, schema, schemas) {
  var constraint = csdlProperty.referentialConstraint;
  var isScalar = false;
  var dataType = this.parseTypeNameWithSchema(csdlProperty.type, schema).typeName;

  var cfg = {
    nameOnServer: csdlProperty.name,
    entityTypeName: dataType,
    isScalar: isScalar,
  };

  if (constraint) {
    var propRefs = __toArray(constraint);
    var fkNames = propRefs.map(__pluck("referencedProperty"));
    var inFkNames = propRefs.map(__pluck("property"));
    cfg.invForeignKeyNamesOnServer = inFkNames;
    cfg.foreignKeyNamesOnServer = fkNames;
  }

  var np = new NavigationProperty(cfg);
  entityType._addPropertyCore(np);
  return np;
}; // End of parseCsdlNavProperty

var csdlMetadataParserV4 = new CsdlMetadataParserV4Ctor();

breeze.csdlMetadataParserV4 = csdlMetadataParserV4;
