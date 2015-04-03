(function (testFns) {
  var breeze = testFns.breeze;
  var core = breeze.core;
  var EntityAspect = breeze.EntityAspect;
  var MetadataStore = breeze.MetadataStore;

  module("classRewrite", {
    beforeEach: function () {
      this.interceptor = function (property, newValue, accessorFn) {
        var prevValues = this.prevValues;
        if (!prevValues) {
          prevValues = [];
          this.prevValues = prevValues;
        }
        var oldValue = accessorFn();
        if (oldValue != null) {
          prevValues.push(oldValue);
        }
        accessorFn(newValue);
      };


    },
    afterEach: function () {

    }
  });


  test("class watcher - 2", function () {

    var Customer = testFns.makeEntityCtor(function () {
      this.companyName = null;
    });

    var metadataStore = new MetadataStore();
    metadataStore.trackUnmappedType(Customer, this.interceptor);

    var cust1 = new Customer();
    // next line is needed by chrome.
    new EntityAspect(cust1);
    cust1.setProperty("companyName", "foo");
    cust1.setProperty("companyName", "bar");
    ok(cust1.getProperty("companyName") === "bar");
    ok(cust1.prevValues.length === 1);


  });

  test("class watcher - 3", function () {

    var Customer = testFns.makeEntityCtor(function () {
      this.companyName = null;
    });

    var metadataStore = new MetadataStore();
    metadataStore.trackUnmappedType(Customer, this.interceptor);

    var cust1 = new Customer();
    // next line is needed by Chrome.
    new EntityAspect(cust1);
    cust1.setProperty("companyName", "foo");
    cust1.setProperty("companyName", "foox");
    ok(cust1.prevValues.length === 1);
    var oldInterceptor = Customer.prototype._$interceptor;
    Customer.prototype._$interceptor = function (p, v, a) {
      a(v);
    };
    cust1.setProperty("companyName", "bar");
    ok(cust1.getProperty("companyName") === "bar");
    ok(cust1.prevValues.length === 1);
    Customer.prototype._$interceptor = oldInterceptor;
    cust1.setProperty("companyName", "foo2");
    ok(cust1.getProperty("companyName") == "foo2");
    ok(cust1.prevValues.length === 2);

  });


})(breezeTestFns);