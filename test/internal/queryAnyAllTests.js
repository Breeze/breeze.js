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

  module("query - any/all", {
    beforeEach: function (assert) {
      testFns.setup(assert);
    },
    afterEach: function (assert) {

    }
  });

  test("any and gt", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Employees")
        .where("orders", "any", "freight", ">", 950);
    
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length >= 1 && emps.length <= 10, "should be between 1 and 10 emps with orders with freight > 950");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("any can be expressed as not all", function (assert) {
    var done = assert.async();
    var maxFreight = 800;
    var em = newEm();
    var query = EntityQuery.from("Employees")
      .where("orders", "any", "freight", ">", maxFreight)
      .expand("orders");
    var emps, emps2;
    em.executeQuery(query).then(function (data) {
      emps = data.results;
      ok(emps.length >= 1, "should be at least 1 emps with orders with freight > maxFreight");
      emps.forEach(function (emp) {
        var orders = emp.getProperty("orders");
        isOk = orders.some(function (order) {
          return order.getProperty("freight") > maxFreight;
        })
        ok(isOk, "at least one order on each emp should be > maxFreight ")
      });
      var p1 = new Predicate("freight", "<=", maxFreight).or("freight", "==", null);
      var predicate = new Predicate("orders", "all", p1).not();
      var query2 = EntityQuery.from("Employees")
        .where(predicate)
        .expand("orders");
      return em.executeQuery(query2);
    }).then(function(data2) {
      emps2 = data2.results;
      ok(emps.length == emps2.length, "both emp arrays should be the same length");
      isOk = emps.every(function(emp) {
        return emps2.indexOf(emp) >= 0;
      });
      ok(isOk, "should be the same emps as the first query");
    }).fail(testFns.handleFail).fin(done);

  });

  testFns.skipIf("mongo", "does not support 'expand'").
  test("any with territories/regions and inverse with all", function (assert) {
      var done = assert.async();
      var maxFreight = 800;
      var em = newEm();
      var query = EntityQuery.from("Regions")
        .where("territories", "any", "territoryDescription", "startsWith", "B")
        .expand("territories");
      var regions;
      em.executeQuery(query).then(function (data) {
        regions = data.results;
        ok(regions.length >= 1, "should be at least 1 region that matches");
        regions.forEach(function (region) {
          var territories = region.getProperty("territories");
          isOk = territories.some(function (territory) {
            var descr = territory.getProperty("territoryDescription");
            return descr.indexOf("B") == 0;
          })
          ok(isOk, "at least one territory on each region should match");
        });
        var p1 = new Predicate("territoryDescription", "startsWith", "B").not().or("territoryDescription", "==", null);
        var predicate = new Predicate("territories", "all", p1).not();
        var query2 = EntityQuery.from("Regions")
          .where(predicate)
          .expand("territories");
        return em.executeQuery(query2);
      }).then(function(data2) {
        var regions2 = data2.results;
        ok(regions2.length == regions.length, "both arrays should be the same length");
        isOk = regions.every(function(region) {
          return regions2.indexOf(region) >= 0;
        });
        ok(isOk, "should be the same regions as the first query");
      }).fail(testFns.handleFail).fin(done);

    });



  test("any and gt (local)", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Employees")
        .where("orders", "any", "freight", ">", 950)
        .expand("orders");
 
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length >= 1, "should be at least 1 emps with orders with freight > 950");
      var emps2 = em.executeQueryLocally(query);

      var isOk = testFns.haveSameContents(emps, emps2);
      ok(isOk, "arrays should have the same contents");
    }).fail(testFns.handleFail).fin(done);

  });


  test("all with composite predicates ", function (assert) {
    var done = assert.async();
    var em = newEm();
    var p2 = Predicate.create("freight", ">", 10);
    var p1 = Predicate.create("orders", "all", p2);
    var p0 = Predicate.create("companyName", "contains", "ar").and(p1);

    var query = EntityQuery.from("Customers").where(p0).expand("orders");

 
    em.executeQuery(query).then(function (data) {
      var custs = data.results;
      custs.forEach(function (cust) {
        ok(cust.getProperty("companyName").indexOf("ar") >= 0, "custName should contain 'ar'");
        var orders = cust.getProperty("orders");
        var isOk = orders.every(function (o) {
          return o.getProperty("freight") > 10;
        });
        ok(isOk, "every order should have a freight value > 10");
      })

      var custs2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(custs, custs2);
      ok(isOk, "arrays should have the same contents");

    }).fail(testFns.handleFail).fin(done);

  });

  test("any with not", function (assert) {
    var done = assert.async();
    var em = newEm();
    // customers with no orders
    var p = Predicate.create("orders", "any", "rowVersion", ">=", 0).not();
    var query = EntityQuery.from("Customers").where(p).expand("orders");

     em.executeQuery(query).then(function (data) {
      var custs = data.results;
      custs.forEach(function (cust) {
        var orders = cust.getProperty("orders");
        ok(orders.length === 0, "every orders collection should be empty");
      })

      var custs2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(custs, custs2);
      ok(isOk, "arrays should have the same contents");

    }).fail(testFns.handleFail).fin(done);

  });

  test("any with != null", function (assert) {
    var done = assert.async();
    var em = newEm();
    // customers with no orders
    var p = Predicate.create("orders", "any", "rowVersion", "!=", null).not();
    var query = EntityQuery.from("Customers").where(p).expand("orders");
 
    em.executeQuery(query).then(function (data) {
      var custs = data.results;
      custs.forEach(function (cust) {
        var orders = cust.getProperty("orders");
        ok(orders.length === 0, "every orders collection should be empty");
      })

      var custs2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(custs, custs2);
      ok(isOk, "arrays should have the same contents");

    }).fail(testFns.handleFail).fin(done);

  });

  test("any and gt with expand", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Employees")
        .where("orders", "any", "freight", ">", 950)
        .expand("orders");
 
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length >= 1, "should be at least 1 emps with orders with freight > 950");
      emps.forEach(function (emp) {
        var orders = emp.getProperty("orders");
        var isOk = orders.some(function (order) {
          return order.getProperty("freight") > 950;
        });
        ok(isOk, "should be some order with freight > 950");
      });

      var emps2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(emps, emps2);
      ok(isOk, "arrays should have the same contents");
    }).fail(testFns.handleFail).fin(done);

  });

  test("any and nested property", function (assert) {
    var done = assert.async();
    var em = newEm();
    var query = EntityQuery.from("Employees")
        .where("orders", "any", "customer.companyName", "startsWith", "Lazy")
        .expand("orders.customer");
 
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length === 2, "should be only 2 emps with orders with companys named 'Lazy...' ");
      emps.forEach(function (emp) {
        var orders = emp.getProperty("orders");
        var isOk = orders.some(function (order) {
          var cust = order.getProperty("customer");
          return cust && cust.getProperty("companyName").indexOf("Lazy") >= 0;
        });
        ok(isOk, "should be some order with the right company name");
      });

      var emps2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(emps, emps2);
      ok(isOk, "arrays should have the same contents");
    }).fail(testFns.handleFail).fin(done);

  });

  test("any with composite predicate and expand", function (assert) {
    var done = assert.async();
    var em = newEm();
    var p = Predicate.create("freight", ">", 950).and("shipCountry", "startsWith", "G");
    var query = EntityQuery.from("Employees")
        .where("orders", "any", p)
        .expand("orders");
    var queryUrl = query._toUri(em);
 
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length === 1, "should be only 1 emps with orders (with freight > 950 and shipCountry starting with 'G')");
      emps.forEach(function (emp) {
        var orders = emp.getProperty("orders");
        var isOk = orders.some(function (order) {
          return order.getProperty("freight") > 950 && order.getProperty("shipCountry").indexOf("G") === 0;
        });
        ok(isOk, "should be some order with freight > 950");
      });

      var emps2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(emps, emps2);
      ok(isOk, "arrays should have the same contents");

    }).fail(testFns.handleFail).fin(done);
  });

  test("two anys and an expand", function (assert) {
    var done = assert.async();
    // different query than one above.
    var em = newEm();
    var p = Predicate.create("orders", "any", "freight", ">", 950)
        .and("orders", "any", "shipCountry", "startsWith", "G");
    var query = EntityQuery.from("Employees")
        .where(p)
        .expand("orders");
    var queryUrl = query._toUri(em);
 
    em.executeQuery(query).then(function (data) {
      var emps = data.results;
      ok(emps.length >= 1, "should be at least 1 emp with (orders with freight > 950) and (orders with shipCountry starting with 'G'");
      emps.forEach(function (emp) {
        var orders = emp.getProperty("orders");
        var isOk = orders.some(function (order) {
          return order.getProperty("freight") > 950;
        });
        ok(isOk, "should be some order with freight > 950");
        var isOk = orders.some(function (order) {
          return order.getProperty("shipCountry").indexOf("G") === 0;
        });
        ok(isOk, "should be some order with shipCountry starting with 'G'");
      });

      var emps2 = em.executeQueryLocally(query);
      var isOk = testFns.haveSameContents(emps, emps2);
      ok(isOk, "arrays should have the same contents");
    }).fail(testFns.handleFail).fin(done);
  });

  test("nested any", function (assert) {
    var done = assert.async();
    // different query than one above.
    var em = newEm();
    var q1 = EntityQuery.from("Customers")
        .where("orders", "any", "orderDetails", "some", "unitPrice", ">", 200);

    var p2 = new Predicate("unitPrice", ">", 200).and("quantity", ">", 50);
    var q2 = EntityQuery.from("Customers")
        .where("orders", "some", "orderDetails", "any", p2)
        .expand("orders.orderDetails");

    var queryUrl = q2._toUri(em);
 
    var custs, l0, l2;
    em.executeQuery(q1).then(function (data) {
      custs = data.results;
      l0 = custs.length;
      ok(l0 > 10);
      return em.executeQuery(q2);
    }).then(function (data2) {
      custs = data2.results;
      l2 = custs.length;
      ok(l2 < l0, "2nd query should return fewer records.");

      var custs2 = em.executeQueryLocally(q2);
      var isOk = testFns.haveSameContents(custs, custs2);
      ok(isOk, "arrays should have the same contents");

    }).fail(testFns.handleFail).fin(done);
  });

  test("nested any predicate toString", function () {
    
    var em = newEm()
    var p2 = new Predicate("unitPrice", ">", 200).and("quantity", ">", 50);
    var p1 = new Predicate("orders", "some", "orderDetails", "any", p2);

    var q2 = EntityQuery.from("Customers")
        .where("orders", "some", "orderDetails", "any", p2)
        .expand("orders.orderDetails");

    var queryUrl = q2._toUri(em);
    var s = q2.wherePredicate.toString();

    ok(s.length > 0);
  });

  test("nested any error", function () {
    var em = newEm()
    var p2 = new Predicate("unitPrice", ">", 200).and("XXquantity", ">", 50);

    var q2 = EntityQuery.from("Customers")
        .where("orders", "some", "orderDetails", "any", p2)
        .expand("orders.orderDetails");

    try {
      var queryUrl = q2._toUri(em);
      ok(false, "should not get here")
    } catch (e) {
      ok(e.message.indexOf("XXquantity") >= 0, "error should be about 'XXquantity'");
    }

  });


})(breezeTestFns);