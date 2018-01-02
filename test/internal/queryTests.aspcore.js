(function (testFns) {
  var breeze = testFns.breeze;
  var core = breeze.core;
  var Event = core.Event;

  var EntityQuery = breeze.EntityQuery;
  var DataService = breeze.DataService;
  var MetadataStore = breeze.MetadataStore;
  var EntityManager = breeze.EntityManager;
  var EntityKey = breeze.EntityKey;
  var FilterQueryOp = breeze.FilterQueryOp;
  var Predicate = breeze.Predicate;
  var QueryOptions = breeze.QueryOptions;
  var FetchStrategy = breeze.FetchStrategy;
  var MergeStrategy = breeze.MergeStrategy;

  var newEm = testFns.newEm;
  var wellKnownData = testFns.wellKnownData;
  var skipIfMongoExpand = testFns.skipIf("mongo", "does not support 'expand'");
  var skipIfHibFuncExpr = testFns.skipIf("hibernate", "TODO: does not yet support function expressions");

  module("query - basic", {
    beforeEach: function (assert) {
      testFns.setup(assert);
    },
    afterEach: function (assert) {
    }
  });



  testFns.skipIf("mongo", "eventually will not use OData syntax").
  skipIf("sequelize,hibernate,aspcore", "does not use OData syntax").
  test("check if correct OData datatype", function () {
    var em = newEm();
    var query = EntityQuery.from('Products').using(em).where({
      'unitPrice': {
        '>=': {
          value: 100,
          dataType: breeze.DataType.Decimal
        }
      }
    });
    var url = query._toUri(em);
    ok(url.indexOf("100m") >= 0, "should have formatted the unitPrice as a decimal")
    var query2 = EntityQuery.from('Products').using(em).where('unitPrice', '>=', {
      value: 100,
      dataType: breeze.DataType.Decimal
    });
    var url2 = query2._toUri(em);
    ok(url2.indexOf("100m") >= 0, "should have formatted the unitPrice as a decimal - again")

  });

  test("can handle simple json query syntax ", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from('Customers').using(em).where({ 'city': { '==': 'London' } });
    var url = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var r = data.results;
      ok(r.length > 0, "should have gotten some results");
    }).fail(testFns.handleFail).fin(done);
  });

  test("can handle parens in right hand side of predicate", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = new EntityQuery("Customers");

    // a valid query that returns no data
    var q2 = query.where('city', 'startsWith', 'Lon (don )');

    ok(true, "should get here");
    em.executeQuery(q2).then(function (data) {
      var r = data.results;
      ok(r.length == 0, "should have gotten 0 results");
    }).fail(testFns.handleFail).fin(done);
  });


  test("should not throw when add where clause to query with a `.fromEntityType` value", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = new EntityQuery("Customers");

    // Don't care about the query result.
    // Just want the `fromEntityType` property to set as a side effect or execution
    em.executeQueryLocally(query);

    // now we can repro the bug reported in https://github.com/Breeze/breeze.js/issues/44
    // This next statement throws the "undefined is not a function" exception in 1.5.1
    var q2 = query.where('city', 'eq', 'London');

    ok(true, "should get here");

    em.executeQuery(q2).then(function (data) {
      var r = data.results;
      ok(r.length > 0, "should have gotten some results");
    }).fail(testFns.handleFail).fin(done);
  });

  test("with 'in'", function (assert) {
    var done = assert.async();
    var em1 = newEm();

    var countries = ['Austria', 'Italy', 'Norway']
    var query = EntityQuery.from("Customers")
      .where("country", 'in', countries);

    em1.executeQuery(query).then(function (data) {
      var r = data.results;
      ok(r.length > 0, "should have gotten some results");
      var isOk = r.every(function (cust) {
        return countries.indexOf(cust.getProperty("country")) >= 0;
      })
      ok(isOk, "should be able to verify in test");
      var r2 = em1.executeQueryLocally(query);
      ok(r2.length === r.length);
    }).fail(testFns.handleFail).fin(done);
  });

  //Using EntityManager em1, query Entity A and it's nav property (R1) Entity B1.
  //Using EntityManager em2, query A and change it's nav property to B2. Save the change.
  //Using EntityManager em1, still holding A and B1, query A, including it's expanded nav property R1.
  //In R1.subscribeChanges, the correct new value of B2 will exist as R1's value but it will have a status of "Detached".
  test("nav prop change and expand", function (assert) {
    var done = assert.async();
    var em1 = newEm();
    var em2 = newEm();
    var p = Predicate.create("freight", ">", 100).and("customerID", "!=", null);
    var query = new breeze.EntityQuery()
      .from("Orders")
      .where(p)
      .orderBy("orderID")
      .expand("customer")
      .take(1);

    var oldCust, newCust1a, newCust1b, order1, order1a, order1b;
    em1.executeQuery(query).then(function (data) {
      order1 = data.results[0];
      oldCust = order1.getProperty("customer");
      ok(oldCust != null, "oldCust should not be null");
      return em2.executeQuery(EntityQuery.fromEntityKey(order1.entityAspect.getKey()));

    }).then(function (data2) {
      order1a = data2.results[0];
      ok(order1.entityAspect.getKey().equals(order1a.entityAspect.getKey()), "order keys should be the same");

      var customerType = em2.metadataStore.getEntityType("Customer");
      newCust1a = customerType.createEntity();
      newCust1a.setProperty("companyName", "Test_compName");
      order1a.setProperty("customer", newCust1a);
      return em2.saveChanges();
    }).then(function (sr) {
      em1.entityChanged.subscribe(function (args) {
        var entity = args.entity;
        ok(entity != null, "entity should not be null");
        ok(entity.entityAspect.entityState != EntityState.Detached, "entityState should not be detached");
      });
      return em1.executeQuery(query);
    }).then(function (data3) {
      order1b = data3.results[0];
      ok(order1b == order1, "should be the same order");
      newCust1b = order1b.getProperty("customer");
      ok(newCust1a.entityAspect.getKey().equals(newCust1b.entityAspect.getKey()), "customer keys should be the same");
      ok(newCust1b != null, "newCust3 should not be null");
      ok(newCust1b.entityAspect.entityState.isUnchanged(), "should be unchanged");
    }).fail(testFns.handleFail).fin(done);
  });

  test("by entity key without preexisting metadata", function (assert) {
    var done = assert.async();
    var manager = new breeze.EntityManager(testFns.serviceName);

    manager.fetchMetadata().then(function () {
      var empType = manager.metadataStore.getEntityType("Employee");
      var entityKey = new EntityKey(empType, 1);
      var query = EntityQuery.fromEntityKey(entityKey);
      return manager.executeQuery(query);
    }).then(function (data) {
      var results = data.results;
      ok(results.length === 1, "should have returned a single record");
      var emp = results[0];
    }).fail(testFns.handleFail).fin(done);
  });

  test("same field twice", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var p = Predicate.create("freight", ">", 100).and("freight", "<", 200);

    var query = new breeze.EntityQuery()
      .from("Orders")
      .where(p);

    manager.executeQuery(query).then(function (data) {
      var orders = data.results;
      ok(orders.length > 0, "should be some results");
      orders.forEach(function (o) {
        var f = o.getProperty("freight");
        if (f > 100 && f < 200) {

        } else {
          ok(false, "freight should be > 100 and < 200");
        }
      });
    }).fail(testFns.handleFail).fin(done);
  });

  test("one to one", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Orders")
      .where("internationalOrder", "==", null);

    manager.executeQuery(query).then(function (data) {
      ok(false, "shouldn't get here");
    }).fail(function (e) {
      ok(true, "should get here");
    }).fin(done);

  });

  test("with bad criteria", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where("badPropName", "==", "7");

    manager.executeQuery(query).then(function (data) {
      ok(false, "shouldn't get here");
    }).fail(function (e) {
      ok(true, "should get here");
    }).fin(done);

  });

  test("with bad criteria - 2", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("AltCustomers")
      .where("xxxx", "<", 7);

    manager.executeQuery(query).then(function (data) {
      ok(false, "shouldn't get here");
    }).fail(function (e) {
      ok(true, "should get here");
    }).fin(done);

  });

  test("expand not working with paging or inlinecount", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var predicate = Predicate.create(testFns.orderKeyName, "<", 10500);

    var query = new breeze.EntityQuery()
      .from("Orders")
      .expand("orderDetails, orderDetails.product")
      .where(predicate)
      .inlineCount()
      .orderBy("orderDate")
      .take(2)
      .skip(1)
      .using(manager)
      .execute()
      .then(function (data) {
        ok(data.inlineCount > 0, "should have an inlinecount");

        var localQuery = breeze.EntityQuery
          .from('OrderDetails');

        // For ODATA this is a known bug: https://aspnetwebstack.codeplex.com/workitem/1037
        // having to do with mixing expand and inlineCount
        // it sounds like it might already be fixed in the next major release but not yet avail.

        var orderDetails = manager.executeQueryLocally(localQuery);
        ok(orderDetails.length > 0, "should not be empty");

        var localQuery2 = breeze.EntityQuery
          .from('Products');

        var products = manager.executeQueryLocally(localQuery2);
        ok(products.length > 0, "should not be empty");
      }).fail(testFns.handleFail).fin(done);
  });

  test("test date in projection", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Orders")
      .where("orderDate", "!=", null)
      .orderBy("orderDate")
      .take(3);

    var orderDate;
    var orderDate2;

    manager.executeQuery(query).then(function (data) {
      var result = data.results[0];
      orderDate = result.getProperty("orderDate");
      ok(core.isDate(orderDate), "orderDate should be of 'Date type'");
      var manager2 = newEm();
      var query = new breeze.EntityQuery()
        .from("Orders")
        .where("orderDate", "!=", null)
        .orderBy("orderDate")
        .take(3)
        .select("orderDate");
      return manager2.executeQuery(query);
    }).then(function (data2) {
      orderDate2 = data2.results[0].orderDate;
      if (testFns.DEBUG_ODATA) {
        ok(core.isDate(orderDate2), "orderDate2 is not a date - ugh'");
        var orderDate2a = orderDate2;
      } else {
        ok(!core.isDate(orderDate2), "orderDate pojection should not be a date except with ODATA'");
        var orderDate2a = breeze.DataType.parseDateFromServer(orderDate2);
      }
      ok(orderDate.getTime() === orderDate2a.getTime(), "should be the same date");
    }).fail(testFns.handleFail).fin(done);

  });

  test("empty predicates", function (assert) {
    var done = assert.async();

    var manager = newEm();
    var predicate1 = Predicate.create("lastName", "startsWith", "D");
    var predicate2 = Predicate.create("firstName", "startsWith", "A");
    var predicates = Predicate.or([undefined, predicate1, null, predicate2, null]);
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(predicates);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
      data.results.forEach(function (e) {
        var firstName = e.getProperty("firstName");
        var lastName = e.getProperty("lastName");
        var ok1 = firstName && firstName.indexOf("A") === 0;
        var ok2 = lastName && lastName.indexOf("D") === 0;
        ok(ok1 || ok2, "predicate should be satisfied");
      });

    }).fail(testFns.handleFail).fin(done);

  });

  test("empty predicates 2", function (assert) {
    var done = assert.async();
    var manager = newEm();

    // var predicate1 = Predicate.create("lastName", "startsWith", "D");

    var predicates = Predicate.and([]);
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(predicates);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 6, "there should be records returned");
    }).fail(testFns.handleFail).fin(done);

  });

  test("empty predicates 3", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var predicate1 = Predicate.create("lastName", "startsWith", "D").or("firstName", "startsWith", "A");
    var predicates = Predicate.and([null, undefined, predicate1]);
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(predicates);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
      var empId = data.results[0].getProperty(testFns.employeeKeyName);
      if (!testFns.DEBUG_MONGO) {
        ok(empId < 6, "should <  6");
      }
    }).fail(testFns.handleFail).fin(done);

  });

  test("empty predicates 4", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var predicates = Predicate.and([undefined, null, null]);
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(predicates);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 6, "there should be records returned");
    }).fail(testFns.handleFail).fin(done);

  });


  test("empty clauses", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where().orderBy().select().expand().take().skip();

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
    }).fail(testFns.handleFail).fin(done);

  });

  test("empty clauses - 2", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(null).orderBy(null).select(null).expand(null).take(null).skip(null);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
    }).fail(testFns.handleFail).fin(done);

  });

  skipIfHibFuncExpr.
  skipIf("mongo", "does not yet support 'year' function").
  test("function expr - date(year) function", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where("year(hireDate)", ">", 1993);

    manager.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length > 0, "there should be records returned");
      var emps2 = manager.executeQueryLocally(query);
      ok(emps2.length == emps.length, "should be the same recs");

    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  skipIf("mongo", "does not support 'year' odata predicate").
  test("function expr - date(month) function", function (assert) {

    var done = assert.async();
    var manager = newEm();
    var p = Predicate.create("month(hireDate)", ">", 6).and("month(hireDate)", "<", 11);
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(p);

    manager.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length > 0, "there should be records returned");
      var emps2 = manager.executeQueryLocally(query);
      ok(emps2.length == emps.length, "should be the same recs");

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo,sequelize,hibernate,aspcore", "does not support the 'add' OData predicate").
  test("OData predicate - add ", function (assert) {

    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Employees")
      .where("EmployeeID add ReportsToEmployeeID gt 3");

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
      try {
        manager.executeQueryLocally(query);
        ok(false, "shouldn't get here");
      } catch (e) {
        ok(e, "should throw an exception");
      }
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo,sequelize,hibernate,aspcore", "does not support the 'add' OData predicate").
  test("OData predicate - add combined with regular predicate", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var predicate = Predicate.create("EmployeeID add ReportsToEmployeeID gt 3").and("employeeID", "<", 9999);

    var query = new breeze.EntityQuery()
      .from("Employees")
      .where(predicate);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length > 0, "there should be records returned");
      try {
        manager.executeQueryLocally(query);
        ok(false, "shouldn't get here");
      } catch (e) {
        ok(e, "should throw an exception");
      }
    }).fail(testFns.handleFail).fin(done);
  });


  test("take(0)", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers")
      .take(0);

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length === 0, "should be no records returned");
    }).fail(testFns.handleFail).fin(done);
  });

  test("take(0) with inlinecount", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers")
      .take(0)
      .inlineCount();

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length === 0, "should be no records returned");
      ok(data.inlineCount > 0, "should have an inlinecount");
    }).fail(testFns.handleFail).fin(done);
  });

  test("select with inlinecount", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers")
      .select("companyName, region, city")
      .inlineCount();

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length == data.inlineCount, "inlineCount should match return count");

    }).fail(testFns.handleFail).fin(done);
  });

  test("select with inlinecount and take", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers")
      .select("companyName, region, city")
      .take(5)
      .inlineCount();

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length == 5, "should be 5 records returned");
      ok(data.inlineCount > 5, "should have an inlinecount > 5");
    }).fail(testFns.handleFail).fin(done);
  });

  test("select with inlinecount and take and orderBy", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers")
      .select("companyName, region, city")
      .orderBy("city, region")
      .take(5)
      .inlineCount();

    manager.executeQuery(query).then(function (data) {
      ok(data.results.length == 5, "should be 5 records returned");
      ok(data.inlineCount > 5, "should have an inlinecount > 5");
    }).fail(testFns.handleFail).fin(done);
  });


  test("check getEntityByKey", function (assert) {
    var done = assert.async();
    var manager = newEm();
    var query = new breeze.EntityQuery()
      .from("Customers");

    manager.executeQuery(query).then(function (data) {
      var cust1 = data.results[0];
      var key = cust1.getProperty(testFns.customerKeyName);
      var cust2 = manager.getEntityByKey("Customer", key);
      ok(cust1 === cust2);
    }).fail(function (e) {
      ok(false, e.message);
    }).fin(done);
  });

  test("local cache query for all Suppliers in fax 'Papa'", function (assert) {
    var done = assert.async();
    var query = new breeze.EntityQuery("Suppliers");
    var em = newEm(); // creates a new EntityManager configured with metadata

    em.executeQuery(query)
      .then(function (data) {
        var count = data.results.length;
        ok(count > 0, "supplier query returned " + count);

        var predicate = breeze.Predicate.create(testFns.supplierKeyName, '==', 0)
          .or('fax', '==', 'Papa');

        var localQuery = breeze.EntityQuery
          .from('Suppliers')
          .where(predicate)
          .toType('Supplier');

        var suppliers = em.executeQueryLocally(localQuery);
        // Defect #2486 Fails with "Invalid ISO8601 duration 'Papa'"
        equal(suppliers.length, 0, "local query should succeed with no results");
      }).fail(testFns.handleFail).fin(done);
  });


  test("inlineCount when ordering results by simple navigation path", function (assert) {
    var done = assert.async();
    var em = newEm();
    // var pred = new Predicate("employeeID", ">", 1).and("employeeID", "<", 6);
    var pred = new Predicate("shipCity", "startsWith", "A");
    var query = new breeze.EntityQuery.from("Orders")
      .where(pred)
      .orderBy("customerID");
    // .orderBy("customer.companyName")

    var totalCount;
    em.executeQuery(query).then(function (data) {
      totalCount = data.results.length;
      ok(totalCount > 3, "totalCount should be > 3");
      var q2 = query.inlineCount(true).take(3);
      return em.executeQuery(q2);
    }).then(function (data2) {
      ok(data2.results.length === 3);
      ok(data2.inlineCount === totalCount, "inlineCount should equal totalCount");
    }).fail(testFns.handleFail).fin(done);
  });

  test("inlineCount when ordering results by nested navigation path", function (assert) {
    var done = assert.async();
    var em = newEm();
    // var pred = new Predicate("employeeID", ">", 1).and("employeeID", "<", 6);
    var pred = new Predicate("shipCity", "startsWith", "A");
    var query = new breeze.EntityQuery.from("Orders")
      .where(pred)
      // .orderBy("customerID");
      .orderBy("customer.companyName");

    var totalCount;
    em.executeQuery(query).then(function (data) {
      totalCount = data.results.length;
      ok(totalCount > 3, "totalCount should be > 3");
      var q2 = query.inlineCount(true).take(3);
      return em.executeQuery(q2);
    }).then(function (data2) {
      ok(data2.results.length === 3);
      ok(data2.inlineCount === totalCount, "inlineCount should equal totalCount");
    }).fail(testFns.handleFail).fin(done);
  });

  test("getAlfred", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Customers").where("companyName", "startsWith", "Alfreds");

    em.executeQuery(q).then(function (data) {
      var alfred = data.results[0];
      var alfredsID = alfred.getProperty(testFns.customerKeyName).toLowerCase();
      ok(alfredsID === wellKnownData.alfredsID);
    }).fail(testFns.handleFail).fin(done);
  });

  test("URL malformed with bad resource name combined with 'startsWith P'", function (assert) {
    var done = assert.async();
    var em = newEm();
    // we intentionally mispelled the resource name to cause the query to fail
    var q = EntityQuery.from("Customer").where("companyName", "startsWith", "P");

    em.executeQuery(q).then(function (data) {
      ok(true);
    }).fail(function (error) {
      if (testFns.DEBUG_ASPCORE) {
        ok(error.status == 404, "Should have recieved a 404"); // need to use middleware if we want more detail...
      } else if (testFns.DEBUG_MONGO) {
        ok(error.message.indexOf("Unable to locate") >= 0, "Bad error message");
      } else if (testFns.DEBUG_ODATA) {
        ok(error.message.indexOf("Not Found") >= 0, "Bad error message");
      } else if (testFns.DEBUG_SEQUELIZE) {
        ok(error.message.indexOf("Cannot find an entityType" > 0, "Bad error message"));
      } else if (testFns.DEBUG_HIBERNATE) {
        ok(error.message.indexOf("no entityType name registered" > 0, "Bad error message"));
      } else {
        ok(error.message.indexOf("No HTTP resource was found") >= 0, "Bad error message");
      }
    }).fin(done);
  });

  testFns.skipIf("sequelize,hibernate,mongo,aspcore", "does not support OData query syntax").
  test("raw OData query string", function (assert) {

    var done = assert.async();
    var em = newEm();
    var q = ""

    em.executeQuery("Customers?&$top=3").then(function (data) {
      var custs = data.results;
      ok(custs.length === 3, "should be 3 custs");
      var isOk = custs.every(function (c) {
        return c.entityType.shortName === "Customer";
      });
      ok(isOk, "all results should be customers");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("with take, orderby and expand", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q1 = EntityQuery.from("Products")
      .expand("category")
      .orderBy("category.categoryName desc, productName");

    var topTen;
    em.executeQuery(q1).then(function (data) {
      topTen = data.results.slice(0, 10);
      var q2 = q1.take(10);
      return em.executeQuery(q2);
    }).then(function (data2) {
      var topTenAgain = data2.results;
      for (var i = 0; i < 10; i++) {
        ok(topTen[i] === topTenAgain[i]);
      }
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("with take, skip, orderby and expand", function(assert) {
    var done = assert.async();
    var em = newEm();
    var q1 = EntityQuery.from("Products")
      .expand("category")
      .orderBy("category.categoryName, productName");

    var nextTen;
    em.executeQuery(q1).then(function (data) {
      nextTen = data.results.slice(10, 20);
      var q2 = q1.skip(10).take(10);
      return em.executeQuery(q2);
    }).then(function (data2) {
      var nextTenAgain = data2.results;
      for (var i = 0; i < 10; i++) {
        ok(nextTen[i] === nextTenAgain[i], extractDescr(nextTen[i]) + " -- " + extractDescr(nextTenAgain[i]));
      }
    }).fail(testFns.handleFail).fin(done);

  });

  function extractDescr(product) {
    var cat = product.getProperty("category");
    return cat && cat.getProperty("categoryName") + ":" + product.getProperty("productName");
  }

  test("with quotes", function (assert) {
    var done = assert.async();
    var em = newEm();

    var q = EntityQuery.from("Customers")
      .where("companyName", 'contains', "'")
      .using(em);


    q.execute().then(function (data) {
      ok(data.results.length > 0);
      var r = em.executeQueryLocally(q);
      ok(r.length === data.results.length, "local query should return same subset");
    }).fail(testFns.handleFail).fin(done);

  });

  test("bad query test", function (assert) {
    var done = assert.async();
    var em = newEm();

    var q = EntityQuery.from("EntityThatDoesnotExist")
      .using(em);

    q.execute().then(function (data) {
      ok(false, "should not get here");
    }).fail(function (e) {
      if (testFns.DEBUG_ASPCORE) {
        ok(e.status == 404, "should have received a 404 message")  ;
      } else if (testFns.DEBUG_ODATA) {
        ok(e.message == "Not Found", e.Message);
      } else {
        ok(e.message && e.message.toLowerCase().indexOf("entitythatdoesnotexist") >= 0, e.message);
      }
    }).fin(done);
  });

  // testFns.skipIf("mongo", "does not support 'expand'").
  skipIfMongoExpand.
  test("nested expand", function (assert) {
    var done = assert.async();
    var em = newEm();
    var em2 = newEm();
    var query = EntityQuery.from("OrderDetails").where("orderID", "<", 10255).expand("order.customer");

    em.executeQuery(query).then(function (data) {
      var details = data.results;
      details.forEach(function (od) {
        var order = od.getProperty("order");
        ok(order, "should have found an order");
        if (order.getProperty("customerID")) {
          var customer = order.getProperty("customer");
          ok(customer, "should have found a customer");
        }
      })

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("nested expand 3 level", function(assert) {

    var done = assert.async();
    var em = newEm();
    var em2 = newEm();
    var query = EntityQuery.from("Orders").take(5).expand("orderDetails.product.category");


    em.executeQuery(query).then(function (data) {
      var orders = data.results;
      var orderDetails = orders[0].getProperty("orderDetails");
      ok(orderDetails.length, "should have found order details");
      var product = orderDetails[0].getProperty("product");
      ok(product, "should have found a product");
      var category = product.getProperty("category");
      ok(category, "should have found a category");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("retrievedEntities - nested expand 2 level", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("OrderDetails").take(5).expand("order.customer");

    em.executeQuery(query).then(function (data) {
      var entities = data.retrievedEntities;
      ok(entities);
      ok(entities.length > 5, "Should have more than 5 entities, but had " + entities.length);

      var details = data.results;

      var isOk = details.some(function (od) {
        ok(entities.indexOf(od) >= 0, "entities should have orderDetail");
        var order = od.getProperty("order");
        ok(entities.indexOf(order) >= 0, "entities should have order");
        var cust = order.getProperty("customer");
        if (cust) {
          ok(entities.indexOf(cust) >= 0, "entities should have the customer");
          return true;
        } else {
          return false;
        }
      });
      ok(isOk, "at least some customers should have been retrieved");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("retrievedEntities - nested expand 3 level", function(assert) {
    var done = assert.async();

    var em = newEm();
    var query = EntityQuery.from("Orders").take(5).expand("orderDetails.product.category");

    em.executeQuery(query).then(function (data) {
      var entities = data.retrievedEntities;
      ok(entities);
      // removed because may change with structure of db.
      // ok(entities.length == 37, "Should have 37 entities, but had " + entities.length);

      var orders = data.results;
      for (var i = 0, ilen = orders.length; i < ilen; i++) {
        ok(entities.indexOf(orders[i]) >= 0, "entities should have the order");
        var orderDetails = orders[i].getProperty("orderDetails");

        for (var j = 0, jlen = orderDetails.length; j < jlen; j++) {
          ok(entities.indexOf(orderDetails[j]) >= 0, "entities should have the orderDetail");
          ok(entities.indexOf(orderDetails[j].getProperty("product")) >= 0, "entities should have the product");
          ok(entities.indexOf(orderDetails[j].getProperty("product").getProperty("category")) >= 0, "entities should have the category");
        }
      }
      var allEntities = em.getEntities();
      ok(allEntities.length == entities.length, "should have filled the cache with the same number of entities - i.e. no dups")

    }).fail(testFns.handleFail).fin(done);
  });

  var jsonResultsAdapter = new breeze.JsonResultsAdapter({
    name: "eventAdapter",
    extractResults: function (json) {
      return json.results;
    },
    visitNode: function (node, mappingContext, nodeContext) {
      var entityTypeName = 'OrderDetail';
      var entityType = entityTypeName && mappingContext.entityManager.metadataStore.getEntityType(entityTypeName, true);
      var propertyName = nodeContext.propertyName;
      var ignore = propertyName && propertyName.substr(0, 1) === "$";
      if (entityType) {
        if (testFns.DEBUG_HIBERNATE) {
          node.rowVersion = 77;
        } else {
          node.RowVersion = 77;
        }
      }
      return {
        entityType: entityType,
        nodeId: node.$id,
        nodeRefId: node.$ref,
        ignore: ignore
      };
    }
  });

  testFns.skipIf("mongo,odata", "does not work with this test's jsonResultsAdapter").
  test("using jsonResultsAdapter", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("OrderDetails").take(5).using(jsonResultsAdapter);

    em.executeQuery(query).then(function (data) {
      ok(data.results.length === 5, "should be 5 recs");
      var rv = data.results[0].getProperty("rowVersion");
      ok(rv === 77, "rowVersion should be 77");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo,odata", "does not work with this test's jsonResultsAdapter").
  test("using dataService with jsonResultsAdapter", function (assert) {
    var done = assert.async();
    var em = newEm();


    var oldDs = em.dataService;
    var newDs = new DataService({ serviceName: oldDs.serviceName, jsonResultsAdapter: jsonResultsAdapter });
    var query = EntityQuery.from("OrderDetails").take(5).using(newDs);

    em.executeQuery(query).then(function (data) {
      ok(data.results.length === 5, "should be 5 recs");
      var rv = data.results[0].getProperty("rowVersion");
      ok(rv === 77, "rowVersion should be 77");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo,odata", "does not work with this test's jsonResultsAdapter").
  test("using em with dataService with jsonResultsAdapter", function (assert) {
    var done = assert.async();
    var em = newEm();

    var oldDs = em.dataService;
    var newDs = new DataService({ serviceName: oldDs.serviceName, jsonResultsAdapter: jsonResultsAdapter });
    var em2 = new EntityManager({ dataService: newDs });
    var query = EntityQuery.from("OrderDetails").take(5);

    em2.executeQuery(query).then(function (data) {
      ok(data.results.length === 5, "should be 5 recs");
      var rv = data.results[0].getProperty("rowVersion");
      ok(rv === 77, "rowVersion should be 77");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("size test", function (assert) {
    var done = assert.async();
    var em = newEm();
    var em2 = newEm();
    var query = EntityQuery.from("Customers").take(5).expand("orders");

    var s1, s2, s3, s4, s5, s6;
    var difObj;
    em.executeQuery(query).then(function (data) {
      s1 = testFns.sizeOf(em);
      return em.executeQuery(query);
    }).then(function (data2) {
      s2 = testFns.sizeOf(em);
      em.clear();
      s3 = testFns.sizeOf(em);
      difObj = testFns.sizeOfDif(s2, s3);
      ok(difObj.dif, "should be a sizeDif");
      return em.executeQuery(query);
    }).then(function (data3) {
      s4 = testFns.sizeOf(em);
      ok(s1.size === s4.size, "sizes should be equal");
      em2 = newEm();
      return em2.executeQuery(query);
    }).then(function (data4) {
      s5 = testFns.sizeOf(em2);
      difObj = testFns.sizeOfDif(s1, s5);
      ok(difObj.dif == 0, "sizes should be equal but dif was: " + difObj.dif);

      em2.clear();
      s6 = testFns.sizeOf(em2);
      difObj = testFns.sizeOfDif(s3, s6);
      ok(difObj.dif == 0, "empty sizes should be equal but dif was: " + difObj.dif);

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("sizeof config", function (assert) {
    var done = assert.async();
    var em = newEm();
    var em2 = newEm();
    var query = EntityQuery.from("Customers").take(5).expand("orders");

    var s1, s2, s3, s4, s5, s6;
    var sizeDif;
    em.executeQuery(query).then(function (data) {
      s1 = testFns.sizeOf(breeze.config);
      return em.executeQuery(query);
    }).then(function (data2) {
      s2 = testFns.sizeOf(breeze.config);
      em.clear();
      s3 = testFns.sizeOf(breeze.config);
      return em.executeQuery(query);
    }).then(function (data3) {
      s4 = testFns.sizeOf(breeze.config);
      ok(s1.size === s4.size, "sizes should be equal");
      em2 = newEm();
      s5 = testFns.sizeOf(breeze.config);
      return em2.executeQuery(query);
    }).then(function (data4) {
      s6 = testFns.sizeOf(breeze.config);
      ok(s5.size === s6.size, "sizes should be equal");

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("size test property change", function (assert) {
    var done = assert.async();
    var em = newEm();
    var em2 = newEm();
    var query = EntityQuery.from("Customers").take(5).expand("orders");

    var s1, s2, s3, s4, s5, s6;
    var sizeDif, difObj;
    var hasChanges = em.hasChanges();

    em.entityChanged.subscribe(function (x) {
      var y = x;
    });
    em2.entityChanged.subscribe(function (x) {
      var y = x;
    });

    em.executeQuery(query).then(function (data) {
      s1 = testFns.sizeOf(em);
      return em.executeQuery(query);
    }).then(function (data2) {
      var custs = data2.results;
      custs.forEach(function (c) {
        var rv = c.getProperty("rowVersion");
        c.setProperty("rowVersion", rv + 1);
      });
      em.rejectChanges();
      s2 = testFns.sizeOf(em);
      difObj = testFns.sizeOfDif(s1, s2);
      sizeDif = Math.abs(difObj.dif);
      ok(sizeDif < 20, "s12 dif should be very small: " + sizeDif);
      em.clear();
      s3 = testFns.sizeOf(em);
      difObj = testFns.sizeOfDif(s2, s3);
      ok(difObj.dif, "should be a sizeDif result");
      return em.executeQuery(query);
    }).then(function (data3) {
      s4 = testFns.sizeOf(em);
      sizeDif = Math.abs(s1.size - s4.size);
      ok(sizeDif < 20, "sizes should be equal: " + sizeDif);
      return em2.executeQuery(query);
    }).then(function (data4) {
      s5 = testFns.sizeOf(em2);
      difObj = testFns.sizeOfDif(s1, s5);
      sizeDif = Math.abs(difObj.dif);
      ok(sizeDif < 20, "sizes should be almost equal: " + sizeDif);

      em2.clear();
      s6 = testFns.sizeOf(em2);
      difObj = testFns.sizeOfDif(s3, s6);
      sizeDif = Math.abs(difObj.dif);
      ok(sizeDif < 20, "empty sizes should be almost equal: " + sizeDif);

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("detached unresolved children", function (assert) {
    var done = assert.async();
    var realEm = newEm();
    var metadataStore = realEm.metadataStore;
    var orderType = metadataStore.getEntityType("Order");

    var query = EntityQuery.from("Customers")
      .where("customerID", "==", "729de505-ea6d-4cdf-89f6-0360ad37bde7")
      .expand("orders");
    var newOrder = orderType.createEntity(); // call the factory function for the Customer type
    realEm.addEntity(newOrder);
    newOrder.setProperty("customerID", "729de505-ea6d-4cdf-89f6-0360ad37bde7");

    var items = realEm.rejectChanges();

    realEm.executeQuery(query).then(function (data) {
      var orders = data.results[0].getProperty("orders");
      // the bug was that this included the previously detached order above. ( making a length of 11).
      ok(orders.length === 10, "This customer must have 10 Orders");

      var newOrder = orderType.createEntity(); // call the factory function for the Customer type
      realEm.addEntity(newOrder);
      newOrder.setProperty("customerID", "729de505-ea6d-4cdf-89f6-0360ad37bde7");

      var items = realEm.rejectChanges();
      return realEm.executeQuery(query);

    }).then(function (data2) {
      var orders = data2.results[0].getProperty("orders");
      ok(orders.length === 10, "The customers must have 10 Orders");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("with two nested expands", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("OrderDetails")
      .where("orderID", "==", 11069)
      .expand(["order.customer", "order.employee"]);

    em.executeQuery(query).then(function (data) {
      var r = data.results[0];
      var c = r.getProperty("order").getProperty("customer");
      ok(c, "c should not be null");
      var e = r.getProperty("order").getProperty("employee");
      ok(e, "e should not be null");
    }).fail(testFns.handleFail).fin(done);
  });

  test("with two fields", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Orders")
      .where("requiredDate", "<", "shippedDate")
      .take(20);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      ok(r.length > 0);
      r.forEach(function (r) {
        var reqDt = r.getProperty("requiredDate");
        var shipDt = r.getProperty("shippedDate");
        ok(reqDt.getTime() < shipDt.getTime(), "required dates should be before shipped dates");
      });
    }).fail(testFns.handleFail).fin(done);
  });

  test("with two fields & contains", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Employees")
      .where("notes", "contains", "firstName")
      .take(20);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      ok(r.length > 0, "should be at least one record where notes contains firstName");
      r.forEach(function (r) {
        var notes = r.getProperty("notes").toLowerCase();
        var firstNm = r.getProperty("firstName").toLowerCase();
        ok(notes.indexOf(firstNm) >= 0, "notes should contain firstName");
      });
    }).fail(testFns.handleFail).fin(done);
  });

  test("with two fields & startsWith literal", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Employees")
      // .where("lastName", "startsWith", "Dav")
      .where({ lastName: { "startsWith": "Dav" } })
      .take(20);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      ok(r.length > 0, "should be some employees named 'Dav'");
      var isOk = r.every(function (e) {
        return e.getProperty("lastName").toLowerCase().indexOf("dav") >= 0;
      });
      ok(isOk, "lastName should start with 'Dav'");
    }).fail(testFns.handleFail).fin(done);
  });

  test("with two fields & startsWith literal forced", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Employees")
      .where("lastName", "startsWith", { value: "firstName", isLiteral: true })
      // .where("lastName", "startsWith", "firstName", true)
      .take(20);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      ok(r.length === 0, "should be no recs returned");
    }).fail(testFns.handleFail).fin(done);
  });


  test("with inlineCount", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Customers")
      .take(20)
      .inlineCount(true);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      var count = data.inlineCount;
      ok(count > r.length);
    }).fail(testFns.handleFail).fin(done);
  });

  test("without inlineCount", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Customers")
      .take(5);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      var inlineCount = data.inlineCount;
      ok(!inlineCount);
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support nested navigation thru joins").
  test("with inlineCount 2", function(assert) {

    var done = assert.async();
    var em = newEm();
    var q = EntityQuery.from("Orders")
      .where("customer.companyName", "startsWith", "C")
      .take(5)
      .inlineCount(true);

    em.executeQuery(q).then(function (data) {
      var r = data.results;
      var count = data.inlineCount;
      ok(count > r.length);
    }).fail(testFns.handleFail).fin(done);
  });

  test("fetchEntityByKey", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = wellKnownData.alfredsID;

    var alfred;
    em.fetchEntityByKey("Customer", alfredsID).then(function (data) {
      alfred = data.entity;
      ok(alfred, "alfred should have been found");
      ok(data.fromCache === false, "should have been from database");
      return em.fetchEntityByKey("Customer", alfredsID, true);
    }).then(function (data2) {
      var alfred2 = data2.entity;
      ok(alfred2, "alfred2 should have been found");
      ok(alfred === alfred2, "should be the same entity");
      ok(data2.fromCache === true, "should have been from cache");
      return em.fetchEntityByKey(data2.entityKey);
    }).then(function (data3) {
      var alfred3 = data3.entity;
      ok(alfred3 === alfred, "alfred3 should = alfred");
      ok(data3.fromCache === false, "should not have been from cache");
    }).fail(testFns.handleFail).fin(done);
  });

  test("fetchEntityByKey without metadata", function (assert) {
    var done = assert.async();
    var emX = new breeze.EntityManager(testFns.serviceName);
    var alfredsID = wellKnownData.alfredsID;

    var alfred;
    emX.fetchEntityByKey("Customer", alfredsID, true).then(function (data) {
      alfred = data.entity;
      ok(alfred, "alfred should have been found");
      ok(data.fromCache === false, "should have been from database");
    }).fail(testFns.handleFail).fin(done);

  });

  test("fetchEntityByKey - deleted", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = wellKnownData.alfredsID;

    var alfred;
    em.fetchEntityByKey("Customer", alfredsID).then(function (data) {
      alfred = data.entity;
      ok(alfred, "alfred should have been found");
      ok(data.fromCache === false, "should have been from database");
      alfred.entityAspect.setDeleted();
      return em.fetchEntityByKey("Customer", alfredsID, true);
    }).then(function (data2) {
      var alfred2 = data2.entity;
      ok(alfred2 == null, "alfred2 should not have been found");
      ok(data2.fromCache === true, "should have been from cache");
      return em.fetchEntityByKey(data2.entityKey, true);
    }).then(function (data3) {
      var alfred3 = data3.entity;
      ok(alfred3 === null, "alfred3 should = alfred");
      ok(data3.fromCache === true, "should not have been from cache");

      em.setProperties({ queryOptions: em.queryOptions.using(MergeStrategy.OverwriteChanges) });
      return em.fetchEntityByKey(data3.entityKey, true);
    }).then(function (data4) {
      var alfred4 = data4.entity;
      ok(alfred4 === alfred, "alfred3 should = alfred");
      ok(data4.fromCache === false, "should not have been from cache");
    }).fail(testFns.handleFail).fin(done);
  });


  test("fetchEntityByKey - cache first not found", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = wellKnownData.alfredsID;

    var alfred;
    em.fetchEntityByKey("Customer", alfredsID, true).then(function (data) {
      alfred = data.entity;
      ok(alfred, "alfred should have been found");
      ok(data.fromCache === false, "should have been from database");
    }).fail(testFns.handleFail).fin(done);
  });

  test("fetchEntityByKey - missing key", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = '885efa04-cbf2-4dd7-a7de-083ee17b6ad7'; // not a valid key

    var alfred;
    em.fetchEntityByKey("Customer", alfredsID, true).then(function (data) {
      alfred = data.entity;
      ok(alfred === null, "alfred should not have been found");
      ok(data.fromCache === false, "should have been from database");
      ok(data.entityKey);
    }).fail(testFns.handleFail).fin(done);
  });

  test("fetchEntityByKey - bad args", function (assert) {
    var done = assert.async();
    var em = newEm();

    try {
      em.fetchEntityByKey("Customer").then(function (data) {
        ok(false, "should not have gotten here");
      }).fail(testFns.handleFail).fin(done);
    } catch (e) {
      ok(e.message.indexOf("EntityKey") >= 0, "should have an error message than mentions 'EntityKey'");
      done();
    }
  });


  test("hasChanges after query", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Customers").take(20);

    em.executeQuery(query).then(function (data) {
      var r = data.results;
      ok(r.length === 20);
      ok(!em.hasChanges());
    }).fail(testFns.handleFail).fin(done);

  });

  test("hasChanges after query 2", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Customers").where("companyName", "startsWith", "An").take(2);

    var entity;
    em.executeQuery(query).then(function (data) {
      var r = data.results;

      ok(r.length === 2);
      ok(!em.hasChanges());
      entity = r[0];
      return entity.entityAspect.loadNavigationProperty("orders");
    }).then(function (data2) {
      var orders = data2.results;
      var isLoaded = entity.entityAspect.isNavigationPropertyLoaded("orders");
      ok(isLoaded, "navProp should be marked as loaded");
      ok(orders.length > 0, "should be some orders - this is a 'test' bug if not");
      var areAllOrders = orders.every(function (o) {
        return o.entityType.shortName === "Order";
      });
      ok(areAllOrders, "all results should be of the 'order' type");
      ok(!em.hasChanges(), "should not have changes after nav prop load");
      var changes = em.getChanges();
      ok(changes.length === 0, "getChanges should return 0 results");
    }).fail(queryFailed).fin(done);

    function queryFailed(error) {
      ok(false, "query failed with error message = " + error.message);
    }
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("hasChanges after query 3", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Customers").take(20);

    em.executeQuery(query).then(function (data) {
      var r = data.results;
      ok(r.length === 20);
      ok(!em.hasChanges());
      return query.expand("orders").using(em).execute();
    }).then(function (data2) {
      var r2 = data2.results;
      ok(r2.length === 20);
      ok(!em.hasChanges(), "should not have changes after nav prop load");
      var changes = em.getChanges();
      ok(changes.length === 0, "getChanges should return 0 results");
    }).fail(queryFailed).fin(done);

    function queryFailed(error) {
      ok(false, "query failed with error message = " + error.message);
    }
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("isNavigationPropertyLoaded on expand", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Customers").where("companyName", "startsWith", "An").take(2).expand("orders.orderDetails");


    em.executeQuery(query).then(function (data) {
      var r = data.results;

      ok(r.length === 2);
      r.forEach(function (cust) {
        var ordersLoaded = cust.entityAspect.isNavigationPropertyLoaded("orders");
        ok(ordersLoaded, "orders should all be marked as loaded");
        var orders = cust.getProperty("orders");
        ok(orders.length > 0, "should have so orders");
        orders.forEach(function (order) {
          var detailsLoaded = order.entityAspect.isNavigationPropertyLoaded("orderDetails");
          ok(detailsLoaded, "orders should all be marked as loaded");
        });
      });
    }).fail(testFns.handleFail).fin(done);
  });

  test("can run two queries in parallel for fresh EM w/ empty metadataStore", 1, function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = breeze.EntityQuery.from("Customers");
    var successCount = 0;

    var prom1 = em.executeQuery(query).then(function () {
      return successCount++;
    }).fail(queryFailed);
    var prom2 = em.executeQuery(query).then(function () {
      return successCount++;
    }).fail(queryFailed);

    Promise.all([prom1, prom2]).then(function () {
      ok(successCount === 2, "two queries should succeed");
    }).fail(queryFailed).fin(done);

    function queryFailed(error) {
      ok(false, "query failed when successCount is " + successCount +
      " with error message = " + error.message);
    }
  });


  test("numeric/string  query ", function (assert) {
    var done = assert.async();
    var em = newEm();

    var r;
    EntityQuery.from("Products").take(5).using(em).execute().then(function (data) {
      var id = data.results[0].getProperty(testFns.productKeyName).toString();

      var query = new breeze.EntityQuery()
        .from("Products").where(testFns.productKeyName, '==', id).take(5);
      query.using(em).execute().then(function (data2) {
        r = data2.results;
        ok(r.length == 1);
        query = new breeze.EntityQuery()
          .from("Products").where(testFns.productKeyName, '!=', id);
        return query.using(em).execute();
      }).then(function (data3) {
        r = data3.results;
        ok(r.length > 1);
        done();
      }).fail(function (e) {
        ok(false, e);
        done();
      });
    }).fail(testFns.handleFail);
  });


  test("results notification", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers")
      .where(testFns.customerKeyName, "==", alfredsID)
      .using(em);

    var arrayChangedCount = 0;
    var adds;
    var orders;
    query.execute().then(function (data) {
      var customer = data.results[0];
      orders = customer.getProperty("orders");
      orders.arrayChanged.subscribe(function (args) {
        arrayChangedCount++;
        adds = args.added;
      });
      // return query.expand("orders").execute();
      // same as above but doesn't need expand
      return customer.entityAspect.loadNavigationProperty("orders");
    }).then(function (data2) {
      ok(arrayChangedCount === 1, "should only see a single arrayChanged event fired");
      ok(adds && adds.length > 0, "should have been multiple entities shown as added");
      var orderType = em.metadataStore.getEntityType("Order");
      var newOrder = orderType.createEntity();
      orders.push(newOrder);
      ok(arrayChangedCount === 2, "should have incremented by 1");
      ok(adds && adds.length === 1, "should have only a single entity added here");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("results notification suppressed", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers")
      .where(testFns.customerKeyName, "==", alfredsID)
      .using(em);

    var arrayChangedCount = 0;
    var orders;

    query.execute().then(function (data) {
      var customer = data.results[0];
      orders = customer.getProperty("orders");
      orders.arrayChanged.subscribe(function (args) {
        arrayChangedCount++;
      });
      //             Event.enable("arrayChanged", customer.entityAspect, false);
      Event.enable("arrayChanged", em, false);
      return query.expand("orders").execute();
    }).then(function (data2) {
      ok(arrayChangedCount === 0, "should be no arrayChanged events fired");
      var orderType = em.metadataStore.getEntityType("Order");
      var newOrder = orderType.createEntity();
      orders.push(newOrder);
      ok(arrayChangedCount === 0, "should be no arrayChanged events fired");

    }).fail(testFns.handleFail).fin(done);
  });

  test("getEntities after query", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = breeze.EntityQuery.from("Categories");

    em.executeQuery(query).then(function (data) {
      ok(data.results.length > 0); //this returns 45 results
      var ents = em.getEntities();
      ok(ents.length > 0); // this returns 0 results. WHY????
    }).fail(testFns.handleFail).fin(done);

  });


  test("navigation results notification", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers")
      .where(testFns.customerKeyName, "==", alfredsID)
      .using(em);

    var arrayChangedCount = 0;
    var adds;
    var orders;
    query.execute().then(function (data) {
      var customer = data.results[0];
      orders = customer.getProperty("orders");
      orders.arrayChanged.subscribe(function (args) {
        arrayChangedCount++;
        adds = args.added;
      });
      return customer.entityAspect.loadNavigationProperty("orders");
    }).then(function (data2) {
      ok(arrayChangedCount === 1, "should only see a single arrayChanged event fired");
      ok(adds && adds.length > 0, "should have been multiple entities shown as added");
      var orderType = em.metadataStore.getEntityType("Order");
      var newOrder = orderType.createEntity();
      orders.push(newOrder);
      ok(arrayChangedCount === 2, "should have incremented by 1");
      ok(adds && adds.length === 1, "should have only a single entity added here");
    }).fail(testFns.handleFail).fin(done);
  });

  test("results include query", function (assert) {
    var done = assert.async();
    var em = newEm();
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers")
      .where(testFns.customerKeyName, "==", alfredsID)
      .using(em);

    query.execute().then(function (data) {
      var customer = data.results[0];
      var sameQuery = data.query;
      ok(query === sameQuery, "not the same query");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("duplicates after relation query", function (assert) {
    var done = assert.async();
    var em = newEm();
    em.queryOptions = em.queryOptions.using(MergeStrategy.OverwriteChanges);
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers")
      .where(testFns.customerKeyName, "==", alfredsID);
    // bug goes away if you add this.
    // .expand("orders");
    var customer;

    query.using(em).execute().then(function (data) {
      customer = data.results[0];
      var q2 = EntityQuery.from("Orders")
        .where("customerID", "==", alfredsID)
        .expand("customer"); // bug goes away if you remove this
      return q2.using(em).execute();
    }).then(function (data2) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 records");
      var details = customer.getProperty("orders");
      var dups = testFns.getDups(details);
      ok(dups.length === 0, "should be no dups");
    }).fail(testFns.handleFail).fin(done);

  });

  function createProductCtor() {
    var init = function (entity) {
      ok(entity.entityType.shortName === "Product", "entity's productType should be 'Product'");
      ok(entity.getProperty("isObsolete") === false, "should not be obsolete");
      entity.setProperty("isObsolete", true);
    };
    return testFns.makeEntityCtor(function () {
      this.isObsolete = false;
      this.init = init;
    });

  };

  test("post create init after materialization", function (assert) {
    var done = assert.async();
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Product = createProductCtor();

    var productType = em.metadataStore.getEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");
    var query = EntityQuery.from("Products").take(3);

    em.executeQuery(query).then(function (data) {
      var products = data.results;
      products.forEach(function (p) {
        ok(p.getProperty("productName") !== undefined, "productName should be defined");
        ok(p.getProperty("isObsolete") === true, "isObsolete should be true");
      });
    }).fail(testFns.handleFail).fin(done);
  });

  test("post create init using materialized data", 2, function (assert) {
    var done = assert.async();
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Customer = testFns.makeEntityCtor(function () {
      this.companyName = null;
    });

    var customerInitializer = function (customer) {
      // should be called after materialization ... but is not.
      var companyName = customer.getProperty("companyName");
      ok(companyName, "company name should not be null");
      customer.foo = "Foo " + companyName;
    };

    em.metadataStore.registerEntityTypeCtor("Customer", Customer, customerInitializer);

    var query = EntityQuery.from("Customers").top(1);

    // going async
    em.executeQuery(query).then(function (data) {
      var cust = data.results[0];
      equal(cust.foo, "Foo " + cust.getProperty("companyName"),
        "'foo' property, created in initializer, performed as expected");
    }).fail(testFns.handleFail).fin(done);
  });

  test("post create init with no ctor", function (assert) {

    var done = assert.async();
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));

    var dt = new Date();
    var empInitializer = function (emp) {

      emp.setProperty("hireDate", dt);

      emp.foo = "Foo " + emp.getProperty("hireDate").toString();
    };

    em.metadataStore.registerEntityTypeCtor("Employee", null, empInitializer);

    var query = EntityQuery.from("Employees").top(1);

    // going async
    em.executeQuery(query).then(function (data) {
      var emp = data.results[0];
      ok(emp.foo, "foo property should exist");
      var sameDt = emp.getProperty("hireDate");
      ok(dt.getTime() === sameDt.getTime());

    }).fail(testFns.handleFail).fin(done);
  });


  test("date property is a DateTime", function (assert) {
    var done = assert.async();
    // This is what the type of a date should be
    var someDate = new Date();
    ok("object" === typeof someDate,
      "typeof someDate is " + typeof someDate);

    var firstOrderQuery = new EntityQuery("Orders")
      .where("orderDate", ">", new Date(1998, 3, 1))
      .take(1);

    var em = newEm();

    em.executeQuery(firstOrderQuery).then(function (data) {
      var ents = em.getEntities();
      var order = data.results[0];
      var orderDate = order.getProperty("orderDate");

      // THIS TEST FAILS!
      ok("object" === typeof orderDate,
        "typeof orderDate is " + typeof orderDate);
      ok(core.isDate(orderDate), "should be a date");
      done();
    }).fail(testFns.handleFail);

  });


  test("queryOptions using", function () {
    var qo = QueryOptions.defaultInstance;
    ok(qo.fetchStrategy === FetchStrategy.FromServer, "fetchStrategy.FromServer");
    ok(qo.mergeStrategy === MergeStrategy.PreserveChanges, "mergeStrategy.PreserveChanges");
    qo = qo.using(FetchStrategy.FromLocalCache);
    ok(qo.fetchStrategy === FetchStrategy.FromLocalCache, "fetchStrategy.FromLocalCache");
    qo = qo.using({ mergeStrategy: MergeStrategy.OverwriteChanges });
    ok(qo.mergeStrategy === MergeStrategy.OverwriteChanges, "mergeStrategy.OverwriteChanges");

  });

  test("queryOptions errors", function () {
    var qo = new QueryOptions();
    try {
      qo.using(true);
      ok(false, "should not get here-not a config");
    } catch (e) {
      ok(e, e.message);
    }

    try {
      qo.using({ mergeStrategy: 6 });
      ok(false, "should not get here, bad mergeStrategy");
    } catch (e) {
      ok(e, e.message);
    }

    try {
      qo.using({ mergeStrategy: MergeStrategy.OverwriteChanges, foo: "huh" });
      ok(false, "should not get here, unknown property in config");
    } catch (e) {
      ok(e, e.message);
    }

  });

  test("update key on pk change", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var customer = custType.createEntity();
    customer.setProperty("companyName", "[don't know name yet]");
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    em.attachEntity(customer);
    customer.setProperty(testFns.customerKeyName, alfredsID);
    var ek = customer.entityAspect.getKey();
    var sameCustomer = em.findEntityByKey(ek);
    ok(customer === sameCustomer, "customer should == sameCustomer");
  });

  test("reject change to existing key", function (assert) {
    var done = assert.async();
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    var query = EntityQuery.from("Customers").where(testFns.customerKeyName, "==", alfredsID);

    query.using(em).execute().then(function (data) {
      ok(data.results.length === 1, "should have fetched 1 record");
      var customer = custType.createEntity();
      em.attachEntity(customer);
      try {
        customer.setProperty(testFns.customerKeyName, alfredsID);
        ok(false, "should not get here");
      } catch (e) {
        ok(e.message.indexOf("key") > 0);
      }
      done();
    }).fail(testFns.handleFail);
  });

  test("fill placeholder customer asynchronously", function (assert) {
    var done = assert.async();
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var customer = custType.createEntity();
    customer.setProperty("companyName", "[don't know name yet]");
    var alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    // TEST PASSES (NO DUPLICATE) IF SET ID HERE ... BEFORE ATTACH
    // customer.CustomerID(testFns.wellKnownData.alfredsID); // 785efa04-cbf2-4dd7-a7de-083ee17b6ad2

    em.attachEntity(customer);

    // TEST FAILS  (2 IN CACHE W/ SAME ID) ... CHANGING THE ID AFTER ATTACH
    customer.setProperty(testFns.customerKeyName, alfredsID); // 785efa04-cbf2-4dd7-a7de-083ee17b6ad2
    var ek = customer.entityAspect.getKey();
    var sameCustomer = em.getEntityByKey(ek);
    customer.entityAspect.setUnchanged();

    // SHOULD BE THE SAME. EITHER WAY ITS AN ATTACHED UNCHANGED ENTITY
    ok(customer.entityAspect.entityState.isUnchanged(),
      "Attached entity is in state " + customer.entityAspect.entityState);

    ok(em.getEntities().length === 1,
      "# of entities in cache is " + em.getEntities().length);

    // this refresh query will fill the customer values from remote storage
    var refreshQuery = breeze.EntityQuery.fromEntities(customer);

    // going async ...

    refreshQuery.using(em).execute().then(function (data) {
      var results = data.results, count = results.length;
      if (count !== 1) {
        ok(false, "expected one result, got " + count);
      } else {
        var inCache = em.getEntities();
        if (inCache.length === 2) {

          // DUPLICATE ID DETECTED SHOULD NEVER GET HERE
          var c1 = inCache[0], c2 = inCache[1];
          ok(false,
            "Two custs in cache with same ID, ({0})-{1} and ({2})-{3}".format(// format is my extension to String
              c1.getProperty(testFns.customerKeyName), c1.getProperty("companyName"), c2.getProperty(testFns.customerKeyName), c2.getProperty("companyName")));
        }

        // This test should succeed; it fails because of above bug!!!
        ok(results[0] === customer,
          "refresh query result is the same as the customer in cache" +
          " whose updated name is " + customer.getProperty("companyName"));
      }
      done();
    }).fail(testFns.handleFail);
  });


  test("uni (1-n) region and territories", function (assert) {
    var done = assert.async();
    var em = newEm();
    var q = new EntityQuery()
      .from("Regions")
      .where("regionDescription", "==", "Northern");


    em.executeQuery(q).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var region = data.results[0];
      var terrs = region.getProperty("territories");
      return terrs.load();
    }).then(function (data2) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      ok(data2.results.length > 0, "This may be a test bug - need a region with territories");
    }).fail(testFns.handleFail).fin(done);
  });


  test("starts with op", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      .where("companyName", "startsWith", "C")
      .orderBy("companyName");
    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var customers = data.results;
      testFns.assertIsSorted(customers, "companyName", breeze.DataType.String, false, em.metadataStore.localQueryComparisonOptions.isCaseSensitive);
      customers.forEach(function (c) {
        ok(c.getProperty("companyName"), 'should have a companyName property');
        var key = c.entityAspect.getKey();
        ok(key, "missing key");
        var c2 = em.findEntityByKey(key);
        ok(c2 === c, "entity not cached");
      });
      done();
    }).fail(testFns.handleFail);
  });

  test("greater than op", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("Orders")
      .where("freight", ">", 100);

    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var orders = data.results;
      ok(orders.length > 0);

    }).fail(testFns.handleFail).fin(done);
  });


  test("predicate", function (assert) {
    var done = assert.async();
    var em = newEm();

    var baseQuery = EntityQuery.from("Orders");
    var pred1 = new Predicate("freight", ">", 100);
    var pred2 = new Predicate("orderDate", ">", new Date(1998, 3, 1));
    var query = baseQuery.where(pred1.and(pred2));
    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var orders = data.results;
      ok(orders.length > 0);
    }).fail(testFns.handleFail).fin(done);
  });

  test("predicate with contains", function (assert) {
    var done = assert.async();
    var em = newEm();

    var p1 = Predicate.create("companyName", "startsWith", "S");
    var p2 = Predicate.create("city", "contains", "er");

    var whereClause = p1.and(p2);

    var query = new breeze.EntityQuery()
      .from("Customers")
      .where(whereClause);

    em.executeQuery(query).then(function (data) {
      var customers = data.results;
      ok(customers.length > 0);
    }).fail(testFns.handleFail).fin(done);
  });

  test("with contains", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Customers")
      .where("companyName", FilterQueryOp.Contains, 'market');
    //.where("CompanyName", "contains", 'market'); // Alternative to FilterQueryOp
    //.where("substringof(CompanyName,'market')", "eq", true); // becomes in OData
    //.where("indexOf(toLower(CompanyName),'market')", "ne", -1); // equivalent to

    em.executeQuery(query).then(function (data) {
      ok(data.results.length > 0);
    }).fail(testFns.handleFail).fin(done);
  });


  test("predicate 2", function (assert) {
    var done = assert.async();
    var em = newEm();

    var baseQuery = EntityQuery.from("Orders");
    var pred1 = Predicate.create("freight", ">", 100);
    var pred2 = Predicate.create("orderDate", ">", new Date(1998, 3, 1));
    var newPred = Predicate.and([pred1, pred2]);
    var query = baseQuery.where(newPred);
    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var orders = data.results;
      ok(orders.length > 0);

    }).fail(testFns.handleFail).fin(done);
  });

  test("predicate 3", function (assert) {
    var done = assert.async();
    var em = newEm();

    var baseQuery = EntityQuery.from("Orders");
    var pred = Predicate.create("freight", ">", 100)
      .and("orderDate", ">", new Date(1998, 3, 1));
    var query = baseQuery.where(pred);
    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var orders = data.results;
      ok(orders.length > 0);
    }).fail(testFns.handleFail).fin(done);
  });


  test("not predicate with null", function (assert) {
    var done = assert.async();
    var em = newEm();

    var pred = new Predicate("region", FilterQueryOp.Equals, null);
    pred = pred.not();
    var query = new EntityQuery()
      .from("Customers")
      .where(pred)
      .take(10);

    var queryUrl = query._toUri(em);

    em.executeQuery(query, function (data) {
      var customers = data.results;
      ok(customers.length > 0);
      customers.forEach(function (customer) {
        var region = customer.getProperty("region");
        ok(region != null, "region should not be either null or undefined");
      });
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "OrderDetails is not queryable").
  test("unidirectional navigation load", function (assert) {
    var done = assert.async();
    var em = newEm();
    var count = 5;
    var query = EntityQuery.from("OrderDetails").take(count);

    query.using(em).execute().then(function (data) {
      var orderDetails = data.results;
      ok(orderDetails.length === count);
      var promises = orderDetails.map(function (od) {
        return od.entityAspect.loadNavigationProperty("product").then(function (data2) {
          var products = data2.results;
          ok(products.length === 1, "should only return a single product");
          var product = products[0];
          ok(od.getProperty("product") === product, "product should be set");
        });
      });
      return Promise.all(promises);
    }).then(function () {
      ok(true, "all promises completed");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "OrderDetails is not queryable").
  test("unidirectional navigation query", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("OrderDetails")
      .where("product.productID", "==", 1);

    var orderDetails;
    query.using(em).execute().then(function (data) {
      orderDetails = data.results;
      ok(orderDetails.length > 0);
      orderDetails.forEach(function (od) {
        ok(od.getProperty("productID") === 1, "productID should === 1");
      });
      var q2 = EntityQuery.from("Products")
        .where("productID", "==", 1);
      return em.executeQuery(q2);
    }).then(function (data) {
      var product = data.results[0];
      orderDetails.forEach(function (od) {
        ok(od.getProperty("product") === product, "product should be set");
      });

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("unidirectional navigation bad query", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("Products")
      .where("productID", "==", 1)
      .expand("orderDetails");


    query.using(em).execute().then(function (data) {
      ok(false, "should not get here");

    }).fail(function (err) {
      if (testFns.DEBUG_ODATA) {
        ok(err.message.indexOf("Product") >= 1, "should be an error message about the Product query");
      } else {
        ok(err.message.indexOf("orderDetails") >= 1, " message should be about missing OrderDetails property");
      }
    }).fin(done);
  });

  testFns.skipIf("mongo", "does not support navigation").
  test("bidirectional navigation of same entity type", function(assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("Employees")
      .where("reportsToEmployeeID", "!=", null);

    var orderDetails;
    query.using(em).execute().then(function (data) {
      var emps = data.results;
      // check using well-known data.  Map of employeeId : reportsToEmployeeID
      var map = {
        1: 2, 3: 2, 4: 3, 5: 8, 6: 2, 8: 3, 9: 6, 10: 6
      };
      emps.forEach(function (emp) {
        ok(map[emp.getProperty("employeeID")] == emp.getProperty("reportsToEmployeeID"), "reportsToEmployeeID should match");
      });
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support navigation").
  test("unidirectional navigation of different type (1-n)", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = EntityQuery.from("Territories").where("regionID", "!=", null);
    var query2 = EntityQuery.from("Regions");

    var territories, regions;
    query.using(em).execute().then(function (data) {
      territories = data.results;
      return query2.using(em).execute();
    }).then(function (data2) {
      var regions = data2.results;
      regions.forEach(function (region) {
        var terrs = region.getProperty("territories");
        var isOk = terrs.every(function (terr) {
          return terr.getProperty("regionID") == region.getProperty("regionID");
        });
        ok(isOk, "issue with terr then regions")
      });
      em = newEm();
      return query2.using(em).execute()
    }).then(function (data3) {
      regions = data3.results;
      return query.using(em).execute();
    }).then(function (data4) {
      var territories = data4.results;
      regions.forEach(function (region) {
        var terrs = region.getProperty("territories");
        var isOk = terrs.every(function (terr) {
          return terr.getProperty("regionID") == region.getProperty("regionID");
        });
        ok(isOk, "issue with regions then terrs")
      });

    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support navigation").
  test("unidirectional navigation of same entity type (1-1)", function (assert) {
    var done = assert.async();
    // create metadata manually so we don't have the bidirectional directReports navigation
    var ms = testFns.newMs();

    ms.addEntityType({
      shortName: "Employee",
      namespace: "Foo",
      autoGeneratedKeyType: breeze.AutoGeneratedKeyType.Identity,
      dataProperties: [
        new breeze.DataProperty({
          name: "employeeID",
          dataType: breeze.DataType.Int32,
          isNullable: false,
          isPartOfKey: true
        })
      ]
    });
    var employeeType = ms.getEntityType("Employee");

    employeeType.addProperty(new breeze.DataProperty({
      name: "firstName",
      dataType: breeze.DataType.String
    }));
    employeeType.addProperty(new breeze.DataProperty({
      name: "reportsToEmployeeID",
      dataType: breeze.DataType.Int32
    }));

    employeeType.addProperty(new breeze.NavigationProperty({
      name: "boss",
      entityTypeName: "Employee:#Foo",
      isScalar: true,
      associationName: "Employee_Boss",
      foreignKeyNames: ["reportsToEmployeeID"]

    }));

    ms.setEntityTypeForResourceName('Employees', 'Employee');
    var em = newEm(ms);
    ms.addDataService(em.dataService);

    // check using well-known data.  Map of employeeId : reportsToEmployeeID
    var map = {
      1: 2,
      3: 2,
      4: 3,
      5: 8,
      6: 2,
      8: 3,
      9: 6,
      10: 6
    };

    // var query = EntityQuery.from("Employees").where("reportsToEmployeeID", "!=", null).orderBy("employeeID");
    var query = EntityQuery.from("Employees").where("employeeID", "<=", 10).orderBy("reportsToEmployeeID")
      .select("employeeID, firstName, reportsToEmployeeID").toType("Employee");

    query.using(em).execute().then(function (data) {
      var emps = data.results;
      emps.forEach(function (emp) {
        var empId = emp.getProperty("employeeID");
        var reportsToEmpId = emp.getProperty("reportsToEmployeeID");
        ok(empId && map[empId] == reportsToEmpId, "reportsToEmployeeID should match");
        reportsToEmpId && ok(emp.getProperty("boss").getProperty("employeeID") == reportsToEmpId, "boss should match");
      });
      var em = newEm(ms);
      var query2 = EntityQuery.from("Employees").where("employeeID", "<=", 10).orderByDesc("reportsToEmployeeID")
        .select("employeeID, firstName, reportsToEmployeeID").toType("Employee");
      return query2.using(em).execute();
    }).then(function (data2) {
      var emps = data2.results;
      emps.forEach(function (emp) {
        var empId = emp.getProperty("employeeID");
        var reportsToEmpId = emp.getProperty("reportsToEmployeeID");
        ok(empId && map[empId] == reportsToEmpId, "reportsToEmployeeID should match");
        reportsToEmpId && ok(emp.getProperty("boss").getProperty("employeeID") == reportsToEmpId, "boss should match");
      });
      var foo = "foo";
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support navigation").
  test("unidirectional navigation of same entity type (1-n)",  function (assert) {
    var done = assert.async();
    // create metadata manually so we don't have the bidirectional directReports navigation
    var ms = testFns.newMs();

    ms.addEntityType({
      shortName: "Employee",
      namespace: "Foo",
      autoGeneratedKeyType: breeze.AutoGeneratedKeyType.Identity,
      dataProperties: [
        new breeze.DataProperty({
          name: "employeeID",
          dataType: breeze.DataType.Int32,
          isNullable: false,
          isPartOfKey: true
        })
      ]
    });
    var employeeType = ms.getEntityType("Employee");

    employeeType.addProperty(new breeze.DataProperty({
      name: "firstName",
      dataType: breeze.DataType.String
    }));
    employeeType.addProperty(new breeze.DataProperty({
      name: "reportsToEmployeeID",
      dataType: breeze.DataType.Int32
    }));

    employeeType.addProperty(new breeze.NavigationProperty({
      name: "directReports",
      entityTypeName: "Employee:#Foo",
      isScalar: false,
      associationName: "Employee_DirectReports",
      invForeignKeyNames: ["reportsToEmployeeID"]

    }));

    ms.setEntityTypeForResourceName('Employees', 'Employee');
    var em = newEm(ms);
    ms.addDataService(em.dataService);

    // check using well-known data.  Map of employeeId : reportsToEmployeeID
    var map = {
      1: 2,
      3: 2,
      4: 3,
      5: 8,
      6: 2,
      8: 3,
      9: 6,
      10: 6
    };

    // var query = EntityQuery.from("Employees").where("reportsToEmployeeID", "!=", null).orderBy("employeeID");
    var query = EntityQuery.from("Employees").where("employeeID", "<=", 10).orderBy("reportsToEmployeeID")
      .select("employeeID, firstName, reportsToEmployeeID").toType("Employee");

    query.using(em).execute().then(function (data) {
      var emps = data.results;
      emps.forEach(function (emp) {
        var empId = emp.getProperty("employeeID");
        var reportsToEmpId = emp.getProperty("reportsToEmployeeID");
        ok(empId && map[empId] == reportsToEmpId, "reportsToEmployeeID should match");
        emp.getProperty("directReports").forEach(function (dr) {
          ok(dr.getProperty("reportsToEmployeeID") == emp.getProperty("employeeID"), "boss should match");
        });

      });
      var em = newEm(ms);
      var query2 = EntityQuery.from("Employees").where("employeeID", "<=", 10).orderByDesc("reportsToEmployeeID")
        .select("employeeID, firstName, reportsToEmployeeID").toType("Employee");
      return query2.using(em).execute();
    }).then(function (data2) {
      var emps = data2.results;
      emps.forEach(function (emp) {
        var empId = emp.getProperty("employeeID");
        var reportsToEmpId = emp.getProperty("reportsToEmployeeID");
        ok(empId && map[empId] == reportsToEmpId, "reportsToEmployeeID should match");
        emp.getProperty("directReports").forEach(function (dr) {
          ok(dr.getProperty("reportsToEmployeeID") == emp.getProperty("employeeID"), "boss should match");
        });
      });
      var foo = "foo";
    }).fail(testFns.handleFail).fin(done);
  });


  test("fromEntities", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders")
      .take(2);

    em.executeQuery(query).then(function (data) {
      var orders = data.results;
      ok(orders.length === 2, "data.results length should be 2");
      var q2 = EntityQuery.fromEntities(orders);
      return q2.execute();
    }).then(function (data2) {
      ok(data2.results.length === 2, "data.results length should be 2");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not have the nested property Product.category.categoryName").
  test("where nested property", function(assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Products")
      .where("category.categoryName", "startswith", "S")
      .expand("category");
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var products = data.results;
      var cats = products.map(function (product) {
        return product.getProperty("category");
      });
      cats.forEach(function (cat) {
        var catName = cat.getProperty("categoryName");
        ok(core.stringStartsWith(catName, "S"));
      });
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not have the nested property Order.customer.region").
  test("where nested property 2", function(assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders")
      .where("customer.region", "==", "CA");
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var customers = data.results;
      ok(customers.length > 0, "some customers should have been found");
    }).fail(testFns.handleFail).fin(done);
  });

  test("orderBy", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery("Products")
      .orderBy("productName desc")
      .take(5);

    em.executeQuery(query).then(function (data) {
      var products = data.results;
      var productName = products[0].getProperty("productName");
      testFns.assertIsSorted(products, "productName", breeze.DataType.String, true, em.metadataStore.localQueryComparisonOptions.isCaseSensitive);
    }).fail(testFns.handleFail).fin(done);
  });

  test("orderBy 2 fields", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery("Customers")
      .orderBy("country, city")
      .where("country", "!=", null).where("city", "!=", null)
      .take(30);

    var custs, custs2;
    em.executeQuery(query).then(function (data) {
      custs = data.results;
      var countryCities = custs.map(function (p) {
        var countryCity = testFns.removeAccents(p.getProperty("country") + ":" + p.getProperty("city"));
        p.countryCity = countryCity;
        return countryCity;
      });

      testFns.assertIsSorted(countryCities, null, breeze.DataType.String, false, em.metadataStore.localQueryComparisonOptions.isCaseSensitive);
      var q2 = query.orderBy(null);
      var q3 = q2.orderBy("country").orderBy("city");
      return em.executeQuery(q3);
    }).then(function (data2) {
      custs2 = data2.results;
      custs2.forEach(function (p) {
        p.countryCity = testFns.removeAccents(p.getProperty("country") + ":" + p.getProperty("city"));
      });
      var isOk = breeze.core.arrayZip(custs, custs2, function (c1, c2) {
        return c1.countryCity == c2.countryCity;
      }).every(function (v) {
        return v;
      });
      ok(isOk, "ordering should be the same");
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("expand", function(assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery().from("Products").where("categoryID", "!=", null);

    query = query.expand("category").take(5);

    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");

      var products = data.results;
      ok(products.length == 5, "should have 5 products");
      var cats = [];
      products.map(function (product) {
        var cat = product.getProperty("category");
        if (cat) {
          cats.push(cats);
        }
      });
      ok(cats.length == 5, "should have found 5 categories but found: " + cats.length);
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("expand multiple", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery("Orders").where("customerID", "!=", null).where("employeeID", "!=", null);

    query = query.expand(["customer", "employee"])
      .take(20);

    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var orders = data.results;
      var custs = [];
      var emps = [];
      orders.map(function (order) {
        var cust = order.getProperty("customer");
        if (cust) {
          custs.push(cust);
        }
        var emp = order.getProperty("employee");
        if (emp) {
          emps.push(emp);
        }
      });
      ok(custs.length === 20, "should have 20 customers but got " + custs.length);
      ok(emps.length === 20, "should have 20 employees but got " + emps.length);


    }).fail(testFns.handleFail).fin(done)
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("expand nested", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders");

    query = query.expand("customer, orderDetails, orderDetails.product")
      .take(5);

    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var orders = data.results;
      var custs = [];
      var orderDetails = [];
      var products = [];
      orders.map(function (order) {
        var cust = order.getProperty("customer");
        if (cust) {
          custs.push(cust);
        }
        var orderDetailItems = order.getProperty("orderDetails");
        if (orderDetailItems) {
          Array.prototype.push.apply(orderDetails, orderDetailItems);
          orderDetailItems.map(function (orderDetail) {
            var product = orderDetail.getProperty("product");
            if (product) {
              products.push(product);
            }
          });
        }
      });
      ok(orders.length == 5, "should have 5 orders");
      ok(custs.length >= 1, "should have more than 1 customers");

      ok(orderDetails.length > 5, "should have > 5 orderDetails");
      ok(products.length > 5, "should have > 5 products");
    }).fail(testFns.handleFail).fin(done);


  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("expand through null child object", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders")
      .where("employeeID", "eq", null);

    query = query.expand("employee, employee.manager, employee.directReports")
      .take(5);

    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var orders = data.results;
      ok(orders.length > 0, "should have at least 1 order with no employeeID - check the db this may be a test bug");
      orders.map(function (order) {
        var emp = order.getProperty("employee");
        ok(emp == null, "employee should be null");
      });
    }).fail(testFns.handleFail).fin(done);


  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("orderBy nested", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Products")
      .orderBy("category.categoryName desc")
      .expand("category");


    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var products = data.results;
      var cats = products.map(function (product) {
        return product.getProperty("category");
      });

      testFns.assertIsSorted(cats, "categoryName", breeze.DataType.String, true, em.metadataStore.localQueryComparisonOptions.isCaseSensitive);
    }).fail(testFns.handleFail).fin(done);
  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("orderBy two part nested", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Products")
      .orderBy(["category.categoryName desc", "productName"])
      .expand("category");


    em.executeQuery(query).then(function (data) {
      ok(!em.hasChanges(), "should not have any changes");
      ok(em.getChanges().length === 0, "getChanges should return 0 results");
      var products = data.results;
      var cats = products.map(function (product) {
        return product.getProperty("category");
      });

      testFns.assertIsSorted(cats, "categoryName", breeze.DataType.String, true, em.metadataStore.localQueryComparisonOptions.isCaseSensitive);
    }).fail(testFns.handleFail).fin(done);
  });

  test("skiptake", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Products")
      .orderBy("productName");

    var skipTakeCount = 5;
    em.executeQuery(query).then(function (data) {
      var products = data.results;

      var newq1 = query.skip(skipTakeCount);
      var newq1Url = newq1._toUri(em);
      var p1 = em.executeQuery(newq1).then(function (data1) {
        var custs1 = data1.results;
        equal(custs1.length, products.length - skipTakeCount);
      });

      var newq2 = query.take(skipTakeCount);
      var newq2Url = newq1._toUri(em);
      var p2 = em.executeQuery(newq2).then(function (data2) {
        var custs2 = data2.results;
        equal(custs2.length, skipTakeCount);
      });

      var newq3 = query.skip(skipTakeCount).take(skipTakeCount);
      var newq3Url = newq1._toUri(em);
      var p3 = em.executeQuery(newq3).then(function (data3) {
        var custs3 = data3.results;
        equal(custs3.length, skipTakeCount);
      })
      return Promise.all([p1, p2, p3]);
    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  test("function expr - toLower", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      // .where("toLower(companyName)", "startsWith", "c");
      .where({ "toLower(companyName)": { startsWith: "C" } });
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var custs = data.results;
      ok(custs.length > 0);
      ok(custs.every(function (cust) {
        var name = cust.getProperty("companyName").toLowerCase();
        return core.stringStartsWith(name, "c");
      }), "every cust should startwith a 'c'");

    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  test("function expr - toUpper/substring", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      .where("toUpper(substring(companyName, 1, 2))", "startsWith", "OM");
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var custs = data.results;
      ok(custs.length > 0);
      ok(custs.every(function (cust) {
        var val = cust.getProperty("companyName").substr(1, 2).toUpperCase();
        return val === "OM";
      }), "every cust should have 'OM' as the 2nd and 3rd letters");
    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  test("function expr - length", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      .where("length(contactTitle)", ">", 17);
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var custs = data.results;
      ok(custs.length > 0);
      ok(custs.every(function (cust) {
        var val = cust.getProperty("contactTitle");
        return val.length > 17;
      }), "every cust have a name longer than 17 chars");
    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  skipIf("mongo", "does not support 'expand'").
  test("function expr - navigation then length", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders")
      .where("length(customer.companyName)", ">", 30)
      .expand("customer");
    var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      var orders = data.results;
      ok(orders.length > 0);
      ok(orders.every(function (order) {
        var cust = order.getProperty("customer");
        var val = cust.getProperty("companyName");
        return val.length > 30;
      }), "every order must have a cust with a name longer than 30 chars");
    }).fail(testFns.handleFail).fin(done);
  });

  skipIfHibFuncExpr.
  test("bad query function expr -  bad property name", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Orders")
      .where("length(customer.fooName)", ">", 30);
    // var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      ok(false, "should not get here");
    }).fail(function (error) {
      ok(error instanceof Error);
      ok(error.message.indexOf("fooName") > 0, "bad message");
      error.handled = true;
    }).fin(done);
  });


  test("bad filter operator", function () {
    var em = newEm();

    try {
      var query = new EntityQuery()
        .from("Customers")
        .where("companyName", "startsXWith", "C");
      ok(false, "shouldn't get here");
    } catch (error) {
      ok(error instanceof Error);
      ok(error.message.indexOf("startsXWith") > 0, "bad message");
    }
  });

  test("bad filter property", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      .where("badCompanyName", "startsWith", "C");
    // var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      ok(false, "shouldn't get here");
    }).fail(function (error) {
      ok(error instanceof Error);
      ok(error.message.indexOf("badCompanyName") > 0, "bad message");
      error.handled = true;
    }).fin(done);

  });

  test("bad orderBy property ", function (assert) {
    var done = assert.async();
    var em = newEm();

    var query = new EntityQuery()
      .from("Customers")
      .where("companyName", FilterQueryOp.StartsWith, "C")
      .orderBy("badCompanyName");
    // var queryUrl = query._toUri(em);

    em.executeQuery(query).then(function (data) {
      ok(false, "shouldn't get here");
    }).fail(function (error) {
      ok(error instanceof Error);
      ok(error.message.indexOf("badCompanyName") > 0, "bad message");
      error.handled = true;
    }).fin(done);

  });

  test("by EntityQuery.fromEntityKey ", function (assert) {
    var done = assert.async();
    var em = newEm();
    var empType = em.metadataStore.getEntityType("Employee");
    var entityKey = new EntityKey(empType, wellKnownData.nancyID);
    var query = EntityQuery.fromEntityKey(entityKey);


    em.executeQuery(query).then(function (data) {
      var emp = data.results[0];
      ok(emp.getProperty(testFns.employeeKeyName) === wellKnownData.nancyID);
    }).fail(testFns.handleFail).fin(done);

  });

  test("by EntityQuery.fromEntityNavigation  - (-> n) ", function (assert) {
    var done = assert.async();
    var em = newEm();
    var empType = em.metadataStore.getEntityType("Employee");
    var orderType = em.metadataStore.getEntityType("Order");
    var entityKey = new EntityKey(empType, wellKnownData.nancyID);
    var query = EntityQuery.fromEntityKey(entityKey);


    var emp;
    em.executeQuery(query).then(function (data) {
      emp = data.results[0];
      ok(emp.getProperty(testFns.employeeKeyName) === wellKnownData.nancyID);
      var np = emp.entityType.getProperty("orders");
      var q2 = EntityQuery.fromEntityNavigation(emp, np);
      return em.executeQuery(q2);
    }).then(function (data2) {
      ok(data2.results.length > 0, "no data returned");
      ok(data2.results.every(function (r) {
        return r.entityType === orderType;
      }));
      var orders = emp.getProperty("orders");
      ok(orders.length === data2.results.length, "local array does not match queried results");
    }).fail(testFns.handleFail).fin(done);

  });

  test("by EntityQuery.fromEntityNavigation - (-> 1) ", function (assert) {
    var done = assert.async();
    var em = newEm();

    var pred = Predicate.create("customerID", "!=", null).and("employeeID", "!=", null);
    var query = EntityQuery.from("Orders").where(pred).take(1);


    em.executeQuery(query).then(function (data) {
      var order = data.results[0];
      ok(order.entityType.shortName === "Order");
      var np = order.entityType.getProperty("employee");
      ok(np, "can't find nav prop 'Employee'");
      var q2 = EntityQuery.fromEntityNavigation(order, np);
      return em.executeQuery(q2);
    }).then(function (data2) {
      ok(data2.results.length === 1, "wrong amount of data returned");
      ok(data2.results[0].entityType.shortName === "Employee");
    }).fail(testFns.handleFail).fin(done);

  });

  test("by entityAspect.loadNavigationProperty - (-> n) ", function (assert) {
    var done = assert.async();
    var em = newEm();
    var empType = em.metadataStore.getEntityType("Employee");
    var entityKey = new EntityKey(empType, wellKnownData.nancyID);
    var query = EntityQuery.fromEntityKey(entityKey);


    var emp;
    em.executeQuery(query).then(function (data) {
      emp = data.results[0];
      return emp.entityAspect.loadNavigationProperty("orders");
    }).then(function (data2) {
      ok(data2.results.length > 0, "no data returned");
      ok(data2.results.every(function (r) {
        return r.entityType.shortName = "Order";
      }));
      var orders = emp.getProperty("orders");
      ok(orders.length === data2.results.length, "local array does not match queried results");
    }).fail(testFns.handleFail).fin(done);

  });

  test("by entityAspect.loadNavigationProperty - (-> 1) ", function (assert) {
    var done = assert.async();
    var em = newEm();

    var pred = Predicate.create("customerID", "!=", null).and("employeeID", "!=", null);
    var query = EntityQuery.from("Orders").where(pred).take(1);
    em.tag = "xxxx";

    var order;
    em.executeQuery(query).then(function (data) {
      order = data.results[0];
      ok(order.entityType.shortName === "Order");
      var emp = order.getProperty("employee");
      ok(emp === null, "emp should start null");
      return order.entityAspect.loadNavigationProperty("employee");
    }).then(function (data2) {
      ok(data2.results.length === 1, "wrong amount of data returned");
      ok(data2.results[0].entityType.shortName === "Employee");
      var sameEmp = order.getProperty("employee");
      ok(data2.results[0] === sameEmp, "query results do not match nav results");
      var orders = sameEmp.getProperty("orders");
      var ix = orders.indexOf(order);
      ok(ix >= 0, "can't find order in reverse lookup");
    }).fail(testFns.handleFail).fin(done);

  });

  test("load from navigationProperty value.load (-> n)", function (assert) {
    var done = assert.async();
    var em = newEm();
    var empType = em.metadataStore.getEntityType("Employee");
    var orderType = em.metadataStore.getEntityType("Order");
    var entityKey = new EntityKey(empType, wellKnownData.nancyID);
    var query = EntityQuery.fromEntityKey(entityKey);


    var orders, emp;
    em.executeQuery(query).then(function (data) {
      emp = data.results[0];
      orders = emp.getProperty("orders");
      ok(orders.length === 0, "orders length should start at 0");
      return orders.load();
    }).then(function (data2) {
      ok(data2.results.length > 0, "no data returned");
      ok(data2.results.every(function (r) {
        return r.entityType === orderType;
      }));
      ok(orders.length === data2.results.length, "local array does not match queried results");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("odata", "is not applicable for this test").
  test("WebApi metadata", function(assert) {
    var done = assert.async();

    var metadataPath = testFns.defaultServiceName + "/Metadata";
    $.getJSON(metadataPath, function (data, status) {
      // On success, 'data' contains the model metadata.
      //                console.log(data);
      ok(data);
      var metadata = typeof (data) === "string" ? JSON.parse(data) : data;
      var str = JSON.stringify(metadata, undefined, 4);
      testFns.output("Metadata");
      testFns.output(str);
      done();
    }).fail(testFns.handleFail);
  });

  function checkIfDeleted(entityManager, entities) {
    origEntities = entities.slice(0);
    var q = EntityQuery.fromEntities(entities)
    entityManager.executeQuery(q).then(function (data) {
      var foundEntities = data.entities;
      foundEntities.forEach(function (e, ix) {
        if (entities.indexOf(e)) {
          origEntities.splice(ix, 1)
        }
      });
      if (origEntities.length > 0) {
        origEntities.forEach(function (e) {
          entityManager.removeEntity(e);
        });
      }
    });
  }

})(breezeTestFns);