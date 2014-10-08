// ajaxAdapterTests
(function (testFns) {
    var breeze = testFns.breeze;

    module("ajaxAdapter", {
        setup: function () {
            testFns.setup();
        },
        teardown: function () {

        }
    });

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


})(breezeTestFns);