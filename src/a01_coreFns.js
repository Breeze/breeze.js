/**
 @module core
 **/

var __hasOwnProperty = uncurry(Object.prototype.hasOwnProperty);
var __arraySlice = uncurry(Array.prototype.slice);
var __isES5Supported = function () {
  try {
    return !!(Object.getPrototypeOf && Object.defineProperty({}, 'x', {}));
  } catch (e) {
    return false;
  }
}();

// iterate over object
function __objectForEach(obj, kvFn) {
  for (var key in obj) {
    if (__hasOwnProperty(obj, key)) {
      kvFn(key, obj[key]);
    }
  }
}

function __objectMap(obj, kvFn) {
  var results = [];
  for (var key in obj) {
    if (__hasOwnProperty(obj, key)) {
      var result = kvFn ? kvFn(key, obj[key]) : obj[key];
      if (result !== undefined) {
        results.push(result);
      }
    }
  }
  return results;
}

function __objectFirst(obj, kvPredicate) {
  for (var key in obj) {
    if (__hasOwnProperty(obj, key)) {
      var value = obj[key];
      if (kvPredicate(key, value)) {
        return { key: key, value: value };
      }
    }
  }
  return null;
}

function __isSettable(entity, propertyName) {
  var pd = __getPropDescriptor(entity, propertyName);
  if (pd == null) return true;
  return !!(pd.writable || pd.set);
}

function __getPropDescriptor(obj, propertyName) {
  if (!__isES5Supported) return null;

  if (obj.hasOwnProperty(propertyName)) {
    return Object.getOwnPropertyDescriptor(obj, propertyName);
  } else {
    var nextObj = Object.getPrototypeOf(obj);
    if (nextObj == null) return null;
    return __getPropDescriptor(nextObj, propertyName);
  }
}

// Functional extensions

// can be used like: persons.filter(propEq("firstName", "John"))
function __propEq(propertyName, value) {
  return function (obj) {
    return obj[propertyName] === value;
  };
}

// can be used like persons.map(pluck("firstName"))
function __pluck(propertyName) {
  return function (obj) {
    return obj[propertyName];
  };
}

// end functional extensions


function __getOwnPropertyValues(source) {
  var result = [];
  for (var name in source) {
    if (__hasOwnProperty(source, name)) {
      result.push(source[name]);
    }
  }
  return result;
}

function __extend(target, source, propNames) {
  if (!source) return target;
  if (propNames) {
    propNames.forEach(function (propName) {
      target[propName] = source[propName];
    });
  } else {
    for (var propName in source) {
      if (__hasOwnProperty(source, propName)) {
        target[propName] = source[propName];
      }
    }
  }
  return target;
}


function __updateWithDefaults(target, defaults) {
  for (var name in defaults) {
    if (target[name] === undefined) {
      target[name] = defaults[name];
    }
  }
  return target;
}


function __setAsDefault(target, ctor) {
  // we want to insure that the object returned by ctor.defaultInstance is always immutable
  // Use 'target' as the primary template for the ctor.defaultInstance;
  // Use current 'ctor.defaultInstance' as the template for any missing properties
  // creates a new instance for ctor.defaultInstance
  // returns target unchanged
  ctor.defaultInstance = __updateWithDefaults(new ctor(target), ctor.defaultInstance);
  return target;
}

// 'source' is an object that will be transformed into another
// 'template' is a map where the
//    keys: are the keys to return
//      if a key contains ','s then the key is treated as a delimited string with first of the
//      keys being the key to return and the others all valid aliases for this key
//    'values' are either
//        1) the 'default' value of the key
//        2) a function that takes in the source value and should return the value to set
//      The value from the source is then set on the target,
//      after first passing thru the fn, if provided, UNLESS:
//        1) it is the default value
//        2) it is undefined ( nulls WILL be set)
// 'target' is optional
//    - if it exists then properties of the target will be set ( overwritten if the exist)
//    - if it does not exist then a new object will be created as filled.
// 'target is returned.
function __toJson(source, template, target) {
  target = target || {};

  for (var key in template) {
    var aliases = key.split(",");
    var defaultValue = template[key];
    // using some as a forEach with a 'break'
    aliases.some(function(propName) {
      if (!(propName in source)) return false;
      var value = source[propName];
      // there is a functional property defined with this alias ( not what we want to replace).
      if (typeof value == 'function') return false;
      // '==' is deliberate here - idea is that null or undefined values will never get serialized
      // if default value is set to null.
      if (value == defaultValue) return true;
      if (Array.isArray(value) && value.length === 0) return true;
      if (typeof(defaultValue) === "function") {
        value = defaultValue(value);
      } else if (typeof (value) === "object") {
        if (value && value.parentEnum) {
          value = value.name;
        }
      }
      if (value === undefined) return true;
      target[aliases[0]] = value;
      return true;
    });
  }
  return target;
}

// safely perform toJSON logic on objects with cycles.
function __toJSONSafe(obj, replacer) {
  if (obj !== Object(obj)) return obj; // primitive value
  if (obj._$visited) return undefined;
  if (obj.toJSON) {
    var newObj = obj.toJSON();
    if (newObj !== Object(newObj)) return newObj; // primitive value
    if (newObj !== obj) return __toJSONSafe(newObj);
    // toJSON returned the object unchanged.
    obj = newObj;
  }
  obj._$visited = true;
  var result;
  if (obj instanceof Array) {
    result = obj.map(function (o) {
      return __toJSONSafe(o, replacer);
    });
  } else if (typeof (obj) === "function") {
    result = undefined;
  } else {
    result = {};
    for (var prop in obj) {
      if (prop === "_$visited") continue;
      var val = obj[prop];
      if (replacer) {
        val = replacer(prop, val);
        if (val === undefined) continue;
      }
      val = __toJSONSafe(val);
      if (val === undefined) continue;
      result[prop] = val;
    }
  }
  delete obj._$visited;
  return result;
}

// resolves the values of a list of properties by checking each property in multiple sources until a value is found.
function __resolveProperties(sources, propertyNames) {
  var r = {};
  var length = sources.length;
  propertyNames.forEach(function (pn) {
    for (var i = 0; i < length; i++) {
      var src = sources[i];
      if (src) {
        var val = src[pn];
        if (val !== undefined) {
          r[pn] = val;
          break;
        }
      }
    }
  });
  return r;
}


// array functions

function __toArray(item) {
  if (item == null) {
    return [];
  } else if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

// a version of Array.map that doesn't require an array, i.e. works on arrays and scalars.
function __map(items, fn, includeNull) {
  // whether to return nulls in array of results; default = true;
  includeNull = includeNull == null ? true : includeNull;
  if (items == null) return items;
  var result;
  if (Array.isArray(items)) {
    result = [];
    items.forEach(function (v, ix) {
      var r = fn(v, ix);
      if (r != null || includeNull) {
        result[ix] = r;
      }
    });
  } else {
    result = fn(items);
  }
  return result;
}


function __arrayFirst(array, predicate) {
  for (var i = 0, j = array.length; i < j; i++) {
    if (predicate(array[i])) {
      return array[i];
    }
  }
  return null;
}

function __arrayIndexOf(array, predicate) {
  for (var i = 0, j = array.length; i < j; i++) {
    if (predicate(array[i])) return i;
  }
  return -1;
}

function __arrayAddItemUnique(array, item) {
  var ix = array.indexOf(item);
  if (ix === -1) array.push(item);
}

function __arrayRemoveItem(array, predicateOrItem, shouldRemoveMultiple) {
  var predicate = __isFunction(predicateOrItem) ? predicateOrItem : undefined;
  var lastIx = array.length - 1;
  var removed = false;
  for (var i = lastIx; i >= 0; i--) {
    if (predicate ? predicate(array[i]) : (array[i] === predicateOrItem)) {
      array.splice(i, 1);
      removed = true;
      if (!shouldRemoveMultiple) {
        return true;
      }
    }
  }
  return removed;
}

function __arrayZip(a1, a2, callback) {
  var result = [];
  var n = Math.min(a1.length, a2.length);
  for (var i = 0; i < n; ++i) {
    result.push(callback(a1[i], a2[i]));
  }
  return result;
}

//function __arrayDistinct(array) {
//    array = array || [];
//    var result = [];
//    for (var i = 0, j = array.length; i < j; i++) {
//        if (result.indexOf(array[i]) < 0)
//            result.push(array[i]);
//    }
//    return result;
//}

// Not yet needed
//// much faster but only works on array items with a toString method that
//// returns distinct string for distinct objects.  So this is safe for arrays with primitive
//// types but not for arrays with object types, unless toString() has been implemented.
//function arrayDistinctUnsafe(array) {
//    var o = {}, i, l = array.length, r = [];
//    for (i = 0; i < l; i += 1) {
//        var v = array[i];
//        o[v] = v;
//    }
//    for (i in o) r.push(o[i]);
//    return r;
//}

function __arrayEquals(a1, a2, equalsFn) {
  //Check if the arrays are undefined/null
  if (!a1 || !a2) return false;

  if (a1.length !== a2.length) return false;

  //go thru all the vars
  for (var i = 0; i < a1.length; i++) {
    //if the var is an array, we need to make a recursive check
    //otherwise we'll just compare the values
    if (Array.isArray(a1[i])) {
      if (!__arrayEquals(a1[i], a2[i])) return false;
    } else {
      if (equalsFn) {
        if (!equalsFn(a1[i], a2[i])) return false;
      } else {
        if (a1[i] !== a2[i]) return false;
      }
    }
  }
  return true;
}

// end of array functions

// returns and array for a source and a prop, and creates the prop if needed.
function __getArray(source, propName) {
  var arr = source[propName];
  if (!arr) {
    arr = [];
    source[propName] = arr;
  }
  return arr;
}

function __requireLib(libNames, errMessage) {
  var arrNames = libNames.split(";");
  for (var i = 0, j = arrNames.length; i < j; i++) {
    var lib = __requireLibCore(arrNames[i]);
    if (lib) return lib;
  }
  if (errMessage) {
    throw new Error("Unable to initialize " + libNames + ".  " + errMessage);
  }
}

// Returns the 'libName' module if loaded or else returns undefined
function __requireLibCore(libName) {
  var window = global.window;
  if (!window) return; // Must run in a browser. Todo: add commonjs support

  // get library from browser globals if we can
  var lib = window[libName];
  if (lib) return lib;

  // if require exists, maybe require can get it.
  // This method is synchronous so it can't load modules with AMD.
  // It can only obtain modules from require that have already been loaded.
  // Developer should bootstrap such that the breeze module
  // loads after all other libraries that breeze should find with this method
  // See documentation
  var r = window.require;
  if (r) { // if require exists
    if (r.defined) { // require.defined is not standard and may not exist
      // require.defined returns true if module has been loaded
      return r.defined(libName) ? r(libName) : undefined;
    } else {
      // require.defined does not exist so we have to call require('libName') directly.
      // The require('libName') overload is synchronous and does not load modules.
      // It throws an exception if the module isn't already loaded.
      try {
        return r(libName);
      } catch (e) {
        // require('libName') threw because module not loaded
        return;
      }
    }
  }
}

function __using(obj, property, tempValue, fn) {
  var originalValue = obj[property];
  if (tempValue === originalValue) {
    return fn();
  }
  obj[property] = tempValue;
  try {
    return fn();
  } finally {
    if (originalValue === undefined) {
      delete obj[property];
    } else {
      obj[property] = originalValue;
    }
  }
}

function __wrapExecution(startFn, endFn, fn) {
  var state;
  try {
    state = startFn();
    return fn();
  } catch (e) {
    if (typeof(state) === 'object') {
      state.error = e;
    }
    throw e;
  } finally {
    endFn(state);
  }
}

function __memoize(fn) {
  return function () {
    var args = __arraySlice(arguments),
        hash = "",
        i = args.length,
        currentArg = null;
    while (i--) {
      currentArg = args[i];
      hash += (currentArg === Object(currentArg)) ? JSON.stringify(currentArg) : currentArg;
      fn.memoize || (fn.memoize = {});
    }
    return (hash in fn.memoize) ?
           fn.memoize[hash] :
           fn.memoize[hash] = fn.apply(this, args);
  };
}

function __getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    //noinspection NonShortCircuitBooleanExpressionJS
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function __durationToSeconds(duration) {
  // basic algorithm from https://github.com/nezasa/iso8601-js-period
  if (typeof duration !== "string") throw new Error("Invalid ISO8601 duration '" + duration + "'");

  // regex splits as follows - grp0, grp1, y, m, d, grp2, h, m, s
  //                           0     1     2  3  4  5     6  7  8
  var struct = /^P((\d+Y)?(\d+M)?(\d+D)?)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.exec(duration);
  if (!struct) throw new Error("Invalid ISO8601 duration '" + duration + "'");

  var ymdhmsIndexes = [2, 3, 4, 6, 7, 8]; // -> grp1,y,m,d,grp2,h,m,s
  var factors = [31104000, // year (360*24*60*60)
                 2592000,             // month (30*24*60*60)
                 86400,               // day (24*60*60)
                 3600,                // hour (60*60)
                 60,                  // minute (60)
                 1];                  // second (1)

  var seconds = 0;
  for (var i = 0; i < 6; i++) {
    var digit = struct[ymdhmsIndexes[i]];
    // remove letters, replace by 0 if not defined
    digit = digit ? +digit.replace(/[A-Za-z]+/g, '') : 0;
    seconds += digit * factors[i];
  }
  return seconds;

}

// is functions

function __noop() {
  // does nothing
}

function __identity(x) {
  return x;
}

function __classof(o) {
  if (o === null) {
    return "null";
  }
  if (o === undefined) {
    return "undefined";
  }
  return Object.prototype.toString.call(o).slice(8, -1).toLowerCase();
}

function __isDate(o) {
  return __classof(o) === "date" && !isNaN(o.getTime());
}

function __isDateString(s) {
  // var rx = /^(\d{4}|[+\-]\d{6})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(?:(Z)|([+\-])(\d{2})(?::(\d{2}))?)?)?$/;
  var rx = /^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/;
  return (typeof s === "string") && rx.test(s);
}

function __isFunction(o) {
  return __classof(o) === "function";
}

function __isString(o) {
  return (typeof o === "string");
}

function __isObject(o) {
  return (typeof o === "object");
}

function __isGuid(value) {
  return (typeof value === "string") && /[a-fA-F\d]{8}-(?:[a-fA-F\d]{4}-){3}[a-fA-F\d]{12}/.test(value);
}

function __isDuration(value) {
  return (typeof value === "string") && /^(-|)?P[T]?[\d\.,\-]+[YMDTHS]/.test(value);
}

function __isEmpty(obj) {
  if (obj === null || obj === undefined) {
    return true;
  }
  for (var key in obj) {
    if (__hasOwnProperty(obj, key)) {
      return false;
    }
  }
  return true;
}

function __isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// returns true for booleans, numbers, strings and dates
// false for null, and non-date objects, functions, and arrays
function __isPrimitive(obj) {
  if (obj == null) return false;
  // true for numbers, strings, booleans and null, false for objects
  if (obj != Object(obj)) return true;
  return _isDate(obj);
}

// end of is Functions

// string functions

function __stringStartsWith(str, prefix) {
  // returns true for empty string or null prefix
  if ((!str)) return false;
  if (prefix == "" || prefix == null) return true;
  return str.indexOf(prefix, 0) === 0;
}

function __stringEndsWith(str, suffix) {
  // returns true for empty string or null suffix
  if ((!str)) return false;
  if (suffix == "" || suffix == null) return true;
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

// Based on fragment from Dean Edwards' Base 2 library
// format("a %1 and a %2", "cat", "dog") -> "a cat and a dog"
function __formatString(string) {
  var args = arguments;
  var pattern = RegExp("%([1-" + (arguments.length - 1) + "])", "g");
  return string.replace(pattern, function (match, index) {
    return args[index];
  });
}

// end of string functions

// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
function uncurry(f) {
  var call = Function.call;
  return function () {
    return call.apply(f, arguments);
  };
}

// shims

if (!Object.create) {
  Object.create = function (parent) {
    var F = function () {
    };
    F.prototype = parent;
    return new F();
  };
}

var core = {};

// not all methods above are exported
core.__isES5Supported = __isES5Supported;

core.objectForEach = __objectForEach;

core.extend = __extend;
core.propEq = __propEq;
core.pluck = __pluck;

core.arrayEquals = __arrayEquals;
core.arrayFirst = __arrayFirst;
core.arrayIndexOf = __arrayIndexOf;
core.arrayRemoveItem = __arrayRemoveItem;
core.arrayZip = __arrayZip;

core.requireLib = __requireLib;
core.using = __using;

core.memoize = __memoize;
core.getUuid = __getUuid;
core.durationToSeconds = __durationToSeconds;

core.isDate = __isDate;
core.isGuid = __isGuid;
core.isDuration = __isDuration;
core.isFunction = __isFunction;
core.isEmpty = __isEmpty;
core.isNumeric = __isNumeric;

core.stringStartsWith = __stringStartsWith;
core.stringEndsWith = __stringEndsWith;
core.formatString = __formatString;

core.getPropertyDescriptor = __getPropDescriptor;

core.toJSONSafe = __toJSONSafe;

core.parent = breeze;
breeze.core = core;


