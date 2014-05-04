// needs JQuery v.>=1.5
// see https://api.jquery.com/jQuery.ajax/
(function(factory) {
    // Module systems magic dance.
    if (breeze) {
        factory(breeze);
    } else if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "breeze"
        factory(require("breeze"));
    } else if (typeof define === "function" && define["amd"]) {
        // AMD anonymous module with hard-coded dependency on "breeze"
        define(["breeze"], factory);
    }
}(function(breeze) {
    var core = breeze.core;
    
    var jQuery;
    
    var ctor = function () {
        this.name = "jQuery";
        this.defaultSettings = { };
        this.requestInterceptor = null; // s
    };

    ctor.prototype.initialize = function () {
        // look for the jQuery lib but don't fail immediately if not found
        jQuery = core.requireLib("jQuery");
    };

    ctor.prototype.ajax = function (config) {
        if (!jQuery) {
            throw new Error("Unable to locate jQuery");
        }
        var jqConfig = {
            type: config.type, 
            url: config.url,
            data: config.params || config.data,
            dataType: config.dataType,
            contentType: config.contentType,
            crossDomain: config.crossDomain,
            headers: config.headers || {}
        }
        
        if (!core.isEmpty(this.defaultSettings)) {
            var compositeConfig = core.extend({}, this.defaultSettings);
            jqConfig = core.extend(compositeConfig, jqConfig);
            // extend is shallow; extend headers separately
            jqConfig.headers = core.extend(this.defaultSettings.headers, jqConfig.headers);
        }
        
        var requestInfo = {
            adapter: this,      // this adapter
            config: jqConfig,   // jQuery's ajax 'settings' object
            zConfig: config,    // the config arg from the calling Breeze data service adapter
            success: successFn, // adapter's success callback
            error: errorFn      // adapter's error callback
        }

        if (core.isFunction(this.requestInterceptor)){
            this.requestInterceptor(requestInfo);
            if (this.requestInterceptor.oneTime){
                this.requestInterceptor = null;
            }
        }

        if (requestInfo.config){
            requestInfo.jqXHR = jQuery.ajax(requestInfo.config)
            .done(requestInfo.success)
            .fail(requestInfo.error); 
        }

        function successFn(data, textStatus, jqXHR) {
            var httpResponse = {
                data: data,
                status: jqXHR.status,
                getHeaders: getHeadersFn(jqXHR ),
                config: config
            };
            config.success(httpResponse);
            jqXHR.onreadystatechange = null;
            jqXHR.abort = null;               
        }

        function errorFn(jqXHR, textStatus, errorThrown) {
            var responseText, status;
            /* jqXHR could be in invalid state e.g., after timeout */
            try {
             responseText = jqXHR.responseText;
             status = jqXHR.status;
             jqXHR.onreadystatechange = null;
             jqXHR.abort = null;               
            } catch(e){ /* ignore errors */ }  

            var httpResponse = {
                data: responseText,
                status: status,
                getHeaders: getHeadersFn(jqXHR ),
                error: errorThrown,
                config: config
            };
            config.error(httpResponse);
        }
    };
    
    function getHeadersFn(jqXHR) {
        return function (headerName) {
            // XHR can be bad so wrap in try/catch
            if (headerName && headerName.length > 0) {
                try {
                    return jqXHR.getResponseHeader(headerName);
                } catch (e){
                    return null;
                }                
            } else {
                try {
                    return jqXHR.getAllResponseHeaders();                    
                } catch (e){
                    return {}
                }
            };
        };
    }

    breeze.config.registerAdapter("ajax", ctor);
    
}));
