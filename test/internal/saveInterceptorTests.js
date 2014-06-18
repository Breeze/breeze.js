(function (testFns) {
    var breeze = testFns.breeze;
    var dsAdapter;
    var handleFail = testFns.handleFail;
    var newEm = testFns.newEm;

    var wellKnownData = testFns.wellKnownData;

    var xasyncTest = function () { }; // easy way to disable a test is to put 'x' in front
    var xtest = function(){}; // easy way to disable a test is to put 'x' in front of 'test'

    module("save interceptor", {
        setup: function () {
            testFns.setup();
            // get active dataService adapter
            // removing any lingering, instance-level ChangeRequestInterceptor
            // left behind by some outside test that forgot to cleanup.
            // The prototype-level interceptor is untouched.
            dsAdapter = breeze.config.getAdapterInstance('dataService');
            delete dsAdapter.changeRequestInterceptor;
        },
        teardown: function () {
            delete dsAdapter.changeRequestInterceptor;
        }
    });

    asyncTest('Default interceptor, no harm', function(){
        var em = newEm();
        getNancy(em).then(function(nancy){
            tweakEmp(nancy);
            return em.saveChanges();
        })
        .then(function(result){
            equal(result.entities.length, 1, "should have saved Nancy");
        })
        .catch(handleFail).finally(start);
    });
    asyncTest('NULL interceptor, no harm', function () {
        dsAdapter.changeRequestInterceptor = null;
        var em = newEm();
        getNancy(em).then(function (nancy) {
            tweakEmp(nancy);
            return em.saveChanges();
        })
        .then(function (result) {
            equal(result.entities.length, 1, "should have saved Nancy");
        })
        .catch(handleFail).finally(start);
    });
    asyncTest('interceptor members called with expected values', function () {
        var em = newEm();
        var nancy;
        var wasCalled = false;

        // simple enough for all dataservice adapters
        dsAdapter.changeRequestInterceptor = function (saveContext, saveBundle) {

            ok(saveContext.entityManager === em, "'saveContext' should have the em");
            ok(saveBundle.saveOptions, "'saveBundle' should have a 'saveOptions'");

            this.getRequest = function (request, entity, index) {
                ok(request, "getRequest: request should be defined");
                ok(entity === nancy, "getRequest: entity should be Nancy");
                equal(index, 0, "getRequest: index should be 0");

                if (testFns.DEBUG_ODATA) {
                    var headers = request && request.headers;
                    ok(headers, "getRequest: request headers should be accessible");
                } else {
                    var aspect = request && request.entityAspect;
                    ok(aspect, "getRequest: request.entityAspect should be defined");
                    var origValues = aspect && aspect.originalValuesMap;
                    ok(origValues, "getRequest: originalValuesMap should be accessible");
                }
                return request;
            };

            this.done = function (requests) {
                ok(Array.isArray(requests), "done: 'requests' should be an array");
                equal(requests && requests.length, 1, "done: 'requests' should have 1 request");
                wasCalled = true;
            };  
        }

        getNancy(em).then(function (emp) {
            nancy = emp;
            tweakEmp(nancy);
            return em.saveChanges();
        })
        .then(function () {
            ok(wasCalled, "done should have been called");
        })
        .catch(handleFail)
        .finally(function() {
            // poison this adapter's interceptor to prove test module always clears it
            dsAdapter.changeRequestInterceptor = PoisonInterceptor;
            start();
        });
    });

    // A future test when we want to explore intercepting multiple requests
    xtest("insert multipart entity", function () {
        var em = newEm();
        var product = createProduct(em);
        var order = createOrder(em);
        stop();
        em.saveChanges()
        .then(function (result) {
            equal(result.entities.length, 2, "should have saved 2 entities");
            // attempt cleanup
            product.entityAspect.setDeleted();
            order.entityAspect.setDeleted();
            return em.saveChanges();
        })
        .then(function(/*result*/){
            ok(true, "removed the 2 added entities");
        })
        .fail(testFns.handleFail).fin(start);
    });

    ////// helpers ///////
    function createOrder(em) {
        return em.createEntity("Order", {
            shipName: "Test_" + new Date().toDateString()
        });
    }

    function createProduct(em) {
        return em.createEntity("Product", {
            productName: "Test_" + new Date().toDateString()
        });
    }

    function getNancy(em){
        return breeze.EntityQuery.from("Employees")
            .where(testFns.employeeKeyName, "eq", wellKnownData.nancyID)
            .using(em).execute().then(function(data) {
                return data.results[0];
            });
    }

    function PoisonInterceptor() {
        this.getRequest =
        this.done =
            function () { throw new Error("Poison interceptor called."); };
    }

    function tweakEmp(emp, baseToc){
        baseToc = baseToc || 'Ms.';
        var prop = 'titleOfCourtesy';
        var toc = emp.getProperty(prop);
        // toggle toc to make an innocuous saveable change
        emp.setProperty(prop, toc === baseToc ? 'Dr.' : baseToc); 
    }
    
})(breezeTestFns);