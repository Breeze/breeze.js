// ajaxAdapterTests
(function (testFns) {
    var breeze = testFns.breeze;
    var core = breeze.core;
    var originalAjaxAdapter;

    module("ajaxAdapter", {
        setup: function () {
            testFns.setup();
            originalAjaxAdapter = breeze.config.getAdapterInstance('ajax');
        },
        teardown: function () {
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
        var ajaxStub = sinon.stub(originalAjaxAdapter, "ajax").throws(err);
        try {
            breeze.EntityQuery.from("Todos").using(em).execute()
                .catch(function () { wasCaught = true;})
                .finally(fin);
        } catch (e) {
            ok(false, "the attempt to query with bad adapter threw sync exception");
            ajaxStub.restore();
            start();
        }

        function fin() {
            ok(originalAjaxAdapter.ajax.threw(err), "ajax adapter threw expected error");
            ok(wasCaught, "the exceptions was passed to the promise's catch");
            ajaxStub.restore();
            start();
        }
    });

    /*********************************************************
      * jQuery ajax adapter default settings are inherited
      *********************************************************/
    asyncTest("jQuery ajax adapter default settings are inherited", 2, function() {

        // get jQuery ajax adapter and ensure it is the default adapter for this test
        var adapter = breeze.config.getAdapterInstance('ajax', 'jQuery');
        breeze.config.initializeAdapterInstance('ajax', adapter.name, true);

        var ajaxSpy = sinon.spy(jQuery, "ajax");

        // copy the original default settings so can restore at end of test
        var defSettings = adapter.defaultSettings;
        var originalDefaultSettings = core.extend({}, defSettings);
        // add a default header to the default settings that will be used.
        var fooHeader = 'foo header';
        defSettings.headers = {foo_header: fooHeader};

        new breeze.EntityManager('/bad/address/')
            .fetchMetadata() // triggers a call to the server
            .then(stubWtf, expectedFailure).finally(fin);

        // should fail; we're only interested in how ajax was called
        function expectedFailure(err) {
            if (err.status !== 404) {
                ok(false, "server call failed with unexpected error: " + err.message);
                expect(1);
                return;
            }
            var ajaxSettings = ajaxSpy.args[0][0]; // 1st arg of 1st call
            ok(ajaxSettings != null, 'ajax was called with a settings object');
            var actualHeader = ajaxSettings.headers && ajaxSettings.headers['foo_header'];
            equal(actualHeader, fooHeader,
            "received expected default 'foo_header' with value: " + fooHeader);
        }

        function fin(){
            // restore
            adapter.defaultSettings = originalDefaultSettings;
            ajaxSpy.restore();
            start();
        }

    });
    /*********************************************************
      * Angular ajax adapter default settings are inherited
      *********************************************************/
    asyncTest("Angular ajax adapter default settings are inherited", 2, function () {

        // get Angular ajax adapter and ensure it is the default adapter for this test
        var adapter = breeze.config.getAdapterInstance('ajax', 'angular');
        breeze.config.initializeAdapterInstance('ajax', adapter.name, true);

        var ajaxSpy = sinon.spy(adapter, "$http");

        // copy the original default settings so can restore at end of test
        var defSettings = adapter.defaultSettings;
        var originalDefaultSettings = core.extend({}, defSettings);
        // add a default header to the default settings that will be used.
        var fooHeader = 'foo header';
        defSettings.headers = { foo_header: fooHeader };

        new breeze.EntityManager('/bad/address/')
            .fetchMetadata() // triggers a call to the server
            .then(stubWtf, expectedFailure).finally(fin);

        // should fail; we're only interested in how ajax was called
        function expectedFailure(err) {
            if (err.status !== 404) {
                ok(false, "server call failed with unexpected error: " + err.message);
                expect(1);
                return;
            }

            var ajaxSettings = ajaxSpy.args[0][0]; // 1st arg of 1st call
            ok(ajaxSettings != null, 'ajax was called with a settings object');
            var actualHeader = ajaxSettings.headers && ajaxSettings.headers['foo_header'];
            equal(actualHeader, fooHeader,
            "received expected default 'foo_header' with value: " + fooHeader);
        }

        function fin() {
            // restore
            adapter.defaultSettings = originalDefaultSettings;
            ajaxSpy.restore();
            start();
        }

    });

    /////
    function stubWtf() {
        ok(false, "server request succeeded when it shouldn't; Disaster!");
    }

})(breezeTestFns);