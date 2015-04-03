// ajaxAdapterTests
(function (testFns) {
  var breeze = testFns.breeze;
  var core = breeze.core;
  var expectedError = new Error('deliberate error');
  var originalAjaxAdapter;

  module("ajaxAdapter", {
    beforeEach: function () {
      //testFns.setup();
      originalAjaxAdapter = breeze.config.getAdapterInstance('ajax');
    },
    afterEach: function () {
      // restore pre-test default adapter instance in case we changed it in a test
      breeze.config.initializeAdapterInstance('ajax', originalAjaxAdapter.name, true);
    }
  });

  /*********************************************************
   * exception in ajax adapter should be caught in promise
   * Because Breeze bug "2590 dataserviceadapter throws if ajax call throws",
   * the exception bubbles out synchronously and the test fails
   *********************************************************/
  test("exception in ajax adapter should be caught in promise", 2, function (assert) {
    var done = assert.async();
    var em = new breeze.EntityManager('/bad/address/');
    var wasCaught = false;

    // Make sure the ajaxAdapter throws when used
    // if you leave this line and bug #2590 is not fixed, the test will fail
    // Regardless, if you comment this out, then the "bad url" will be caught properly
    // and passed to the catch and the test passes
    var ajaxStub = sinon.stub(originalAjaxAdapter, 'ajax').throws(expectedError);
    try {
      breeze.EntityQuery.from("Todos").using(em).execute()
          .catch(function (err) {
            equal(err, expectedError, "ajax adapter threw expected error");
            ok(true, "the exception was passed to the promise's catch");
          })
          .finally(fin);

    } catch (err) {
      ok(false, "the attempt to query with bad adapter threw sync exception");
      ajaxStub.restore();
      done();
    }

    function fin() {
      ajaxStub.restore();
      done();
    }
  });

  /*********************************************************
   * jQuery ajax adapter default settings are inherited
   *********************************************************/
  test("jQuery ajax adapter default settings are inherited", 3, function (assert) {
    var done = assert.async();
    // get jQuery ajax adapter and ensure it is the default adapter for this test
    var adapter = breeze.config.getAdapterInstance('ajax', 'jQuery');
    breeze.config.initializeAdapterInstance('ajax', adapter.name, true);

    var ajaxStub = sinon.stub(jQuery, 'ajax').throws(expectedError);

    inheritedDefaultSettingsTest(adapter, ajaxStub, done);
  });

  /*********************************************************
   * Angular ajax adapter default settings are inherited
   *********************************************************/
  test("Angular ajax adapter default settings are inherited", 3, function (assert) {
    var done = assert.async();
    // get Angular ajax adapter and ensure it is the default adapter for this test
    var adapter = breeze.config.getAdapterInstance('ajax', 'angular');
    breeze.config.initializeAdapterInstance('ajax', adapter.name, true);

    var ajaxStub = sinon.stub(adapter, '$http').throws(expectedError);

    inheritedDefaultSettingsTest(adapter, ajaxStub, done);

  });

  function inheritedDefaultSettingsTest(adapter, ajaxStub, done) {
    // copy the original default settings so can restore at end of test
    var defSettings = adapter.defaultSettings;
    var originalDefaultSettings = core.extend({}, defSettings);
    // add a default header to the default settings that will be used.
    var fooHeader = 'foo header';
    defSettings.headers = { foo_header: fooHeader };

    new breeze.EntityManager('/bad/address/')
        .fetchMetadata() // triggers a call to the server
        .then(unexpectedSuccess, expectedFailure).finally(fin);

    // should fail; we're only interested in how ajax was called
    function expectedFailure(err) {
      equal(err, expectedError, "ajax fn threw expected error");
      var ajaxSettings = ajaxStub.args[0][0]; // 1st arg of 1st call
      ok(ajaxSettings != null, 'ajax was called with a settings object');
      var actualHeader = ajaxSettings.headers && ajaxSettings.headers['foo_header'];
      equal(actualHeader, fooHeader,
              "received expected default 'foo_header' with value: " + fooHeader);
    }

    function fin() {
      // restore
      adapter.defaultSettings = originalDefaultSettings;
      ajaxStub.restore();
      done();
    }
  }

  /////
  function unexpectedSuccess() {
    ok(false, "server request succeeded when it shouldn't; Disaster!");
  }

})(breezeTestFns);