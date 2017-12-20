(function (testFns) {
  var breeze = testFns.breeze;
  var Predicate = breeze.Predicate;
  var FilterQueryOp = breeze.FilterQueryOp;

  module("predicates - safe construction");

  // These tests guard against exceptions thrown when constructing a predicate
  // They do not test if the predicates actually work
  // Should have a test for each example in the Predicate API doc

  function okJSON(pred, jsonObj) {
    predJSON = JSON.stringify(pred.toJSON());
    testJSON = JSON.stringify(jsonObj);
    ok(predJSON == testJSON, "Should be " + testJSON + " but is " + predJSON);
  }

  test('constructor', function () {
    expect(2);
    //throw new Error("test error"); // prove that test would fail if Predicate throws
    // Ex1
    var p1 = new Predicate("CompanyName", "StartsWith", "B");
    okJSON(p1, {"CompanyName":{"startswith":"B"}});
    // Ex2
    var p2 = new Predicate("Region", FilterQueryOp.Equals, null);
    okJSON(p2, {"Region":null});
  });

  test('and - class method', function () {
    expect(1);
    // Ex1
    var dt = new Date(Date.UTC(1988, 9, 12));
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = Predicate.and(p1, p2, p3);

    // Ex2
    var preds = [p1, p2, p3];
    newPred = Predicate.and(preds);
    okJSON(newPred, {"and":[{"OrderDate":{"ne":"1988-10-12T00:00:00.000Z"}},{"ShipCity":{"startswith":"C"}},{"Freight":{"gt":100}}]});
  });

  // D#2674
  test('#and - instance method', function () {
    expect(2);
    // Ex1
    var dt = new Date(Date.UTC(1988, 9, 12));
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = p1.and(p2, p3)

    // Ex2
    var preds = [p2, p3];
    newPred = p1.and(preds);
    okJSON(newPred, {"and":[{"OrderDate":{"ne":"1988-10-12T00:00:00.000Z"}},{"ShipCity":{"startswith":"C"}},{"Freight":{"gt":100}}]});

    // Ex3
    var p4 = Predicate.create("ShipCity", "startswith", "F")
                      .and("Size", "gt", 2000);
    okJSON(p4, {"ShipCity":{"startswith":"F"},"Size":{"gt":2000}});
  });

  // D#2674
  test('create - class method', function () {
    expect(3);
    var a = 'ShipCity';
    var b = 'startswith';
    var c = 'F';

    // Ex1
    var p1 = Predicate.create(a, b, c);
    // Ex2
    var p2 = new Predicate(a, b, c);

    // The any/all variations are not documented.
    // But we can test them anyway.
    // Ex3
    var p3 = new Predicate('orders', 'any', a, b, c);
    okJSON(p3, {"orders":{"any":{"ShipCity":{"startswith":"F"}}}});

    // Ex4
    var p4 = new Predicate('orders', 'all', a, b, c);
    okJSON(p4, {"orders":{"all":{"ShipCity":{"startswith":"F"}}}});

    var p4a = Predicate.create("orders", "any", a, b, c);

    var p4b = Predicate.create("orders", "any",  [a, b, c]);

    var p4c = Predicate.create("orders", "any", p1);
    okJSON(p4c, {"orders":{"any":{"ShipCity":{"startswith":"F"}}}});
  });

  test('not - class method', function () {
    expect(1);
    // Ex1
    var p1 = Predicate.create("Freight", "gt", 100);
    var not_p1 = Predicate.not(p1);

    okJSON(not_p1, {"not":{"Freight":{"gt":100}}});
  });

  test('#not - instance method', function () {
    expect(1);
    // Ex1
    var p1 = Predicate.create("Freight", "gt", 100);
    not_p1 = p1.not();
    okJSON(not_p1, {"not":{"Freight":{"gt":100}}});
  });

  test('or - class method', function () {
    expect(2);
    // Ex1
    var dt = new Date(Date.UTC(88, 9, 12));
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = Predicate.or(p1, p2, p3);
    okJSON(newPred,  {"or":[{"OrderDate":{"ne":"1988-10-12T00:00:00.000Z"}},{"ShipCity":{"startswith":"C"}},{"Freight":{"gt":100}}]});

    // Ex2
    var preds = [p1, p2, p3];
    newPred = Predicate.or(preds);
    okJSON(newPred,  {"or":[{"OrderDate":{"ne":"1988-10-12T00:00:00.000Z"}},{"ShipCity":{"startswith":"C"}},{"Freight":{"gt":100}}]});
  });

  // D#2674
  test('#or - instance method', function () {
    expect(2);
    // Ex1
    var dt = new Date(Date.UTC(88, 9, 12));
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = p1.or(p2, p3);

    // Ex2
    var preds = [p2, p3];
    newPred = p1.or(preds);
    okJSON(newPred, {"or":[{"OrderDate":{"ne":"1988-10-12T00:00:00.000Z"}},{"ShipCity":{"startswith":"C"}},{"Freight":{"gt":100}}]});

    // Ex3
    var p4 = Predicate.create("ShipCity", "startswith", "F")
      .or("Size", "gt", 2000);
    okJSON(p4, {"or":[{"ShipCity":{"startswith":"F"}},{"Size":{"gt":2000}}]});

  });

  test("JSON can handle 'startswith'", function(assert) {
    expect(1);
    var p2 = { companyName: { startswith: 'B'} };
             
    var p = Predicate.create(p2);
    okJSON(p, {"companyName":{"startswith":"B"}});
  });

  test("JSON can handle 'and' with 'startswith'", function(assert) {
    expect(1);
    var p2 = {
      and: [ 
        { companyName: { startswith: 'B'} },
        // { country: { in: [ 'Belgium', 'Germany'] } },
        // { not: { country: { in: [ 'Belgium', 'Germany'] } } }
        { country: { ne: 'Belgium'}},
        { country: { ne: 'Germany'}}
      ]  
    };
             
    var p = Predicate.create(p2);
    okJSON(p, {"and":[{"companyName":{"startswith":"B"}},{"country":{"ne":"Belgium"}},{"country":{"ne":"Germany"}}]});
  });

  test("JSON can handle 'and' with 'in'", function(assert) {
    expect(1);
    var p2 = {
      and: [ 
        { companyName: { startswith: 'B'} },
        { country: { in: [ 'Belgium', 'Germany'] } },
      ]  
    };
             
    var p = Predicate.create(p2);
    okJSON(p, {"companyName":{"startswith":"B"},"country":{"in":["Belgium","Germany"]}});
  });

  test("JSON can handle 'not': expr: 'in'", function(assert) {
    expect(1);
    // var p2 = { country: { not: { in: [ 'Belgium', 'Germany'] } } };
    var p2 = { not: { country: { in: [ 'Belgium', 'Germany'] } } };
             
    var p = Predicate.create(p2);
    okJSON(p, {"not":{"country":{"in":["Belgium","Germany"]}}});
  });

  test("JSON can handle 'and' with 'not':'in'", function(assert) {
    expect(1);
    var p2 = {
      and: [ 
        { companyName: { startswith: 'B'} },
        { not: { country: { in: [ 'Belgium', 'Germany'] } } },
      ]  
    };
             
    var p = Predicate.create(p2);
    okJSON(p, {"companyName":{"startswith":"B"},"not":{"country":{"in":["Belgium","Germany"]}}});
  });

})(breezeTestFns);
