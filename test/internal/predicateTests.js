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

    // These next variations fail in v.1.5.3 (D#2674)
    // According to the documentation
    // http://www.breezejs.com/sites/all/apidocs/classes/Predicate.html#method_create
    // the trailing args can be predicates (either in an array or individually).
    /*
     * create ( property  operator  value  predicates ) ...
     *
     * predicates Multiple Predicates | Array of Predicate
     *    Any null or undefined values passed in will be automatically
     *    filtered out before constructing the composite predicate.
     */
    // Perhaps the API doc is wrong because it was written before "any/all".
    // Perhaps we shouldn't offer the "predicates" signature.

    // Ex5
    var p5 = Predicate.create(a, b, c, [p1, null, p2]);

    // Ex6
    var p6 = Predicate.create(a, b, c, p1, undefined, p2);
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
