(function (testFns) {
  var breeze = testFns.breeze;
  var Predicate = breeze.Predicate;
  var FilterQueryOp = breeze.FilterQueryOp;

  module("predicates - safe construction");

  // These tests guard against exceptions thrown when constructing a predicate
  // They do not test if the predicates actually work
  // Should have a test for each example in the Predicate API doc

  test('constructor', function () {
    expect(0);
    //throw new Error("test error"); // prove that test would fail if Predicate throws
    // Ex1
    var p1 = new Predicate("CompanyName", "StartsWith", "B");
    // Ex2
    var p2 = new Predicate("Region", FilterQueryOp.Equals, null);
  });

  test('and - class method', function () {
    expect(0);
    // Ex1
    var dt = new Date(1988, 9, 12);
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = Predicate.and(p1, p2, p3);

    // Ex2
    var preds = [p1, p2, p3];
    newPred = Predicate.and(preds);
  });

  // D#2674
  test('#and - instance method', function () {
    expect(0);
    // Ex1
    var dt = new Date(1988, 9, 12);
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = p1.and(p2, p3)

    // Ex2
    var preds = [p2, p3];
    newPred = p1.and(preds);

    // Ex3
    var p4 = Predicate.create("ShipCity", "startswith", "F")
                      .and("Size", "gt", 2000);
  });

  // D#2674
  test('create - class method', function () {
    expect(0);
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

    // Ex4
    var p4 = new Predicate('orders', 'all', a, b, c);

    var p4a = Predicate.create("orders", "any", a, b, c);

    var p4b = Predicate.create("orders", "any",  [a, b, c]);

    var p4c = Predicate.create("orders", "any", p1);

  });

  test('not - class method', function () {
    expect(0);
    // Ex1
    var p1 = Predicate.create("Freight", "gt", 100);
    var not_p1 = Predicate.not(p1);

  });

  test('#not - instance method', function () {
    expect(0);
    // Ex1
    var p1 = Predicate.create("Freight", "gt", 100);
    not_p1 = p1.not();
  });

  test('or - class method', function () {
    expect(0);
    // Ex1
    var dt = new Date(88, 9, 12);
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = Predicate.or(p1, p2, p3);

    // Ex2
    var preds = [p1, p2, p3];
    newPred = Predicate.or(preds);
  });

  // D#2674
  test('#or - instance method', function () {
    expect(0);
    // Ex1
    var dt = new Date(88, 9, 12);
    var p1 = Predicate.create("OrderDate", "ne", dt);
    var p2 = Predicate.create("ShipCity", "startsWith", "C");
    var p3 = Predicate.create("Freight", ">", 100);
    var newPred = p1.or(p2, p3);

    // Ex2
    var preds = [p2, p3];
    newPred = p1.or(preds);

    // Ex3
    var p4 = Predicate.create("ShipCity", "startswith", "F")
      .or("Size", "gt", 2000);

  });

})(breezeTestFns);
