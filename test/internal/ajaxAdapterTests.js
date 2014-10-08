// ajaxAdapterTests
(function (testFns) {
    var breeze = testFns.breeze;
    var originalAjaxAdapter;

    module("ajaxAdapter", {
        setup: function () {
            testFns.setup();
            originalAjaxAdapter = breeze.config.getAdapterInstance('ajax');
        },
        teardown: function () {
            try {
                originalAjaxAdapter.ajax.restore(); // restore if spied or stubbed
            } catch (e) {
                /* assume it wasn't a spy or stub; ignore error*/
            }
            // restore pre-test default adapter instance in case we changed it in a test
            breeze.config.initializeAdapterInstance('ajax', originalAjaxAdapter.name, true);
        }
    });

    /*********************************************************
      * exception in ajax adapter should be caught in promise
      * Because Breeze bug "2590 dataserviceadapter throws if ajax call throws",
      * the exception bubbles out synchronously and the test fails
      *********************************************************/
    asyncTest("exception in ajax adapter should be caught in promise", 2, function () {
        var em = new breeze.EntityManager('/bad/address/');
        var wasCaught = false;
        var err = new Error('some error in the ajax adapter');

        // Make sure the ajaxAdapter throws when used
        // if you leave this line and bug #2590 is not fixed, the test will fail
        // Regardless, if you comment this out, then the "bad url" will be caught properly
        // and passed to the catch and the test passes
        sinon.stub(originalAjaxAdapter, "ajax").throws(err);
        try {
            breeze.EntityQuery.from("Todos").using(em).execute()
                .catch(function () { wasCaught = true;})
                .finally(fin);
        } catch (e) {
            ok(false, "the attempt to query with bad adapter threw sync exception");
            start();
        }

        function fin() {
            ok(originalAjaxAdapter.ajax.threw(err), "ajax adapter threw expected error");
            ok(wasCaught, "the exceptions was passed to the promise's catch");
            start();
        }
    });


})(breezeTestFns);