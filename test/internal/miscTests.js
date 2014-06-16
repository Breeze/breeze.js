/*********************
 * ES 5 RO Property tests
 * No Breeze. No dependencies.
 **********************/
(function() {
    // DO NOT SET OPTION STRICT as we are trying to prove how it behaves with and w/o that

    // Only run this module if defineProperty is supported
    var definePropertyIsSupported;
    try {
        Object.getPrototypeOf && Object.defineProperty({}, 'x', {});
        definePropertyIsSupported = true;
    } catch (e) {
        definePropertyIsSupported = false;
    }
    if (!definePropertyIsSupported) { return; } // don't bother with these tests

    module("misc - ES5 Property tests", {
        setup: setup
    });
    var obj, proto;

    function setup() {
        var ctor = function (name) { this.name = name || 'test'};
        proto = ctor.prototype;
        proto.setProperty = function (propertyName, value) {
            'use strict'; // because setup intentionally defined where there is no 'use strict'
            this[propertyName] = value;           
            return this; // allow setProperty chaining.
        };
        Object.defineProperty(proto, 'foo', {
            get: function() { return 42; },
            enumerable: true,
            configurable: true
        });

        Object.defineProperty(proto, 'bar', {
            value: 84,
            writable: false,
            enumerable: true,
            configurable: true
        });
        obj = new ctor();
    }

    test("'foo' property's 'writable' flag is undefined because test has a getter", function() {
        var def = Object.getOwnPropertyDescriptor(proto, 'foo');
        ok(def.writable === undefined);
    });
    test("'bar' property is not writable because is a value property wtesth that flag set to false", function() {
        var def = Object.getOwnPropertyDescriptor(proto, 'bar');
        ok(def.writable === false);
    });
    test("can set 'foo' property's 'writable' flag even though test has a getter", function() {
        'use strict';
        var def = Object.getOwnPropertyDescriptor(proto, 'foo');
        def.writable = false;
        ok(def.writable === false);
    });
    test("and NOT STRICT, foo reassignment is harmless", function() {
        obj.foo = 100;
        ok(obj.foo === 42);
    });
    test("and NOT STRICT, bar reassignment is harmless", function() {
        obj.bar = 100;
        ok(obj.bar === 84);
    });
    test("and USE STRICT, foo reassignment throws", function() {
        'use strict';
        throws(function() { obj.foo = 100; },
            TypeError//("Cannot set property foo of #<Object> which has only a getter")
        );
    });

    test("and USE STRICT, obj.foo=obj.foo throws", function () {
        'use strict';
        throws(function () { obj.foo = obj.foo; },
            TypeError//("Cannot set property foo of #<Object> which has only a getter")
        );
    });
    test("and USE STRICT, obj['foo']=obj.foo throws", function () {
        'use strict';
        throws(function () { obj['foo'] = obj.foo; }, 
            TypeError//("Cannot set property foo of #<Object> which has only a getter")
        );
    });
    ////////////////////////////////////////////
    // IE11 bug: this['foo'] not same as this.foo
    //test("and USE STRICT, obj.setProperty('foo', obj.foo) throws", function () {
    //    'use strict';
    //    throws(function () { obj.setProperty('foo', obj.foo); }, // DOES NOT THROW IN IE11 !!!
    //        TypeError//("Cannot set property foo of #<Object> which has only a getter")
    //    );
    //});
    ///////////////////
    test("and USE STRICT, bar reassignment throws", function() {
        'use strict';
        throws(function() { obj.bar = 100; },
            TypeError//("Cannot assign to read only property 'bar' of #<Object>")
        );
    });
    test("and USE STRICT, foo reassignment within try/catch is harmless", function() {
        /* Model for proposed Breeze change */
        'use strict';
        try {
            obj.foo = 100;
        } catch (e) {
            if (!(e instanceof TypeError)) {
                throw e; // unexpected error type
            }
        }
        ok(obj.foo === 42);
    });
    test("and USE STRICT, bar reassignment within try/catch is harmless", function() {
        /* Model for proposed Breeze change */
        'use strict';
        try {
            obj.bar = 100;
        } catch (e) {
            if (!(e instanceof TypeError)) {
                throw e; // unexpected error type
            }
        }
        ok(obj.bar === 84);
    });
})();

/*********************
 * ORIGINAL MISC TESTS
 **********************/
(function (testFns) {
    var breeze = testFns.breeze;
    var core = breeze.core;
    
    var MetadataStore = breeze.MetadataStore;

    var Enum = core.Enum;
    var EntityManager = breeze.EntityManager;
    var EntityQuery = breeze.EntityQuery;
    var EntityType = breeze.EntityType;
    var NamingConvention = breeze.NamingConvention;

    var newEm = testFns.newEm;

    module("misc", {
        setup: function () {
            testFns.setup();
        },
        teardown: function () {

        }
    });

    var toJSONSafe = core.toJSONSafe;

   

    function testNcRoundTrip(nc, name, isClientName) {
        if (isClientName) {
            var sName = nc.clientPropertyNameToServer(name, parent);
            var testName = nc.serverPropertyNameToClient(sName, parent);
        } else {
            var cName = nc.serverPropertyNameToClient(name, parent);
            var testName = nc.clientPropertyNameToServer(name, parent);
        }
        Assert.IsTrue(testName == name, "unable to roundtrip from " + (isClientName ? 'client' : 'server') + " name: " + name);
    }

    /*********************************************************
      * exception in ajax adapter should be caught in promise
      * Because Breeze bug "2590 dataserviceadapter throws if ajax call throws",
      * the exception bubbles out synchronously and the test fails
      *********************************************************/
    test("exception in ajax adapter should be caught in promise", 1, function () {
        // var em = newEm();
        var em = new breeze.EntityManager('/bad/address/');
        var wasCaught = false;

        var adapter = breeze.config.getAdapterInstance('ajax');
        var origAjax = adapter.ajax;
        // Make sure the ajaxAdapter throws when used
        // if you leave this line and bug #2590 is not fixed, the test will fail
        // Regardless, if you comment this out, then the "bad url" will be caught properly
        // and passed to the catch and the test passes
        adapter.ajax = function () { throw new Error('some error in the ajax adapter'); };
        stop();
        try {
            EntityQuery.from("Todos").using(em).execute()
                .catch(function () {
                    wasCaught = true;
                })
                .finally(fin);
        } catch (e) {
            ok(false, "the attempt to query with bad adapter threw sync exception");
            start();
        } finally {
            // restore ajax adapter regardless
            adapter.ajax = origAjax;
        }

        function fin() {
            ok(wasCaught, "the attempt to query a bad endpoint was passed to the promise's catch");
            start();
        }
    });


    test("importBug", function() {
        // test import of entities
        var serviceName = 'breeze/NorthBreeze'; // route to the (same origin) Web Api controller
        var manager = new breeze.EntityManager(serviceName); // gets metadata from /breeze/NorthBreeze/Metadata

        // define the metadata to import
        var metadata = {
            "localQueryComparisonOptions": "caseInsensitiveSQL",
            "structuralTypes": [
                {
                    "shortName": "Agent",
                    "namespace": "BL",
                    "baseTypeName": "SystemUser:#BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Agents",
                    "dataProperties": [
                        {
                            "nameOnServer": "Telephone",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Mobile",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "SystemUser",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "SystemUsers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Username",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Password",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PermissionProfileId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "PermissionProfile",
                            "entityTypeName": "Profile:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Profile_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "PermissionProfileId"
                            ]
                        },
                        {
                            "nameOnServer": "PermissionUserModules",
                            "entityTypeName": "UserModule:#BL.Permissions",
                            "isScalar": false,
                            "associationName": "AN_SystemUser_UserModule",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "PermissionUserActions",
                            "entityTypeName": "UserAction:#BL.Permissions",
                            "isScalar": false,
                            "associationName": "AN_SystemUser_UserAction",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Capacity",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Capacities",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NumberOfAdults",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NumberOfChilds",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NumberOfJuniors",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NumberOfInfants",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DisplayOrder",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "OrderActionProtocolLine",
                    "namespace": "BL.Protocols",
                    "baseTypeName": "OrderProtocolLine:#BL.Protocols",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderActionProtocolLines",
                    "dataProperties": [
                        {
                            "nameOnServer": "ActionType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Protocols.BaseProtocolLine+ActionTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "URL",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "OrderChangeProtocolLine",
                    "namespace": "BL.Protocols",
                    "baseTypeName": "OrderProtocolLine:#BL.Protocols",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderChangeProtocolLines",
                    "dataProperties": [
                        {
                            "nameOnServer": "EntityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NewValue",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OldValue",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ChangeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Protocols.BaseProtocolLine+ChangeTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PropertyName",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "OrderProtocolLine",
                    "namespace": "BL.Protocols",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderProtocolLines",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChangedById",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ChangedBy",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_OrderProtocolLine_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "ChangedById"
                            ]
                        },
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_Order_OrderProtocolLine",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderProductType",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderProductTypes",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProductType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ProductTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CommissionPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PayingToProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IncomeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+IncomeType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PayToPaymentMethod",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PayToPaymentMethod, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VATPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Provider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "ProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "PayingToProvider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "PayingToProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "ProductTypeCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderProducts",
                            "entityTypeName": "ProviderProduct:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_ProviderProduct_ProviderProductType",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ProductTypeFixedRemarks",
                            "entityTypeName": "ProviderProductTypeFixedRemark:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_ProviderProductType_ProviderProductTypeFixedRemark",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "InvoiceDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "baseTypeName": "BaseInvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "InvoiceDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "CompanyId",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "InvoiceServices",
                            "entityTypeName": "InvoiceDocumentService:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_InvoiceDocument_InvoiceDocumentService"
                        },
                        {
                            "nameOnServer": "InvoiceReceipt",
                            "entityTypeName": "InvoiceReceipt:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_InvoiceDocument_InvoiceReceipt"
                        }
                    ]
                },
                {
                    "shortName": "BaseInvoiceDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "baseTypeName": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BaseInvoiceDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "VatTotalPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ServicesTotalAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraTotalAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PayTo",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ProviderInvoiceDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "baseTypeName": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderInvoiceDocuments",
                    "dataProperties": [],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProviderVoucherInvoice",
                            "entityTypeName": "ProviderVoucherInvoice:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_ProviderInvoiceDocument_ProviderVoucherInvoice"
                        }
                    ]
                },
                {
                    "shortName": "ProviderVoucherDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "baseTypeName": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderVoucherDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "ServiceBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "SubServiceBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IfSendedToProvider",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReferenceNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PaymentDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GrossPriceVatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GrossPriceVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GrossPriceExcludeVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionVatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionExcludeVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPriceVatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPriceVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPriceExcludeVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionVatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionExcludeVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionVatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionExcludeVat",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Tax",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PFee",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CreditMCO",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalProviderInvoice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionInvoice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPaid",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalDeposits",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPayOrder",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IncomeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+IncomeType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ServiceBase",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_ProviderVoucherDocument_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "ServiceBaseId"
                            ]
                        },
                        {
                            "nameOnServer": "SubServiceBase",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_ProviderVoucherDocument_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "SubServiceBaseId"
                            ]
                        },
                        {
                            "nameOnServer": "Provider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ProviderVoucherDocument",
                            "foreignKeyNamesOnServer": [
                                "ProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderVoucherInvoice",
                            "entityTypeName": "ProviderVoucherInvoice:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_ProviderVoucherDocument_ProviderVoucherInvoice"
                        },
                        {
                            "nameOnServer": "ProviderVouchersPayOrder",
                            "entityTypeName": "ProviderVoucherPayOrder:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_ProviderVoucherDocument_ProviderVoucherPayOrder"
                        }
                    ]
                },
                {
                    "shortName": "ReceiptDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "baseTypeName": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ReceiptDocuments",
                    "dataProperties": [],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Payments",
                            "entityTypeName": "BasePayment:#BL.Orders",
                            "isScalar": false,
                            "associationName": "AN_BasePayment_ReceiptDocument"
                        },
                        {
                            "nameOnServer": "InvoiceReceipt",
                            "entityTypeName": "InvoiceReceipt:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_InvoiceReceipt_ReceiptDocument"
                        }
                    ]
                },
                {
                    "shortName": "BaseAccountingDocument",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BaseAccountingDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "BaseAccountingDocumentId",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RecipientName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DocumentNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Remarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Total",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DocumentType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+AccountingDocumentType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Status",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+AccountingDocumentStatus, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsOriginalPrinted",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExportedBatchNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReceiptFor",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SystemUserId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DateOfPrint",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountMovement",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_BaseAccountingDocument_Order",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        },
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_BaseAccountingDocument",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "Currency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_BaseAccountingDocument_Currency",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "SystemUser",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_BaseAccountingDocument_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "SystemUserId"
                            ]
                        },
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_BaseAccountingDocument_Customer",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "HotelChain",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "HotelChains",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Credit2000ErrorCode",
                    "namespace": "BL.CreditcardClearingCompanySettings",
                    "autoGeneratedKeyType": "None",
                    "defaultResourceName": "Credit2000ErrorCodes",
                    "dataProperties": [
                        {
                            "nameOnServer": "Code",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "CountryRegion",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CountryRegions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CountryId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Currency",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Currencies",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrentRate",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DisplayOrder",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InternationalCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LocalCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsLocal",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Currency",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CustomerCreditCard",
                    "namespace": "BL.Customers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CustomerCreditCards",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreditCardNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Token",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Terminal",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderFirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderLastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderIdNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExpireDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CardType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+CreditCardTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CVV",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_Customer_CustomerCreditCard",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CustomerDocument",
                    "namespace": "BL.Documents",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CustomerDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DocumentAttachmentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "DocumentAttachment",
                            "entityTypeName": "DocumentAttachment:#BL.Documents",
                            "isScalar": true,
                            "associationName": "AN_CustomerDocument_DocumentAttachment",
                            "foreignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_Customer_CustomerDocument",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CustomerAddress",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CustomerAddresss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Country",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "City",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Street",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "StreetNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Zip",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ExternalSysCurrency",
                    "namespace": "BL.ExternalSystems",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ExternalSysCurrencies",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExtSystem",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ExternalSystems, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Code",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "YTourCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_ExternalSysCurrency",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ServiceRemarks",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ServiceRemarkss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RemarksFromClient",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RemarksFromProvider",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RemarksToClient",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RemarksToProvider",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OfficeRemarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CancellationPolicyRemarks",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Port",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Ports",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IATACode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Longitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Latitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Port+PortTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Tax",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "City",
                            "entityTypeName": "City:#BL",
                            "isScalar": true,
                            "associationName": "AN_City_Port",
                            "foreignKeyNamesOnServer": [
                                "CityId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "DefAgencyProviders",
                    "namespace": "BL.Agencies",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "DefAgencyProviderss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProductType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ProductTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Provider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_DefAgencyProviders_Provider",
                            "foreignKeyNamesOnServer": [
                                "ProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_DefAgencyProviders",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "NumberOfParticipants",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "NumberOfParticipantss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Adults",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Childs",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Infants",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "SystemTag",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "SystemTags",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Tag",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "OrderSaleAccountingInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderSaleAccountingInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "UnitPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DiscountPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DiscountAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "MarkUpAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "MarkUpPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AdditionPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AdditionFee",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CancellationFee",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VAT",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VATPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalInvoice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalReciept",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalProfitAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalProfitPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalVCHR",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "OrderCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_OrderSaleAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ExtSysInterfaceSystemId",
                    "namespace": "BL.ExternalSystems",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ExtSysInterfaceSystemIds",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExtSysId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IntefaceSystemID",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Bank",
                    "namespace": "BL.Banks",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Banks",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Code",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Bank",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "BankAccounts",
                            "entityTypeName": "BankAccount:#BL.Banks",
                            "isScalar": false,
                            "associationName": "AN_Bank_BankAccount",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "SaleAccountingPriceInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "SaleAccountingPriceInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrencyRate",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UnitPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DiscountPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DiscountAmount",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MarkUpAmount",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MarkUpPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AdditionPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AdditionFee",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CancellationFee",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VAT",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VATPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "OrderCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_SaleAccountingPriceInfo",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_SaleAccountingPriceInfo",
                            "foreignKeyNamesOnServer": [
                                "ProviderCurrencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "RoomType",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "RoomTypes",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HotelId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Hotel",
                            "entityTypeName": "Hotel:#BL",
                            "isScalar": true,
                            "associationName": "AN_Hotel_RoomType",
                            "foreignKeyNamesOnServer": [
                                "HotelId"
                            ]
                        },
                        {
                            "nameOnServer": "Capacities",
                            "entityTypeName": "RoomTypeCapacity:#BL",
                            "isScalar": false,
                            "associationName": "AN_RoomType_RoomTypeCapacity",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Credit2000Settings",
                    "namespace": "BL.CreditcardClearingCompanySettings",
                    "baseTypeName": "BaseCreditcardClearingCompanySettings:#BL.CreditcardClearingCompanySettings",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Credit2000Settingss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Language",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "BaseCreditcardClearingCompanySettings",
                    "namespace": "BL.CreditcardClearingCompanySettings",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BaseCreditcardClearingCompanySettingss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Username",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Password",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "JNum",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MinPayments",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MaxPayments",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceURL",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Terminal",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ProviderProductTypeFixedRemark",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderProductTypeFixedRemarks",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderProductTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderCreateFrom",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderCreateTo",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceStartDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceEndDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Remark",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ServiceProviderAccountingInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ServiceProviderAccountingInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountingPriceInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderedFrom",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PayTo",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PaidBy",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PaidBy, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PayToPaymentMethod",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PayToPaymentMethod, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ClientPayMethod",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ClientPayMethod, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IncomeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+IncomeType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "InvoiceInBrutto",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ValueDate",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ValueDate, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AccountingRemarksFromProvider",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AccountingRemarksToProvider",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissonConfirmedBy",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OfficeRemarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Status",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ServiceProviderAccountingInfoStatus, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "CostAccountingInfo",
                            "entityTypeName": "CostAccountingPriceInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_CostAccountingPriceInfo_ServiceProviderAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "AccountingPriceInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "OrderedFromProvider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ServiceProviderAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "OrderedFrom"
                            ]
                        },
                        {
                            "nameOnServer": "PayToProvider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ServiceProviderAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "PayTo"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BusinessAgentContactPerson",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BusinessAgentContactPersons",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ContactPersonId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "BusinessAgent",
                            "entityTypeName": "BusinessAgent:#BL.BusinessAgents",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgent_BusinessAgentContactPerson",
                            "foreignKeyNamesOnServer": [
                                "BusinessAgentId"
                            ]
                        },
                        {
                            "nameOnServer": "ContactPerson",
                            "entityTypeName": "ContactPerson:#BL",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentContactPerson_ContactPerson",
                            "foreignKeyNamesOnServer": [
                                "ContactPersonId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "InvoiceReceipt",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "InvoiceReceipts",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InvoiceDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReceiptDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalAmount",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "InvoiceDocument",
                            "entityTypeName": "InvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_InvoiceDocument_InvoiceReceipt",
                            "foreignKeyNamesOnServer": [
                                "InvoiceDocumentId"
                            ]
                        },
                        {
                            "nameOnServer": "ReceiptDocument",
                            "entityTypeName": "ReceiptDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_InvoiceReceipt_ReceiptDocument",
                            "foreignKeyNamesOnServer": [
                                "ReceiptDocumentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BoardBase",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BoardBases",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Code",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "CountryVATInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CountryVATInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CountryId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProductTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VatPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ValidFrom",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Country",
                            "entityTypeName": "Country:#BL",
                            "isScalar": true,
                            "associationName": "AN_Country_CountryVATInfo",
                            "foreignKeyNamesOnServer": [
                                "CountryId"
                            ]
                        },
                        {
                            "nameOnServer": "ProductType",
                            "entityTypeName": "ProviderProductType:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_CountryVATInfo_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "ProductTypeId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "FlightCustomerLegInfo",
                    "namespace": "BL.Flights",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "FlightCustomerLegInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceCustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TicketNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Seat",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Remark",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "UserModule",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "UserModules",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "SystemUserId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ModuleId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReadOnly",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IsManual",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Module",
                            "entityTypeName": "Module:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Module_UserModule",
                            "foreignKeyNamesOnServer": [
                                "ModuleId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderDocContactInfo",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderDocContactInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DocumentType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+DocumentContactTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ProviderProductTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderDepartmentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Phone",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DocumentRemark",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProductType",
                            "entityTypeName": "ProviderProductType:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_ProviderDocContactInfo_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "ProviderProductTypeId"
                            ]
                        },
                        {
                            "nameOnServer": "Department",
                            "entityTypeName": "ProviderDepartment:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_ProviderDepartment_ProviderDocContactInfo",
                            "foreignKeyNamesOnServer": [
                                "ProviderDepartmentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "VAT",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "VATs",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VatPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ServiceType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ServiceType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_VAT",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Hotel",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Hotels",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Longitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Latitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Rank",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Hotel+HotelTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Address",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Telephone1",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Telephone2",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Website",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CheckinTime",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CheckoutTime",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChainId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "City",
                            "entityTypeName": "City:#BL",
                            "isScalar": true,
                            "associationName": "AN_City_Hotel",
                            "foreignKeyNamesOnServer": [
                                "CityId"
                            ]
                        },
                        {
                            "nameOnServer": "Chain",
                            "entityTypeName": "HotelChain:#BL",
                            "isScalar": true,
                            "associationName": "AN_Hotel_HotelChain",
                            "foreignKeyNamesOnServer": [
                                "ChainId"
                            ]
                        },
                        {
                            "nameOnServer": "RoomTypes",
                            "entityTypeName": "RoomType:#BL",
                            "isScalar": false,
                            "associationName": "AN_Hotel_RoomType",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "BoardBases",
                            "entityTypeName": "HotelsBoardBases:#BL",
                            "isScalar": false,
                            "associationName": "AN_Hotel_HotelsBoardBases",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "MediaObjects",
                            "entityTypeName": "MediaObject:#BL",
                            "isScalar": false,
                            "associationName": "AN_Hotel_MediaObject"
                        }
                    ]
                },
                {
                    "shortName": "ServiceCustomerAccountingInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ServiceCustomerAccountingInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CommissionPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CommissionAmount",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ContactPerson",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ContactPersons",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone1",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone3",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PhoneType1",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PhoneType2",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PhoneType3",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FaceBook",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Twiter",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "JobDescription",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Department",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Order",
                    "namespace": "BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Orders",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "StartDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EndDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChannelId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Docket",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PromoteUserId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PrevOrderNum",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+OrderType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Status",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+OrderStatus, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ClientType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+OrderClientType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Language",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+Language, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OrderSaleAccountingPriceInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CostAccountingPriceInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RemarksId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Currency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_Order",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "Agent",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_Order_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "AgentId"
                            ]
                        },
                        {
                            "nameOnServer": "PromoteAgent",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_Order_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "PromoteUserId"
                            ]
                        },
                        {
                            "nameOnServer": "SaleAccountingInfo",
                            "entityTypeName": "OrderSaleAccountingInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_Order_OrderSaleAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "OrderSaleAccountingPriceInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "CostAccountingInfo",
                            "entityTypeName": "CostAccountingPriceInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_CostAccountingPriceInfo_Order",
                            "foreignKeyNamesOnServer": [
                                "CostAccountingPriceInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "Remarks",
                            "entityTypeName": "OrderRemarks:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_Order_OrderRemarks",
                            "foreignKeyNamesOnServer": [
                                "RemarksId"
                            ]
                        },
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Order",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "OrderCustomers",
                            "entityTypeName": "OrderCustomer:#BL.Orders",
                            "isScalar": false,
                            "associationName": "AN_Order_OrderCustomer",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Services",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": false,
                            "associationName": "AN_Order_ServiceBase",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Payments",
                            "entityTypeName": "BasePayment:#BL.Orders",
                            "isScalar": false,
                            "associationName": "AN_BasePayment_Order",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "AccountingDocuments",
                            "entityTypeName": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_BaseAccountingDocument_Order",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "QueueOrder",
                            "entityTypeName": "QueueOrder:#BL",
                            "isScalar": false,
                            "associationName": "AN_Order_QueueOrder",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "OrderDocuments",
                            "entityTypeName": "OrderDocument:#BL.Documents",
                            "isScalar": false,
                            "associationName": "AN_Order_OrderDocument",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentOrders",
                            "entityTypeName": "BusinessAgentOrder:#BL",
                            "isScalar": false,
                            "associationName": "AN_BusinessAgentOrder_Order",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "OrderDocument",
                    "namespace": "BL.Documents",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderDocuments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DocumentAttachmentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "DocumentAttachment",
                            "entityTypeName": "DocumentAttachment:#BL.Documents",
                            "isScalar": true,
                            "associationName": "AN_DocumentAttachment_OrderDocument",
                            "foreignKeyNamesOnServer": [
                                "DocumentAttachmentId"
                            ]
                        },
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_Order_OrderDocument",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BusinessAgentTag",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BusinessAgentTags",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TagId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "BusinessAgent",
                            "entityTypeName": "BusinessAgent:#BL.BusinessAgents",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgent_BusinessAgentTag",
                            "foreignKeyNamesOnServer": [
                                "BusinessAgentId"
                            ]
                        },
                        {
                            "nameOnServer": "SystemTag",
                            "entityTypeName": "SystemTag:#BL",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentTag_SystemTag",
                            "foreignKeyNamesOnServer": [
                                "TagId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "RefDataConversion",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "RefDataConversions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExternalSystemId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExternalSystemCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ServiceCustomer",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ServiceCustomers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BaseServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PersonalIdNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FirstNameEng",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastNameEng",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DOB",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ContactPhone",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+AgeTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PNR",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AccountingInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "SerivceBase",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_ServiceBase_ServiceCustomer",
                            "foreignKeyNamesOnServer": [
                                "BaseServiceId"
                            ]
                        },
                        {
                            "nameOnServer": "DBCustomer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_Customer_ServiceCustomer",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        },
                        {
                            "nameOnServer": "AccountingInfo",
                            "entityTypeName": "ServiceCustomerAccountingInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_ServiceCustomer_ServiceCustomerAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "AccountingInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "LegInfo",
                            "entityTypeName": "FlightCustomerLegInfo:#BL.Flights",
                            "isScalar": false,
                            "associationName": "AN_FlightCustomerLegInfo_ServiceCustomer",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "FlightService",
                    "namespace": "BL.Services",
                    "baseTypeName": "ServiceBase:#BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "FlightServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "NumberOfParticipantsId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AdultPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChildPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InfantPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "JuniorPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OriginalTotal",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OriginalStatus",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OriginalPlType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsRoundTrip",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "NumberOfParticipants",
                            "entityTypeName": "NumberOfParticipants:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_FlightService_NumberOfParticipants",
                            "foreignKeyNamesOnServer": [
                                "NumberOfParticipantsId"
                            ]
                        },
                        {
                            "nameOnServer": "Legs",
                            "entityTypeName": "FlightLegInfo:#BL.Services",
                            "isScalar": false,
                            "associationName": "AN_FlightLegInfo_FlightService"
                        }
                    ]
                },
                {
                    "shortName": "GeneralService",
                    "namespace": "BL.Services",
                    "baseTypeName": "ServiceBase:#BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "GeneralServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GeneralServiceTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Type",
                            "entityTypeName": "GeneralServiceType:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_GeneralService_GeneralServiceType",
                            "foreignKeyNamesOnServer": [
                                "GeneralServiceTypeId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "PackageService",
                    "namespace": "BL.Services",
                    "baseTypeName": "ServiceBase:#BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "PackageServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "HotelServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FlightServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "HotelService",
                            "entityTypeName": "HotelService:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_HotelService_PackageService",
                            "foreignKeyNamesOnServer": [
                                "HotelServiceId"
                            ]
                        },
                        {
                            "nameOnServer": "FlightService",
                            "entityTypeName": "FlightService:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_FlightService_PackageService",
                            "foreignKeyNamesOnServer": [
                                "FlightServiceId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "HotelRoomService",
                    "namespace": "BL.Services",
                    "baseTypeName": "ServiceBase:#BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "HotelRoomServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "NumberOfParticipantsId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BoardBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RoomTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "HotelServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "NumberOfParticipants",
                            "entityTypeName": "NumberOfParticipants:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_HotelRoomService_NumberOfParticipants",
                            "foreignKeyNamesOnServer": [
                                "NumberOfParticipantsId"
                            ]
                        },
                        {
                            "nameOnServer": "BoardBase",
                            "entityTypeName": "BoardBase:#BL",
                            "isScalar": true,
                            "associationName": "AN_BoardBase_HotelRoomService",
                            "foreignKeyNamesOnServer": [
                                "BoardBaseId"
                            ]
                        },
                        {
                            "nameOnServer": "RoomType",
                            "entityTypeName": "RoomType:#BL",
                            "isScalar": true,
                            "associationName": "AN_HotelRoomService_RoomType",
                            "foreignKeyNamesOnServer": [
                                "RoomTypeId"
                            ]
                        },
                        {
                            "nameOnServer": "HotelService",
                            "entityTypeName": "HotelService:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_HotelRoomService_HotelService",
                            "foreignKeyNamesOnServer": [
                                "HotelServiceId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "HotelService",
                    "namespace": "BL.Services",
                    "baseTypeName": "ServiceBase:#BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "HotelServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "HotelId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Hotel",
                            "entityTypeName": "Hotel:#BL",
                            "isScalar": true,
                            "associationName": "AN_Hotel_HotelService",
                            "foreignKeyNamesOnServer": [
                                "HotelId"
                            ]
                        },
                        {
                            "nameOnServer": "Rooms",
                            "entityTypeName": "HotelRoomService:#BL.Services",
                            "isScalar": false,
                            "associationName": "AN_HotelRoomService_HotelService"
                        }
                    ]
                },
                {
                    "shortName": "ServiceBase",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ServiceBases",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ImmediateConfirmation",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ServiceType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "StartDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EndDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "SubServiceNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DataSourceProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InterfaceSystemId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InterfaceSystemRef",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SaleAccountingPriceInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderAccountingInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Quantity",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderPNR",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExternalProviderType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ClientPNR",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Status",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+ServiceStatus, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "InvoiceOnlyToThisService",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceRemarksId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_Order_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        },
                        {
                            "nameOnServer": "Provider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "ProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "DataSourceProvider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "DataSourceProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "SaleAccountingInfo",
                            "entityTypeName": "SaleAccountingPriceInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_SaleAccountingPriceInfo_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "SaleAccountingPriceInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderAccountingInfo",
                            "entityTypeName": "ServiceProviderAccountingInfo:#BL.AccountingObjects",
                            "isScalar": true,
                            "associationName": "AN_ServiceBase_ServiceProviderAccountingInfo",
                            "foreignKeyNamesOnServer": [
                                "ProviderAccountingInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "Remarks",
                            "entityTypeName": "ServiceRemarks:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_ServiceBase_ServiceRemarks",
                            "foreignKeyNamesOnServer": [
                                "ServiceRemarksId"
                            ]
                        },
                        {
                            "nameOnServer": "ServiceCustomers",
                            "entityTypeName": "ServiceCustomer:#BL.Services",
                            "isScalar": false,
                            "associationName": "AN_ServiceBase_ServiceCustomer",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderVoucherDocuments",
                            "entityTypeName": "ProviderVoucherDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_ProviderVoucherDocument_ServiceBase",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "AgencySettingsKey",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "AgencySettingsKeies",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Address",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Addresss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Street",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "City",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Country",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HouseNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Zip",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "MediaObject",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "MediaObjects",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MediaType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.MediaObject+MediaTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SourceUrl",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Width",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Height",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "OrderCustomer",
                    "namespace": "BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderCustomers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IsLeadCustomer",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_Order_OrderCustomer",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        },
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_Customer_OrderCustomer",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "SequenceManager",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "SequenceManagers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "SequenceType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.SequenceManager+SequenceTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SequenceName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Prefix",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Sufix",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "CashPayment",
                    "namespace": "BL.Orders.Payments",
                    "baseTypeName": "BasePayment:#BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CashPayments",
                    "dataProperties": [
                        {
                            "nameOnServer": "DepositNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "CheckPayment",
                    "namespace": "BL.Orders.Payments",
                    "baseTypeName": "BasePayment:#BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CheckPayments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Bank",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Branch",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CheckNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DepositNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "BankTransfer",
                    "namespace": "BL.Orders.Payments",
                    "baseTypeName": "BasePayment:#BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BankTransfers",
                    "dataProperties": [
                        {
                            "nameOnServer": "ToAccountId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Bank",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Branch",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DepositNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReferenceNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ToAccount",
                            "entityTypeName": "BankAccount:#BL.Banks",
                            "isScalar": true,
                            "associationName": "AN_BankAccount_BankTransfer",
                            "foreignKeyNamesOnServer": [
                                "ToAccountId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CreditcardPayment",
                    "namespace": "BL.Orders",
                    "baseTypeName": "BasePayment:#BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CreditcardPayments",
                    "dataProperties": [
                        {
                            "nameOnServer": "NumberOfPayments",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Token",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ConfirmationCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderFirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderLastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "HolderIdNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastFourDigits",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExpireDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Remarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CardType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+CreditCardTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PaymentType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+CreditCardPaymentTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Status",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Orders.CreditcardPayment+CreditCardStatus, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ErrorCode",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChargeDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CVV",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ClearingService",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Orders.CreditcardPayment+CreditClearingServices, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FirstPayment",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ConnectionId",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CustomerCreditCardId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InterestPercent",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "CustomerCreditCard",
                            "entityTypeName": "CustomerCreditCard:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_CreditcardPayment_CustomerCreditCard",
                            "foreignKeyNamesOnServer": [
                                "CustomerCreditCardId"
                            ]
                        },
                        {
                            "nameOnServer": "Payments",
                            "entityTypeName": "CreditCardPaymentDetail:#BL.Orders.Payments",
                            "isScalar": false,
                            "associationName": "AN_CreditcardPayment_CreditCardPaymentDetail"
                        }
                    ]
                },
                {
                    "shortName": "BasePayment",
                    "namespace": "BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BasePayments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PaymentDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReceiptDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PaymentType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Currency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_BasePayment_Currency",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_BasePayment_Order",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        },
                        {
                            "nameOnServer": "ReceiptDocument",
                            "entityTypeName": "ReceiptDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_BasePayment_ReceiptDocument",
                            "foreignKeyNamesOnServer": [
                                "ReceiptDocumentId"
                            ]
                        },
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_BasePayment_Customer",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "OrderRemarks",
                    "namespace": "BL.Orders",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "OrderRemarkss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RemarksFromClient",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RemarksToClient",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OfficeRemarks",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "CostAccountingPriceInfo",
                    "namespace": "BL.AccountingObjects",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CostAccountingPriceInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrencyRate",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ExtraCommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionVAT",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CommissionVATPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionAmount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommissionPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Tax",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VAT",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VATPercent",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AdditionFee",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PFee",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CreditMCO",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalProviderInv",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalVCHR",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPayToProvider",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPaid",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalDeposits",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalToPay",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "OrderCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_CostAccountingPriceInfo_Currency",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_CostAccountingPriceInfo_Currency",
                            "foreignKeyNamesOnServer": [
                                "ProviderCurrencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProfileModule",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProfileModules",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProfileId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ModuleId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ReadOnly",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Profile",
                            "entityTypeName": "Profile:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Profile_ProfileModule",
                            "foreignKeyNamesOnServer": [
                                "ProfileId"
                            ]
                        },
                        {
                            "nameOnServer": "Module",
                            "entityTypeName": "Module:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Module_ProfileModule",
                            "foreignKeyNamesOnServer": [
                                "ModuleId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CustomerPassport",
                    "namespace": "BL.Customers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CustomerPassports",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PassportNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsLeadPassport",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Nationality",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IssueDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IssueCity",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ValidityDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_Customer_CustomerPassport",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "PaymentInterest",
                    "namespace": "BL.Orders.Payments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "PaymentInterests",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NumberOfPayments",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InterestPercent",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_PaymentInterest",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "HotelFacility",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "HotelFacilities",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "ExternalSystem",
                    "namespace": "BL.ExternalSystems",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ExternalSystems",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Customer",
                    "namespace": "BL.Customers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Customers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FirstNameEng",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastNameEng",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Facebook",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PersonalIdNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PassportNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Remarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CustomerAddressId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Phone1Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone1Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone3Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone3Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NewsLetterSubscription",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FrequentTravellerNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgeType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+AgeTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Gender",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+Genders, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DOB",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Address",
                            "entityTypeName": "CustomerAddress:#BL",
                            "isScalar": true,
                            "associationName": "AN_Customer_CustomerAddress",
                            "foreignKeyNamesOnServer": [
                                "CustomerAddressId"
                            ]
                        },
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Customer",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "Passports",
                            "entityTypeName": "CustomerPassport:#BL.Customers",
                            "isScalar": false,
                            "associationName": "AN_Customer_CustomerPassport",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "CreditCards",
                            "entityTypeName": "CustomerCreditCard:#BL.Customers",
                            "isScalar": false,
                            "associationName": "AN_Customer_CustomerCreditCard",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "CustomerDocuments",
                            "entityTypeName": "CustomerDocument:#BL.Documents",
                            "isScalar": false,
                            "associationName": "AN_Customer_CustomerDocument",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "RoomTypeCapacity",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "RoomTypeCapacities",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RoomTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CapacityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NumberOfInfants",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "RoomType",
                            "entityTypeName": "RoomType:#BL",
                            "isScalar": true,
                            "associationName": "AN_RoomType_RoomTypeCapacity",
                            "foreignKeyNamesOnServer": [
                                "RoomTypeId"
                            ]
                        },
                        {
                            "nameOnServer": "Capacity",
                            "entityTypeName": "Capacity:#BL",
                            "isScalar": true,
                            "associationName": "AN_Capacity_RoomTypeCapacity",
                            "foreignKeyNamesOnServer": [
                                "CapacityId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "QueueRuleCondition",
                    "namespace": "BL.Queues",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "QueueRuleConditions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PropertyName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Operator",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Value",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "QueueId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "LeftHandOperator",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RightHandOperator",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "JoinWith",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DataType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SortOrder",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "QueueRuleId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "QueueRule",
                            "entityTypeName": "QueueRule:#BL.Queues",
                            "isScalar": true,
                            "associationName": "AN_QueueRule_QueueRuleCondition",
                            "foreignKeyNamesOnServer": [
                                "QueueRuleId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Airline",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Airlines",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IATACode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LogoPath",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "PayOrder",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "PayOrders",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProviderVouchersPayOrder",
                            "entityTypeName": "ProviderVoucherPayOrder:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": false,
                            "associationName": "AN_PayOrder_ProviderVoucherPayOrder",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BusinessAgent",
                    "namespace": "BL.BusinessAgents",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BusinessAgents",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CompanyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MainAgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AddressId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentSettingsId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ShippingAddressId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalOrdersCount",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalCommision",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalInvoice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPaied",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalPrice",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalBalance",
                            "dataType": "Double",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_BusinessAgent",
                            "foreignKeyNamesOnServer": [
                                "MainAgentId"
                            ]
                        },
                        {
                            "nameOnServer": "Address",
                            "entityTypeName": "Address:#BL",
                            "isScalar": true,
                            "associationName": "AN_Address_BusinessAgent",
                            "foreignKeyNamesOnServer": [
                                "AddressId"
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentSettings",
                            "entityTypeName": "BusinessAgentSettings:#BL",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgent_BusinessAgentSettings",
                            "foreignKeyNamesOnServer": [
                                "BusinessAgentSettingsId"
                            ]
                        },
                        {
                            "nameOnServer": "ShippingAddress",
                            "entityTypeName": "Address:#BL",
                            "isScalar": true,
                            "associationName": "AN_Address_BusinessAgent",
                            "foreignKeyNamesOnServer": [
                                "ShippingAddressId"
                            ]
                        },
                        {
                            "nameOnServer": "Tags",
                            "entityTypeName": "BusinessAgentTag:#BL",
                            "isScalar": false,
                            "associationName": "AN_BusinessAgent_BusinessAgentTag",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ContactPersons",
                            "entityTypeName": "BusinessAgentContactPerson:#BL",
                            "isScalar": false,
                            "associationName": "AN_BusinessAgent_BusinessAgentContactPerson",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentOrders",
                            "entityTypeName": "BusinessAgentOrder:#BL",
                            "isScalar": false,
                            "associationName": "AN_BusinessAgent_BusinessAgentOrder",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Provider",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Providers",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VATNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DefaultCurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountingCardCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsWholesaler",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PoviderBankingInfoId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DeductionTaxPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Phone1Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone1Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone3Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PhoneTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone3Number",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NewVoucherOnChangePrices",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "DefaultCurrency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Currency_Provider",
                            "foreignKeyNamesOnServer": [
                                "DefaultCurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "BankAccount",
                            "entityTypeName": "BankAccount:#BL.Banks",
                            "isScalar": true,
                            "associationName": "AN_BankAccount_Provider",
                            "foreignKeyNamesOnServer": [
                                "PoviderBankingInfoId"
                            ]
                        },
                        {
                            "nameOnServer": "ContactPersons",
                            "entityTypeName": "ContactPerson:#BL",
                            "isScalar": false,
                            "associationName": "AN_ContactPerson_Provider",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ProductTypes",
                            "entityTypeName": "ProviderProductType:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Provider_ProviderProductType",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Departments",
                            "entityTypeName": "ProviderDepartment:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Provider_ProviderDepartment",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "DocContactInfo",
                            "entityTypeName": "ProviderDocContactInfo:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Provider_ProviderDocContactInfo",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ProductTypeFixedRemarks",
                            "entityTypeName": "ProviderProductTypeFixedRemark:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Provider_ProviderProductTypeFixedRemark",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderProtocol",
                            "entityTypeName": "ProviderProtocol:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Provider_ProviderProtocol",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Conversions",
                            "entityTypeName": "RefDataConversion:#BL",
                            "isScalar": false,
                            "associationName": "AN_Provider_RefDataConversion",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderDepartment",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderDepartments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DepartmentName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "EntityLocalization",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "EntityLocalizations",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PropertyName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Value",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LanguageId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "FlightLegInfo",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "FlightLegInfos",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Direction",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Services.FlightLegInfo+FlightDirections, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Services.FlightLegInfo+FlightTypes, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AircraftCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CarrierCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DepartureDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DepartureTime",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ArrivalDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ArrivalTime",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "FlightNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ProviderPNR",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OriginalPlType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "OriginalStatus",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ClassCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "DeparturePortId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ArrivalPortId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AirlineId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FlightServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "DeparturePort",
                            "entityTypeName": "Port:#BL",
                            "isScalar": true,
                            "associationName": "AN_FlightLegInfo_Port",
                            "foreignKeyNamesOnServer": [
                                "DeparturePortId"
                            ]
                        },
                        {
                            "nameOnServer": "ArrivalPort",
                            "entityTypeName": "Port:#BL",
                            "isScalar": true,
                            "associationName": "AN_FlightLegInfo_Port",
                            "foreignKeyNamesOnServer": [
                                "ArrivalPortId"
                            ]
                        },
                        {
                            "nameOnServer": "Airline",
                            "entityTypeName": "Airline:#BL",
                            "isScalar": true,
                            "associationName": "AN_Airline_FlightLegInfo",
                            "foreignKeyNamesOnServer": [
                                "AirlineId"
                            ]
                        },
                        {
                            "nameOnServer": "FlightService",
                            "entityTypeName": "FlightService:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_FlightLegInfo_FlightService",
                            "foreignKeyNamesOnServer": [
                                "FlightServiceId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderProductsSpecialAgreement",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderProductsSpecialAgreements",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderProductId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderCreateFrom",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderCreateTo",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Arrival",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Departure",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ComissionPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PayToPaymentMethod",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PayToPaymentMethod, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Module",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Modules",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "RelativePath",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Actions",
                            "entityTypeName": "Action:#BL.Permissions",
                            "isScalar": false,
                            "associationName": "AN_Action_Module",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Country",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Countries",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IATACode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "NeedVisa",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Regions",
                            "entityTypeName": "CountryRegion:#BL",
                            "isScalar": false,
                            "associationName": "AN_Country_CountryRegion",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Action",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Actions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ModuleId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Module",
                            "entityTypeName": "Module:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Action_Module",
                            "foreignKeyNamesOnServer": [
                                "ModuleId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderProduct",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderProducts",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderProductTypeId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "EntityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderType",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+OrderType, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ComissionPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PayToPaymentMethod",
                            "dataType": "NHibernate.Type.EnumType`1[[BL.Enums+PayToPaymentMethod, BL, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]], NHibernate",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PayingToProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExternalSystemId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VATPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProductType",
                            "entityTypeName": "ProviderProductType:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_ProviderProduct_ProviderProductType",
                            "foreignKeyNamesOnServer": [
                                "ProviderProductTypeId"
                            ]
                        },
                        {
                            "nameOnServer": "PayingToProvider",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_Provider_ProviderProduct",
                            "foreignKeyNamesOnServer": [
                                "PayingToProviderId"
                            ]
                        },
                        {
                            "nameOnServer": "ExternalSystem",
                            "entityTypeName": "ExternalSystem:#BL.ExternalSystems",
                            "isScalar": true,
                            "associationName": "AN_ExternalSystem_ProviderProduct",
                            "foreignKeyNamesOnServer": [
                                "ExternalSystemId"
                            ]
                        },
                        {
                            "nameOnServer": "SpecialAgreements",
                            "entityTypeName": "ProviderProductsSpecialAgreement:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_ProviderProduct_ProviderProductsSpecialAgreement",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProfileAction",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProfileActions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProfileId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ActionId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AllowManagerOverride",
                            "dataType": "Byte",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "byte"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Profile",
                            "entityTypeName": "Profile:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Profile_ProfileAction",
                            "foreignKeyNamesOnServer": [
                                "ProfileId"
                            ]
                        },
                        {
                            "nameOnServer": "Action",
                            "entityTypeName": "Action:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Action_ProfileAction",
                            "foreignKeyNamesOnServer": [
                                "ActionId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "QueueRule",
                    "namespace": "BL.Queues",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "QueueRules",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Interval",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IsAuto",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "QueueId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Queue",
                            "entityTypeName": "Queue:#BL.Queues",
                            "isScalar": true,
                            "associationName": "AN_Queue_QueueRule",
                            "foreignKeyNamesOnServer": [
                                "QueueId"
                            ]
                        },
                        {
                            "nameOnServer": "Conditions",
                            "entityTypeName": "QueueRuleCondition:#BL.Queues",
                            "isScalar": false,
                            "associationName": "AN_QueueRule_QueueRuleCondition",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "UserAction",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "UserActions",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "SystemUserId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ActionId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AllowManagerOverride",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IsManual",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Action",
                            "entityTypeName": "Action:#BL.Permissions",
                            "isScalar": true,
                            "associationName": "AN_Action_UserAction",
                            "foreignKeyNamesOnServer": [
                                "ActionId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "CreditCardPaymentDetail",
                    "namespace": "BL.Orders.Payments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "CreditCardPaymentDetails",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DepositNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PaymentDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Total",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "PaymentNumber",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreditCardPaymentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "CreditCardPayment",
                            "entityTypeName": "CreditcardPayment:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_CreditcardPayment_CreditCardPaymentDetail",
                            "foreignKeyNamesOnServer": [
                                "CreditCardPaymentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "DBErrorLog",
                    "namespace": "BL.Logs",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "DBErrorLogs",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Exception",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "EntityType",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "EntityId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "Queue",
                    "namespace": "BL.Queues",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Queues",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Agency",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Queue",
                            "foreignKeyNamesOnServer": [
                                "AgencyId"
                            ]
                        },
                        {
                            "nameOnServer": "Agent",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_Queue_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "AgentId"
                            ]
                        },
                        {
                            "nameOnServer": "QueueRules",
                            "entityTypeName": "QueueRule:#BL.Queues",
                            "isScalar": false,
                            "associationName": "AN_Queue_QueueRule",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Orders",
                            "entityTypeName": "QueueOrder:#BL",
                            "isScalar": false,
                            "associationName": "AN_Queue_QueueOrder",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Agency",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Agencies",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Address",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ZipCode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Telephone1",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Telephone2",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Website",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AdminEmail",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Remarks",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ParentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CountryId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ExpiryDate",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Parent",
                            "entityTypeName": "Agency:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Agency",
                            "foreignKeyNamesOnServer": [
                                "ParentId"
                            ]
                        },
                        {
                            "nameOnServer": "Country",
                            "entityTypeName": "Country:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agency_Country",
                            "foreignKeyNamesOnServer": [
                                "CountryId"
                            ]
                        },
                        {
                            "nameOnServer": "Banks",
                            "entityTypeName": "Bank:#BL.Banks",
                            "isScalar": false,
                            "associationName": "AN_Agency_Bank",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Providers",
                            "entityTypeName": "Provider:#BL.Providers",
                            "isScalar": false,
                            "associationName": "AN_Agency_Provider",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "DefaultProviders",
                            "entityTypeName": "DefAgencyProviders:#BL.Agencies",
                            "isScalar": false,
                            "associationName": "AN_Agency_DefAgencyProviders",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "InvoiceDocumentService",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "InvoiceDocumentServices",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Total",
                            "dataType": "Double",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ServiceBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "InvoiceDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Service",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_InvoiceDocumentService_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "ServiceBaseId"
                            ]
                        },
                        {
                            "nameOnServer": "InvoiceDocument",
                            "entityTypeName": "InvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_InvoiceDocument_InvoiceDocumentService",
                            "foreignKeyNamesOnServer": [
                                "InvoiceDocumentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "DocumentAttachment",
                    "namespace": "BL.Documents",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "DocumentAttachments",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Subject",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IsDisplayToCustomer",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "BaseService",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_DocumentAttachment_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "ServiceBaseId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderVoucherPayOrder",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderVoucherPayOrders",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderVoucherId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PayOrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProviderVoucher",
                            "entityTypeName": "ProviderVoucherDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_ProviderVoucherDocument_ProviderVoucherPayOrder",
                            "foreignKeyNamesOnServer": [
                                "ProviderVoucherId"
                            ]
                        },
                        {
                            "nameOnServer": "PayOrder",
                            "entityTypeName": "PayOrder:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_PayOrder_ProviderVoucherPayOrder",
                            "foreignKeyNamesOnServer": [
                                "PayOrderId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "Profile",
                    "namespace": "BL.Permissions",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Profiles",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Modules",
                            "entityTypeName": "ProfileModule:#BL.Permissions",
                            "isScalar": false,
                            "associationName": "AN_Profile_ProfileModule",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Actions",
                            "entityTypeName": "ProfileAction:#BL.Permissions",
                            "isScalar": false,
                            "associationName": "AN_Profile_ProfileAction",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BusinessAgentOrder",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BusinessAgentOrders",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BusinessAgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ServiceId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CustomerId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "GrossPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CommisionAmount",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CommisionPercent",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "NetPrice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyRate",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "VoucherNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "VoucherDocPath",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Remark",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "TotalInvoice",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TotalPayed",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "TagId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "BusinessAgent",
                            "entityTypeName": "BusinessAgent:#BL.BusinessAgents",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgent_BusinessAgentOrder",
                            "foreignKeyNamesOnServer": [
                                "BusinessAgentId"
                            ]
                        },
                        {
                            "nameOnServer": "Order",
                            "entityTypeName": "Order:#BL.Orders",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentOrder_Order",
                            "foreignKeyNamesOnServer": [
                                "OrderId"
                            ]
                        },
                        {
                            "nameOnServer": "Service",
                            "entityTypeName": "ServiceBase:#BL.Services",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentOrder_ServiceBase",
                            "foreignKeyNamesOnServer": [
                                "ServiceId"
                            ]
                        },
                        {
                            "nameOnServer": "Customer",
                            "entityTypeName": "Customer:#BL.Customers",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentOrder_Customer",
                            "foreignKeyNamesOnServer": [
                                "CustomerId"
                            ]
                        },
                        {
                            "nameOnServer": "Currency",
                            "entityTypeName": "Currency:#BL",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentOrder_Currency",
                            "foreignKeyNamesOnServer": [
                                "CurrencyId"
                            ]
                        },
                        {
                            "nameOnServer": "SystemTags",
                            "entityTypeName": "SystemTag:#BL",
                            "isScalar": true,
                            "associationName": "AN_BusinessAgentOrder_SystemTag",
                            "foreignKeyNamesOnServer": [
                                "TagId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderVoucherInvoice",
                    "namespace": "BL.AccountingObjects.AccountingDocuments",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderVoucherInvoices",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderVoucherDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderInvoiceDocumentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ProviderVoucherDocument",
                            "entityTypeName": "ProviderVoucherDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_ProviderVoucherDocument_ProviderVoucherInvoice",
                            "foreignKeyNamesOnServer": [
                                "ProviderVoucherDocumentId"
                            ]
                        },
                        {
                            "nameOnServer": "ProviderInvoiceDocument",
                            "entityTypeName": "ProviderInvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                            "isScalar": true,
                            "associationName": "AN_ProviderInvoiceDocument_ProviderVoucherInvoice",
                            "foreignKeyNamesOnServer": [
                                "ProviderInvoiceDocumentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "HotelsBoardBases",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "HotelsBoardBasess",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "HotelId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BoardBaseId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Hotel",
                            "entityTypeName": "Hotel:#BL",
                            "isScalar": true,
                            "associationName": "AN_Hotel_HotelsBoardBases",
                            "foreignKeyNamesOnServer": [
                                "HotelId"
                            ]
                        },
                        {
                            "nameOnServer": "BoardBase",
                            "entityTypeName": "BoardBase:#BL",
                            "isScalar": true,
                            "associationName": "AN_BoardBase_HotelsBoardBases",
                            "foreignKeyNamesOnServer": [
                                "BoardBaseId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "GeneralServiceType",
                    "namespace": "BL.Services",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "GeneralServiceTypes",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Description",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": []
                },
                {
                    "shortName": "City",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "Cities",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Name",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "CountryId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "IATACode",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Longitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Latitude",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "RegionId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Country",
                            "entityTypeName": "Country:#BL",
                            "isScalar": true,
                            "associationName": "AN_City_Country",
                            "foreignKeyNamesOnServer": [
                                "CountryId"
                            ]
                        },
                        {
                            "nameOnServer": "Region",
                            "entityTypeName": "CountryRegion:#BL",
                            "isScalar": true,
                            "associationName": "AN_City_CountryRegion",
                            "foreignKeyNamesOnServer": [
                                "RegionId"
                            ]
                        },
                        {
                            "nameOnServer": "Ports",
                            "entityTypeName": "Port:#BL",
                            "isScalar": false,
                            "associationName": "AN_City_Port",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        },
                        {
                            "nameOnServer": "Localizations",
                            "entityTypeName": "EntityLocalization:#BL",
                            "isScalar": false,
                            "associationName": "AN_City_EntityLocalization",
                            "invForeignKeyNamesOnServer": [
                                "Id"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "QueueOrder",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "QueueOrders",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "QueueId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "OrderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgentIdIn",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DateIn",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgentIdOut",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DateOut",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "AgentIn",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_QueueOrder_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "AgentIdIn"
                            ]
                        },
                        {
                            "nameOnServer": "AgentOut",
                            "entityTypeName": "SystemUser:#BL",
                            "isScalar": true,
                            "associationName": "AN_QueueOrder_SystemUser",
                            "foreignKeyNamesOnServer": [
                                "AgentIdOut"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderContact",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderContacts",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderDepartmentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FirstName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "LastName",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone1",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Phone2",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Fax",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Email",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Facebook",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Twiter",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "JobDescription",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Department",
                            "entityTypeName": "ProviderDepartment:#BL.Providers",
                            "isScalar": true,
                            "associationName": "AN_ProviderContact_ProviderDepartment",
                            "foreignKeyNamesOnServer": [
                                "ProviderDepartmentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BankAccount",
                    "namespace": "BL.Banks",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BankAccounts",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "BankId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Branch",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AccountNumber",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "BankAddress",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Swift",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "IBAN",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "ABA",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "SpecialRemaks",
                            "dataType": "String",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Bank",
                            "entityTypeName": "Bank:#BL.Banks",
                            "isScalar": true,
                            "associationName": "AN_Bank_BankAccount",
                            "foreignKeyNamesOnServer": [
                                "BankId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "AgencySetting",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "AgencySettings",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "AgencySettingsKeyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Value",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "Type",
                            "dataType": "NHibernate.Type.EnumType`1[[System.Data.DbType, System.Data, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089]], NHibernate",
                            "isNullable": true
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "Key",
                            "entityTypeName": "AgencySettingsKey:#BL",
                            "isScalar": true,
                            "associationName": "AN_AgencySetting_AgencySettingsKey",
                            "foreignKeyNamesOnServer": [
                                "AgencySettingsKeyId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "ProviderProtocol",
                    "namespace": "BL.Providers",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "ProviderProtocols",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CreateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "UpdateDate",
                            "dataType": "DateTime",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "date"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Active",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ProviderId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "FieldId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ChangeInfo",
                            "dataType": "String",
                            "isNullable": true
                        },
                        {
                            "nameOnServer": "AgentId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": [
                        {
                            "nameOnServer": "ChangedBy",
                            "entityTypeName": "Agent:#BL",
                            "isScalar": true,
                            "associationName": "AN_Agent_ProviderProtocol",
                            "foreignKeyNamesOnServer": [
                                "AgentId"
                            ]
                        }
                    ]
                },
                {
                    "shortName": "BusinessAgentSettings",
                    "namespace": "BL",
                    "autoGeneratedKeyType": "Identity",
                    "defaultResourceName": "BusinessAgentSettingss",
                    "dataProperties": [
                        {
                            "nameOnServer": "Id",
                            "dataType": "Int32",
                            "isNullable": false,
                            "isPartOfKey": true,
                            "validators": [
                                {
                                    "name": "required"
                                },
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "Obligo",
                            "dataType": "Single",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "number"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "DaysBeforeObligoViolation",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "ObligoViolationAction",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "CurrencyId",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MustProvideVoucherId",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "MustProvideVoucherDoc",
                            "dataType": "Boolean",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "bool"
                                }
                            ]
                        },
                        {
                            "nameOnServer": "PaymentType",
                            "dataType": "Int32",
                            "isNullable": true,
                            "validators": [
                                {
                                    "name": "int32"
                                }
                            ]
                        }
                    ],
                    "navigationProperties": []
                }
            ],
            "resourceEntityTypeMap": {
                "Agents": "Agent:#BL",
                "SystemUsers": "SystemUser:#BL",
                "Capacities": "Capacity:#BL",
                "OrderActionProtocolLines": "OrderActionProtocolLine:#BL.Protocols",
                "OrderChangeProtocolLines": "OrderChangeProtocolLine:#BL.Protocols",
                "OrderProtocolLines": "OrderProtocolLine:#BL.Protocols",
                "ProviderProductTypes": "ProviderProductType:#BL.Providers",
                "InvoiceDocuments": "InvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                "BaseInvoiceDocuments": "BaseInvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                "ProviderInvoiceDocuments": "ProviderInvoiceDocument:#BL.AccountingObjects.AccountingDocuments",
                "ProviderVoucherDocuments": "ProviderVoucherDocument:#BL.AccountingObjects.AccountingDocuments",
                "ReceiptDocuments": "ReceiptDocument:#BL.AccountingObjects.AccountingDocuments",
                "BaseAccountingDocuments": "BaseAccountingDocument:#BL.AccountingObjects.AccountingDocuments",
                "HotelChains": "HotelChain:#BL",
                "Credit2000ErrorCodes": "Credit2000ErrorCode:#BL.CreditcardClearingCompanySettings",
                "CountryRegions": "CountryRegion:#BL",
                "Currencies": "Currency:#BL",
                "CustomerCreditCards": "CustomerCreditCard:#BL.Customers",
                "CustomerDocuments": "CustomerDocument:#BL.Documents",
                "CustomerAddresss": "CustomerAddress:#BL",
                "ExternalSysCurrencies": "ExternalSysCurrency:#BL.ExternalSystems",
                "ServiceRemarkss": "ServiceRemarks:#BL.Services",
                "Ports": "Port:#BL",
                "DefAgencyProviderss": "DefAgencyProviders:#BL.Agencies",
                "NumberOfParticipantss": "NumberOfParticipants:#BL.Services",
                "SystemTags": "SystemTag:#BL",
                "OrderSaleAccountingInfos": "OrderSaleAccountingInfo:#BL.AccountingObjects",
                "ExtSysInterfaceSystemIds": "ExtSysInterfaceSystemId:#BL.ExternalSystems",
                "Banks": "Bank:#BL.Banks",
                "SaleAccountingPriceInfos": "SaleAccountingPriceInfo:#BL.AccountingObjects",
                "RoomTypes": "RoomType:#BL",
                "Credit2000Settingss": "Credit2000Settings:#BL.CreditcardClearingCompanySettings",
                "BaseCreditcardClearingCompanySettingss": "BaseCreditcardClearingCompanySettings:#BL.CreditcardClearingCompanySettings",
                "ProviderProductTypeFixedRemarks": "ProviderProductTypeFixedRemark:#BL.Providers",
                "ServiceProviderAccountingInfos": "ServiceProviderAccountingInfo:#BL.AccountingObjects",
                "BusinessAgentContactPersons": "BusinessAgentContactPerson:#BL",
                "InvoiceReceipts": "InvoiceReceipt:#BL.AccountingObjects.AccountingDocuments",
                "BoardBases": "BoardBase:#BL",
                "CountryVATInfos": "CountryVATInfo:#BL.AccountingObjects",
                "FlightCustomerLegInfos": "FlightCustomerLegInfo:#BL.Flights",
                "UserModules": "UserModule:#BL.Permissions",
                "ProviderDocContactInfos": "ProviderDocContactInfo:#BL.Providers",
                "VATs": "VAT:#BL.AccountingObjects",
                "Hotels": "Hotel:#BL",
                "ServiceCustomerAccountingInfos": "ServiceCustomerAccountingInfo:#BL.AccountingObjects",
                "ContactPersons": "ContactPerson:#BL",
                "Orders": "Order:#BL.Orders",
                "OrderDocuments": "OrderDocument:#BL.Documents",
                "BusinessAgentTags": "BusinessAgentTag:#BL",
                "RefDataConversions": "RefDataConversion:#BL",
                "ServiceCustomers": "ServiceCustomer:#BL.Services",
                "FlightServices": "FlightService:#BL.Services",
                "GeneralServices": "GeneralService:#BL.Services",
                "PackageServices": "PackageService:#BL.Services",
                "HotelRoomServices": "HotelRoomService:#BL.Services",
                "HotelServices": "HotelService:#BL.Services",
                "ServiceBases": "ServiceBase:#BL.Services",
                "AgencySettingsKeies": "AgencySettingsKey:#BL",
                "Addresss": "Address:#BL",
                "MediaObjects": "MediaObject:#BL",
                "OrderCustomers": "OrderCustomer:#BL.Orders",
                "SequenceManagers": "SequenceManager:#BL",
                "CashPayments": "CashPayment:#BL.Orders.Payments",
                "CheckPayments": "CheckPayment:#BL.Orders.Payments",
                "BankTransfers": "BankTransfer:#BL.Orders.Payments",
                "CreditcardPayments": "CreditcardPayment:#BL.Orders",
                "BasePayments": "BasePayment:#BL.Orders",
                "OrderRemarkss": "OrderRemarks:#BL.Orders",
                "CostAccountingPriceInfos": "CostAccountingPriceInfo:#BL.AccountingObjects",
                "ProfileModules": "ProfileModule:#BL.Permissions",
                "CustomerPassports": "CustomerPassport:#BL.Customers",
                "PaymentInterests": "PaymentInterest:#BL.Orders.Payments",
                "HotelFacilities": "HotelFacility:#BL",
                "ExternalSystems": "ExternalSystem:#BL.ExternalSystems",
                "Customers": "Customer:#BL.Customers",
                "RoomTypeCapacities": "RoomTypeCapacity:#BL",
                "QueueRuleConditions": "QueueRuleCondition:#BL.Queues",
                "Airlines": "Airline:#BL",
                "PayOrders": "PayOrder:#BL.AccountingObjects.AccountingDocuments",
                "BusinessAgents": "BusinessAgent:#BL.BusinessAgents",
                "Providers": "Provider:#BL.Providers",
                "ProviderDepartments": "ProviderDepartment:#BL.Providers",
                "EntityLocalizations": "EntityLocalization:#BL",
                "FlightLegInfos": "FlightLegInfo:#BL.Services",
                "ProviderProductsSpecialAgreements": "ProviderProductsSpecialAgreement:#BL.Providers",
                "Modules": "Module:#BL.Permissions",
                "Countries": "Country:#BL",
                "Actions": "Action:#BL.Permissions",
                "ProviderProducts": "ProviderProduct:#BL.Providers",
                "ProfileActions": "ProfileAction:#BL.Permissions",
                "QueueRules": "QueueRule:#BL.Queues",
                "UserActions": "UserAction:#BL.Permissions",
                "CreditCardPaymentDetails": "CreditCardPaymentDetail:#BL.Orders.Payments",
                "DBErrorLogs": "DBErrorLog:#BL.Logs",
                "Queues": "Queue:#BL.Queues",
                "Agencies": "Agency:#BL",
                "InvoiceDocumentServices": "InvoiceDocumentService:#BL.AccountingObjects.AccountingDocuments",
                "DocumentAttachments": "DocumentAttachment:#BL.Documents",
                "ProviderVoucherPayOrders": "ProviderVoucherPayOrder:#BL.AccountingObjects.AccountingDocuments",
                "Profiles": "Profile:#BL.Permissions",
                "BusinessAgentOrders": "BusinessAgentOrder:#BL",
                "ProviderVoucherInvoices": "ProviderVoucherInvoice:#BL.AccountingObjects.AccountingDocuments",
                "HotelsBoardBasess": "HotelsBoardBases:#BL",
                "GeneralServiceTypes": "GeneralServiceType:#BL.Services",
                "Cities": "City:#BL",
                "QueueOrders": "QueueOrder:#BL",
                "ProviderContacts": "ProviderContact:#BL.Providers",
                "BankAccounts": "BankAccount:#BL.Banks",
                "AgencySettings": "AgencySetting:#BL",
                "ProviderProtocols": "ProviderProtocol:#BL.Providers",
                "BusinessAgentSettingss": "BusinessAgentSettings:#BL"
            }
        }

        manager.metadataStore.importMetadata(JSON.stringify(metadata));

        // define the data to import
        var data = {
            "tempKeys": [
                {
                    "entityType": "OrderCustomer:#BL.Orders",
                    "values": [
                        -25
                    ]
                }
            ],
            "entityGroupMap": {
                "OrderCustomer:#BL.Orders": {
                    "entities": [
                        {
                            "Id": -25,
                            "Active": true,
                            "OrderId": -1,
                            "CustomerId": 1,
                            "IsLeadCustomer": true,
                            "entityAspect": {
                                "tempNavPropNames": [
                                    "Order"
                                ],
                                "entityState": "Added"
                            }
                        }
                    ]
                },
                "Customer:#BL.Customers": {
                    "entities": [
                        {
                            "Id": 1,
                            "CreateDate": "2013-10-24T13:48:56.000Z",
                            "UpdateDate": "2014-04-01T16:03:02.000Z",
                            "Active": true,
                            "FirstName": "\u05d0\u05d5\u05dc\u05d2",
                            "LastName": "\u05de\u05d6'\u05d1",
                            "FirstNameEng": "Oleg",
                            "LastNameEng": "Mezhv",
                            "Email": "mail@mail.com",
                            "PersonalIdNumber": "12345",
                            "CustomerAddressId": 1141,
                            "Phone1Type": "LandLine",
                            "Phone1Number": "555555",
                            "Phone2Type": "LandLine",
                            "Phone2Number": "0",
                            "Phone3Type": "LandLine",
                            "Phone3Number": "0",
                            "NewsLetterSubscription": false,
                            "AgeType": "Adult",
                            "Gender": "Female",
                            "DOB": "2010-10-10T00:00:00.000Z",
                            "AgencyId": 5,
                            "entityAspect": {
                                "entityState": "Unchanged"
                            }
                        }
                    ]
                }
            },
            "metadataVersion": "1.0.5"
        };

        var r= manager.importEntities(JSON.stringify(data));
        ok(r.entities.length > 0, "length should be  > 0");
    });


    test("toJSONSafe", function () {
        var o = {
            a: 1,
            b: null,
            c: true,
            d: false,
            e: { e1: "xxx", e2: { e21: 33, e22: undefined, e23: null } },
            f: ["adfasdf", 3, null, undefined, { f1: 666, f2: "adfasf", f3: false }]
        };
        var o1 = toJSONSafe(o);
        checkJSONSafe(o1);
        var s1 = JSON.stringify(o1);

        o.e.e2.x = o;
        o1 = toJSONSafe(o)
        checkJSONSafe(o1);
        s1 = JSON.stringify(o1);
        ok(o1.e.e2.x === undefined);
        delete o.e.e2.x;

        o.f.push(o);
        o1 = toJSONSafe(o)
        checkJSONSafe(o1);
        s1 = JSON.stringify(o1);
        ok(o1.f[o1.f.length-1] === undefined);
        ok(o1.f[1] === 3)
        
    });

    function checkJSONSafe(o1) {
        ok(o1.e.e2.e21 === 33);
        ok(o1.e.e2.e23 === null);
        ok(o1.e.e2.e22 === undefined); // interesting case.
        ok(!("e22" in o1.e.e2));
        ok(o1.f[4].f2 === "adfasf");
    }

    test("hasCycles", function () {
        var o = {
            a: 1,
            b: null,
            c: true,
            d: false,
            e: { e1: "xxx", e2: { e21: 33, e22: undefined, e23: null } },
            f: ["adfasdf", 3, null, undefined, { f1: 666, f2: "adfasf", f3: false }]
        };
        var hasCycles = __hasCycles(o);
        ok(!hasCycles, "should not have cycles");
        o.e.e2.x = o;
        hasCycles = __hasCycles(o);
        ok(hasCycles, "should have cycles");
        delete o.e.e2.x;
        var hasCycles = __hasCycles(o);
        ok(!hasCycles, "should not have cycles");
        o.f.push(o);
        hasCycles = __hasCycles(o);
        ok(hasCycles, "should have cycles");
    });

    //function toJSONSafe(obj) {
    //    if (obj !== Object(obj)) return obj; // primitive value
    //    if (obj._$visited) return undefined;
    //    if (obj.toJSON) {
    //        obj = obj.toJSON();
    //    }
    //    obj._$visited = true;
    //    var result;
    //    if (obj instanceof Array) {
    //        result = obj.map(toJSONSafe);
    //    } else if (typeof (obj) === "function") {
    //        result = undefined;
    //    } else {
    //        var result = {};
    //        for (var prop in obj) {
    //            if (prop === "_$visited") continue;
    //            var val = toJSONSafe(obj[prop]);
    //            if (val === undefined) continue;                   
    //            result[prop] = val;
    //        }
    //    }
    //    delete obj._$visited;
    //    return result;
    //}
    
    function __hasCycles(obj) {
        if (obj !== Object(obj)) return false; // primitive value
        if (obj._$visited) return true;
        obj._$visited = true;
        var result = false;
        if (obj instanceof Array) {
            result = obj.some(__hasCycles);
        } else {
            for (var prop in obj) {
                if (__hasCycles(obj[prop])) {
                    result = true;
                    break;
                }
            }
        }
        delete obj._$visited;
        return result;
    }

    test("module with setup/teardown", function () {
        expect(1);
        ok(true);
    });
    
    test("mock metaDataService", function() {

        if (testFns.modelLibrary == "backbone") {
            ok(true, "NOT APPLICABLE");
            return;
        }

        //1st step
        var mockDataService = new breeze.DataService({
            serviceName: "mockDataService",
            hasServerMetadata: false
        });

        var mockMetadataStore = new breeze.MetadataStore(
            {
                namingConvention: breeze.NamingConvention.camelCase
            });

        var queryOptions = new breeze.QueryOptions({
            fetchStrategy: breeze.FetchStrategy.FromLocalCache
        });

        var entityManager = new breeze.EntityManager({
            dataService: mockDataService,
            metadataStore: mockMetadataStore,
            queryOptions: queryOptions
        });
        // 2nd step
        var et = new breeze.EntityType({
            shortName: "Tag",
            namespace: "Football.Models",
            autoGeneratedKeyType: breeze.AutoGeneratedKeyType.Identity,
            defaultResourceName: "Tag"
        });
        et.addProperty(new breeze.DataProperty({
            name: "id",
            dataType: breeze.DataType.Int32,
            isNullable: false,
            isPartOfKey: true
        }));
        et.addProperty(new breeze.DataProperty({
            name: "name",
            dataType: breeze.DataType.String,
            isNullable: false
        }));
        mockMetadataStore.addEntityType(et);
        mockMetadataStore.registerEntityTypeCtor("Tag", null);

        // mockMetadataStore.setEntityTypeForResourceName("Tag", et);
        // mockMetadataStore.addDataService(mockDataService);
        
        //3rd step 
        var etType = mockMetadataStore.getEntityType("Tag");
        var newTag = etType.createEntity({ id: 1, name: "tag" });
        entityManager.addEntity(newTag);
        // 4th step
        stop();
        breeze.EntityQuery.from("Tag").using(entityManager).execute().then(function(data) {
            var r = data.results;
            ok(r.length > 0, "Should have returned some results");
        }).fail(function(err) {
            ok(false, "should not get here");
        }).fin(start);

    });;


    test("isDate", function() {
        var a = null;
        ok(!core.isDate(a), "x should not be a date");
        var zzz = undefined;
        ok(!core.isDate(zzz), "zzzz should not be date");
        var dt1 = new Date();
        ok(core.isDate(dt1), "dt1 should be a date");
        var dt2 = new Date("xxx");
        ok(!core.isDate(dt2), "dt2 is not a date");
    });
    
    var factors = [31104000, // year (360*24*60*60) 
          2592000,             // month (30*24*60*60) 
          86400,               // day (24*60*60) 
          3600,                // hour (60*60) 
          60,                  // minute (60) 
          1];                  // second (1)

    test("durationToSeconds", function() {
        var secs = core.durationToSeconds("PT1S");
        ok(secs === 1, "should be 1");
        secs = core.durationToSeconds("PT3H20M1S");
        ok(secs === (3 * 60 * 60) + (20 * 60) + 1);
        secs = core.durationToSeconds("P2Y1MT20M1S");
        ok(secs === ((2 * factors[0]) + (1 * factors[1]) + (20 * factors[4]) + 1));
    });

    test("backbone", function() {
        var Person = Backbone.Model.extend({});
        var aPerson = new Person();
        ok(aPerson instanceof Person);

    });
    
    test("date comparison", function () {
        var dt1 = new Date();
        var dt2 = new Date(dt1.getTime());
        ok(dt1 != dt2);
        ok(dt1 !== dt2);
        ok(dt1 >= dt2);
        ok(dt1 <= dt2);
        
    });

    test("iso date conversion", function() {
        var dt1 = new Date(Date.now());
        ok(core.isDate(dt1));
        var dt1AsString = dt1.toISOString();
        var dt1a = new Date(Date.parse(dt1AsString));
        // var dt1a = core.dateFromIsoString(dt1AsString);
        ok(dt1.getTime() === dt1a.getTime());
    });

    test("regex function matching", function () {
        // hacking into FnNode - just for testing - this is not the way these would ever get used in a real app.
        var entity = new TestEntity();
        var ms = new MetadataStore();
        var mt = new EntityType(ms);
        var fo = breeze.FilterQueryOp.Equals;

        // fo is only needed in this one case.
        var node0 = breeze.FnNode.create("CompanyName", mt, fo);
        var val0 = node0.fn(entity);
        ok(val0 == "Test Company 1");
        
        var node1 = breeze.FnNode.create("substring(toUpper(CompanyName), length('adfasdf'))", mt);
        var val1 = node1.fn(entity);
        ok(val1 === 'MPANY 1');
        var url1 = node1.toODataFragment(mt);

        var node2 = breeze.FnNode.create("substring(toUpper(toLower(CompanyName)), length('adfa,sdf'))", mt);
        var val2 = node2.fn(entity);
        var url2 = node2.toODataFragment(mt);
        
        var node3 = breeze.FnNode.create("substring(substring(toLower(CompanyName), length('adf,asdf')),5)", mt);
        var val3 = node3.fn(entity);
        var url3 = node3.toODataFragment(mt);

        var node4 = breeze.FnNode.create("substring(CompanyName, length(substring('xxxxxxx', 4)))", mt);
        var val4 = node4.fn(entity);
        var url4 = node4.toODataFragment(mt);
        
    });

    var TestEntity = function() {
        this.CompanyName = "Test Company 1";
        
    };
    
    TestEntity.prototype.getProperty = function(propName) {
        return this[propName];
    };
    
    

    test("dual purpose func and object", function () {
        var fn = function () {
        };
        var obj = {};
        obj["foo"] = fn;
        obj["foo"]["bar"] = 999;
        ok(999 === obj.foo.bar);
        ok(obj.foo() === undefined);
    });

    test("attaching a property to a string is a noop", function () {
        var foo = "abcd";
        foo.extra = "efgh";
        var extra = foo.extra;
        ok(extra === undefined);
    });


    test("createFromPrototype semantics", function () {
        var literal1 = { a: 1, b: 2 };
        var literal2 = { a: 999, b: 1000 };
        var proto = {
            nextId: 1,
            increment: function () {
                this.a = this.a + 1;
            }
        };
        var newLit1 = createFromPrototype(proto, literal1);
        var newLit2 = createFromPrototype(proto, literal2);
        newLit1.increment();
        ok(newLit1.a === 2);

    });

    test("createFromPrototype semantics2", function () {
        var p1Data = { age: 10, hair: "brown" };
        var p2Data = { age: 20, hair: "red" };


        var person = {
            nextId: 1,
            incrementAge: function () {
                this.age = this.age + 1;
            }
        };

        var male = {
            sex: "M"
        };

        var man = createFromPrototype(person, male);

        var man1 = createFromPrototype(man, p1Data);
        var man2 = createFromPrototype(man, p2Data);

        man1.incrementAge();
        ok(man1.age === 11);
        ok(man2.sex === "M");
        ok(man.isPrototypeOf(man1));
        ok(person.isPrototypeOf(man1));

    });

    function notest() {
    }

    test("Chrome defineProperty bug - bad behavior", function () {
        var Person = function (firstName, lastName) {
            this.firstName = firstName;
            this.lastName = lastName;
        };

        var proto = Person.prototype;

        var earlyPerson = new Person("early", "person");

        function makePropDescription(propName) {
            return {
                get: function () {
                    return this["_" + propName];
                },
                set: function (value) {
                    this["_" + propName] = value.toUpperCase();
                },
                enumerable: true,
                configurable: true
            };
        }

        Object.defineProperty(proto, "firstName", makePropDescription("firstName"));
        ok(earlyPerson.firstName === "early");
        var p1 = new Person("jim", "jones");
        var p2 = new Person("bill", "smith");
        ok(p1.firstName === "JIM");
        ok(p2.firstName === "BILL");
    });

    test("IE 9 defineProperty bug - better workaround", function () {
        var Person = function (firstName, lastName) {
            this.firstName = firstName;
            this.lastName = lastName;
        };

        var proto = Person.prototype;
        proto._pendingSets = [];
        proto._pendingSets.schedule = function (entity, propName, value) {
            this.push({ entity: entity, propName: propName, value: value });
            if (!this.isPending) {
                this.isPending = true;
                var that = this;
                setTimeout(function () { that.process(); });
            }
        };
        proto._pendingSets.process = function () {
            if (this.length === 0) return;
            this.forEach(function (ps) {
                if (!ps.entity._backingStore) {
                    ps.entity._backingStore = {};
                }
                ps.entity[ps.propName] = ps.value;
            });
            this.length = 0;
            this.isPending = false;
        };

        function makePropDescription(propName) {
            return {
                get: function () {
                    var bs = this._backingStore;
                    if (!bs) {
                        proto._pendingSets.process();
                        bs = this._backingStore;
                        if (!bs) return;
                    }
                    return bs[propName];
                },
                set: function (value) {
                    var bs = this._backingStore;
                    if (!bs) {
                        proto._pendingSets.schedule(this, propName, value);
                    } else {
                        bs[propName] = value ? value.toUpperCase() : null;
                    }
                },
                enumerable: true,
                configurable: true
            };
        }

        Object.defineProperty(proto, "firstName", makePropDescription("firstName"));

        var p1 = new Person("jim", "jones");
        // fails on next line
        var p2 = new Person("bill", "smith");
        var p3 = new Person();
        var p1name = p1.firstName;
        var p3name = p3.firstName;
        p3.firstName = "fred";

        ok(p1.firstName === "JIM");
        ok(p2.firstName === "BILL");


    });

    // change to test to see it crash in ie. - works in Chrome and FF.
    notest("IE 9 defineProperty bug - CRASH", function () {
        var Person = function (firstName, lastName) {
            this.firstName = firstName;
            this.lastName = lastName;
        };

        var proto = Person.prototype;

        function makePropDescription(propName) {
            return {
                get: function () {
                    if (!this.backingStore) {
                        this.backingStore = {};
                    }
                    return this.backingStore[propName];
                },
                set: function (value) {
                    if (!this.backingStore) {
                        this.backingStore = {};
                    }
                    if (value) {
                        this.backingStore[propName] = value.toUpperCase();
                    }
                    ;
                },
                enumerable: true,
                configurable: true
            };
        }


        Object.defineProperty(proto, "firstName", makePropDescription("firstName"));

        var p1 = new Person("jim", "jones");
        // fails on next line
        var p2 = new Person("bill", "smith");
        ok(p1.firstName === "JIM");
        ok(p2.firstName === "BILL");


    });


    test("ie defineProperty bug - workaround", function () {
        var Person = function (firstName, lastName) {
            this.firstName = firstName;
            this.lastName = lastName;

        };
        var proto = Person.prototype;

        var earlyPerson = new Person("early", "person");

        Object.defineProperty(proto, "firstName", makePropDescription("firstName"));
        proto._backups = [];

        function getBackingStore(obj) {
            // idea here is that we CANNOT create a new property on 'this' from
            // within property getter/setter code. IE has real issues with it.
            var bs = obj._backingStore;
            if (bs) return bs;
            var prt = Object.getPrototypeOf(obj);
            var backups = prt._backups;

            var matchingBackup = core.arrayFirst(backups, function (backup) {
                return backup.obj === obj;
            });
            if (matchingBackup) {
                bs = matchingBackup.backingStore;
            } else {
                bs = {};
                backups.push({ obj: obj, backingStore: bs });
            }
            if (backups.length > 3) {
                setTimeout(function () {
                    updateBackingStores(prt);
                }, 0);
            }
            return bs;
        }

        // needed for chrome.

        function startTracking(obj) {
            updateBackingStores(Object.getPrototypeOf(obj));
            // rest is needed for Chrome.
            if (obj._backingStore) return;
            obj._backingStore = {};
            Object.getOwnPropertyNames(obj).forEach(function (propName) {
                if (propName === '_backingStore') return;
                // next 3 lines insure any interception logic is hit.
                var value = obj[propName];
                delete obj[propName];
                obj[propName] = value;
            });
        }

        function updateBackingStores(proto) {
            if (proto._backups.length === 0) return;
            proto._backups.forEach(function (backup) {
                if (!backup.obj._backingStore) {
                    backup.obj._backingStore = backup.backingStore;
                }
            });
            proto._backups.length = 0;
        }

        function makePropDescription(propName) {
            return {
                get: function () {
                    var bs = getBackingStore(this);
                    return bs[propName];
                },
                set: function (value) {
                    var bs = getBackingStore(this);
                    if (value) {
                        bs[propName] = value.toUpperCase();
                    }
                },
                enumerable: true,
                configurable: true
            };
        }

        earlyPerson.firstName = "still early";
        ok(earlyPerson.firstName === "still early");

        var p1 = new Person("jim", "jones");

        var p1a = new Person();
        startTracking(p1);
        startTracking(p1a);
        p1a.firstName = "xxx";
        ok(p1a.firstName === "XXX");
        // used to fail on the next line 
        var p2 = new Person("bill", "smith");
        startTracking(p2);
        ok(p1.firstName === "JIM");
        ok(p2.firstName === "BILL");

        ok(p1a.firstName === "XXX");
        ok(p1.firstName === "JIM");
        ok(p2.firstName === "BILL");
    });


    test("funclet test", function () {

        var foos = [
            { id: 1, name: "Abc" },
            { id: 2, name: "def" },
            { id: 3, name: "ghi" }
        ];

        ok(foos[0] === core.arrayFirst(foos, core.propEq("name", "Abc")));
        ok(foos[2] === core.arrayFirst(foos, core.propEq("id", 3)));
    });

    test("enum test", function () {

        var proto = {
            isBright: function () { return this.toString().toLowerCase().indexOf("r") >= 0; },
            isShort: function () { return this.getName().length <= 4; }
        };

        var Color = new Enum("Color", proto);
        Color.Red = Color.addSymbol();
        Color.Blue = Color.addSymbol();
        Color.Green = Color.addSymbol();

        //    Color.RedOrBlue = Color.or(Color.Red, Color.Blue);
        //    var isB = Color.RedOrBlue.isBright();
        //    var getSymbols = Color.getSymbols();
        //    var name = Color.RedOrBlue.name();

        ok(Color.Red.isBright(), "Red should be 'bright'");
        ok(!Color.Blue.isBright(), "Blue should not be 'bright'");
        ok(!Color.Green.isShort(), "Green should not be short");

        var Shape = new Enum("Shape");
        Shape.Round = Shape.addSymbol();
        Shape.Square = Shape.addSymbol();

        ok(Shape.Round.isBright === undefined, "Shape.Round.isBright should be undefined");

        ok(Color instanceof Enum, "color should be instance of Enum");
        ok(Enum.isSymbol(Color.Red), "Red should be a symbol");
        ok(Color.contains(Color.Red), "Color should contain Red");
        ok(!Color.contains(Shape.Round), "Color should not contain Round");
        ok(Color.getSymbols().length === 3, "There should be 3 colors defined");

        ok(Color.Green.toString() == "Green", "Green.toString should be 'Green' was:" + Color.Green.toString());
        ok(Shape.Square.parentEnum === Shape, "Shape.Square's parent should be Shape");

    });
    
    test("enum test2", function () {

        var prototype = {
            nextDay: function () {
                var nextIndex = (this.dayIndex+1) % 7;
                return DayOfWeek.getSymbols()[nextIndex];
            }
        };

        var DayOfWeek = new Enum("DayOfWeek", prototype);
        DayOfWeek.Monday = DayOfWeek.addSymbol( { dayIndex: 0 });
        DayOfWeek.Tuesday = DayOfWeek.addSymbol( { dayIndex: 1 });
        DayOfWeek.Wednesday = DayOfWeek.addSymbol( { dayIndex: 2 });
        DayOfWeek.Thursday = DayOfWeek.addSymbol( { dayIndex: 3 });
        DayOfWeek.Friday = DayOfWeek.addSymbol( { dayIndex: 4 });
        DayOfWeek.Saturday = DayOfWeek.addSymbol( { dayIndex: 5, isWeekend: true });
        DayOfWeek.Sunday = DayOfWeek.addSymbol( { dayIndex: 6, isWeekend: true });
        DayOfWeek.resolveSymbols();

      // custom methods
        ok(DayOfWeek.Monday.nextDay() === DayOfWeek.Tuesday);
        ok(DayOfWeek.Sunday.nextDay() === DayOfWeek.Monday);
        // custom properties
        ok(DayOfWeek.Tuesday.isWeekend === undefined);
        ok(DayOfWeek.Saturday.isWeekend == true);
        // Standard enum capabilities
        ok(DayOfWeek instanceof Enum);
        ok(Enum.isSymbol(DayOfWeek.Wednesday));
        ok(DayOfWeek.contains(DayOfWeek.Thursday));
        ok(DayOfWeek.Tuesday.parentEnum == DayOfWeek);
        ok(DayOfWeek.getSymbols().length === 7);
        ok(DayOfWeek.Friday.toString() === "Friday");
        var x = DayOfWeek.fromName("Tuesday");
        var y = DayOfWeek.fromName("xxx");

    });
    

    // return a new object that like the 'object' with ths prototype stuck in 'underneath'
    function createFromPrototype(prototype, obj) {
        var newObject = Object.create(prototype);
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                newObject[prop] = obj[prop];
            }
        }

        return newObject;
    };

})(breezeTestFns);