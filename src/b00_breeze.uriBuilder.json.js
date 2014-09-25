﻿(function (factory) {
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

  var ctor = function() {
    this.name = "json";
  };
  var proto = ctor.prototype;

  proto.initialize = function() {};

  proto.buildUri = function (entityQuery, metadataStore) {
    // force entityType validation;
    var entityType = entityQuery._getFromEntityType(metadataStore, false);

    var json = entityQuery.toJSONExt( { onServer: true});
    json.from = undefined;
    json.queryOptions = undefined;

    var jsonString = JSON.stringify(json);
    var urlBody = encodeURIComponent(jsonString);
    return entityQuery.resourceName + "?" + urlBody;

  };

  breeze.config.registerAdapter("uriBuilder", ctor);

}));



