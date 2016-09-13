/**
 * we gonna treat the FunctionType as a very special "EntityType"
 * 
 * data properties will be the parameters
 * 
 * and
 * 
 * return data property
 */
var FunctionType = (function () {
  var __nextAnonIx = 0;

  var ctor = function FunctionType(config) {
    EntityType.call(this, config);      
    
    assertConfig(config)
          .whereParam("isBindable").isBoolean().isOptional().withDefault(false)
          .whereParam("isFunctionImport").isBoolean().isOptional().withDefault(false)
          .whereParam("entityType").isOptional().withDefault(null)
          .whereParam("returnType").isOptional().withDefault(null)
          .whereParam("httpMethod").isOptional().isString().withDefault('GET')
          .applyAll(this);

    // for function import
    // this.isFunctionImport = false;

    // for function (bound)
    // this.entityType = null;

    // if a function is not bound
    // then isFunctionImport == false && entityType == null

    // for return type
    // this.returnType = null;
  };
  var proto = ctor.prototype;
  var parseRawValue = DataType.parseRawValue;
  proto._$typeName = "FunctionType";
  ctor.qualifyTypeName = qualifyTypeName;

  // inherits from EntityType for the ease of query
  proto.__proto__ = EntityType.prototype;
  proto.constructor = FunctionType;

  return ctor;
})();