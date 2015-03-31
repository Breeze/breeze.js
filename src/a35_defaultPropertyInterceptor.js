function defaultPropertyInterceptor(property, newValue, rawAccessorFn) {
  // 'this' is the entity itself in this context.

  if (newValue === undefined) newValue = null;
  var oldValue = rawAccessorFn();

  var dataType = property.dataType;
  if (dataType && dataType.parse) {
    // attempts to coerce a value to the correct type - if this fails return the value unchanged
    if (Array.isArray(newValue) && !property.isScalar) {
      newValue = newValue.map(function (nv) {
        return dataType.parse(nv, typeof nv);
      });
    } else {
      newValue = dataType.parse(newValue, typeof newValue);
    }
  }

  // exit if no change - extra cruft is because dateTimes don't compare cleanly.
  if (newValue === oldValue || (dataType && dataType.isDate && newValue && oldValue && newValue.valueOf() === oldValue.valueOf())) {
    return;
  }

  // CANNOT DO NEXT LINE because it has the possibility of creating a new property
  // 'entityAspect' on 'this'.  - Not permitted by IE inside of a defined property on a prototype.
  // var entityAspect = new EntityAspect(this);

  var propertyName;
  var entityAspect = this.entityAspect;
  if (entityAspect) {
    propertyName = property.name;
  } else {
    var localAspect = this.complexAspect;
    if (localAspect) {
      entityAspect = localAspect.getEntityAspect();
      propertyName = localAspect.getPropertyPath(property.name);
    } else {
      // does not yet have an EntityAspect so just set the prop
      rawAccessorFn(newValue);
      return;
    }
  }

  // Note that we need to handle multiple properties in process, not just one in order to avoid recursion.
  // ( except in the case of null propagation with fks where null -> 0 in some cases.)
  // (this may not be needed because of the newValue === oldValue test above)
  var inProcess = entityAspect._inProcess = entityAspect._inProcess || [];
  // check for recursion
  if (inProcess.indexOf(property) >= 0) return;
  inProcess.push(property);

  try {

    var context = {
      parent: this,
      property: property,
      newValue: newValue,
      oldValue: oldValue,
      propertyName: propertyName,
      entityAspect: entityAspect
    }

    if (property.isComplexProperty) {
      setDpValueComplex(context, rawAccessorFn);
    } else if (property.isDataProperty) {
      setDpValueSimple(context, rawAccessorFn);
    } else {
      setNpValue(context, rawAccessorFn);
    }

    postChangeEvents(context);

  } finally {
    inProcess.pop();
  }
}

function setDpValueSimple(context, rawAccessorFn) {
  var parent = context.parent;
  var property = context.property;
  var entityAspect = context.entityAspect;
  var oldValue = context.oldValue;
  var newValue = context.newValue;

  var entityManager = entityAspect.entityManager;
  // 'entityType' on the next line be null for complex properties but it will only be ref'd within this
  // fn when the property is part of the key
  var entityType = parent.entityType;

  if (!property.isScalar) {
    throw new Error("Nonscalar data properties are readonly - items may be added or removed but the collection may not be changed.");
  }

  // store an original value for this property if not already set
  if (entityAspect.entityState.isUnchangedOrModified()) {
    var propName = property.name;
    // localAspect is not the same as entityAspect for complex props
    var localAspect = parent.entityAspect || parent.complexAspect;
    if (localAspect.originalValues[propName] === undefined) {
      // otherwise this entry will be skipped during serialization
      localAspect.originalValues[propName] = oldValue !== undefined ? oldValue : property.defaultValue;
    }
  }

  // if we are changing the key update our internal entityGroup indexes.
  if (property.isPartOfKey && entityManager && !entityManager.isLoading) {
    var keyProps = entityType.keyProperties;
    var values = keyProps.map(function (p) {
      if (p === property) {
        return newValue;
      } else {
        return parent.getProperty(p.name);
      }
    });
    var newKey = new EntityKey(entityType, values);
    if (entityManager.findEntityByKey(newKey)) {
      throw new Error("An entity with this key is already in the cache: " + newKey.toString());
    }
    var oldKey = parent.entityAspect.getKey();
    var eg = entityManager._findEntityGroup(entityType);
    eg._replaceKey(oldKey, newKey);
  }

  // process related updates ( the inverse relationship) first so that collection dups check works properly.
  // update inverse relationship

  var relatedNavProp = property.relatedNavigationProperty;
  if (relatedNavProp && entityManager) {
    // Example: bidirectional fkDataProperty: 1->n: order -> orderDetails
    // orderDetail.orderId <- newOrderId || null
    //    ==> orderDetail.order = lookupOrder(newOrderId)
    //    ==> (see set navProp above)
    //       and
    // Example: bidirectional fkDataProperty: 1->1: order -> internationalOrder
    // internationalOrder.orderId <- newOrderId || null
    //    ==> internationalOrder.order = lookupOrder(newOrderId)
    //    ==> (see set navProp above)

    if (newValue != null) {
      var key = new EntityKey(relatedNavProp.entityType, [newValue]);
      var relatedEntity = entityManager.findEntityByKey(key);

      if (relatedEntity) {
        parent.setProperty(relatedNavProp.name, relatedEntity);
      } else {
        // it may not have been fetched yet in which case we want to add it as an unattachedChild.
        entityManager._unattachedChildrenMap.addChild(key, relatedNavProp, parent);
        parent.setProperty(relatedNavProp.name, null);
      }
    } else {
      parent.setProperty(relatedNavProp.name, null);
    }
  } else if (property.inverseNavigationProperty && entityManager && !entityManager._inKeyFixup) {
    // Example: unidirectional fkDataProperty: 1->n: region -> territories
    // territory.regionId <- newRegionId
    //    ==> lookupRegion(newRegionId).territories.push(territory)
    //                and
    // Example: unidirectional fkDataProperty: 1->1: order -> internationalOrder
    // internationalOrder.orderId <- newOrderId
    //    ==> lookupOrder(newOrderId).internationalOrder = internationalOrder
    //                and
    // Example: unidirectional fkDataProperty: 1->n: region -> territories
    // territory.regionId <- null
    //    ==> lookupRegion(territory.oldRegionId).territories.remove(oldTerritory);
    //                and
    // Example: unidirectional fkDataProperty: 1->1: order -> internationalOrder
    // internationalOrder.orderId <- null
    //    ==> lookupOrder(internationalOrder.oldOrderId).internationalOrder = null;

    var invNavProp = property.inverseNavigationProperty;

    if (oldValue != null) {
      key = new EntityKey(invNavProp.parentType, [oldValue]);
      relatedEntity = entityManager.findEntityByKey(key);
      if (relatedEntity) {
        if (invNavProp.isScalar) {
          relatedEntity.setProperty(invNavProp.name, null);
        } else {
          // remove 'this' from old related nav prop
          var relatedArray = relatedEntity.getProperty(invNavProp.name);
          // arr.splice(arr.indexOf(value_to_remove), 1);
          relatedArray.splice(relatedArray.indexOf(parent), 1);
        }
      }
    }

    if (newValue != null) {
      key = new EntityKey(invNavProp.parentType, [newValue]);
      relatedEntity = entityManager.findEntityByKey(key);

      if (relatedEntity) {
        if (invNavProp.isScalar) {
          relatedEntity.setProperty(invNavProp.name, parent);
        } else {
          relatedEntity.getProperty(invNavProp.name).push(parent);
        }
      } else {
        // it may not have been fetched yet in which case we want to add it as an unattachedChild.
        entityManager._unattachedChildrenMap.addChild(key, invNavProp, parent);
      }
    }

  }

  rawAccessorFn(newValue);

  updateStateAndValidate(context);

  // if (property.isPartOfKey && (!this.complexAspect)) {
  if (property.isPartOfKey) {
    // propogate pk change to all related entities;

    var propertyIx = entityType.keyProperties.indexOf(property);
    // this part handles order.orderId => orderDetail.orderId
    // but won't handle product.productId => orderDetail.productId because product
    // doesn't have an orderDetails property.
    entityType.navigationProperties.forEach(function (np) {
      var inverseNp = np.inverse;
      var fkNames = inverseNp ? inverseNp.foreignKeyNames : np.invForeignKeyNames;

      if (fkNames.length === 0) return;
      var npValue = parent.getProperty(np.name);
      if (!npValue) return;
      var fkName = fkNames[propertyIx];
      if (np.isScalar) {
        npValue.setProperty(fkName, newValue);
      } else {
        npValue.forEach(function (iv) {
          iv.setProperty(fkName, newValue);
        });
      }
    });
    // this handles unidirectional problems not covered above.
    if (entityManager) {
      entityType.inverseForeignKeyProperties.forEach(function (invFkProp) {
        if (invFkProp.relatedNavigationProperty.inverse == null) {
          // this next step may be slow - it iterates over all of the entities in a group;
          // hopefully it doesn't happen often.
          entityManager._updateFkVal(invFkProp, oldValue, newValue);
        }
        ;
      });
    }

    // insure that cached key is updated.
    entityAspect.getKey(true);
  }
}

function setDpValueComplex(context, rawAccessorFn) {
  var property = context.property;
  var oldValue = context.oldValue;
  var newValue = context.newValue;

  var dataType = property.dataType;
  if (property.isScalar) {
    if (!newValue) {
      throw new Error(__formatString("You cannot set the '%1' property to null because it's datatype is the ComplexType: '%2'", property.name, property.dataType.name));
    }
    // To get here it must be a ComplexProperty
    // 'dataType' will be a complexType
    if (!oldValue) {
      var ctor = dataType.getCtor();
      oldValue = new ctor();
      rawAccessorFn(oldValue);
    }
    dataType.dataProperties.forEach(function (dp) {
      var pn = dp.name;
      var nv = newValue.getProperty(pn);
      oldValue.setProperty(pn, nv);
    });
  } else {
    throw new Error(__formatString("You cannot set the non-scalar complex property: '%1' on the type: '%2'." +
            "Instead get the property and use array functions like 'push' or 'splice' to change its contents.",
        property.name, property.parentType.name));
  }
}

function setNpValue(context, rawAccessorFn) {

  var parent = context.parent;
  var property = context.property;
  var entityAspect = context.entityAspect;
  var oldValue = context.oldValue;
  var newValue = context.newValue;

  if (!property.isScalar) {
    throw new Error("Nonscalar navigation properties are readonly - entities can be added or removed but the collection may not be changed.");
  }

  var entityManager = entityAspect.entityManager;
  var inverseProp = property.inverse;

  // manage attachment -
  if (newValue != null) {
    var newAspect = newValue.entityAspect;
    if (entityManager) {
      if (newAspect.entityState.isDetached()) {
        if (!entityManager.isLoading) {
          entityManager.attachEntity(newValue, EntityState.Added);
        }
      } else {
        if (newAspect.entityManager !== entityManager) {
          throw new Error("An Entity cannot be attached to an entity in another EntityManager. One of the two entities must be detached first.");
        }
      }
    } else {
      if (newAspect && newAspect.entityManager) {
        entityManager = newAspect.entityManager;
        if (!entityManager.isLoading) {
          entityManager.attachEntity(entityAspect.entity, EntityState.Added);
        }
      }
    }
  }

  // process related updates ( the inverse relationship) first so that collection dups check works properly.
  // update inverse relationship
  if (inverseProp) {
    ///
    if (inverseProp.isScalar) {
      // Example: bidirectional navProperty: 1->1: order -> internationalOrder
      // order.internationalOrder <- internationalOrder || null
      //    ==> (oldInternationalOrder.order = null)
      //    ==> internationalOrder.order = order
      if (oldValue != null) {
        // TODO: null -> NullEntity later
        oldValue.setProperty(inverseProp.name, null);
      }
      if (newValue != null) {
        newValue.setProperty(inverseProp.name, parent);
      }
    } else {
      // Example: bidirectional navProperty: 1->n: order -> orderDetails
      // orderDetail.order <- newOrder || null
      //    ==> (oldOrder).orderDetails.remove(orderDetail)
      //    ==> order.orderDetails.push(newOrder)
      if (oldValue != null) {
        var oldSiblings = oldValue.getProperty(inverseProp.name);
        var ix = oldSiblings.indexOf(parent);
        if (ix !== -1) {
          oldSiblings.splice(ix, 1);
        }
      }
      if (newValue != null) {
        var siblings = newValue.getProperty(inverseProp.name);
        // recursion check if already in the collection is performed by the relationArray
        siblings.push(parent);
      }
    }
  } else if (property.invForeignKeyNames && entityManager && !entityManager._inKeyFixup) {
    var invForeignKeyNames = property.invForeignKeyNames;
    if (newValue != null) {
      // Example: unidirectional navProperty: 1->1: order -> internationalOrder
      // order.InternationalOrder <- internationalOrder
      //    ==> internationalOrder.orderId = orderId
      //      and
      // Example: unidirectional navProperty: 1->n: order -> orderDetails
      // orderDetail.order <-xxx newOrder
      //    ==> CAN'T HAPPEN because if unidirectional because orderDetail will not have an order prop
      var pkValues = parent.entityAspect.getKey().values;
      invForeignKeyNames.forEach(function (fkName, i) {
        newValue.setProperty(fkName, pkValues[i]);
      });
    } else {
      // Example: unidirectional navProperty: 1->1: order -> internationalOrder
      // order.internationalOrder <- null
      //    ==> (old internationalOrder).orderId = null
      //        and
      // Example: unidirectional navProperty: 1->n: order -> orderDetails
      // orderDetail.order <-xxx newOrder
      //    ==> CAN'T HAPPEN because if unidirectional because orderDetail will not have an order prop
      if (oldValue != null) {
        invForeignKeyNames.forEach(function (fkName) {
          var fkProp = oldValue.entityType.getProperty(fkName);
          if (!fkProp.isPartOfKey) {
            // don't update with null if fk is part of the key
            oldValue.setProperty(fkName, null);
          }
        });
      }
    }
  }

  rawAccessorFn(newValue);

  updateStateAndValidate(context);

  // update fk data property - this can only occur if this navProperty has
  // a corresponding fk on this entity.
  if (property.relatedDataProperties) {
    var entityState = entityAspect.entityState;
    // if either side of nav prop is detached don't clear fks. Note: oldValue in next line cannot be null so no check is needed.
    if (newValue == null && (entityState.isDetached() || oldValue.entityAspect.entityState.isDetached())) return;
    if (entityState.isDeleted()) return;
    var inverseKeyProps = property.entityType.keyProperties;
    inverseKeyProps.forEach(function (keyProp, i) {
      var relatedDataProp = property.relatedDataProperties[i];
      // Do not trash related property if it is part of that entity's key
      if (newValue || !relatedDataProp.isPartOfKey) {
        var relatedValue = newValue ? newValue.getProperty(keyProp.name) : relatedDataProp.defaultValue;
        parent.setProperty(relatedDataProp.name, relatedValue);
      }
    });
  }
}

function postChangeEvents(context) {
  var entityAspect = context.entityAspect;

  var entityManager = entityAspect.entityManager;
  var entity = entityAspect.entity;

  var propChangedArgs = { entity: entity, parent: context.parent, property: context.property, propertyName: context.propertyName, oldValue: context.oldValue, newValue: context.newValue };
  if (entityManager) {
    // propertyChanged will be fired during loading but we only want to fire it once per entity, not once per property.
    // so propertyChanged is fired in the entityManager mergeEntity method if not fired here.
    if ((!entityManager.isLoading) && (!entityManager.isRejectingChanges)) {
      entityAspect.propertyChanged.publish(propChangedArgs);
      // don't fire entityChanged event if propertyChanged is suppressed.
      entityManager.entityChanged.publish({ entityAction: EntityAction.PropertyChange, entity: entity, args: propChangedArgs });
    }
  } else {
    entityAspect.propertyChanged.publish(propChangedArgs);
  }
}

function updateStateAndValidate(context) {
  var entityAspect = context.entityAspect;
  var entityManager = entityAspect.entityManager;
  if (entityManager == null || entityManager.isLoading) return;
  var property = context.property;

  if (entityAspect.entityState.isUnchanged() && !property.isUnmapped) {
    entityAspect.setModified();
  }

  if (entityManager.validationOptions.validateOnPropertyChange) {
    // entityAspect.entity is NOT the same as parent in the code below. It's use is deliberate.
    entityAspect._validateProperty(context.newValue,
        { entity: entityAspect.entity, property: property, propertyName: context.propertyName, oldValue: context.oldValue });
  }
}
