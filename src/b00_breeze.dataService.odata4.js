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

  // OData v2 / v3 adapter
  var odataAdapterCtor = breeze.config.getAdapter("dataService", "odata");
  // OData 4 adapter
  var odata4Ctor = function () {
      this.name = "OData4";
  };

  breeze.core.extend(odata4Ctor.prototype, odataAdapterCtor.prototype);
  odata4Ctor.prototype.initialize = function () {
      if (!window.odatajs) {
          breeze.core.requireLib("odatajs", "Needed to support remote OData v4 services");
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
  if (!constraint) {
    // TODO: Revisit this later - right now we just ignore many-many and assocs with missing constraints.

    // Think about adding this back later.
    if (association.end[0].multiplicity == "*" && association.end[1].multiplicity == "*") {
      // ignore many to many relations for now
      return;
    } else {
      // For now assume it will be set later directly on the client.
      // other alternative is to throw an error:
      // throw new Error("Foreign Key Associations must be turned on for this model");
    }
  }

  var cfg = {
    nameOnServer: csdlProperty.name,
    entityTypeName: dataType,
    isScalar: isScalar,
    associationName: association.name
  };

  if (constraint) {
    var principal = constraint.principal;
    var dependent = constraint.dependent;

    var propRefs = __toArray(dependent.propertyRef);
    var fkNames = propRefs.map(__pluck("name"));
    if (csdlProperty.fromRole === principal.role) {
      cfg.invForeignKeyNamesOnServer = fkNames;
    } else {
      // will be used later by np._update
      cfg.foreignKeyNamesOnServer = fkNames;
    }
  }

  var np = new NavigationProperty(cfg);
  entityType._addPropertyCore(np);
  return np;
}; // End of parseCsdlNavProperty

var csdlMetadataParserV4 = new CsdlMetadataParserV4Ctor();

breeze.csdlMetadataParserV4 = csdlMetadataParserV4;
