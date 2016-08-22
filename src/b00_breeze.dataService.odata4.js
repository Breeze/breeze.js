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

  // Now override that parser
  
  var CsdlMetadataParserV3 = breeze.CsdlMetadataParser;

  var CsdlMetadataParserV4 = function () {
    this.version = 4;
  };

  breeze.core.extend(CsdlMetadataParserV4.prototype, CsdlMetadataParserV3);

}));