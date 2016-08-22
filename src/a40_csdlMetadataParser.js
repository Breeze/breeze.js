var CsdlMetadataParser = (function () {

  this.parse = function (metadataStore, schemas, altMetadata) {

    metadataStore._entityTypeResourceMap = {};
    schemas = __toArray(schemas);
    schemas.forEach(function (schema) {
      if (schema.cSpaceOSpaceMapping) {
        // Web api only - not avail in OData.
        var mappings = JSON.parse(schema.cSpaceOSpaceMapping);
        var newMap = {};
        mappings.forEach(function (mapping) {
          newMap[mapping[0]] = mapping[1];
        });
        schema.cSpaceOSpaceMapping = newMap;
      }

      if (schema.entityContainer) {
        __toArray(schema.entityContainer).forEach(function (container) {
          __toArray(container.entitySet).forEach(function (entitySet) {
            var entityTypeName = this.parseTypeNameWithSchema(entitySet.entityType, schema).typeName;
            metadataStore.setEntityTypeForResourceName(entitySet.name, entityTypeName);
            metadataStore._entityTypeResourceMap[entityTypeName] = entitySet.name;
          });
        });
      }

      // process complextypes before entity types.
      if (schema.complexType) {
        __toArray(schema.complexType).forEach(function (ct) {
          var complexType = this.parseCsdlComplexType(ct, schema, metadataStore);
        });
      }
      if (schema.entityType) {
        __toArray(schema.entityType).forEach(function (et) {
          var entityType = this.parseCsdlEntityType(et, schema, schemas, metadataStore);

        });
      }

    });
    var badNavProps = metadataStore.getIncompleteNavigationProperties();
    if (badNavProps.length > 0) {
      var msg = badNavProps.map(function(npa) {
        if (Array.isArray(npa)) {
          return npa.map(function(np) {
            return np.parentType.name + ":" + np.name;
          }).join(', ');
        }
        return npa.parentType.name + ":" + npa.name;
      }).join(', ');
      throw new Error("Incomplete navigation properties: " + msg);
    }
    if (altMetadata) {
      metadataStore.importMetadata(altMetadata, true);
    }
    return metadataStore;
  }

  this.parseCsdlEntityType = function (csdlEntityType, schema, schemas, metadataStore) {
    var shortName = csdlEntityType.name;
    var ns = this.getNamespaceFor(shortName, schema);
    var entityType = new EntityType({
      shortName: shortName,
      namespace: ns,
      isAbstract: csdlEntityType.abstract && csdlEntityType.abstract === 'true'
    });
    if (csdlEntityType.baseType) {
      var baseTypeName = this.parseTypeNameWithSchema(csdlEntityType.baseType, schema).typeName;
      entityType.baseTypeName = baseTypeName;
      var baseEntityType = metadataStore._getEntityType(baseTypeName, true);
      if (baseEntityType) {
        this.completeParseCsdlEntityType(entityType, csdlEntityType, schema, schemas, metadataStore);
      } else {
        var deferrals = metadataStore._deferredTypes[baseTypeName];
        if (!deferrals) {
          deferrals = [];
          metadataStore._deferredTypes[baseTypeName] = deferrals;
        }
        deferrals.push({ entityType: entityType, csdlEntityType: csdlEntityType });
      }
    } else {
      this.completeParseCsdlEntityType(entityType, csdlEntityType, schema, schemas, metadataStore);
    }
    // entityType may or may not have been added to the metadataStore at this point.
    return entityType;

  };

  this.completeParseCsdlEntityType = function (entityType, csdlEntityType, schema, schemas, metadataStore) {
    // from v4 EntityType can has * keys
    var keyNamesOnServer = [];
    
    if (csdlEntityType.key) {
      if (Array.isArray(csdlEntityType.key)) {
        csdlEntityType.key.forEach(function (key) {
          keyNamesOnServer = keyNamesOnServer.concat(__toArray(key.propertyRef).map(__pluck("name")));
        });
      }
      else {
        keyNamesOnServer = __toArray(csdlEntityType.key.propertyRef).map(__pluck("name"));
      }
    } 

    __toArray(csdlEntityType.property).forEach(function (prop) {
      this.parseCsdlDataProperty(entityType, prop, schema, keyNamesOnServer);
    });

    __toArray(csdlEntityType.navigationProperty).forEach(function (prop) {
      this.parseCsdlNavProperty(entityType, prop, schema, schemas);
    });

    metadataStore.addEntityType(entityType);
    entityType.defaultResourceName = metadataStore._entityTypeResourceMap[entityType.name];

    var deferredTypes = metadataStore._deferredTypes;
    var deferrals = deferredTypes[entityType.name];
    if (deferrals) {
      deferrals.forEach(function (d) {
        this.completeParseCsdlEntityType(d.entityType, d.csdlEntityType, schema, schemas, metadataStore);
      });
      delete deferredTypes[entityType.name];
    }

  }

  this.parseCsdlComplexType = function (csdlComplexType, schema, metadataStore) {
    var shortName = csdlComplexType.name;
    var ns = this.getNamespaceFor(shortName, schema);
    var complexType = new ComplexType({
      shortName: shortName,
      namespace: ns
    });

    __toArray(csdlComplexType.property).forEach(function (prop) {
      this.parseCsdlDataProperty(complexType, prop, schema);
    });

    metadataStore.addEntityType(complexType);
    return complexType;
  };

  this.parseCsdlDataProperty = function (parentType, csdlProperty, schema, keyNamesOnServer) {
    var dp;
    var typeParts = csdlProperty.type.split(".");
    // Both tests on typeParts are necessary because of differing metadata conventions for OData and Edmx feeds.
    if (typeParts[0] === "Edm" && typeParts.length === 2) {
      dp = this.parseCsdlSimpleProperty(parentType, csdlProperty, keyNamesOnServer);
    } else {
      if (this.isEnumType(csdlProperty, schema)) {
        dp = this.parseCsdlSimpleProperty(parentType, csdlProperty, keyNamesOnServer);
        if (dp) {
          dp.enumType = csdlProperty.type;
        }
      } else {
        dp = this.parseCsdlComplexProperty(parentType, csdlProperty, schema);
      }
    }
    if (dp) {
      parentType._addPropertyCore(dp);
      this.addValidators(dp);
    }
    return dp;
  }

  this.parseCsdlSimpleProperty = function (parentType, csdlProperty, keyNamesOnServer) {
    var dataType = DataType.fromEdmDataType(csdlProperty.type);
    if (dataType === null) {
      parentType.warnings.push("Unable to recognize DataType for property: " + csdlProperty.name + " DateType: " + csdlProperty.type);
      return null;
    }
    var isNullable = csdlProperty.nullable === 'true' || csdlProperty.nullable == null;
    // var fixedLength = csdlProperty.fixedLength ? csdlProperty.fixedLength === true : undefined;
    var isPartOfKey = keyNamesOnServer != null && keyNamesOnServer.indexOf(csdlProperty.name) >= 0;
    if (isPartOfKey && parentType.autoGeneratedKeyType === AutoGeneratedKeyType.None) {
      if (this.isIdentityProperty(csdlProperty)) {
        parentType.autoGeneratedKeyType = AutoGeneratedKeyType.Identity;
      }
    }
    // TODO: nit - don't set maxLength if null;
    var maxLength = csdlProperty.maxLength;
    maxLength = (maxLength == null || maxLength === "Max") ? null : parseInt(maxLength, 10);
    // can't set the name until we go thru namingConventions and these need the dp.


    var dp = new DataProperty({
      nameOnServer: csdlProperty.name,
      dataType: dataType,
      isNullable: isNullable,
      isPartOfKey: isPartOfKey,
      maxLength: maxLength,
      defaultValue: csdlProperty.defaultValue,
      // fixedLength: fixedLength,
      concurrencyMode: csdlProperty.concurrencyMode
    });

    if (dataType === DataType.Undefined) {
      dp.rawTypeName = csdlProperty.type;
    }
    return dp;
  };

  this.parseCsdlComplexProperty = function (parentType, csdlProperty, schema) {

    // Complex properties are never nullable ( per EF specs)
    // var isNullable = csdlProperty.nullable === 'true' || csdlProperty.nullable == null;
    // var complexTypeName = csdlProperty.type.split("Edm.")[1];
    var complexTypeName = this.parseTypeNameWithSchema(csdlProperty.type, schema).typeName;
    // can't set the name until we go thru namingConventions and these need the dp.
    var dp = new DataProperty({
      nameOnServer: csdlProperty.name,
      complexTypeName: complexTypeName,
      isNullable: false
    });

    return dp;
  };

  this.parseCsdlNavProperty = function (entityType, csdlProperty, schema, schemas) {
    var association = this.getAssociation(csdlProperty, schema, schemas);
    if (!association) {
      if (csdlProperty.relationship)
        throw new Error("Unable to resolve Foreign Key Association: " + csdlProperty.relationship);
      else
        return;
    }
    var toEnd = __arrayFirst(association.end, function (assocEnd) {
      return assocEnd.role === csdlProperty.toRole;
    });

    var isScalar = toEnd.multiplicity !== "*";
    var dataType = this.parseTypeNameWithSchema(toEnd.type, schema).typeName;

    var constraint = association.referentialConstraint;
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
  };

  this.isEnumType = function (csdlProperty, schema) {
    if (schema.enumType) return this.isEdmxEnumType(csdlProperty, schema);
    else if (schema.extensions) return this.isODataEnumType(csdlProperty, schema);
    else return false;
  };

  this.isEdmxEnumType= function (csdlProperty, schema) {
    var enumTypes = __toArray(schema.enumType);
    var typeParts = csdlProperty.type.split(".");
    var baseTypeName = typeParts[typeParts.length - 1];
    return enumTypes.some(function (enumType) {
      return enumType.name === baseTypeName;
    });
  };

  this.isODataEnumType = function (csdlProperty, schema) {
    var enumTypes = schema.extensions.filter(function (ext) {
      return ext.name === "EnumType";
    });
    var typeParts = csdlProperty.type.split(".");
    var baseTypeName = typeParts[typeParts.length - 1];
    return enumTypes.some(function (enumType) {
      return enumType.attributes.some(function (attr) {
        return attr.name === "Name" && attr.value === baseTypeName;
      });
    });
  };

  this.addValidators = function (dataProperty) {
    var typeValidator;
    if (!dataProperty.isNullable) {
      dataProperty.validators.push(Validator.required());
    }

    if (dataProperty.isComplexProperty) return;

    if (dataProperty.dataType === DataType.String) {
      if (dataProperty.maxLength) {
        var validatorArgs = { maxLength: dataProperty.maxLength };
        typeValidator = Validator.maxLength(validatorArgs);
      } else {
        typeValidator = Validator.string();
      }
    } else {
      typeValidator = dataProperty.dataType.validatorCtor();
    }

    dataProperty.validators.push(typeValidator);

  };

  this.isIdentityProperty = function (csdlProperty) {
    // see if web api feed
    var propName = __arrayFirst(Object.keys(csdlProperty), function (pn) {
      return pn.indexOf("StoreGeneratedPattern") >= 0;
    });
    if (propName) {
      return (csdlProperty[propName] === "Identity");
    } else {
      // see if Odata feed
      var extensions = csdlProperty.extensions;
      if (!extensions) {
        return false;
      }
      var identityExtn = __arrayFirst(extensions, function (extension) {
        return extension.name === "StoreGeneratedPattern" && extension.value === "Identity";
      });
      return !!identityExtn;
    }
  };

  // Fast version
  // np: schema.entityType[].navigationProperty.relationship -> schema.association
  //   match( shortName(np.relationship) == schema.association[].name
  //      --> association__

  // Correct version
  // np: schema.entityType[].navigationProperty.relationship -> schema.association
  //   match( np.relationship == schema.entityContainer[0].associationSet[].association )
  //      -> associationSet.name
  //   match ( associationSet.name == schema.association[].name )
  //      -> association

  this.getAssociation = function (csdlNavProperty, containingSchema, schemas) {
    var assocFullName = this.parseTypeNameWithSchema(csdlNavProperty.relationship, containingSchema);
    if (!assocFullName) return null;
    var assocNamespace = assocFullName.namespace;
    var assocSchema = __arrayFirst(schemas, function (schema) {
      return schema.namespace === assocNamespace;
    });
    if (!assocSchema) return null;
    
    var assocName = assocFullName.shortTypeName;
    var assocs = assocSchema.association;
    if (!assocs) return null;
    if (!Array.isArray(assocs)) {
      assocs = [assocs];
    }
    var association = __arrayFirst(assocs, function (assoc) {
      return assoc.name === assocName;
    });
    return association;
  };

  // schema is only needed for navProperty type name
  this.parseTypeNameWithSchema = function (entityTypeName, schema) {
    var result = this.parseTypeName(entityTypeName);
    if (schema && schema.cSpaceOSpaceMapping) {
      var ns = this.getNamespaceFor(result.shortTypeName, schema);
      if (ns) {
        result = makeTypeHash(result.shortTypeName, ns);
      }
    }
    return result;
  };

  this.getNamespaceFor = function (shortName, schema) {
    var ns;
    var mapping = schema.cSpaceOSpaceMapping;
    if (mapping) {
      var fullName = mapping[schema.namespace + "." + shortName];
      ns = fullName && fullName.substr(0, fullName.length - (shortName.length + 1));
      if (ns) return ns;
    }
    // if schema does not also have an entityType node then
    // this is an WebApi2 OData schema which is usually equal to 'Default'; which is useless.
    if (schema.entityType || schema.namespace != 'Default') {
      return schema.namespace;
    }
    return null;
  }

  return {
    parse: this.parse
  };

})();

breeze.CsdlMetadataParser = CsdlMetadataParser; // export the parser too for version 4 parser overriding