(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({2:[function(require,module,exports){
_hmr["websocket:null"].initModule("main.js", module);
(function(){
"use strict";

document.getElementById('content').innerHTML = "test deploy hola sergio, como molasss";

}).apply(this, arguments);

},{}],3:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\inc\\index.js", module);
(function(){
(function (global){
'use strict';

var has = require('../lib/has');
var StrSet = require('../lib/str-set');
var forEach = require('lodash/collection/forEach');
var some = require('lodash/collection/some');
var map = require('lodash/collection/map');
var filter = require('lodash/collection/filter');
var zipObject = require('lodash/array/zipObject');
var forOwn = require('lodash/object/forOwn');
var mapValues = require('lodash/object/mapValues');
var assign = require('lodash/object/assign');

function emitError(err) {
  setTimeout(function() {
    throw err;
  }, 0);
}

function makeModuleIndexesToNames(moduleMeta) {
  var moduleIndexesToNames = {};
  forOwn(moduleMeta, function(value, name) {
    moduleIndexesToNames[value.index] = name;
  });
  return moduleIndexesToNames;
}

var console = global.console ? global.console : {
  error: function(){}, log: function() {}
};

function main(
  moduleDefs, cachedModules, moduleMeta, updateUrl,
  updateMode, supportModes, ignoreUnaccepted, updateCacheBust, bundleKey,
  socketio,
  bundle__filename, bundle__dirname
) {
  var moduleIndexesToNames = makeModuleIndexesToNames(moduleMeta);

  var socket;
  var name, i, len;

  if (!global._hmr[bundleKey].setStatus) {
    var runtimeModuleInfo = {};
    var createInfoEntry = function(name) {
      runtimeModuleInfo[name] = {
        index: moduleMeta[name].index,
        hash: moduleMeta[name].hash,
        parents: new StrSet(moduleMeta[name].parents),
        module: null,
        disposeData: null,
        accepters: new StrSet(),
        accepting: new StrSet(),
        decliners: new StrSet(),
        declining: new StrSet(),
        selfAcceptCbs: [], // may contain null. nonzero length means module is self-accepting
        disposeHandlers: []
      };
    };
    for (name in moduleMeta) {
      if (has(moduleMeta, name)) {
        createInfoEntry(name);
      }
    }

    // loaders take a callback(err, data). They may give null for data if they
    // know there hasn't been an update.
    var fileReloaders = {
      fs: function(cb) {
        var fs;
        try {
          fs = require('f'+'s');
        } catch(e) {
          cb(e);
          return;
        }
        fs.readFile(localHmr.updateUrl || bundle__filename, 'utf8', cb);
      },
      ajax: function(cb) {
        var xhr;
        try {
          xhr = new XMLHttpRequest();
        } catch(e) {
          cb(e);
          return;
        }
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              cb(null, xhr.responseText);
            } else {
              cb(new Error("Request had response "+xhr.status));
            }
          }
        };
        var url = localHmr.updateUrl + (updateCacheBust?'?_v='+(+new Date()):'');
        xhr.open('GET', url, true);
        xhr.send();
      }
    };

    var lastScriptData = null;

    // cb(err, expectUpdate)
    var reloadAndRunScript = function(cb) {
      if (!has(fileReloaders, localHmr.updateMode)) {
        cb(new Error("updateMode "+localHmr.updateMode+" not implemented"));
        return;
      }
      var reloader = fileReloaders[localHmr.updateMode];
      reloader(function(err, data) {
        if (err || !data || lastScriptData === data) {
          cb(err, false);
          return;
        }
        lastScriptData = data;
        localHmr.newLoad = null;
        try {
          //jshint evil:true
          if (bundle__filename || bundle__dirname) {
            new Function('require', '__filename', '__dirname', data)(require, bundle__filename, bundle__dirname);
          } else {
            new Function('require', data)(require);
          }
          // running the file sets _hmr.newLoad
        } catch (err2) {
          localHmr.newLoad = null;
          cb(err2);
          return;
        }
        if (!localHmr.newLoad) {
          cb(new Error("Reloaded script did not set hot module reload data"));
          return;
        }
        cb(null, true);
      });
    };

    var getOutdatedModules = function() {
      var outdated = [];
      var name;
      // add changed and deleted modules
      for (name in runtimeModuleInfo) {
        if (has(runtimeModuleInfo, name)) {
          if (
            !has(localHmr.newLoad.moduleMeta, name) ||
            runtimeModuleInfo[name].hash !== localHmr.newLoad.moduleMeta[name].hash
          ) {
            outdated.push(name);
          }
        }
      }
      // add brand new modules
      for (name in localHmr.newLoad.moduleMeta) {
        if (has(localHmr.newLoad.moduleMeta, name)) {
          if (!has(runtimeModuleInfo, name)) {
            outdated.push(name);
          }
        }
      }
      // add modules that are non-accepting/declining parents of outdated modules.
      // important: if outdated has new elements added during the loop,
      // then we iterate over them too.
      for (var i=0; i<outdated.length; i++) {
        name = outdated[i];
        //jshint -W083
        if (has(runtimeModuleInfo, name)) {
          runtimeModuleInfo[name].parents.forEach(function(parentName) {
            if (
              runtimeModuleInfo[name].selfAcceptCbs.length === 0 &&
              !runtimeModuleInfo[name].accepters.has(parentName) &&
              !runtimeModuleInfo[name].decliners.has(parentName) &&
              outdated.indexOf(parentName) === -1
            ) {
              outdated.push(parentName);
            }
          });
        }
      }
      return outdated;
    };

    var moduleHotCheck = function(autoApply, cb) {
      if (typeof autoApply === 'function') {
        cb = autoApply;
        autoApply = false;
      }
      if (!cb) {
        throw new Error("module.hot.check callback parameter required");
      }
      if (localHmr.status !== 'idle') {
        cb(new Error("module.hot.check can only be called while status is idle"));
        return;
      }
      if (updateMode === 'websocket') {
        cb(new Error("module.hot.check can't be used when update mode is websocket"));
        return;
      }

      localHmr.setStatus('check');
      reloadAndRunScript(function(err, expectUpdate) {
        if (err || !expectUpdate) {
          localHmr.setStatus('idle');
          cb(err, null);
          return;
        }
        var outdatedModules = getOutdatedModules();
        if (outdatedModules.length === 0) {
          localHmr.setStatus('idle');
          cb(null, null);
        } else {
          localHmr.setStatus('ready');
          if (autoApply) {
            moduleHotApply(autoApply, cb);
          } else {
            cb(null, outdatedModules);
          }
        }
      });
    };

    var moduleHotApply = function(options, cb) {
      if (typeof options === 'function') {
        cb = options;
        options = null;
      }
      if (!cb) {
        throw new Error("module.hot.apply callback parameter required");
      }
      var ignoreUnaccepted = !!(options && options.ignoreUnaccepted);
      if (localHmr.status !== 'ready') {
        cb(new Error("module.hot.apply can only be called while status is ready"));
        return;
      }

      var outdatedModules = getOutdatedModules();
      var isValueNotInOutdatedModules = function(value) {
        return outdatedModules.indexOf(value) === -1;
      };
      var i, len;
      var acceptedUpdates = filter(outdatedModules, function(name) {
        if (has(runtimeModuleInfo, name)) {
          if (
            runtimeModuleInfo[name].decliners.some(isValueNotInOutdatedModules) ||
            (
              runtimeModuleInfo[name].accepters.size() === 0 &&
              runtimeModuleInfo[name].selfAcceptCbs.length === 0 &&
              runtimeModuleInfo[name].parents.some(isValueNotInOutdatedModules)
            )
          ) {
            return false;
          }
        }
        return true;
      });
      if (!ignoreUnaccepted && outdatedModules.length !== acceptedUpdates.length) {
        localHmr.setStatus('idle');
        cb(new Error("Some updates were declined"));
        return;
      }
      var an;
      for (i=0, len=acceptedUpdates.length; i<len; i++) {
        an = acceptedUpdates[i];
        if (has(runtimeModuleInfo, an)) {
          runtimeModuleInfo[an].disposeData = {};
          for (var j=0; j<runtimeModuleInfo[an].disposeHandlers.length; j++) {
            try {
              runtimeModuleInfo[an].disposeHandlers[j].call(null, runtimeModuleInfo[an].disposeData);
            } catch(e) {
              localHmr.setStatus('idle');
              cb(e || new Error("Unknown dispose callback error"));
              return;
            }
          }
        }
      }
      var selfAccepters = [];
      for (i=0, len=acceptedUpdates.length; i<len; i++) {
        an = acceptedUpdates[i];
        //jshint -W083
        if (!has(runtimeModuleInfo, an)) {
          // new modules
          runtimeModuleInfo[an] = {
            index: an,
            hash: localHmr.newLoad.moduleMeta[an].hash,
            parents: new StrSet(localHmr.newLoad.moduleMeta[an].parents),
            module: null,
            disposeData: null,
            accepters: new StrSet(),
            accepting: new StrSet(),
            decliners: new StrSet(),
            declining: new StrSet(),
            selfAcceptCbs: [],
            disposeHandlers: []
          };
        } else if (!has(localHmr.newLoad.moduleMeta, an)) {
          // removed modules
          delete cachedModules[runtimeModuleInfo[an].index];
          delete runtimeModuleInfo[an];
          continue;
        } else {
          // updated modules
          runtimeModuleInfo[an].hash = localHmr.newLoad.moduleMeta[an].hash;
          runtimeModuleInfo[an].parents = new StrSet(localHmr.newLoad.moduleMeta[an].parents);
          runtimeModuleInfo[an].module = null;
          runtimeModuleInfo[an].accepting.forEach(function(accepted) {
            runtimeModuleInfo[accepted].accepters.del(an);
          });
          runtimeModuleInfo[an].accepting = new StrSet();
          runtimeModuleInfo[an].declining.forEach(function(accepted) {
            runtimeModuleInfo[accepted].decliners.del(an);
          });
          runtimeModuleInfo[an].declining = new StrSet();
          forEach(runtimeModuleInfo[an].selfAcceptCbs, function(cb) {
            selfAccepters.push({name: an, cb: cb});
          });
          runtimeModuleInfo[an].selfAcceptCbs = [];
          runtimeModuleInfo[an].disposeHandlers = [];
        }

        moduleDefs[runtimeModuleInfo[an].index] = [
          // module function
          localHmr.newLoad.moduleDefs[localHmr.newLoad.moduleMeta[an].index][0],
          // module deps
          mapValues(localHmr.newLoad.moduleDefs[localHmr.newLoad.moduleMeta[an].index][1], function(depIndex, depRef) {
            var depName = localHmr.newLoad.moduleIndexesToNames[depIndex];
            if (has(localHmr.runtimeModuleInfo, depName)) {
              return localHmr.runtimeModuleInfo[depName].index;
            } else {
              return depName;
            }
          })
        ];
        cachedModules[runtimeModuleInfo[an].index] = null;
      }

      // Update the accept handlers list and call the right ones
      var errCanWait = null;
      var updatedNames = new StrSet(acceptedUpdates);
      var oldUpdateHandlers = localHmr.updateHandlers;
      var relevantUpdateHandlers = [];
      var newUpdateHandlers = [];
      for (i=0, len=oldUpdateHandlers.length; i<len; i++) {
        if (!updatedNames.has(oldUpdateHandlers[i].accepter)) {
          newUpdateHandlers.push(oldUpdateHandlers[i]);
        }
        if (updatedNames.hasIntersection(oldUpdateHandlers[i].deps)) {
          relevantUpdateHandlers.push(oldUpdateHandlers[i]);
        }
      }
      localHmr.updateHandlers = newUpdateHandlers;
      for (i=0, len=relevantUpdateHandlers.length; i<len; i++) {
        try {
          relevantUpdateHandlers[i].cb.call(null, acceptedUpdates);
        } catch(e) {
          if (errCanWait) emitError(errCanWait);
          errCanWait = e;
        }
      }

      // Call the self-accepting modules
      forEach(selfAccepters, function(obj) {
        try {
          require(runtimeModuleInfo[obj.name].index);
        } catch(e) {
          if (obj.cb) {
            obj.cb.call(null, e);
          } else {
            if (errCanWait) emitError(errCanWait);
            errCanWait = e;
          }
        }
      });

      localHmr.setStatus('idle');
      cb(errCanWait, acceptedUpdates);
    };

    var moduleHotSetUpdateMode = function(mode, options) {
      options = options || {};

      if (supportModes.indexOf(mode) === -1) {
        throw new Error("Mode "+mode+" not in supportModes. Please check the Browserify-HMR plugin options.");
      }
      if (mode === 'ajax' && !options.url) {
        throw new Error("url required for ajax update mode");
      }
      if (localHmr.status !== 'idle') {
        throw new Error("module.hot.setUpdateMode can only be called while status is idle");
      }

      localHmr.newLoad = null;
      localHmr.updateMode = updateMode = mode;
      localHmr.updateUrl = updateUrl = options.url;
      updateCacheBust = options.cacheBust;
      ignoreUnaccepted = has(options, 'ignoreUnaccepted') ? options.ignoreUnaccepted : true;

      if (socket) {
        socket.disconnect();
        socket = null;
      }
      if (mode === 'websocket') {
        socket = setupSocket();
      }
    };

    var setupSocket = function() {
      var url = updateUrl || 'http://localhost:3123';
      var socket = socketio(url, {'force new connection': true});
      console.log('[HMR] Attempting websocket connection to', url);

      var isAcceptingMessages = false;
      socket.on('connect', function() {
        isAcceptingMessages = false;
        var syncMsg = mapValues(runtimeModuleInfo, function(value, name) {
          return {
            hash: value.hash
          };
        });
        socket.emit('sync', syncMsg);
      });
      var isUpdating = false;
      var queuedUpdateMessages = [];
      socket.on('sync confirm', function() {
        console.log('[HMR] Websocket connection successful.');
        isAcceptingMessages = true;
        queuedUpdateMessages = [];
      });
      socket.on('disconnect', function() {
        console.log('[HMR] Websocket connection lost.');
      });
      var acceptNewModules = function(msg) {
        // Make sure we don't accept new modules before we've synced ourselves.
        if (!isAcceptingMessages) return;
        if (isUpdating) {
          queuedUpdateMessages.push(msg);
          return;
        }
        // Take the message and create a localHmr.newLoad value as if the
        // bundle had been re-executed, then call moduleHotApply.
        isUpdating = true;

        // random id so we can make the normally unnamed args have random names
        var rid = String(Math.random()).replace(/[^0-9]/g, '');

        var newModuleDefs = localHmr.newLoad ? localHmr.newLoad.moduleDefs : assign({}, moduleDefs);
        var newModuleMeta = localHmr.newLoad ?
          localHmr.newLoad.moduleMeta : mapValues(runtimeModuleInfo, function(value, key) {
            return {
              index: value.index,
              hash: value.hash,
              parents: value.parents.toArray()
            };
          });
        forOwn(msg.newModuleData, function(value, key) {
          newModuleMeta[key] = {
            index: value.index,
            hash: value.hash,
            parents: value.parents
          };
        });
        forEach(msg.removedModules, function(removedName) {
          delete newModuleDefs[runtimeModuleInfo[removedName].index];
          delete newModuleMeta[removedName];
        });
        var newModuleIndexesToNames = makeModuleIndexesToNames(newModuleMeta);
        forOwn(msg.newModuleData, function(value, key) {
          // this part needs to run after newModuleMeta and
          // newModuleIndexesToNames are populated.
          var newModuleFunction = (function() {
            var fn;
            //jshint evil:true
            if (bundle__filename || bundle__dirname) {
              fn = new Function('require', 'module', 'exports', '_u1'+rid, '_u2'+rid, '__u3'+rid, '__u4'+rid, '__filename', '__dirname', value.source);
              return function(require, module, exports, _u1, _u2, _u3, _u4) {
                global._hmr[bundleKey].initModule(key, module);
                fn.call(this, require, module, exports, _u1, _u2, _u3, _u4, bundle__filename, bundle__dirname);
              };
            } else {
              fn = new Function('require', 'module', 'exports',  '_u1'+rid, '_u2'+rid, '__u3'+rid, '__u4'+rid, value.source);
              return function(require, module, exports, _u1, _u2, _u3, _u4) {
                global._hmr[bundleKey].initModule(key, module);
                fn.call(this, require, module, exports, _u1, _u2, _u3, _u4);
              };
            }
          })();

          newModuleDefs[newModuleMeta[key].index] = [
            // module function
            newModuleFunction,
            // module deps
            mapValues(value.deps, function(depIndex, depRef) {
              var depName = newModuleIndexesToNames[depIndex];
              if (has(newModuleMeta, depName)) {
                return newModuleMeta[depName].index;
              } else {
                return depName;
              }
            })
          ];
        });
        localHmr.newLoad = {
          moduleDefs: newModuleDefs,
          moduleMeta: newModuleMeta,
          moduleIndexesToNames: newModuleIndexesToNames
        };
        localHmr.setStatus('ready');
        var outdatedModules = getOutdatedModules();
        moduleHotApply({ignoreUnaccepted: ignoreUnaccepted}, function(err, updatedNames) {
          if (err) {
            console.error('[HMR] Error applying update', err);
          }
          if (updatedNames) {
            console.log('[HMR] Updated modules', updatedNames);
            if (outdatedModules.length !== updatedNames.length) {
              var notUpdatedNames = filter(outdatedModules, function(name) {
                return updatedNames.indexOf(name) === -1;
              });
              console.log('[HMR] Some modules were not updated', notUpdatedNames);
            }
          }
          isUpdating = false;
          var queuedMsg;
          while ((queuedMsg = queuedUpdateMessages.shift())) {
            acceptNewModules(queuedMsg);
          }
        });
      };
      socket.on('new modules', acceptNewModules);
      return socket;
    };

    var localHmr = {
      updateUrl: updateUrl,
      updateMode: updateMode,
      runtimeModuleInfo: runtimeModuleInfo,

      status: "idle",
      setStatus: function(status) {
        this.status = status;
        var statusHandlers = this.statusHandlers.slice();
        for (var i=0, len=statusHandlers.length; i<len; i++) {
          statusHandlers[i].call(null, status);
        }
      },
      statusHandlers: [],
      updateHandlers: [],

      // during a reload this is set to an object with moduleDefs,
      // moduleMeta, and moduleIndexesToNames properties
      newLoad: null,

      initModule: function(name, module) {
        runtimeModuleInfo[name].module = module;
        module.hot = {
          accept: function(deps, cb) {
            if (!cb && (!deps || typeof deps === 'function')) { // self
              cb = deps;
              deps = null;
              runtimeModuleInfo[name].selfAcceptCbs.push(cb);
            } else {
              if (typeof deps === 'string') {
                deps = [deps];
              }
              var depNames = new StrSet();
              for (var i=0, depsLen=deps.length; i<depsLen; i++) {
                var depIndex = moduleDefs[runtimeModuleInfo[name].index][1][deps[i]];
                if (depIndex === undefined || !has(moduleIndexesToNames, depIndex)) {
                  throw new Error("File does not use dependency: "+deps[i]);
                }
                depNames.add(moduleIndexesToNames[depIndex]);
              }
              deps = null;
              depNames.forEach(function(depName) {
                runtimeModuleInfo[depName].accepters.add(name);
                runtimeModuleInfo[name].accepting.add(depName);
              });
              if (cb) {
                localHmr.updateHandlers.push({
                  accepter: name,
                  deps: depNames,
                  cb: cb
                });
              }
            }
          },
          decline: function(deps) {
            if (!deps) { // self
              runtimeModuleInfo[name].decliners.add(name);
              runtimeModuleInfo[name].declining.add(name);
            } else {
              if (typeof deps === 'string') {
                deps = [deps];
              }
              for (var i=0, depsLen=deps.length; i<depsLen; i++) {
                var depIndex = moduleDefs[runtimeModuleInfo[name].index][1][deps[i]];
                if (depIndex === undefined || !has(moduleIndexesToNames, depIndex)) {
                  throw new Error("File does not use dependency: "+deps[i]);
                }
                var depName = moduleIndexesToNames[depIndex];
                runtimeModuleInfo[depName].decliners.add(name);
                runtimeModuleInfo[name].declining.add(depName);
              }
            }
          },
          data: runtimeModuleInfo[name].disposeData,
          dispose: function(cb) {
            return this.addDisposeHandler(cb);
          },
          addDisposeHandler: function(cb) {
            runtimeModuleInfo[name].disposeHandlers.push(cb);
          },
          removeDisposeHandler: function(cb) {
            var ix = runtimeModuleInfo[name].disposeHandlers.indexOf(cb);
            if (ix !== -1) {
              runtimeModuleInfo[name].disposeHandlers.splice(ix, 1);
            }
          },

          // Management
          check: moduleHotCheck,
          apply: moduleHotApply,
          status: function(cb) {
            if (cb) {
              return this.addStatusHandler(cb);
            }
            return localHmr.status;
          },
          addStatusHandler: function(cb) {
            localHmr.statusHandlers.push(cb);
          },
          removeStatusHandler: function(cb) {
            var ix = localHmr.statusHandlers.indexOf(cb);
            if (ix !== -1) {
              localHmr.statusHandlers.splice(ix, 1);
            }
          },
          setUpdateMode: moduleHotSetUpdateMode
        };
      }
    };
    global._hmr[bundleKey] = localHmr;

    if (updateMode === 'websocket') {
      socket = setupSocket();
    }
    return true;
  } else { // We're in a reload!
    global._hmr[bundleKey].newLoad = {
      moduleDefs: moduleDefs,
      moduleMeta: moduleMeta,
      moduleIndexesToNames: moduleIndexesToNames
    };
    return false;
  }
}

module.exports = main;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"../lib/has":4,"../lib/str-set":5,"lodash/array/zipObject":7,"lodash/collection/filter":8,"lodash/collection/forEach":9,"lodash/collection/map":10,"lodash/collection/some":11,"lodash/object/assign":66,"lodash/object/forOwn":67,"lodash/object/mapValues":70}],4:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\lib\\has.js", module);
(function(){
'use strict';

function has(object, propName) {
  return Object.prototype.hasOwnProperty.call(object, propName);
}
module.exports = has;

}).apply(this, arguments);

},{}],5:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\lib\\str-set.js", module);
(function(){
'use strict';

var has = require('./has');

function StrSet(other) {
  this._map = {};
  this._size = 0;
  if (other) {
    for (var i=0,len=other.length; i<len; i++) {
      this.add(other[i]);
    }
  }
}
StrSet.prototype.add = function(value) {
  if (!this.has(value)) {
    this._map[value] = true;
    this._size++;
  }
};
StrSet.prototype.has = function(value) {
  return has(this._map, value);
};
StrSet.prototype.del = function(value) {
  if (this.has(value)) {
    delete this._map[value];
    this._size--;
  }
};
StrSet.prototype.size = function() {
  return this._size;
};
StrSet.prototype.forEach = function(cb) {
  for (var value in this._map) {
    if (has(this._map, value)) {
      cb(value);
    }
  }
};
StrSet.prototype.some = function(cb) {
  for (var value in this._map) {
    if (has(this._map, value)) {
      if (cb(value)) {
        return true;
      }
    }
  }
  return false;
};
StrSet.prototype.every = function(cb) {
  return !this.some(function(x) {
    return !cb(x);
  });
};
StrSet.prototype.hasIntersection = function(otherStrSet) {
  var value;
  if (this._size < otherStrSet._size) {
    return this.some(function(value) {
      return otherStrSet.has(value);
    });
  } else {
    var self = this;
    return otherStrSet.some(function(value) {
      return self.has(value);
    });
  }
};
StrSet.prototype.toArray = function() {
  var arr = [];
  this.forEach(function(value) {
    arr.push(value);
  });
  return arr;
};

module.exports = StrSet;

}).apply(this, arguments);

},{"./has":4}],6:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\array\\last.js", module);
(function(){
/**
 * Gets the last element of `array`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to query.
 * @returns {*} Returns the last element of `array`.
 * @example
 *
 * _.last([1, 2, 3]);
 * // => 3
 */
function last(array) {
  var length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

module.exports = last;

}).apply(this, arguments);

},{}],7:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\array\\zipObject.js", module);
(function(){
var isArray = require('../lang/isArray');

/**
 * The inverse of `_.pairs`; this method returns an object composed from arrays
 * of property names and values. Provide either a single two dimensional array,
 * e.g. `[[key1, value1], [key2, value2]]` or two arrays, one of property names
 * and one of corresponding values.
 *
 * @static
 * @memberOf _
 * @alias object
 * @category Array
 * @param {Array} props The property names.
 * @param {Array} [values=[]] The property values.
 * @returns {Object} Returns the new object.
 * @example
 *
 * _.zipObject([['fred', 30], ['barney', 40]]);
 * // => { 'fred': 30, 'barney': 40 }
 *
 * _.zipObject(['fred', 'barney'], [30, 40]);
 * // => { 'fred': 30, 'barney': 40 }
 */
function zipObject(props, values) {
  var index = -1,
      length = props ? props.length : 0,
      result = {};

  if (length && !values && !isArray(props[0])) {
    values = [];
  }
  while (++index < length) {
    var key = props[index];
    if (values) {
      result[key] = values[index];
    } else if (key) {
      result[key[0]] = key[1];
    }
  }
  return result;
}

module.exports = zipObject;

}).apply(this, arguments);

},{"../lang/isArray":61}],8:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js", module);
(function(){
var arrayFilter = require('../internal/arrayFilter'),
    baseCallback = require('../internal/baseCallback'),
    baseFilter = require('../internal/baseFilter'),
    isArray = require('../lang/isArray');

/**
 * Iterates over elements of `collection`, returning an array of all elements
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias select
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {Array} Returns the new filtered array.
 * @example
 *
 * _.filter([4, 5, 6], function(n) {
 *   return n % 2 == 0;
 * });
 * // => [4, 6]
 *
 * var users = [
 *   { 'user': 'barney', 'age': 36, 'active': true },
 *   { 'user': 'fred',   'age': 40, 'active': false }
 * ];
 *
 * // using the `_.matches` callback shorthand
 * _.pluck(_.filter(users, { 'age': 36, 'active': true }), 'user');
 * // => ['barney']
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.pluck(_.filter(users, 'active', false), 'user');
 * // => ['fred']
 *
 * // using the `_.property` callback shorthand
 * _.pluck(_.filter(users, 'active'), 'user');
 * // => ['barney']
 */
function filter(collection, predicate, thisArg) {
  var func = isArray(collection) ? arrayFilter : baseFilter;
  predicate = baseCallback(predicate, thisArg, 3);
  return func(collection, predicate);
}

module.exports = filter;

}).apply(this, arguments);

},{"../internal/arrayFilter":14,"../internal/baseCallback":19,"../internal/baseFilter":22,"../lang/isArray":61}],9:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\forEach.js", module);
(function(){
var arrayEach = require('../internal/arrayEach'),
    baseEach = require('../internal/baseEach'),
    createForEach = require('../internal/createForEach');

/**
 * Iterates over elements of `collection` invoking `iteratee` for each element.
 * The `iteratee` is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection). Iteratee functions may exit iteration early
 * by explicitly returning `false`.
 *
 * **Note:** As with other "Collections" methods, objects with a "length" property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2]).forEach(function(n) {
 *   console.log(n);
 * }).value();
 * // => logs each value from left to right and returns the array
 *
 * _.forEach({ 'a': 1, 'b': 2 }, function(n, key) {
 *   console.log(n, key);
 * });
 * // => logs each value-key pair and returns the object (iteration order is not guaranteed)
 */
var forEach = createForEach(arrayEach, baseEach);

module.exports = forEach;

}).apply(this, arguments);

},{"../internal/arrayEach":13,"../internal/baseEach":21,"../internal/createForEach":41}],10:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js", module);
(function(){
var arrayMap = require('../internal/arrayMap'),
    baseCallback = require('../internal/baseCallback'),
    baseMap = require('../internal/baseMap'),
    isArray = require('../lang/isArray');

/**
 * Creates an array of values by running each element in `collection` through
 * `iteratee`. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.every`, `_.filter`, `_.map`, `_.mapValues`, `_.reject`, and `_.some`.
 *
 * The guarded methods are:
 * `ary`, `callback`, `chunk`, `clone`, `create`, `curry`, `curryRight`,
 * `drop`, `dropRight`, `every`, `fill`, `flatten`, `invert`, `max`, `min`,
 * `parseInt`, `slice`, `sortBy`, `take`, `takeRight`, `template`, `trim`,
 * `trimLeft`, `trimRight`, `trunc`, `random`, `range`, `sample`, `some`,
 * `sum`, `uniq`, and `words`
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new mapped array.
 * @example
 *
 * function timesThree(n) {
 *   return n * 3;
 * }
 *
 * _.map([1, 2], timesThree);
 * // => [3, 6]
 *
 * _.map({ 'a': 1, 'b': 2 }, timesThree);
 * // => [3, 6] (iteration order is not guaranteed)
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * // using the `_.property` callback shorthand
 * _.map(users, 'user');
 * // => ['barney', 'fred']
 */
function map(collection, iteratee, thisArg) {
  var func = isArray(collection) ? arrayMap : baseMap;
  iteratee = baseCallback(iteratee, thisArg, 3);
  return func(collection, iteratee);
}

module.exports = map;

}).apply(this, arguments);

},{"../internal/arrayMap":15,"../internal/baseCallback":19,"../internal/baseMap":29,"../lang/isArray":61}],11:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js", module);
(function(){
var arraySome = require('../internal/arraySome'),
    baseCallback = require('../internal/baseCallback'),
    baseSome = require('../internal/baseSome'),
    isArray = require('../lang/isArray'),
    isIterateeCall = require('../internal/isIterateeCall');

/**
 * Checks if `predicate` returns truthy for **any** element of `collection`.
 * The function returns as soon as it finds a passing value and does not iterate
 * over the entire collection. The predicate is bound to `thisArg` and invoked
 * with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias any
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 * @example
 *
 * _.some([null, 0, 'yes', false], Boolean);
 * // => true
 *
 * var users = [
 *   { 'user': 'barney', 'active': true },
 *   { 'user': 'fred',   'active': false }
 * ];
 *
 * // using the `_.matches` callback shorthand
 * _.some(users, { 'user': 'barney', 'active': false });
 * // => false
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.some(users, 'active', false);
 * // => true
 *
 * // using the `_.property` callback shorthand
 * _.some(users, 'active');
 * // => true
 */
function some(collection, predicate, thisArg) {
  var func = isArray(collection) ? arraySome : baseSome;
  if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
    predicate = undefined;
  }
  if (typeof predicate != 'function' || thisArg !== undefined) {
    predicate = baseCallback(predicate, thisArg, 3);
  }
  return func(collection, predicate);
}

module.exports = some;

}).apply(this, arguments);

},{"../internal/arraySome":16,"../internal/baseCallback":19,"../internal/baseSome":35,"../internal/isIterateeCall":52,"../lang/isArray":61}],12:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\function\\restParam.js", module);
(function(){
/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that invokes `func` with the `this` binding of the
 * created function and arguments from `start` and beyond provided as an array.
 *
 * **Note:** This method is based on the [rest parameter](https://developer.mozilla.org/Web/JavaScript/Reference/Functions/rest_parameters).
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var say = _.restParam(function(what, names) {
 *   return what + ' ' + _.initial(names).join(', ') +
 *     (_.size(names) > 1 ? ', & ' : '') + _.last(names);
 * });
 *
 * say('hello', 'fred', 'barney', 'pebbles');
 * // => 'hello fred, barney, & pebbles'
 */
function restParam(func, start) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        rest = Array(length);

    while (++index < length) {
      rest[index] = args[start + index];
    }
    switch (start) {
      case 0: return func.call(this, rest);
      case 1: return func.call(this, args[0], rest);
      case 2: return func.call(this, args[0], args[1], rest);
    }
    var otherArgs = Array(start + 1);
    index = -1;
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = rest;
    return func.apply(this, otherArgs);
  };
}

module.exports = restParam;

}).apply(this, arguments);

},{}],13:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayEach.js", module);
(function(){
/**
 * A specialized version of `_.forEach` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

}).apply(this, arguments);

},{}],14:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayFilter.js", module);
(function(){
/**
 * A specialized version of `_.filter` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[++resIndex] = value;
    }
  }
  return result;
}

module.exports = arrayFilter;

}).apply(this, arguments);

},{}],15:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayMap.js", module);
(function(){
/**
 * A specialized version of `_.map` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

}).apply(this, arguments);

},{}],16:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arraySome.js", module);
(function(){
/**
 * A specialized version of `_.some` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

module.exports = arraySome;

}).apply(this, arguments);

},{}],17:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\assignWith.js", module);
(function(){
var keys = require('../object/keys');

/**
 * A specialized version of `_.assign` for customizing assigned values without
 * support for argument juggling, multiple sources, and `this` binding `customizer`
 * functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @param {Function} customizer The function to customize assigned values.
 * @returns {Object} Returns `object`.
 */
function assignWith(object, source, customizer) {
  var index = -1,
      props = keys(source),
      length = props.length;

  while (++index < length) {
    var key = props[index],
        value = object[key],
        result = customizer(value, source[key], key, object, source);

    if ((result === result ? (result !== value) : (value === value)) ||
        (value === undefined && !(key in object))) {
      object[key] = result;
    }
  }
  return object;
}

module.exports = assignWith;

}).apply(this, arguments);

},{"../object/keys":68}],18:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseAssign.js", module);
(function(){
var baseCopy = require('./baseCopy'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.assign` without support for argument juggling,
 * multiple sources, and `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return source == null
    ? object
    : baseCopy(source, keys(source), object);
}

module.exports = baseAssign;

}).apply(this, arguments);

},{"../object/keys":68,"./baseCopy":20}],19:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js", module);
(function(){
var baseMatches = require('./baseMatches'),
    baseMatchesProperty = require('./baseMatchesProperty'),
    bindCallback = require('./bindCallback'),
    identity = require('../utility/identity'),
    property = require('../utility/property');

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return thisArg === undefined
      ? func
      : bindCallback(func, thisArg, argCount);
  }
  if (func == null) {
    return identity;
  }
  if (type == 'object') {
    return baseMatches(func);
  }
  return thisArg === undefined
    ? property(func)
    : baseMatchesProperty(func, thisArg);
}

module.exports = baseCallback;

}).apply(this, arguments);

},{"../utility/identity":72,"../utility/property":73,"./baseMatches":30,"./baseMatchesProperty":31,"./bindCallback":37}],20:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCopy.js", module);
(function(){
/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property names to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @returns {Object} Returns `object`.
 */
function baseCopy(source, props, object) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];
    object[key] = source[key];
  }
  return object;
}

module.exports = baseCopy;

}).apply(this, arguments);

},{}],21:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseEach.js", module);
(function(){
var baseForOwn = require('./baseForOwn'),
    createBaseEach = require('./createBaseEach');

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
var baseEach = createBaseEach(baseForOwn);

module.exports = baseEach;

}).apply(this, arguments);

},{"./baseForOwn":24,"./createBaseEach":39}],22:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFilter.js", module);
(function(){
var baseEach = require('./baseEach');

/**
 * The base implementation of `_.filter` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function baseFilter(collection, predicate) {
  var result = [];
  baseEach(collection, function(value, index, collection) {
    if (predicate(value, index, collection)) {
      result.push(value);
    }
  });
  return result;
}

module.exports = baseFilter;

}).apply(this, arguments);

},{"./baseEach":21}],23:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFor.js", module);
(function(){
var createBaseFor = require('./createBaseFor');

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

module.exports = baseFor;

}).apply(this, arguments);

},{"./createBaseFor":40}],24:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseForOwn.js", module);
(function(){
var baseFor = require('./baseFor'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

module.exports = baseForOwn;

}).apply(this, arguments);

},{"../object/keys":68,"./baseFor":23}],25:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseGet.js", module);
(function(){
var toObject = require('./toObject');

/**
 * The base implementation of `get` without support for string paths
 * and default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} path The path of the property to get.
 * @param {string} [pathKey] The key representation of path.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path, pathKey) {
  if (object == null) {
    return;
  }
  if (pathKey !== undefined && pathKey in toObject(object)) {
    path = [pathKey];
  }
  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[path[index++]];
  }
  return (index && index == length) ? object : undefined;
}

module.exports = baseGet;

}).apply(this, arguments);

},{"./toObject":58}],26:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqual.js", module);
(function(){
var baseIsEqualDeep = require('./baseIsEqualDeep'),
    isObject = require('../lang/isObject'),
    isObjectLike = require('./isObjectLike');

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
}

module.exports = baseIsEqual;

}).apply(this, arguments);

},{"../lang/isObject":64,"./baseIsEqualDeep":27,"./isObjectLike":55}],27:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js", module);
(function(){
var equalArrays = require('./equalArrays'),
    equalByTag = require('./equalByTag'),
    equalObjects = require('./equalObjects'),
    isArray = require('../lang/isArray'),
    isTypedArray = require('../lang/isTypedArray');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  if (!isLoose) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
    }
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

module.exports = baseIsEqualDeep;

}).apply(this, arguments);

},{"../lang/isArray":61,"../lang/isTypedArray":65,"./equalArrays":44,"./equalByTag":45,"./equalObjects":46}],28:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsMatch.js", module);
(function(){
var baseIsEqual = require('./baseIsEqual'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Array} matchData The propery names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = toObject(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = baseIsMatch;

}).apply(this, arguments);

},{"./baseIsEqual":26,"./toObject":58}],29:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMap.js", module);
(function(){
var baseEach = require('./baseEach'),
    isArrayLike = require('./isArrayLike');

/**
 * The base implementation of `_.map` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function baseMap(collection, iteratee) {
  var index = -1,
      result = isArrayLike(collection) ? Array(collection.length) : [];

  baseEach(collection, function(value, key, collection) {
    result[++index] = iteratee(value, key, collection);
  });
  return result;
}

module.exports = baseMap;

}).apply(this, arguments);

},{"./baseEach":21,"./isArrayLike":50}],30:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatches.js", module);
(function(){
var baseIsMatch = require('./baseIsMatch'),
    getMatchData = require('./getMatchData'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.matches` which does not clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    var key = matchData[0][0],
        value = matchData[0][1];

    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === value && (value !== undefined || (key in toObject(object)));
    };
  }
  return function(object) {
    return baseIsMatch(object, matchData);
  };
}

module.exports = baseMatches;

}).apply(this, arguments);

},{"./baseIsMatch":28,"./getMatchData":48,"./toObject":58}],31:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js", module);
(function(){
var baseGet = require('./baseGet'),
    baseIsEqual = require('./baseIsEqual'),
    baseSlice = require('./baseSlice'),
    isArray = require('../lang/isArray'),
    isKey = require('./isKey'),
    isStrictComparable = require('./isStrictComparable'),
    last = require('../array/last'),
    toObject = require('./toObject'),
    toPath = require('./toPath');

/**
 * The base implementation of `_.matchesProperty` which does not clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to compare.
 * @returns {Function} Returns the new function.
 */
function baseMatchesProperty(path, srcValue) {
  var isArr = isArray(path),
      isCommon = isKey(path) && isStrictComparable(srcValue),
      pathKey = (path + '');

  path = toPath(path);
  return function(object) {
    if (object == null) {
      return false;
    }
    var key = pathKey;
    object = toObject(object);
    if ((isArr || !isCommon) && !(key in object)) {
      object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
      if (object == null) {
        return false;
      }
      key = last(path);
      object = toObject(object);
    }
    return object[key] === srcValue
      ? (srcValue !== undefined || (key in object))
      : baseIsEqual(srcValue, object[key], undefined, true);
  };
}

module.exports = baseMatchesProperty;

}).apply(this, arguments);

},{"../array/last":6,"../lang/isArray":61,"./baseGet":25,"./baseIsEqual":26,"./baseSlice":34,"./isKey":53,"./isStrictComparable":56,"./toObject":58,"./toPath":59}],32:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseProperty.js", module);
(function(){
/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

module.exports = baseProperty;

}).apply(this, arguments);

},{}],33:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\basePropertyDeep.js", module);
(function(){
var baseGet = require('./baseGet'),
    toPath = require('./toPath');

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 */
function basePropertyDeep(path) {
  var pathKey = (path + '');
  path = toPath(path);
  return function(object) {
    return baseGet(object, path, pathKey);
  };
}

module.exports = basePropertyDeep;

}).apply(this, arguments);

},{"./baseGet":25,"./toPath":59}],34:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseSlice.js", module);
(function(){
/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  start = start == null ? 0 : (+start || 0);
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = (end === undefined || end > length) ? length : (+end || 0);
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

module.exports = baseSlice;

}).apply(this, arguments);

},{}],35:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseSome.js", module);
(function(){
var baseEach = require('./baseEach');

/**
 * The base implementation of `_.some` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function baseSome(collection, predicate) {
  var result;

  baseEach(collection, function(value, index, collection) {
    result = predicate(value, index, collection);
    return !result;
  });
  return !!result;
}

module.exports = baseSome;

}).apply(this, arguments);

},{"./baseEach":21}],36:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseToString.js", module);
(function(){
/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

}).apply(this, arguments);

},{}],37:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\bindCallback.js", module);
(function(){
var identity = require('../utility/identity');

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

module.exports = bindCallback;

}).apply(this, arguments);

},{"../utility/identity":72}],38:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createAssigner.js", module);
(function(){
var bindCallback = require('./bindCallback'),
    isIterateeCall = require('./isIterateeCall'),
    restParam = require('../function/restParam');

/**
 * Creates a `_.assign`, `_.defaults`, or `_.merge` function.
 *
 * @private
 * @param {Function} assigner The function to assign values.
 * @returns {Function} Returns the new assigner function.
 */
function createAssigner(assigner) {
  return restParam(function(object, sources) {
    var index = -1,
        length = object == null ? 0 : sources.length,
        customizer = length > 2 ? sources[length - 2] : undefined,
        guard = length > 2 ? sources[2] : undefined,
        thisArg = length > 1 ? sources[length - 1] : undefined;

    if (typeof customizer == 'function') {
      customizer = bindCallback(customizer, thisArg, 5);
      length -= 2;
    } else {
      customizer = typeof thisArg == 'function' ? thisArg : undefined;
      length -= (customizer ? 1 : 0);
    }
    if (guard && isIterateeCall(sources[0], sources[1], guard)) {
      customizer = length < 3 ? undefined : customizer;
      length = 1;
    }
    while (++index < length) {
      var source = sources[index];
      if (source) {
        assigner(object, source, customizer);
      }
    }
    return object;
  });
}

module.exports = createAssigner;

}).apply(this, arguments);

},{"../function/restParam":12,"./bindCallback":37,"./isIterateeCall":52}],39:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseEach.js", module);
(function(){
var getLength = require('./getLength'),
    isLength = require('./isLength'),
    toObject = require('./toObject');

/**
 * Creates a `baseEach` or `baseEachRight` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    var length = collection ? getLength(collection) : 0;
    if (!isLength(length)) {
      return eachFunc(collection, iteratee);
    }
    var index = fromRight ? length : -1,
        iterable = toObject(collection);

    while ((fromRight ? index-- : ++index < length)) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}

module.exports = createBaseEach;

}).apply(this, arguments);

},{"./getLength":47,"./isLength":54,"./toObject":58}],40:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseFor.js", module);
(function(){
var toObject = require('./toObject');

/**
 * Creates a base function for `_.forIn` or `_.forInRight`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var iterable = toObject(object),
        props = keysFunc(object),
        length = props.length,
        index = fromRight ? length : -1;

    while ((fromRight ? index-- : ++index < length)) {
      var key = props[index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

module.exports = createBaseFor;

}).apply(this, arguments);

},{"./toObject":58}],41:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForEach.js", module);
(function(){
var bindCallback = require('./bindCallback'),
    isArray = require('../lang/isArray');

/**
 * Creates a function for `_.forEach` or `_.forEachRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createForEach(arrayFunc, eachFunc) {
  return function(collection, iteratee, thisArg) {
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee)
      : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
  };
}

module.exports = createForEach;

}).apply(this, arguments);

},{"../lang/isArray":61,"./bindCallback":37}],42:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForOwn.js", module);
(function(){
var bindCallback = require('./bindCallback');

/**
 * Creates a function for `_.forOwn` or `_.forOwnRight`.
 *
 * @private
 * @param {Function} objectFunc The function to iterate over an object.
 * @returns {Function} Returns the new each function.
 */
function createForOwn(objectFunc) {
  return function(object, iteratee, thisArg) {
    if (typeof iteratee != 'function' || thisArg !== undefined) {
      iteratee = bindCallback(iteratee, thisArg, 3);
    }
    return objectFunc(object, iteratee);
  };
}

module.exports = createForOwn;

}).apply(this, arguments);

},{"./bindCallback":37}],43:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createObjectMapper.js", module);
(function(){
var baseCallback = require('./baseCallback'),
    baseForOwn = require('./baseForOwn');

/**
 * Creates a function for `_.mapKeys` or `_.mapValues`.
 *
 * @private
 * @param {boolean} [isMapKeys] Specify mapping keys instead of values.
 * @returns {Function} Returns the new map function.
 */
function createObjectMapper(isMapKeys) {
  return function(object, iteratee, thisArg) {
    var result = {};
    iteratee = baseCallback(iteratee, thisArg, 3);

    baseForOwn(object, function(value, key, object) {
      var mapped = iteratee(value, key, object);
      key = isMapKeys ? mapped : key;
      value = isMapKeys ? value : mapped;
      result[key] = value;
    });
    return result;
  };
}

module.exports = createObjectMapper;

}).apply(this, arguments);

},{"./baseCallback":19,"./baseForOwn":24}],44:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalArrays.js", module);
(function(){
var arraySome = require('./arraySome');

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
    return false;
  }
  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index],
        result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;

    if (result !== undefined) {
      if (result) {
        continue;
      }
      return false;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (isLoose) {
      if (!arraySome(other, function(othValue) {
            return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
          })) {
        return false;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
      return false;
    }
  }
  return true;
}

module.exports = equalArrays;

}).apply(this, arguments);

},{"./arraySome":16}],45:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalByTag.js", module);
(function(){
/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        : object == +other;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == (other + '');
  }
  return false;
}

module.exports = equalByTag;

}).apply(this, arguments);

},{}],46:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalObjects.js", module);
(function(){
var keys = require('../object/keys');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isLoose) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  var skipCtor = isLoose;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key],
        result = customizer ? customizer(isLoose ? othValue : objValue, isLoose? objValue : othValue, key) : undefined;

    // Recursively compare objects (susceptible to call stack limits).
    if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
      return false;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (!skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;

}).apply(this, arguments);

},{"../object/keys":68}],47:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getLength.js", module);
(function(){
var baseProperty = require('./baseProperty');

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

module.exports = getLength;

}).apply(this, arguments);

},{"./baseProperty":32}],48:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getMatchData.js", module);
(function(){
var isStrictComparable = require('./isStrictComparable'),
    pairs = require('../object/pairs');

/**
 * Gets the propery names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData(object) {
  var result = pairs(object),
      length = result.length;

  while (length--) {
    result[length][2] = isStrictComparable(result[length][1]);
  }
  return result;
}

module.exports = getMatchData;

}).apply(this, arguments);

},{"../object/pairs":71,"./isStrictComparable":56}],49:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getNative.js", module);
(function(){
var isNative = require('../lang/isNative');

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

module.exports = getNative;

}).apply(this, arguments);

},{"../lang/isNative":63}],50:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isArrayLike.js", module);
(function(){
var getLength = require('./getLength'),
    isLength = require('./isLength');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

module.exports = isArrayLike;

}).apply(this, arguments);

},{"./getLength":47,"./isLength":54}],51:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIndex.js", module);
(function(){
/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

module.exports = isIndex;

}).apply(this, arguments);

},{}],52:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIterateeCall.js", module);
(function(){
var isArrayLike = require('./isArrayLike'),
    isIndex = require('./isIndex'),
    isObject = require('../lang/isObject');

/**
 * Checks if the provided arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call, else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type == 'string' && index in object)) {
    var other = object[index];
    return value === value ? (value === other) : (other !== other);
  }
  return false;
}

module.exports = isIterateeCall;

}).apply(this, arguments);

},{"../lang/isObject":64,"./isArrayLike":50,"./isIndex":51}],53:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isKey.js", module);
(function(){
var isArray = require('../lang/isArray'),
    toObject = require('./toObject');

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  var type = typeof value;
  if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
    return true;
  }
  if (isArray(value)) {
    return false;
  }
  var result = !reIsDeepProp.test(value);
  return result || (object != null && value in toObject(object));
}

module.exports = isKey;

}).apply(this, arguments);

},{"../lang/isArray":61,"./toObject":58}],54:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isLength.js", module);
(function(){
/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

}).apply(this, arguments);

},{}],55:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isObjectLike.js", module);
(function(){
/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isObjectLike;

}).apply(this, arguments);

},{}],56:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isStrictComparable.js", module);
(function(){
var isObject = require('../lang/isObject');

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && !isObject(value);
}

module.exports = isStrictComparable;

}).apply(this, arguments);

},{"../lang/isObject":64}],57:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js", module);
(function(){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('./isIndex'),
    isLength = require('./isLength'),
    keysIn = require('../object/keysIn');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = shimKeys;

}).apply(this, arguments);

},{"../lang/isArguments":60,"../lang/isArray":61,"../object/keysIn":69,"./isIndex":51,"./isLength":54}],58:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toObject.js", module);
(function(){
var isObject = require('../lang/isObject');

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

module.exports = toObject;

}).apply(this, arguments);

},{"../lang/isObject":64}],59:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toPath.js", module);
(function(){
var baseToString = require('./baseToString'),
    isArray = require('../lang/isArray');

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `value` to property path array if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Array} Returns the property path array.
 */
function toPath(value) {
  if (isArray(value)) {
    return value;
  }
  var result = [];
  baseToString(value).replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

module.exports = toPath;

}).apply(this, arguments);

},{"../lang/isArray":61,"./baseToString":36}],60:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArguments.js", module);
(function(){
var isArrayLike = require('../internal/isArrayLike'),
    isObjectLike = require('../internal/isObjectLike');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return isObjectLike(value) && isArrayLike(value) &&
    hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
}

module.exports = isArguments;

}).apply(this, arguments);

},{"../internal/isArrayLike":50,"../internal/isObjectLike":55}],61:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArray.js", module);
(function(){
var getNative = require('../internal/getNative'),
    isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var arrayTag = '[object Array]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

module.exports = isArray;

}).apply(this, arguments);

},{"../internal/getNative":49,"../internal/isLength":54,"../internal/isObjectLike":55}],62:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isFunction.js", module);
(function(){
var isObject = require('./isObject');

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 which returns 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

module.exports = isFunction;

}).apply(this, arguments);

},{"./isObject":64}],63:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isNative.js", module);
(function(){
var isFunction = require('./isFunction'),
    isObjectLike = require('../internal/isObjectLike');

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isNative;

}).apply(this, arguments);

},{"../internal/isObjectLike":55,"./isFunction":62}],64:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isObject.js", module);
(function(){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

}).apply(this, arguments);

},{}],65:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isTypedArray.js", module);
(function(){
var isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dateTag] = typedArrayTags[errorTag] =
typedArrayTags[funcTag] = typedArrayTags[mapTag] =
typedArrayTags[numberTag] = typedArrayTags[objectTag] =
typedArrayTags[regexpTag] = typedArrayTags[setTag] =
typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
}

module.exports = isTypedArray;

}).apply(this, arguments);

},{"../internal/isLength":54,"../internal/isObjectLike":55}],66:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\assign.js", module);
(function(){
var assignWith = require('../internal/assignWith'),
    baseAssign = require('../internal/baseAssign'),
    createAssigner = require('../internal/createAssigner');

/**
 * Assigns own enumerable properties of source object(s) to the destination
 * object. Subsequent sources overwrite property assignments of previous sources.
 * If `customizer` is provided it's invoked to produce the assigned values.
 * The `customizer` is bound to `thisArg` and invoked with five arguments:
 * (objectValue, sourceValue, key, object, source).
 *
 * **Note:** This method mutates `object` and is based on
 * [`Object.assign`](http://ecma-international.org/ecma-262/6.0/#sec-object.assign).
 *
 * @static
 * @memberOf _
 * @alias extend
 * @category Object
 * @param {Object} object The destination object.
 * @param {...Object} [sources] The source objects.
 * @param {Function} [customizer] The function to customize assigned values.
 * @param {*} [thisArg] The `this` binding of `customizer`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * _.assign({ 'user': 'barney' }, { 'age': 40 }, { 'user': 'fred' });
 * // => { 'user': 'fred', 'age': 40 }
 *
 * // using a customizer callback
 * var defaults = _.partialRight(_.assign, function(value, other) {
 *   return _.isUndefined(value) ? other : value;
 * });
 *
 * defaults({ 'user': 'barney' }, { 'age': 36 }, { 'user': 'fred' });
 * // => { 'user': 'barney', 'age': 36 }
 */
var assign = createAssigner(function(object, source, customizer) {
  return customizer
    ? assignWith(object, source, customizer)
    : baseAssign(object, source);
});

module.exports = assign;

}).apply(this, arguments);

},{"../internal/assignWith":17,"../internal/baseAssign":18,"../internal/createAssigner":38}],67:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\forOwn.js", module);
(function(){
var baseForOwn = require('../internal/baseForOwn'),
    createForOwn = require('../internal/createForOwn');

/**
 * Iterates over own enumerable properties of an object invoking `iteratee`
 * for each property. The `iteratee` is bound to `thisArg` and invoked with
 * three arguments: (value, key, object). Iteratee functions may exit iteration
 * early by explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.forOwn(new Foo, function(value, key) {
 *   console.log(key);
 * });
 * // => logs 'a' and 'b' (iteration order is not guaranteed)
 */
var forOwn = createForOwn(baseForOwn);

module.exports = forOwn;

}).apply(this, arguments);

},{"../internal/baseForOwn":24,"../internal/createForOwn":42}],68:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js", module);
(function(){
var getNative = require('../internal/getNative'),
    isArrayLike = require('../internal/isArrayLike'),
    isObject = require('../lang/isObject'),
    shimKeys = require('../internal/shimKeys');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object != 'function' && isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

module.exports = keys;

}).apply(this, arguments);

},{"../internal/getNative":49,"../internal/isArrayLike":50,"../internal/shimKeys":57,"../lang/isObject":64}],69:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js", module);
(function(){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('../internal/isIndex'),
    isLength = require('../internal/isLength'),
    isObject = require('../lang/isObject');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype === object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keysIn;

}).apply(this, arguments);

},{"../internal/isIndex":51,"../internal/isLength":54,"../lang/isArguments":60,"../lang/isArray":61,"../lang/isObject":64}],70:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\mapValues.js", module);
(function(){
var createObjectMapper = require('../internal/createObjectMapper');

/**
 * Creates an object with the same keys as `object` and values generated by
 * running each own enumerable property of `object` through `iteratee`. The
 * iteratee function is bound to `thisArg` and invoked with three arguments:
 * (value, key, object).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Object} Returns the new mapped object.
 * @example
 *
 * _.mapValues({ 'a': 1, 'b': 2 }, function(n) {
 *   return n * 3;
 * });
 * // => { 'a': 3, 'b': 6 }
 *
 * var users = {
 *   'fred':    { 'user': 'fred',    'age': 40 },
 *   'pebbles': { 'user': 'pebbles', 'age': 1 }
 * };
 *
 * // using the `_.property` callback shorthand
 * _.mapValues(users, 'age');
 * // => { 'fred': 40, 'pebbles': 1 } (iteration order is not guaranteed)
 */
var mapValues = createObjectMapper();

module.exports = mapValues;

}).apply(this, arguments);

},{"../internal/createObjectMapper":43}],71:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\object\\pairs.js", module);
(function(){
var keys = require('./keys'),
    toObject = require('../internal/toObject');

/**
 * Creates a two dimensional array of the key-value pairs for `object`,
 * e.g. `[[key1, value1], [key2, value2]]`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the new array of key-value pairs.
 * @example
 *
 * _.pairs({ 'barney': 36, 'fred': 40 });
 * // => [['barney', 36], ['fred', 40]] (iteration order is not guaranteed)
 */
function pairs(object) {
  object = toObject(object);

  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    var key = props[index];
    result[index] = [key, object[key]];
  }
  return result;
}

module.exports = pairs;

}).apply(this, arguments);

},{"../internal/toObject":58,"./keys":68}],72:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\identity.js", module);
(function(){
/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

}).apply(this, arguments);

},{}],73:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\property.js", module);
(function(){
var baseProperty = require('../internal/baseProperty'),
    basePropertyDeep = require('../internal/basePropertyDeep'),
    isKey = require('../internal/isKey');

/**
 * Creates a function that returns the property value at `path` on a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': { 'c': 2 } } },
 *   { 'a': { 'b': { 'c': 1 } } }
 * ];
 *
 * _.map(objects, _.property('a.b.c'));
 * // => [2, 1]
 *
 * _.pluck(_.sortBy(objects, _.property(['a', 'b', 'c'])), 'a.b.c');
 * // => [1, 2]
 */
function property(path) {
  return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
}

module.exports = property;

}).apply(this, arguments);

},{"../internal/baseProperty":32,"../internal/basePropertyDeep":33,"../internal/isKey":53}],74:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\index.js", module);
(function(){

module.exports = require('./lib/');

}).apply(this, arguments);

},{"./lib/":75}],75:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js", module);
(function(){

/**
 * Module dependencies.
 */

var url = require('./url');
var parser = require('socket.io-parser');
var Manager = require('./manager');
var debug = require('debug')('socket.io-client');

/**
 * Module exports.
 */

module.exports = exports = lookup;

/**
 * Managers cache.
 */

var cache = exports.managers = {};

/**
 * Looks up an existing `Manager` for multiplexing.
 * If the user summons:
 *
 *   `io('http://localhost/a');`
 *   `io('http://localhost/b');`
 *
 * We reuse the existing instance based on same scheme/port/host,
 * and we initialize sockets for each namespace.
 *
 * @api public
 */

function lookup(uri, opts) {
  if (typeof uri == 'object') {
    opts = uri;
    uri = undefined;
  }

  opts = opts || {};

  var parsed = url(uri);
  var source = parsed.source;
  var id = parsed.id;
  var io;

  if (opts.forceNew || opts['force new connection'] || false === opts.multiplex) {
    debug('ignoring socket cache for %s', source);
    io = Manager(source, opts);
  } else {
    if (!cache[id]) {
      debug('new io instance for %s', source);
      cache[id] = Manager(source, opts);
    }
    io = cache[id];
  }

  return io.socket(parsed.path);
}

/**
 * Protocol version.
 *
 * @api public
 */

exports.protocol = parser.protocol;

/**
 * `connect`.
 *
 * @param {String} uri
 * @api public
 */

exports.connect = lookup;

/**
 * Expose constructors for standalone build.
 *
 * @api public
 */

exports.Manager = require('./manager');
exports.Socket = require('./socket');

}).apply(this, arguments);

},{"./manager":76,"./socket":78,"./url":79,"debug":83,"socket.io-parser":117}],76:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js", module);
(function(){

/**
 * Module dependencies.
 */

var url = require('./url');
var eio = require('engine.io-client');
var Socket = require('./socket');
var Emitter = require('component-emitter');
var parser = require('socket.io-parser');
var on = require('./on');
var bind = require('component-bind');
var object = require('object-component');
var debug = require('debug')('socket.io-client:manager');
var indexOf = require('indexof');
var Backoff = require('backo2');

/**
 * Module exports
 */

module.exports = Manager;

/**
 * `Manager` constructor.
 *
 * @param {String} engine instance or engine uri/opts
 * @param {Object} options
 * @api public
 */

function Manager(uri, opts){
  if (!(this instanceof Manager)) return new Manager(uri, opts);
  if (uri && ('object' == typeof uri)) {
    opts = uri;
    uri = undefined;
  }
  opts = opts || {};

  opts.path = opts.path || '/socket.io';
  this.nsps = {};
  this.subs = [];
  this.opts = opts;
  this.reconnection(opts.reconnection !== false);
  this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
  this.reconnectionDelay(opts.reconnectionDelay || 1000);
  this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
  this.randomizationFactor(opts.randomizationFactor || 0.5);
  this.backoff = new Backoff({
    min: this.reconnectionDelay(),
    max: this.reconnectionDelayMax(),
    jitter: this.randomizationFactor()
  });
  this.timeout(null == opts.timeout ? 20000 : opts.timeout);
  this.readyState = 'closed';
  this.uri = uri;
  this.connected = [];
  this.encoding = false;
  this.packetBuffer = [];
  this.encoder = new parser.Encoder();
  this.decoder = new parser.Decoder();
  this.autoConnect = opts.autoConnect !== false;
  if (this.autoConnect) this.open();
}

/**
 * Propagate given event to sockets and emit on `this`
 *
 * @api private
 */

Manager.prototype.emitAll = function() {
  this.emit.apply(this, arguments);
  for (var nsp in this.nsps) {
    this.nsps[nsp].emit.apply(this.nsps[nsp], arguments);
  }
};

/**
 * Update `socket.id` of all sockets
 *
 * @api private
 */

Manager.prototype.updateSocketIds = function(){
  for (var nsp in this.nsps) {
    this.nsps[nsp].id = this.engine.id;
  }
};

/**
 * Mix in `Emitter`.
 */

Emitter(Manager.prototype);

/**
 * Sets the `reconnection` config.
 *
 * @param {Boolean} true/false if it should automatically reconnect
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnection = function(v){
  if (!arguments.length) return this._reconnection;
  this._reconnection = !!v;
  return this;
};

/**
 * Sets the reconnection attempts config.
 *
 * @param {Number} max reconnection attempts before giving up
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionAttempts = function(v){
  if (!arguments.length) return this._reconnectionAttempts;
  this._reconnectionAttempts = v;
  return this;
};

/**
 * Sets the delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelay = function(v){
  if (!arguments.length) return this._reconnectionDelay;
  this._reconnectionDelay = v;
  this.backoff && this.backoff.setMin(v);
  return this;
};

Manager.prototype.randomizationFactor = function(v){
  if (!arguments.length) return this._randomizationFactor;
  this._randomizationFactor = v;
  this.backoff && this.backoff.setJitter(v);
  return this;
};

/**
 * Sets the maximum delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelayMax = function(v){
  if (!arguments.length) return this._reconnectionDelayMax;
  this._reconnectionDelayMax = v;
  this.backoff && this.backoff.setMax(v);
  return this;
};

/**
 * Sets the connection timeout. `false` to disable
 *
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.timeout = function(v){
  if (!arguments.length) return this._timeout;
  this._timeout = v;
  return this;
};

/**
 * Starts trying to reconnect if reconnection is enabled and we have not
 * started reconnecting yet
 *
 * @api private
 */

Manager.prototype.maybeReconnectOnOpen = function() {
  // Only try to reconnect if it's the first time we're connecting
  if (!this.reconnecting && this._reconnection && this.backoff.attempts === 0) {
    // keeps reconnection from firing twice for the same reconnection loop
    this.reconnect();
  }
};


/**
 * Sets the current transport `socket`.
 *
 * @param {Function} optional, callback
 * @return {Manager} self
 * @api public
 */

Manager.prototype.open =
Manager.prototype.connect = function(fn){
  debug('readyState %s', this.readyState);
  if (~this.readyState.indexOf('open')) return this;

  debug('opening %s', this.uri);
  this.engine = eio(this.uri, this.opts);
  var socket = this.engine;
  var self = this;
  this.readyState = 'opening';
  this.skipReconnect = false;

  // emit `open`
  var openSub = on(socket, 'open', function() {
    self.onopen();
    fn && fn();
  });

  // emit `connect_error`
  var errorSub = on(socket, 'error', function(data){
    debug('connect_error');
    self.cleanup();
    self.readyState = 'closed';
    self.emitAll('connect_error', data);
    if (fn) {
      var err = new Error('Connection error');
      err.data = data;
      fn(err);
    } else {
      // Only do this if there is no fn to handle the error
      self.maybeReconnectOnOpen();
    }
  });

  // emit `connect_timeout`
  if (false !== this._timeout) {
    var timeout = this._timeout;
    debug('connect attempt will timeout after %d', timeout);

    // set timer
    var timer = setTimeout(function(){
      debug('connect attempt timed out after %d', timeout);
      openSub.destroy();
      socket.close();
      socket.emit('error', 'timeout');
      self.emitAll('connect_timeout', timeout);
    }, timeout);

    this.subs.push({
      destroy: function(){
        clearTimeout(timer);
      }
    });
  }

  this.subs.push(openSub);
  this.subs.push(errorSub);

  return this;
};

/**
 * Called upon transport open.
 *
 * @api private
 */

Manager.prototype.onopen = function(){
  debug('open');

  // clear old subs
  this.cleanup();

  // mark as open
  this.readyState = 'open';
  this.emit('open');

  // add new subs
  var socket = this.engine;
  this.subs.push(on(socket, 'data', bind(this, 'ondata')));
  this.subs.push(on(this.decoder, 'decoded', bind(this, 'ondecoded')));
  this.subs.push(on(socket, 'error', bind(this, 'onerror')));
  this.subs.push(on(socket, 'close', bind(this, 'onclose')));
};

/**
 * Called with data.
 *
 * @api private
 */

Manager.prototype.ondata = function(data){
  this.decoder.add(data);
};

/**
 * Called when parser fully decodes a packet.
 *
 * @api private
 */

Manager.prototype.ondecoded = function(packet) {
  this.emit('packet', packet);
};

/**
 * Called upon socket error.
 *
 * @api private
 */

Manager.prototype.onerror = function(err){
  debug('error', err);
  this.emitAll('error', err);
};

/**
 * Creates a new socket for the given `nsp`.
 *
 * @return {Socket}
 * @api public
 */

Manager.prototype.socket = function(nsp){
  var socket = this.nsps[nsp];
  if (!socket) {
    socket = new Socket(this, nsp);
    this.nsps[nsp] = socket;
    var self = this;
    socket.on('connect', function(){
      socket.id = self.engine.id;
      if (!~indexOf(self.connected, socket)) {
        self.connected.push(socket);
      }
    });
  }
  return socket;
};

/**
 * Called upon a socket close.
 *
 * @param {Socket} socket
 */

Manager.prototype.destroy = function(socket){
  var index = indexOf(this.connected, socket);
  if (~index) this.connected.splice(index, 1);
  if (this.connected.length) return;

  this.close();
};

/**
 * Writes a packet.
 *
 * @param {Object} packet
 * @api private
 */

Manager.prototype.packet = function(packet){
  debug('writing packet %j', packet);
  var self = this;

  if (!self.encoding) {
    // encode, then write to engine with result
    self.encoding = true;
    this.encoder.encode(packet, function(encodedPackets) {
      for (var i = 0; i < encodedPackets.length; i++) {
        self.engine.write(encodedPackets[i]);
      }
      self.encoding = false;
      self.processPacketQueue();
    });
  } else { // add packet to the queue
    self.packetBuffer.push(packet);
  }
};

/**
 * If packet buffer is non-empty, begins encoding the
 * next packet in line.
 *
 * @api private
 */

Manager.prototype.processPacketQueue = function() {
  if (this.packetBuffer.length > 0 && !this.encoding) {
    var pack = this.packetBuffer.shift();
    this.packet(pack);
  }
};

/**
 * Clean up transport subscriptions and packet buffer.
 *
 * @api private
 */

Manager.prototype.cleanup = function(){
  var sub;
  while (sub = this.subs.shift()) sub.destroy();

  this.packetBuffer = [];
  this.encoding = false;

  this.decoder.destroy();
};

/**
 * Close the current socket.
 *
 * @api private
 */

Manager.prototype.close =
Manager.prototype.disconnect = function(){
  this.skipReconnect = true;
  this.backoff.reset();
  this.readyState = 'closed';
  this.engine && this.engine.close();
};

/**
 * Called upon engine close.
 *
 * @api private
 */

Manager.prototype.onclose = function(reason){
  debug('close');
  this.cleanup();
  this.backoff.reset();
  this.readyState = 'closed';
  this.emit('close', reason);
  if (this._reconnection && !this.skipReconnect) {
    this.reconnect();
  }
};

/**
 * Attempt a reconnection.
 *
 * @api private
 */

Manager.prototype.reconnect = function(){
  if (this.reconnecting || this.skipReconnect) return this;

  var self = this;

  if (this.backoff.attempts >= this._reconnectionAttempts) {
    debug('reconnect failed');
    this.backoff.reset();
    this.emitAll('reconnect_failed');
    this.reconnecting = false;
  } else {
    var delay = this.backoff.duration();
    debug('will wait %dms before reconnect attempt', delay);

    this.reconnecting = true;
    var timer = setTimeout(function(){
      if (self.skipReconnect) return;

      debug('attempting reconnect');
      self.emitAll('reconnect_attempt', self.backoff.attempts);
      self.emitAll('reconnecting', self.backoff.attempts);

      // check again for the case socket closed in above events
      if (self.skipReconnect) return;

      self.open(function(err){
        if (err) {
          debug('reconnect attempt error');
          self.reconnecting = false;
          self.reconnect();
          self.emitAll('reconnect_error', err.data);
        } else {
          debug('reconnect success');
          self.onreconnect();
        }
      });
    }, delay);

    this.subs.push({
      destroy: function(){
        clearTimeout(timer);
      }
    });
  }
};

/**
 * Called upon successful reconnect.
 *
 * @api private
 */

Manager.prototype.onreconnect = function(){
  var attempt = this.backoff.attempts;
  this.reconnecting = false;
  this.backoff.reset();
  this.updateSocketIds();
  this.emitAll('reconnect', attempt);
};

}).apply(this, arguments);

},{"./on":77,"./socket":78,"./url":79,"backo2":80,"component-bind":81,"component-emitter":82,"debug":83,"engine.io-client":84,"indexof":113,"object-component":114,"socket.io-parser":117}],77:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\on.js", module);
(function(){

/**
 * Module exports.
 */

module.exports = on;

/**
 * Helper for subscriptions.
 *
 * @param {Object|EventEmitter} obj with `Emitter` mixin or `EventEmitter`
 * @param {String} event name
 * @param {Function} callback
 * @api public
 */

function on(obj, ev, fn) {
  obj.on(ev, fn);
  return {
    destroy: function(){
      obj.removeListener(ev, fn);
    }
  };
}

}).apply(this, arguments);

},{}],78:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js", module);
(function(){

/**
 * Module dependencies.
 */

var parser = require('socket.io-parser');
var Emitter = require('component-emitter');
var toArray = require('to-array');
var on = require('./on');
var bind = require('component-bind');
var debug = require('debug')('socket.io-client:socket');
var hasBin = require('has-binary');

/**
 * Module exports.
 */

module.exports = exports = Socket;

/**
 * Internal events (blacklisted).
 * These events can't be emitted by the user.
 *
 * @api private
 */

var events = {
  connect: 1,
  connect_error: 1,
  connect_timeout: 1,
  disconnect: 1,
  error: 1,
  reconnect: 1,
  reconnect_attempt: 1,
  reconnect_failed: 1,
  reconnect_error: 1,
  reconnecting: 1
};

/**
 * Shortcut to `Emitter#emit`.
 */

var emit = Emitter.prototype.emit;

/**
 * `Socket` constructor.
 *
 * @api public
 */

function Socket(io, nsp){
  this.io = io;
  this.nsp = nsp;
  this.json = this; // compat
  this.ids = 0;
  this.acks = {};
  if (this.io.autoConnect) this.open();
  this.receiveBuffer = [];
  this.sendBuffer = [];
  this.connected = false;
  this.disconnected = true;
}

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Subscribe to open, close and packet events
 *
 * @api private
 */

Socket.prototype.subEvents = function() {
  if (this.subs) return;

  var io = this.io;
  this.subs = [
    on(io, 'open', bind(this, 'onopen')),
    on(io, 'packet', bind(this, 'onpacket')),
    on(io, 'close', bind(this, 'onclose'))
  ];
};

/**
 * "Opens" the socket.
 *
 * @api public
 */

Socket.prototype.open =
Socket.prototype.connect = function(){
  if (this.connected) return this;

  this.subEvents();
  this.io.open(); // ensure open
  if ('open' == this.io.readyState) this.onopen();
  return this;
};

/**
 * Sends a `message` event.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.send = function(){
  var args = toArray(arguments);
  args.unshift('message');
  this.emit.apply(this, args);
  return this;
};

/**
 * Override `emit`.
 * If the event is in `events`, it's emitted normally.
 *
 * @param {String} event name
 * @return {Socket} self
 * @api public
 */

Socket.prototype.emit = function(ev){
  if (events.hasOwnProperty(ev)) {
    emit.apply(this, arguments);
    return this;
  }

  var args = toArray(arguments);
  var parserType = parser.EVENT; // default
  if (hasBin(args)) { parserType = parser.BINARY_EVENT; } // binary
  var packet = { type: parserType, data: args };

  // event ack callback
  if ('function' == typeof args[args.length - 1]) {
    debug('emitting packet with ack id %d', this.ids);
    this.acks[this.ids] = args.pop();
    packet.id = this.ids++;
  }

  if (this.connected) {
    this.packet(packet);
  } else {
    this.sendBuffer.push(packet);
  }

  return this;
};

/**
 * Sends a packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.packet = function(packet){
  packet.nsp = this.nsp;
  this.io.packet(packet);
};

/**
 * Called upon engine `open`.
 *
 * @api private
 */

Socket.prototype.onopen = function(){
  debug('transport is open - connecting');

  // write connect packet if necessary
  if ('/' != this.nsp) {
    this.packet({ type: parser.CONNECT });
  }
};

/**
 * Called upon engine `close`.
 *
 * @param {String} reason
 * @api private
 */

Socket.prototype.onclose = function(reason){
  debug('close (%s)', reason);
  this.connected = false;
  this.disconnected = true;
  delete this.id;
  this.emit('disconnect', reason);
};

/**
 * Called with socket packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onpacket = function(packet){
  if (packet.nsp != this.nsp) return;

  switch (packet.type) {
    case parser.CONNECT:
      this.onconnect();
      break;

    case parser.EVENT:
      this.onevent(packet);
      break;

    case parser.BINARY_EVENT:
      this.onevent(packet);
      break;

    case parser.ACK:
      this.onack(packet);
      break;

    case parser.BINARY_ACK:
      this.onack(packet);
      break;

    case parser.DISCONNECT:
      this.ondisconnect();
      break;

    case parser.ERROR:
      this.emit('error', packet.data);
      break;
  }
};

/**
 * Called upon a server event.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onevent = function(packet){
  var args = packet.data || [];
  debug('emitting event %j', args);

  if (null != packet.id) {
    debug('attaching ack callback to event');
    args.push(this.ack(packet.id));
  }

  if (this.connected) {
    emit.apply(this, args);
  } else {
    this.receiveBuffer.push(args);
  }
};

/**
 * Produces an ack callback to emit with an event.
 *
 * @api private
 */

Socket.prototype.ack = function(id){
  var self = this;
  var sent = false;
  return function(){
    // prevent double callbacks
    if (sent) return;
    sent = true;
    var args = toArray(arguments);
    debug('sending ack %j', args);

    var type = hasBin(args) ? parser.BINARY_ACK : parser.ACK;
    self.packet({
      type: type,
      id: id,
      data: args
    });
  };
};

/**
 * Called upon a server acknowlegement.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onack = function(packet){
  debug('calling ack %s with %j', packet.id, packet.data);
  var fn = this.acks[packet.id];
  fn.apply(this, packet.data);
  delete this.acks[packet.id];
};

/**
 * Called upon server connect.
 *
 * @api private
 */

Socket.prototype.onconnect = function(){
  this.connected = true;
  this.disconnected = false;
  this.emit('connect');
  this.emitBuffered();
};

/**
 * Emit buffered events (received and emitted).
 *
 * @api private
 */

Socket.prototype.emitBuffered = function(){
  var i;
  for (i = 0; i < this.receiveBuffer.length; i++) {
    emit.apply(this, this.receiveBuffer[i]);
  }
  this.receiveBuffer = [];

  for (i = 0; i < this.sendBuffer.length; i++) {
    this.packet(this.sendBuffer[i]);
  }
  this.sendBuffer = [];
};

/**
 * Called upon server disconnect.
 *
 * @api private
 */

Socket.prototype.ondisconnect = function(){
  debug('server disconnect (%s)', this.nsp);
  this.destroy();
  this.onclose('io server disconnect');
};

/**
 * Called upon forced client/server side disconnections,
 * this method ensures the manager stops tracking us and
 * that reconnections don't get triggered for this.
 *
 * @api private.
 */

Socket.prototype.destroy = function(){
  if (this.subs) {
    // clean subscriptions to avoid reconnections
    for (var i = 0; i < this.subs.length; i++) {
      this.subs[i].destroy();
    }
    this.subs = null;
  }

  this.io.destroy(this);
};

/**
 * Disconnects the socket manually.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.close =
Socket.prototype.disconnect = function(){
  if (this.connected) {
    debug('performing disconnect (%s)', this.nsp);
    this.packet({ type: parser.DISCONNECT });
  }

  // remove socket from pool
  this.destroy();

  if (this.connected) {
    // fire events
    this.onclose('io client disconnect');
  }
  return this;
};

}).apply(this, arguments);

},{"./on":77,"component-bind":81,"component-emitter":82,"debug":83,"has-binary":111,"socket.io-parser":117,"to-array":121}],79:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\url.js", module);
(function(){
(function (global){

/**
 * Module dependencies.
 */

var parseuri = require('parseuri');
var debug = require('debug')('socket.io-client:url');

/**
 * Module exports.
 */

module.exports = url;

/**
 * URL parser.
 *
 * @param {String} url
 * @param {Object} An object meant to mimic window.location.
 *                 Defaults to window.location.
 * @api public
 */

function url(uri, loc){
  var obj = uri;

  // default to window.location
  var loc = loc || global.location;
  if (null == uri) uri = loc.protocol + '//' + loc.host;

  // relative path support
  if ('string' == typeof uri) {
    if ('/' == uri.charAt(0)) {
      if ('/' == uri.charAt(1)) {
        uri = loc.protocol + uri;
      } else {
        uri = loc.hostname + uri;
      }
    }

    if (!/^(https?|wss?):\/\//.test(uri)) {
      debug('protocol-less url %s', uri);
      if ('undefined' != typeof loc) {
        uri = loc.protocol + '//' + uri;
      } else {
        uri = 'https://' + uri;
      }
    }

    // parse
    debug('parse %s', uri);
    obj = parseuri(uri);
  }

  // make sure we treat `localhost:80` and `localhost` equally
  if (!obj.port) {
    if (/^(http|ws)$/.test(obj.protocol)) {
      obj.port = '80';
    }
    else if (/^(http|ws)s$/.test(obj.protocol)) {
      obj.port = '443';
    }
  }

  obj.path = obj.path || '/';

  // define unique id
  obj.id = obj.protocol + '://' + obj.host + ':' + obj.port;
  // define href
  obj.href = obj.protocol + '://' + obj.host + (loc && loc.port == obj.port ? '' : (':' + obj.port));

  return obj;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"debug":83,"parseuri":115}],80:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\backo2\\index.js", module);
(function(){

/**
 * Expose `Backoff`.
 */

module.exports = Backoff;

/**
 * Initialize backoff timer with `opts`.
 *
 * - `min` initial timeout in milliseconds [100]
 * - `max` max timeout [10000]
 * - `jitter` [0]
 * - `factor` [2]
 *
 * @param {Object} opts
 * @api public
 */

function Backoff(opts) {
  opts = opts || {};
  this.ms = opts.min || 100;
  this.max = opts.max || 10000;
  this.factor = opts.factor || 2;
  this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
  this.attempts = 0;
}

/**
 * Return the backoff duration.
 *
 * @return {Number}
 * @api public
 */

Backoff.prototype.duration = function(){
  var ms = this.ms * Math.pow(this.factor, this.attempts++);
  if (this.jitter) {
    var rand =  Math.random();
    var deviation = Math.floor(rand * this.jitter * ms);
    ms = (Math.floor(rand * 10) & 1) == 0  ? ms - deviation : ms + deviation;
  }
  return Math.min(ms, this.max) | 0;
};

/**
 * Reset the number of attempts.
 *
 * @api public
 */

Backoff.prototype.reset = function(){
  this.attempts = 0;
};

/**
 * Set the minimum duration
 *
 * @api public
 */

Backoff.prototype.setMin = function(min){
  this.ms = min;
};

/**
 * Set the maximum duration
 *
 * @api public
 */

Backoff.prototype.setMax = function(max){
  this.max = max;
};

/**
 * Set the jitter
 *
 * @api public
 */

Backoff.prototype.setJitter = function(jitter){
  this.jitter = jitter;
};


}).apply(this, arguments);

},{}],81:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\component-bind\\index.js", module);
(function(){
/**
 * Slice reference.
 */

var slice = [].slice;

/**
 * Bind `obj` to `fn`.
 *
 * @param {Object} obj
 * @param {Function|String} fn or string
 * @return {Function}
 * @api public
 */

module.exports = function(obj, fn){
  if ('string' == typeof fn) fn = obj[fn];
  if ('function' != typeof fn) throw new Error('bind() requires a function');
  var args = slice.call(arguments, 2);
  return function(){
    return fn.apply(obj, args.concat(slice.call(arguments)));
  }
};

}).apply(this, arguments);

},{}],82:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\component-emitter\\index.js", module);
(function(){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

}).apply(this, arguments);

},{}],83:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\debug\\debug.js", module);
(function(){

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

}).apply(this, arguments);

},{}],84:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\index.js", module);
(function(){

module.exports =  require('./lib/');

}).apply(this, arguments);

},{"./lib/":85}],85:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\index.js", module);
(function(){

module.exports = require('./socket');

/**
 * Exports parser
 *
 * @api public
 *
 */
module.exports.parser = require('engine.io-parser');

}).apply(this, arguments);

},{"./socket":86,"engine.io-parser":98}],86:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js", module);
(function(){
(function (global){
/**
 * Module dependencies.
 */

var transports = require('./transports');
var Emitter = require('component-emitter');
var debug = require('debug')('engine.io-client:socket');
var index = require('indexof');
var parser = require('engine.io-parser');
var parseuri = require('parseuri');
var parsejson = require('parsejson');
var parseqs = require('parseqs');

/**
 * Module exports.
 */

module.exports = Socket;

/**
 * Noop function.
 *
 * @api private
 */

function noop(){}

/**
 * Socket constructor.
 *
 * @param {String|Object} uri or options
 * @param {Object} options
 * @api public
 */

function Socket(uri, opts){
  if (!(this instanceof Socket)) return new Socket(uri, opts);

  opts = opts || {};

  if (uri && 'object' == typeof uri) {
    opts = uri;
    uri = null;
  }

  if (uri) {
    uri = parseuri(uri);
    opts.host = uri.host;
    opts.secure = uri.protocol == 'https' || uri.protocol == 'wss';
    opts.port = uri.port;
    if (uri.query) opts.query = uri.query;
  }

  this.secure = null != opts.secure ? opts.secure :
    (global.location && 'https:' == location.protocol);

  if (opts.host) {
    var pieces = opts.host.split(':');
    opts.hostname = pieces.shift();
    if (pieces.length) {
      opts.port = pieces.pop();
    } else if (!opts.port) {
      // if no port is specified manually, use the protocol default
      opts.port = this.secure ? '443' : '80';
    }
  }

  this.agent = opts.agent || false;
  this.hostname = opts.hostname ||
    (global.location ? location.hostname : 'localhost');
  this.port = opts.port || (global.location && location.port ?
       location.port :
       (this.secure ? 443 : 80));
  this.query = opts.query || {};
  if ('string' == typeof this.query) this.query = parseqs.decode(this.query);
  this.upgrade = false !== opts.upgrade;
  this.path = (opts.path || '/engine.io').replace(/\/$/, '') + '/';
  this.forceJSONP = !!opts.forceJSONP;
  this.jsonp = false !== opts.jsonp;
  this.forceBase64 = !!opts.forceBase64;
  this.enablesXDR = !!opts.enablesXDR;
  this.timestampParam = opts.timestampParam || 't';
  this.timestampRequests = opts.timestampRequests;
  this.transports = opts.transports || ['polling', 'websocket'];
  this.readyState = '';
  this.writeBuffer = [];
  this.callbackBuffer = [];
  this.policyPort = opts.policyPort || 843;
  this.rememberUpgrade = opts.rememberUpgrade || false;
  this.binaryType = null;
  this.onlyBinaryUpgrades = opts.onlyBinaryUpgrades;

  // SSL options for Node.js client
  this.pfx = opts.pfx || null;
  this.key = opts.key || null;
  this.passphrase = opts.passphrase || null;
  this.cert = opts.cert || null;
  this.ca = opts.ca || null;
  this.ciphers = opts.ciphers || null;
  this.rejectUnauthorized = opts.rejectUnauthorized || null;

  this.open();
}

Socket.priorWebsocketSuccess = false;

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Protocol version.
 *
 * @api public
 */

Socket.protocol = parser.protocol; // this is an int

/**
 * Expose deps for legacy compatibility
 * and standalone browser access.
 */

Socket.Socket = Socket;
Socket.Transport = require('./transport');
Socket.transports = require('./transports');
Socket.parser = require('engine.io-parser');

/**
 * Creates transport of the given type.
 *
 * @param {String} transport name
 * @return {Transport}
 * @api private
 */

Socket.prototype.createTransport = function (name) {
  debug('creating transport "%s"', name);
  var query = clone(this.query);

  // append engine.io protocol identifier
  query.EIO = parser.protocol;

  // transport name
  query.transport = name;

  // session id if we already have one
  if (this.id) query.sid = this.id;

  var transport = new transports[name]({
    agent: this.agent,
    hostname: this.hostname,
    port: this.port,
    secure: this.secure,
    path: this.path,
    query: query,
    forceJSONP: this.forceJSONP,
    jsonp: this.jsonp,
    forceBase64: this.forceBase64,
    enablesXDR: this.enablesXDR,
    timestampRequests: this.timestampRequests,
    timestampParam: this.timestampParam,
    policyPort: this.policyPort,
    socket: this,
    pfx: this.pfx,
    key: this.key,
    passphrase: this.passphrase,
    cert: this.cert,
    ca: this.ca,
    ciphers: this.ciphers,
    rejectUnauthorized: this.rejectUnauthorized
  });

  return transport;
};

function clone (obj) {
  var o = {};
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      o[i] = obj[i];
    }
  }
  return o;
}

/**
 * Initializes transport to use and starts probe.
 *
 * @api private
 */
Socket.prototype.open = function () {
  var transport;
  if (this.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf('websocket') != -1) {
    transport = 'websocket';
  } else if (0 == this.transports.length) {
    // Emit error on next tick so it can be listened to
    var self = this;
    setTimeout(function() {
      self.emit('error', 'No transports available');
    }, 0);
    return;
  } else {
    transport = this.transports[0];
  }
  this.readyState = 'opening';

  // Retry with the next transport if the transport is disabled (jsonp: false)
  var transport;
  try {
    transport = this.createTransport(transport);
  } catch (e) {
    this.transports.shift();
    this.open();
    return;
  }

  transport.open();
  this.setTransport(transport);
};

/**
 * Sets the current transport. Disables the existing one (if any).
 *
 * @api private
 */

Socket.prototype.setTransport = function(transport){
  debug('setting transport %s', transport.name);
  var self = this;

  if (this.transport) {
    debug('clearing existing transport %s', this.transport.name);
    this.transport.removeAllListeners();
  }

  // set up transport
  this.transport = transport;

  // set up transport listeners
  transport
  .on('drain', function(){
    self.onDrain();
  })
  .on('packet', function(packet){
    self.onPacket(packet);
  })
  .on('error', function(e){
    self.onError(e);
  })
  .on('close', function(){
    self.onClose('transport close');
  });
};

/**
 * Probes a transport.
 *
 * @param {String} transport name
 * @api private
 */

Socket.prototype.probe = function (name) {
  debug('probing transport "%s"', name);
  var transport = this.createTransport(name, { probe: 1 })
    , failed = false
    , self = this;

  Socket.priorWebsocketSuccess = false;

  function onTransportOpen(){
    if (self.onlyBinaryUpgrades) {
      var upgradeLosesBinary = !this.supportsBinary && self.transport.supportsBinary;
      failed = failed || upgradeLosesBinary;
    }
    if (failed) return;

    debug('probe transport "%s" opened', name);
    transport.send([{ type: 'ping', data: 'probe' }]);
    transport.once('packet', function (msg) {
      if (failed) return;
      if ('pong' == msg.type && 'probe' == msg.data) {
        debug('probe transport "%s" pong', name);
        self.upgrading = true;
        self.emit('upgrading', transport);
        if (!transport) return;
        Socket.priorWebsocketSuccess = 'websocket' == transport.name;

        debug('pausing current transport "%s"', self.transport.name);
        self.transport.pause(function () {
          if (failed) return;
          if ('closed' == self.readyState) return;
          debug('changing transport and sending upgrade packet');

          cleanup();

          self.setTransport(transport);
          transport.send([{ type: 'upgrade' }]);
          self.emit('upgrade', transport);
          transport = null;
          self.upgrading = false;
          self.flush();
        });
      } else {
        debug('probe transport "%s" failed', name);
        var err = new Error('probe error');
        err.transport = transport.name;
        self.emit('upgradeError', err);
      }
    });
  }

  function freezeTransport() {
    if (failed) return;

    // Any callback called by transport should be ignored since now
    failed = true;

    cleanup();

    transport.close();
    transport = null;
  }

  //Handle any error that happens while probing
  function onerror(err) {
    var error = new Error('probe error: ' + err);
    error.transport = transport.name;

    freezeTransport();

    debug('probe transport "%s" failed because of error: %s', name, err);

    self.emit('upgradeError', error);
  }

  function onTransportClose(){
    onerror("transport closed");
  }

  //When the socket is closed while we're probing
  function onclose(){
    onerror("socket closed");
  }

  //When the socket is upgraded while we're probing
  function onupgrade(to){
    if (transport && to.name != transport.name) {
      debug('"%s" works - aborting "%s"', to.name, transport.name);
      freezeTransport();
    }
  }

  //Remove all listeners on the transport and on self
  function cleanup(){
    transport.removeListener('open', onTransportOpen);
    transport.removeListener('error', onerror);
    transport.removeListener('close', onTransportClose);
    self.removeListener('close', onclose);
    self.removeListener('upgrading', onupgrade);
  }

  transport.once('open', onTransportOpen);
  transport.once('error', onerror);
  transport.once('close', onTransportClose);

  this.once('close', onclose);
  this.once('upgrading', onupgrade);

  transport.open();

};

/**
 * Called when connection is deemed open.
 *
 * @api public
 */

Socket.prototype.onOpen = function () {
  debug('socket open');
  this.readyState = 'open';
  Socket.priorWebsocketSuccess = 'websocket' == this.transport.name;
  this.emit('open');
  this.flush();

  // we check for `readyState` in case an `open`
  // listener already closed the socket
  if ('open' == this.readyState && this.upgrade && this.transport.pause) {
    debug('starting upgrade probes');
    for (var i = 0, l = this.upgrades.length; i < l; i++) {
      this.probe(this.upgrades[i]);
    }
  }
};

/**
 * Handles a packet.
 *
 * @api private
 */

Socket.prototype.onPacket = function (packet) {
  if ('opening' == this.readyState || 'open' == this.readyState) {
    debug('socket receive: type "%s", data "%s"', packet.type, packet.data);

    this.emit('packet', packet);

    // Socket is live - any packet counts
    this.emit('heartbeat');

    switch (packet.type) {
      case 'open':
        this.onHandshake(parsejson(packet.data));
        break;

      case 'pong':
        this.setPing();
        break;

      case 'error':
        var err = new Error('server error');
        err.code = packet.data;
        this.emit('error', err);
        break;

      case 'message':
        this.emit('data', packet.data);
        this.emit('message', packet.data);
        break;
    }
  } else {
    debug('packet received with socket readyState "%s"', this.readyState);
  }
};

/**
 * Called upon handshake completion.
 *
 * @param {Object} handshake obj
 * @api private
 */

Socket.prototype.onHandshake = function (data) {
  this.emit('handshake', data);
  this.id = data.sid;
  this.transport.query.sid = data.sid;
  this.upgrades = this.filterUpgrades(data.upgrades);
  this.pingInterval = data.pingInterval;
  this.pingTimeout = data.pingTimeout;
  this.onOpen();
  // In case open handler closes socket
  if  ('closed' == this.readyState) return;
  this.setPing();

  // Prolong liveness of socket on heartbeat
  this.removeListener('heartbeat', this.onHeartbeat);
  this.on('heartbeat', this.onHeartbeat);
};

/**
 * Resets ping timeout.
 *
 * @api private
 */

Socket.prototype.onHeartbeat = function (timeout) {
  clearTimeout(this.pingTimeoutTimer);
  var self = this;
  self.pingTimeoutTimer = setTimeout(function () {
    if ('closed' == self.readyState) return;
    self.onClose('ping timeout');
  }, timeout || (self.pingInterval + self.pingTimeout));
};

/**
 * Pings server every `this.pingInterval` and expects response
 * within `this.pingTimeout` or closes connection.
 *
 * @api private
 */

Socket.prototype.setPing = function () {
  var self = this;
  clearTimeout(self.pingIntervalTimer);
  self.pingIntervalTimer = setTimeout(function () {
    debug('writing ping packet - expecting pong within %sms', self.pingTimeout);
    self.ping();
    self.onHeartbeat(self.pingTimeout);
  }, self.pingInterval);
};

/**
* Sends a ping packet.
*
* @api public
*/

Socket.prototype.ping = function () {
  this.sendPacket('ping');
};

/**
 * Called on `drain` event
 *
 * @api private
 */

Socket.prototype.onDrain = function() {
  for (var i = 0; i < this.prevBufferLen; i++) {
    if (this.callbackBuffer[i]) {
      this.callbackBuffer[i]();
    }
  }

  this.writeBuffer.splice(0, this.prevBufferLen);
  this.callbackBuffer.splice(0, this.prevBufferLen);

  // setting prevBufferLen = 0 is very important
  // for example, when upgrading, upgrade packet is sent over,
  // and a nonzero prevBufferLen could cause problems on `drain`
  this.prevBufferLen = 0;

  if (this.writeBuffer.length == 0) {
    this.emit('drain');
  } else {
    this.flush();
  }
};

/**
 * Flush write buffers.
 *
 * @api private
 */

Socket.prototype.flush = function () {
  if ('closed' != this.readyState && this.transport.writable &&
    !this.upgrading && this.writeBuffer.length) {
    debug('flushing %d packets in socket', this.writeBuffer.length);
    this.transport.send(this.writeBuffer);
    // keep track of current length of writeBuffer
    // splice writeBuffer and callbackBuffer on `drain`
    this.prevBufferLen = this.writeBuffer.length;
    this.emit('flush');
  }
};

/**
 * Sends a message.
 *
 * @param {String} message.
 * @param {Function} callback function.
 * @return {Socket} for chaining.
 * @api public
 */

Socket.prototype.write =
Socket.prototype.send = function (msg, fn) {
  this.sendPacket('message', msg, fn);
  return this;
};

/**
 * Sends a packet.
 *
 * @param {String} packet type.
 * @param {String} data.
 * @param {Function} callback function.
 * @api private
 */

Socket.prototype.sendPacket = function (type, data, fn) {
  if ('closing' == this.readyState || 'closed' == this.readyState) {
    return;
  }

  var packet = { type: type, data: data };
  this.emit('packetCreate', packet);
  this.writeBuffer.push(packet);
  this.callbackBuffer.push(fn);
  this.flush();
};

/**
 * Closes the connection.
 *
 * @api private
 */

Socket.prototype.close = function () {
  if ('opening' == this.readyState || 'open' == this.readyState) {
    this.readyState = 'closing';

    var self = this;

    function close() {
      self.onClose('forced close');
      debug('socket closing - telling transport to close');
      self.transport.close();
    }

    function cleanupAndClose() {
      self.removeListener('upgrade', cleanupAndClose);
      self.removeListener('upgradeError', cleanupAndClose);
      close();
    }

    function waitForUpgrade() {
      // wait for upgrade to finish since we can't send packets while pausing a transport
      self.once('upgrade', cleanupAndClose);
      self.once('upgradeError', cleanupAndClose);
    }

    if (this.writeBuffer.length) {
      this.once('drain', function() {
        if (this.upgrading) {
          waitForUpgrade();
        } else {
          close();
        }
      });
    } else if (this.upgrading) {
      waitForUpgrade();
    } else {
      close();
    }
  }

  return this;
};

/**
 * Called upon transport error
 *
 * @api private
 */

Socket.prototype.onError = function (err) {
  debug('socket error %j', err);
  Socket.priorWebsocketSuccess = false;
  this.emit('error', err);
  this.onClose('transport error', err);
};

/**
 * Called upon transport close.
 *
 * @api private
 */

Socket.prototype.onClose = function (reason, desc) {
  if ('opening' == this.readyState || 'open' == this.readyState || 'closing' == this.readyState) {
    debug('socket close with reason: "%s"', reason);
    var self = this;

    // clear timers
    clearTimeout(this.pingIntervalTimer);
    clearTimeout(this.pingTimeoutTimer);

    // clean buffers in next tick, so developers can still
    // grab the buffers on `close` event
    setTimeout(function() {
      self.writeBuffer = [];
      self.callbackBuffer = [];
      self.prevBufferLen = 0;
    }, 0);

    // stop event from firing again for transport
    this.transport.removeAllListeners('close');

    // ensure transport won't stay open
    this.transport.close();

    // ignore further transport communication
    this.transport.removeAllListeners();

    // set ready state
    this.readyState = 'closed';

    // clear session id
    this.id = null;

    // emit close event
    this.emit('close', reason, desc);
  }
};

/**
 * Filters upgrades, returning only those matching client transports.
 *
 * @param {Array} server upgrades
 * @api private
 *
 */

Socket.prototype.filterUpgrades = function (upgrades) {
  var filteredUpgrades = [];
  for (var i = 0, j = upgrades.length; i<j; i++) {
    if (~index(this.transports, upgrades[i])) filteredUpgrades.push(upgrades[i]);
  }
  return filteredUpgrades;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./transport":87,"./transports":88,"component-emitter":82,"debug":95,"engine.io-parser":98,"indexof":113,"parsejson":107,"parseqs":108,"parseuri":109}],87:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transport.js", module);
(function(){
/**
 * Module dependencies.
 */

var parser = require('engine.io-parser');
var Emitter = require('component-emitter');

/**
 * Module exports.
 */

module.exports = Transport;

/**
 * Transport abstract constructor.
 *
 * @param {Object} options.
 * @api private
 */

function Transport (opts) {
  this.path = opts.path;
  this.hostname = opts.hostname;
  this.port = opts.port;
  this.secure = opts.secure;
  this.query = opts.query;
  this.timestampParam = opts.timestampParam;
  this.timestampRequests = opts.timestampRequests;
  this.readyState = '';
  this.agent = opts.agent || false;
  this.socket = opts.socket;
  this.enablesXDR = opts.enablesXDR;

  // SSL options for Node.js client
  this.pfx = opts.pfx;
  this.key = opts.key;
  this.passphrase = opts.passphrase;
  this.cert = opts.cert;
  this.ca = opts.ca;
  this.ciphers = opts.ciphers;
  this.rejectUnauthorized = opts.rejectUnauthorized;
}

/**
 * Mix in `Emitter`.
 */

Emitter(Transport.prototype);

/**
 * A counter used to prevent collisions in the timestamps used
 * for cache busting.
 */

Transport.timestamps = 0;

/**
 * Emits an error.
 *
 * @param {String} str
 * @return {Transport} for chaining
 * @api public
 */

Transport.prototype.onError = function (msg, desc) {
  var err = new Error(msg);
  err.type = 'TransportError';
  err.description = desc;
  this.emit('error', err);
  return this;
};

/**
 * Opens the transport.
 *
 * @api public
 */

Transport.prototype.open = function () {
  if ('closed' == this.readyState || '' == this.readyState) {
    this.readyState = 'opening';
    this.doOpen();
  }

  return this;
};

/**
 * Closes the transport.
 *
 * @api private
 */

Transport.prototype.close = function () {
  if ('opening' == this.readyState || 'open' == this.readyState) {
    this.doClose();
    this.onClose();
  }

  return this;
};

/**
 * Sends multiple packets.
 *
 * @param {Array} packets
 * @api private
 */

Transport.prototype.send = function(packets){
  if ('open' == this.readyState) {
    this.write(packets);
  } else {
    throw new Error('Transport not open');
  }
};

/**
 * Called upon open
 *
 * @api private
 */

Transport.prototype.onOpen = function () {
  this.readyState = 'open';
  this.writable = true;
  this.emit('open');
};

/**
 * Called with data.
 *
 * @param {String} data
 * @api private
 */

Transport.prototype.onData = function(data){
  var packet = parser.decodePacket(data, this.socket.binaryType);
  this.onPacket(packet);
};

/**
 * Called with a decoded packet.
 */

Transport.prototype.onPacket = function (packet) {
  this.emit('packet', packet);
};

/**
 * Called upon close.
 *
 * @api private
 */

Transport.prototype.onClose = function () {
  this.readyState = 'closed';
  this.emit('close');
};

}).apply(this, arguments);

},{"component-emitter":82,"engine.io-parser":98}],88:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js", module);
(function(){
(function (global){
/**
 * Module dependencies
 */

var XMLHttpRequest = require('xmlhttprequest');
var XHR = require('./polling-xhr');
var JSONP = require('./polling-jsonp');
var websocket = require('./websocket');

/**
 * Export transports.
 */

exports.polling = polling;
exports.websocket = websocket;

/**
 * Polling transport polymorphic constructor.
 * Decides on xhr vs jsonp based on feature detection.
 *
 * @api private
 */

function polling(opts){
  var xhr;
  var xd = false;
  var xs = false;
  var jsonp = false !== opts.jsonp;

  if (global.location) {
    var isSSL = 'https:' == location.protocol;
    var port = location.port;

    // some user agents have empty `location.port`
    if (!port) {
      port = isSSL ? 443 : 80;
    }

    xd = opts.hostname != location.hostname || port != opts.port;
    xs = opts.secure != isSSL;
  }

  opts.xdomain = xd;
  opts.xscheme = xs;
  xhr = new XMLHttpRequest(opts);

  if ('open' in xhr && !opts.forceJSONP) {
    return new XHR(opts);
  } else {
    if (!jsonp) throw new Error('JSONP disabled');
    return new JSONP(opts);
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./polling-jsonp":89,"./polling-xhr":90,"./websocket":92,"xmlhttprequest":93}],89:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-jsonp.js", module);
(function(){
(function (global){

/**
 * Module requirements.
 */

var Polling = require('./polling');
var inherit = require('component-inherit');

/**
 * Module exports.
 */

module.exports = JSONPPolling;

/**
 * Cached regular expressions.
 */

var rNewline = /\n/g;
var rEscapedNewline = /\\n/g;

/**
 * Global JSONP callbacks.
 */

var callbacks;

/**
 * Callbacks count.
 */

var index = 0;

/**
 * Noop.
 */

function empty () { }

/**
 * JSONP Polling constructor.
 *
 * @param {Object} opts.
 * @api public
 */

function JSONPPolling (opts) {
  Polling.call(this, opts);

  this.query = this.query || {};

  // define global callbacks array if not present
  // we do this here (lazily) to avoid unneeded global pollution
  if (!callbacks) {
    // we need to consider multiple engines in the same page
    if (!global.___eio) global.___eio = [];
    callbacks = global.___eio;
  }

  // callback identifier
  this.index = callbacks.length;

  // add callback to jsonp global
  var self = this;
  callbacks.push(function (msg) {
    self.onData(msg);
  });

  // append to query string
  this.query.j = this.index;

  // prevent spurious errors from being emitted when the window is unloaded
  if (global.document && global.addEventListener) {
    global.addEventListener('beforeunload', function () {
      if (self.script) self.script.onerror = empty;
    }, false);
  }
}

/**
 * Inherits from Polling.
 */

inherit(JSONPPolling, Polling);

/*
 * JSONP only supports binary as base64 encoded strings
 */

JSONPPolling.prototype.supportsBinary = false;

/**
 * Closes the socket.
 *
 * @api private
 */

JSONPPolling.prototype.doClose = function () {
  if (this.script) {
    this.script.parentNode.removeChild(this.script);
    this.script = null;
  }

  if (this.form) {
    this.form.parentNode.removeChild(this.form);
    this.form = null;
    this.iframe = null;
  }

  Polling.prototype.doClose.call(this);
};

/**
 * Starts a poll cycle.
 *
 * @api private
 */

JSONPPolling.prototype.doPoll = function () {
  var self = this;
  var script = document.createElement('script');

  if (this.script) {
    this.script.parentNode.removeChild(this.script);
    this.script = null;
  }

  script.async = true;
  script.src = this.uri();
  script.onerror = function(e){
    self.onError('jsonp poll error',e);
  };

  var insertAt = document.getElementsByTagName('script')[0];
  insertAt.parentNode.insertBefore(script, insertAt);
  this.script = script;

  var isUAgecko = 'undefined' != typeof navigator && /gecko/i.test(navigator.userAgent);
  
  if (isUAgecko) {
    setTimeout(function () {
      var iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      document.body.removeChild(iframe);
    }, 100);
  }
};

/**
 * Writes with a hidden iframe.
 *
 * @param {String} data to send
 * @param {Function} called upon flush.
 * @api private
 */

JSONPPolling.prototype.doWrite = function (data, fn) {
  var self = this;

  if (!this.form) {
    var form = document.createElement('form');
    var area = document.createElement('textarea');
    var id = this.iframeId = 'eio_iframe_' + this.index;
    var iframe;

    form.className = 'socketio';
    form.style.position = 'absolute';
    form.style.top = '-1000px';
    form.style.left = '-1000px';
    form.target = id;
    form.method = 'POST';
    form.setAttribute('accept-charset', 'utf-8');
    area.name = 'd';
    form.appendChild(area);
    document.body.appendChild(form);

    this.form = form;
    this.area = area;
  }

  this.form.action = this.uri();

  function complete () {
    initIframe();
    fn();
  }

  function initIframe () {
    if (self.iframe) {
      try {
        self.form.removeChild(self.iframe);
      } catch (e) {
        self.onError('jsonp polling iframe removal error', e);
      }
    }

    try {
      // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
      var html = '<iframe src="javascript:0" name="'+ self.iframeId +'">';
      iframe = document.createElement(html);
    } catch (e) {
      iframe = document.createElement('iframe');
      iframe.name = self.iframeId;
      iframe.src = 'javascript:0';
    }

    iframe.id = self.iframeId;

    self.form.appendChild(iframe);
    self.iframe = iframe;
  }

  initIframe();

  // escape \n to prevent it from being converted into \r\n by some UAs
  // double escaping is required for escaped new lines because unescaping of new lines can be done safely on server-side
  data = data.replace(rEscapedNewline, '\\\n');
  this.area.value = data.replace(rNewline, '\\n');

  try {
    this.form.submit();
  } catch(e) {}

  if (this.iframe.attachEvent) {
    this.iframe.onreadystatechange = function(){
      if (self.iframe.readyState == 'complete') {
        complete();
      }
    };
  } else {
    this.iframe.onload = complete;
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./polling":91,"component-inherit":94}],90:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js", module);
(function(){
(function (global){
/**
 * Module requirements.
 */

var XMLHttpRequest = require('xmlhttprequest');
var Polling = require('./polling');
var Emitter = require('component-emitter');
var inherit = require('component-inherit');
var debug = require('debug')('engine.io-client:polling-xhr');

/**
 * Module exports.
 */

module.exports = XHR;
module.exports.Request = Request;

/**
 * Empty function
 */

function empty(){}

/**
 * XHR Polling constructor.
 *
 * @param {Object} opts
 * @api public
 */

function XHR(opts){
  Polling.call(this, opts);

  if (global.location) {
    var isSSL = 'https:' == location.protocol;
    var port = location.port;

    // some user agents have empty `location.port`
    if (!port) {
      port = isSSL ? 443 : 80;
    }

    this.xd = opts.hostname != global.location.hostname ||
      port != opts.port;
    this.xs = opts.secure != isSSL;
  }
}

/**
 * Inherits from Polling.
 */

inherit(XHR, Polling);

/**
 * XHR supports binary
 */

XHR.prototype.supportsBinary = true;

/**
 * Creates a request.
 *
 * @param {String} method
 * @api private
 */

XHR.prototype.request = function(opts){
  opts = opts || {};
  opts.uri = this.uri();
  opts.xd = this.xd;
  opts.xs = this.xs;
  opts.agent = this.agent || false;
  opts.supportsBinary = this.supportsBinary;
  opts.enablesXDR = this.enablesXDR;

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;

  return new Request(opts);
};

/**
 * Sends data.
 *
 * @param {String} data to send.
 * @param {Function} called upon flush.
 * @api private
 */

XHR.prototype.doWrite = function(data, fn){
  var isBinary = typeof data !== 'string' && data !== undefined;
  var req = this.request({ method: 'POST', data: data, isBinary: isBinary });
  var self = this;
  req.on('success', fn);
  req.on('error', function(err){
    self.onError('xhr post error', err);
  });
  this.sendXhr = req;
};

/**
 * Starts a poll cycle.
 *
 * @api private
 */

XHR.prototype.doPoll = function(){
  debug('xhr poll');
  var req = this.request();
  var self = this;
  req.on('data', function(data){
    self.onData(data);
  });
  req.on('error', function(err){
    self.onError('xhr poll error', err);
  });
  this.pollXhr = req;
};

/**
 * Request constructor
 *
 * @param {Object} options
 * @api public
 */

function Request(opts){
  this.method = opts.method || 'GET';
  this.uri = opts.uri;
  this.xd = !!opts.xd;
  this.xs = !!opts.xs;
  this.async = false !== opts.async;
  this.data = undefined != opts.data ? opts.data : null;
  this.agent = opts.agent;
  this.isBinary = opts.isBinary;
  this.supportsBinary = opts.supportsBinary;
  this.enablesXDR = opts.enablesXDR;

  // SSL options for Node.js client
  this.pfx = opts.pfx;
  this.key = opts.key;
  this.passphrase = opts.passphrase;
  this.cert = opts.cert;
  this.ca = opts.ca;
  this.ciphers = opts.ciphers;
  this.rejectUnauthorized = opts.rejectUnauthorized;

  this.create();
}

/**
 * Mix in `Emitter`.
 */

Emitter(Request.prototype);

/**
 * Creates the XHR object and sends the request.
 *
 * @api private
 */

Request.prototype.create = function(){
  var opts = { agent: this.agent, xdomain: this.xd, xscheme: this.xs, enablesXDR: this.enablesXDR };

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;

  var xhr = this.xhr = new XMLHttpRequest(opts);
  var self = this;

  try {
    debug('xhr open %s: %s', this.method, this.uri);
    xhr.open(this.method, this.uri, this.async);
    if (this.supportsBinary) {
      // This has to be done after open because Firefox is stupid
      // http://stackoverflow.com/questions/13216903/get-binary-data-with-xmlhttprequest-in-a-firefox-extension
      xhr.responseType = 'arraybuffer';
    }

    if ('POST' == this.method) {
      try {
        if (this.isBinary) {
          xhr.setRequestHeader('Content-type', 'application/octet-stream');
        } else {
          xhr.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        }
      } catch (e) {}
    }

    // ie6 check
    if ('withCredentials' in xhr) {
      xhr.withCredentials = true;
    }

    if (this.hasXDR()) {
      xhr.onload = function(){
        self.onLoad();
      };
      xhr.onerror = function(){
        self.onError(xhr.responseText);
      };
    } else {
      xhr.onreadystatechange = function(){
        if (4 != xhr.readyState) return;
        if (200 == xhr.status || 1223 == xhr.status) {
          self.onLoad();
        } else {
          // make sure the `error` event handler that's user-set
          // does not throw in the same tick and gets caught here
          setTimeout(function(){
            self.onError(xhr.status);
          }, 0);
        }
      };
    }

    debug('xhr data %s', this.data);
    xhr.send(this.data);
  } catch (e) {
    // Need to defer since .create() is called directly fhrom the constructor
    // and thus the 'error' event can only be only bound *after* this exception
    // occurs.  Therefore, also, we cannot throw here at all.
    setTimeout(function() {
      self.onError(e);
    }, 0);
    return;
  }

  if (global.document) {
    this.index = Request.requestsCount++;
    Request.requests[this.index] = this;
  }
};

/**
 * Called upon successful response.
 *
 * @api private
 */

Request.prototype.onSuccess = function(){
  this.emit('success');
  this.cleanup();
};

/**
 * Called if we have data.
 *
 * @api private
 */

Request.prototype.onData = function(data){
  this.emit('data', data);
  this.onSuccess();
};

/**
 * Called upon error.
 *
 * @api private
 */

Request.prototype.onError = function(err){
  this.emit('error', err);
  this.cleanup(true);
};

/**
 * Cleans up house.
 *
 * @api private
 */

Request.prototype.cleanup = function(fromError){
  if ('undefined' == typeof this.xhr || null === this.xhr) {
    return;
  }
  // xmlhttprequest
  if (this.hasXDR()) {
    this.xhr.onload = this.xhr.onerror = empty;
  } else {
    this.xhr.onreadystatechange = empty;
  }

  if (fromError) {
    try {
      this.xhr.abort();
    } catch(e) {}
  }

  if (global.document) {
    delete Request.requests[this.index];
  }

  this.xhr = null;
};

/**
 * Called upon load.
 *
 * @api private
 */

Request.prototype.onLoad = function(){
  var data;
  try {
    var contentType;
    try {
      contentType = this.xhr.getResponseHeader('Content-Type').split(';')[0];
    } catch (e) {}
    if (contentType === 'application/octet-stream') {
      data = this.xhr.response;
    } else {
      if (!this.supportsBinary) {
        data = this.xhr.responseText;
      } else {
        data = 'ok';
      }
    }
  } catch (e) {
    this.onError(e);
  }
  if (null != data) {
    this.onData(data);
  }
};

/**
 * Check if it has XDomainRequest.
 *
 * @api private
 */

Request.prototype.hasXDR = function(){
  return 'undefined' !== typeof global.XDomainRequest && !this.xs && this.enablesXDR;
};

/**
 * Aborts the request.
 *
 * @api public
 */

Request.prototype.abort = function(){
  this.cleanup();
};

/**
 * Aborts pending requests when unloading the window. This is needed to prevent
 * memory leaks (e.g. when using IE) and to ensure that no spurious error is
 * emitted.
 */

if (global.document) {
  Request.requestsCount = 0;
  Request.requests = {};
  if (global.attachEvent) {
    global.attachEvent('onunload', unloadHandler);
  } else if (global.addEventListener) {
    global.addEventListener('beforeunload', unloadHandler, false);
  }
}

function unloadHandler() {
  for (var i in Request.requests) {
    if (Request.requests.hasOwnProperty(i)) {
      Request.requests[i].abort();
    }
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./polling":91,"component-emitter":82,"component-inherit":94,"debug":95,"xmlhttprequest":93}],91:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js", module);
(function(){
/**
 * Module dependencies.
 */

var Transport = require('../transport');
var parseqs = require('parseqs');
var parser = require('engine.io-parser');
var inherit = require('component-inherit');
var debug = require('debug')('engine.io-client:polling');

/**
 * Module exports.
 */

module.exports = Polling;

/**
 * Is XHR2 supported?
 */

var hasXHR2 = (function() {
  var XMLHttpRequest = require('xmlhttprequest');
  var xhr = new XMLHttpRequest({ xdomain: false });
  return null != xhr.responseType;
})();

/**
 * Polling interface.
 *
 * @param {Object} opts
 * @api private
 */

function Polling(opts){
  var forceBase64 = (opts && opts.forceBase64);
  if (!hasXHR2 || forceBase64) {
    this.supportsBinary = false;
  }
  Transport.call(this, opts);
}

/**
 * Inherits from Transport.
 */

inherit(Polling, Transport);

/**
 * Transport name.
 */

Polling.prototype.name = 'polling';

/**
 * Opens the socket (triggers polling). We write a PING message to determine
 * when the transport is open.
 *
 * @api private
 */

Polling.prototype.doOpen = function(){
  this.poll();
};

/**
 * Pauses polling.
 *
 * @param {Function} callback upon buffers are flushed and transport is paused
 * @api private
 */

Polling.prototype.pause = function(onPause){
  var pending = 0;
  var self = this;

  this.readyState = 'pausing';

  function pause(){
    debug('paused');
    self.readyState = 'paused';
    onPause();
  }

  if (this.polling || !this.writable) {
    var total = 0;

    if (this.polling) {
      debug('we are currently polling - waiting to pause');
      total++;
      this.once('pollComplete', function(){
        debug('pre-pause polling complete');
        --total || pause();
      });
    }

    if (!this.writable) {
      debug('we are currently writing - waiting to pause');
      total++;
      this.once('drain', function(){
        debug('pre-pause writing complete');
        --total || pause();
      });
    }
  } else {
    pause();
  }
};

/**
 * Starts polling cycle.
 *
 * @api public
 */

Polling.prototype.poll = function(){
  debug('polling');
  this.polling = true;
  this.doPoll();
  this.emit('poll');
};

/**
 * Overloads onData to detect payloads.
 *
 * @api private
 */

Polling.prototype.onData = function(data){
  var self = this;
  debug('polling got data %s', data);
  var callback = function(packet, index, total) {
    // if its the first message we consider the transport open
    if ('opening' == self.readyState) {
      self.onOpen();
    }

    // if its a close packet, we close the ongoing requests
    if ('close' == packet.type) {
      self.onClose();
      return false;
    }

    // otherwise bypass onData and handle the message
    self.onPacket(packet);
  };

  // decode payload
  parser.decodePayload(data, this.socket.binaryType, callback);

  // if an event did not trigger closing
  if ('closed' != this.readyState) {
    // if we got data we're not polling
    this.polling = false;
    this.emit('pollComplete');

    if ('open' == this.readyState) {
      this.poll();
    } else {
      debug('ignoring poll - transport state "%s"', this.readyState);
    }
  }
};

/**
 * For polling, send a close packet.
 *
 * @api private
 */

Polling.prototype.doClose = function(){
  var self = this;

  function close(){
    debug('writing close packet');
    self.write([{ type: 'close' }]);
  }

  if ('open' == this.readyState) {
    debug('transport open - closing');
    close();
  } else {
    // in case we're trying to close while
    // handshaking is in progress (GH-164)
    debug('transport not open - deferring close');
    this.once('open', close);
  }
};

/**
 * Writes a packets payload.
 *
 * @param {Array} data packets
 * @param {Function} drain callback
 * @api private
 */

Polling.prototype.write = function(packets){
  var self = this;
  this.writable = false;
  var callbackfn = function() {
    self.writable = true;
    self.emit('drain');
  };

  var self = this;
  parser.encodePayload(packets, this.supportsBinary, function(data) {
    self.doWrite(data, callbackfn);
  });
};

/**
 * Generates uri for connection.
 *
 * @api private
 */

Polling.prototype.uri = function(){
  var query = this.query || {};
  var schema = this.secure ? 'https' : 'http';
  var port = '';

  // cache busting is forced
  if (false !== this.timestampRequests) {
    query[this.timestampParam] = +new Date + '-' + Transport.timestamps++;
  }

  if (!this.supportsBinary && !query.sid) {
    query.b64 = 1;
  }

  query = parseqs.encode(query);

  // avoid port if default for schema
  if (this.port && (('https' == schema && this.port != 443) ||
     ('http' == schema && this.port != 80))) {
    port = ':' + this.port;
  }

  // prepend ? to query
  if (query.length) {
    query = '?' + query;
  }

  return schema + '://' + this.hostname + port + this.path + query;
};

}).apply(this, arguments);

},{"../transport":87,"component-inherit":94,"debug":95,"engine.io-parser":98,"parseqs":108,"xmlhttprequest":93}],92:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js", module);
(function(){
/**
 * Module dependencies.
 */

var Transport = require('../transport');
var parser = require('engine.io-parser');
var parseqs = require('parseqs');
var inherit = require('component-inherit');
var debug = require('debug')('engine.io-client:websocket');

/**
 * `ws` exposes a WebSocket-compatible interface in
 * Node, or the `WebSocket` or `MozWebSocket` globals
 * in the browser.
 */

var WebSocket = require('ws');

/**
 * Module exports.
 */

module.exports = WS;

/**
 * WebSocket transport constructor.
 *
 * @api {Object} connection options
 * @api public
 */

function WS(opts){
  var forceBase64 = (opts && opts.forceBase64);
  if (forceBase64) {
    this.supportsBinary = false;
  }
  Transport.call(this, opts);
}

/**
 * Inherits from Transport.
 */

inherit(WS, Transport);

/**
 * Transport name.
 *
 * @api public
 */

WS.prototype.name = 'websocket';

/*
 * WebSockets support binary
 */

WS.prototype.supportsBinary = true;

/**
 * Opens socket.
 *
 * @api private
 */

WS.prototype.doOpen = function(){
  if (!this.check()) {
    // let probe timeout
    return;
  }

  var self = this;
  var uri = this.uri();
  var protocols = void(0);
  var opts = { agent: this.agent };

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;

  this.ws = new WebSocket(uri, protocols, opts);

  if (this.ws.binaryType === undefined) {
    this.supportsBinary = false;
  }

  this.ws.binaryType = 'arraybuffer';
  this.addEventListeners();
};

/**
 * Adds event listeners to the socket
 *
 * @api private
 */

WS.prototype.addEventListeners = function(){
  var self = this;

  this.ws.onopen = function(){
    self.onOpen();
  };
  this.ws.onclose = function(){
    self.onClose();
  };
  this.ws.onmessage = function(ev){
    self.onData(ev.data);
  };
  this.ws.onerror = function(e){
    self.onError('websocket error', e);
  };
};

/**
 * Override `onData` to use a timer on iOS.
 * See: https://gist.github.com/mloughran/2052006
 *
 * @api private
 */

if ('undefined' != typeof navigator
  && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
  WS.prototype.onData = function(data){
    var self = this;
    setTimeout(function(){
      Transport.prototype.onData.call(self, data);
    }, 0);
  };
}

/**
 * Writes data to socket.
 *
 * @param {Array} array of packets.
 * @api private
 */

WS.prototype.write = function(packets){
  var self = this;
  this.writable = false;
  // encodePacket efficient as it uses WS framing
  // no need for encodePayload
  for (var i = 0, l = packets.length; i < l; i++) {
    parser.encodePacket(packets[i], this.supportsBinary, function(data) {
      //Sometimes the websocket has already been closed but the browser didn't
      //have a chance of informing us about it yet, in that case send will
      //throw an error
      try {
        self.ws.send(data);
      } catch (e){
        debug('websocket closed before onclose event');
      }
    });
  }

  function ondrain() {
    self.writable = true;
    self.emit('drain');
  }
  // fake drain
  // defer to next tick to allow Socket to clear writeBuffer
  setTimeout(ondrain, 0);
};

/**
 * Called upon close
 *
 * @api private
 */

WS.prototype.onClose = function(){
  Transport.prototype.onClose.call(this);
};

/**
 * Closes socket.
 *
 * @api private
 */

WS.prototype.doClose = function(){
  if (typeof this.ws !== 'undefined') {
    this.ws.close();
  }
};

/**
 * Generates uri for connection.
 *
 * @api private
 */

WS.prototype.uri = function(){
  var query = this.query || {};
  var schema = this.secure ? 'wss' : 'ws';
  var port = '';

  // avoid port if default for schema
  if (this.port && (('wss' == schema && this.port != 443)
    || ('ws' == schema && this.port != 80))) {
    port = ':' + this.port;
  }

  // append timestamp to URI
  if (this.timestampRequests) {
    query[this.timestampParam] = +new Date;
  }

  // communicate binary support capabilities
  if (!this.supportsBinary) {
    query.b64 = 1;
  }

  query = parseqs.encode(query);

  // prepend ? to query
  if (query.length) {
    query = '?' + query;
  }

  return schema + '://' + this.hostname + port + this.path + query;
};

/**
 * Feature detection for WebSocket.
 *
 * @return {Boolean} whether this transport is available.
 * @api public
 */

WS.prototype.check = function(){
  return !!WebSocket && !('__initialize' in WebSocket && this.name === WS.prototype.name);
};

}).apply(this, arguments);

},{"../transport":87,"component-inherit":94,"debug":95,"engine.io-parser":98,"parseqs":108,"ws":110}],93:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\xmlhttprequest.js", module);
(function(){
// browser shim for xmlhttprequest module
var hasCORS = require('has-cors');

module.exports = function(opts) {
  var xdomain = opts.xdomain;

  // scheme must be same when usign XDomainRequest
  // http://blogs.msdn.com/b/ieinternals/archive/2010/05/13/xdomainrequest-restrictions-limitations-and-workarounds.aspx
  var xscheme = opts.xscheme;

  // XDomainRequest has a flow of not sending cookie, therefore it should be disabled as a default.
  // https://github.com/Automattic/engine.io-client/pull/217
  var enablesXDR = opts.enablesXDR;

  // XMLHttpRequest can be disabled on IE
  try {
    if ('undefined' != typeof XMLHttpRequest && (!xdomain || hasCORS)) {
      return new XMLHttpRequest();
    }
  } catch (e) { }

  // Use XDomainRequest for IE8 if enablesXDR is true
  // because loading bar keeps flashing when using jsonp-polling
  // https://github.com/yujiosaka/socke.io-ie8-loading-example
  try {
    if ('undefined' != typeof XDomainRequest && !xscheme && enablesXDR) {
      return new XDomainRequest();
    }
  } catch (e) { }

  if (!xdomain) {
    try {
      return new ActiveXObject('Microsoft.XMLHTTP');
    } catch(e) { }
  }
}

}).apply(this, arguments);

},{"has-cors":105}],94:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\component-inherit\\index.js", module);
(function(){

module.exports = function(a, b){
  var fn = function(){};
  fn.prototype = b.prototype;
  a.prototype = new fn;
  a.prototype.constructor = a;
};
}).apply(this, arguments);

},{}],95:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\browser.js", module);
(function(){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // This hackery is required for IE8,
  // where the `console.log` function doesn't have 'apply'
  return 'object' == typeof console
    && 'function' == typeof console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      localStorage.removeItem('debug');
    } else {
      localStorage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = localStorage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

}).apply(this, arguments);

},{"./debug":96}],96:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\debug.js", module);
(function(){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

}).apply(this, arguments);

},{"ms":97}],97:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\node_modules\\ms\\index.js", module);
(function(){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

}).apply(this, arguments);

},{}],98:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js", module);
(function(){
(function (global){
/**
 * Module dependencies.
 */

var keys = require('./keys');
var hasBinary = require('has-binary');
var sliceBuffer = require('arraybuffer.slice');
var base64encoder = require('base64-arraybuffer');
var after = require('after');
var utf8 = require('utf8');

/**
 * Check if we are running an android browser. That requires us to use
 * ArrayBuffer with polling transports...
 *
 * http://ghinda.net/jpeg-blob-ajax-android/
 */

var isAndroid = navigator.userAgent.match(/Android/i);

/**
 * Check if we are running in PhantomJS.
 * Uploading a Blob with PhantomJS does not work correctly, as reported here:
 * https://github.com/ariya/phantomjs/issues/11395
 * @type boolean
 */
var isPhantomJS = /PhantomJS/i.test(navigator.userAgent);

/**
 * When true, avoids using Blobs to encode payloads.
 * @type boolean
 */
var dontSendBlobs = isAndroid || isPhantomJS;

/**
 * Current protocol version.
 */

exports.protocol = 3;

/**
 * Packet types.
 */

var packets = exports.packets = {
    open:     0    // non-ws
  , close:    1    // non-ws
  , ping:     2
  , pong:     3
  , message:  4
  , upgrade:  5
  , noop:     6
};

var packetslist = keys(packets);

/**
 * Premade error packet.
 */

var err = { type: 'error', data: 'parser error' };

/**
 * Create a blob api even for blob builder when vendor prefixes exist
 */

var Blob = require('blob');

/**
 * Encodes a packet.
 *
 *     <packet type id> [ <data> ]
 *
 * Example:
 *
 *     5hello world
 *     3
 *     4
 *
 * Binary is encoded in an identical principle
 *
 * @api private
 */

exports.encodePacket = function (packet, supportsBinary, utf8encode, callback) {
  if ('function' == typeof supportsBinary) {
    callback = supportsBinary;
    supportsBinary = false;
  }

  if ('function' == typeof utf8encode) {
    callback = utf8encode;
    utf8encode = null;
  }

  var data = (packet.data === undefined)
    ? undefined
    : packet.data.buffer || packet.data;

  if (global.ArrayBuffer && data instanceof ArrayBuffer) {
    return encodeArrayBuffer(packet, supportsBinary, callback);
  } else if (Blob && data instanceof global.Blob) {
    return encodeBlob(packet, supportsBinary, callback);
  }

  // might be an object with { base64: true, data: dataAsBase64String }
  if (data && data.base64) {
    return encodeBase64Object(packet, callback);
  }

  // Sending data as a utf-8 string
  var encoded = packets[packet.type];

  // data fragment is optional
  if (undefined !== packet.data) {
    encoded += utf8encode ? utf8.encode(String(packet.data)) : String(packet.data);
  }

  return callback('' + encoded);

};

function encodeBase64Object(packet, callback) {
  // packet data is an object { base64: true, data: dataAsBase64String }
  var message = 'b' + exports.packets[packet.type] + packet.data.data;
  return callback(message);
}

/**
 * Encode packet helpers for binary types
 */

function encodeArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var data = packet.data;
  var contentArray = new Uint8Array(data);
  var resultBuffer = new Uint8Array(1 + data.byteLength);

  resultBuffer[0] = packets[packet.type];
  for (var i = 0; i < contentArray.length; i++) {
    resultBuffer[i+1] = contentArray[i];
  }

  return callback(resultBuffer.buffer);
}

function encodeBlobAsArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var fr = new FileReader();
  fr.onload = function() {
    packet.data = fr.result;
    exports.encodePacket(packet, supportsBinary, true, callback);
  };
  return fr.readAsArrayBuffer(packet.data);
}

function encodeBlob(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  if (dontSendBlobs) {
    return encodeBlobAsArrayBuffer(packet, supportsBinary, callback);
  }

  var length = new Uint8Array(1);
  length[0] = packets[packet.type];
  var blob = new Blob([length.buffer, packet.data]);

  return callback(blob);
}

/**
 * Encodes a packet with binary data in a base64 string
 *
 * @param {Object} packet, has `type` and `data`
 * @return {String} base64 encoded message
 */

exports.encodeBase64Packet = function(packet, callback) {
  var message = 'b' + exports.packets[packet.type];
  if (Blob && packet.data instanceof Blob) {
    var fr = new FileReader();
    fr.onload = function() {
      var b64 = fr.result.split(',')[1];
      callback(message + b64);
    };
    return fr.readAsDataURL(packet.data);
  }

  var b64data;
  try {
    b64data = String.fromCharCode.apply(null, new Uint8Array(packet.data));
  } catch (e) {
    // iPhone Safari doesn't let you apply with typed arrays
    var typed = new Uint8Array(packet.data);
    var basic = new Array(typed.length);
    for (var i = 0; i < typed.length; i++) {
      basic[i] = typed[i];
    }
    b64data = String.fromCharCode.apply(null, basic);
  }
  message += global.btoa(b64data);
  return callback(message);
};

/**
 * Decodes a packet. Changes format to Blob if requested.
 *
 * @return {Object} with `type` and `data` (if any)
 * @api private
 */

exports.decodePacket = function (data, binaryType, utf8decode) {
  // String data
  if (typeof data == 'string' || data === undefined) {
    if (data.charAt(0) == 'b') {
      return exports.decodeBase64Packet(data.substr(1), binaryType);
    }

    if (utf8decode) {
      try {
        data = utf8.decode(data);
      } catch (e) {
        return err;
      }
    }
    var type = data.charAt(0);

    if (Number(type) != type || !packetslist[type]) {
      return err;
    }

    if (data.length > 1) {
      return { type: packetslist[type], data: data.substring(1) };
    } else {
      return { type: packetslist[type] };
    }
  }

  var asArray = new Uint8Array(data);
  var type = asArray[0];
  var rest = sliceBuffer(data, 1);
  if (Blob && binaryType === 'blob') {
    rest = new Blob([rest]);
  }
  return { type: packetslist[type], data: rest };
};

/**
 * Decodes a packet encoded in a base64 string
 *
 * @param {String} base64 encoded message
 * @return {Object} with `type` and `data` (if any)
 */

exports.decodeBase64Packet = function(msg, binaryType) {
  var type = packetslist[msg.charAt(0)];
  if (!global.ArrayBuffer) {
    return { type: type, data: { base64: true, data: msg.substr(1) } };
  }

  var data = base64encoder.decode(msg.substr(1));

  if (binaryType === 'blob' && Blob) {
    data = new Blob([data]);
  }

  return { type: type, data: data };
};

/**
 * Encodes multiple messages (payload).
 *
 *     <length>:data
 *
 * Example:
 *
 *     11:hello world2:hi
 *
 * If any contents are binary, they will be encoded as base64 strings. Base64
 * encoded strings are marked with a b before the length specifier
 *
 * @param {Array} packets
 * @api private
 */

exports.encodePayload = function (packets, supportsBinary, callback) {
  if (typeof supportsBinary == 'function') {
    callback = supportsBinary;
    supportsBinary = null;
  }

  var isBinary = hasBinary(packets);

  if (supportsBinary && isBinary) {
    if (Blob && !dontSendBlobs) {
      return exports.encodePayloadAsBlob(packets, callback);
    }

    return exports.encodePayloadAsArrayBuffer(packets, callback);
  }

  if (!packets.length) {
    return callback('0:');
  }

  function setLengthHeader(message) {
    return message.length + ':' + message;
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, !isBinary ? false : supportsBinary, true, function(message) {
      doneCallback(null, setLengthHeader(message));
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(results.join(''));
  });
};

/**
 * Async array map using after
 */

function map(ary, each, done) {
  var result = new Array(ary.length);
  var next = after(ary.length, done);

  var eachWithIndex = function(i, el, cb) {
    each(el, function(error, msg) {
      result[i] = msg;
      cb(error, result);
    });
  };

  for (var i = 0; i < ary.length; i++) {
    eachWithIndex(i, ary[i], next);
  }
}

/*
 * Decodes data when a payload is maybe expected. Possible binary contents are
 * decoded from their base64 representation
 *
 * @param {String} data, callback method
 * @api public
 */

exports.decodePayload = function (data, binaryType, callback) {
  if (typeof data != 'string') {
    return exports.decodePayloadAsBinary(data, binaryType, callback);
  }

  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var packet;
  if (data == '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

  var length = ''
    , n, msg;

  for (var i = 0, l = data.length; i < l; i++) {
    var chr = data.charAt(i);

    if (':' != chr) {
      length += chr;
    } else {
      if ('' == length || (length != (n = Number(length)))) {
        // parser error - ignoring payload
        return callback(err, 0, 1);
      }

      msg = data.substr(i + 1, n);

      if (length != msg.length) {
        // parser error - ignoring payload
        return callback(err, 0, 1);
      }

      if (msg.length) {
        packet = exports.decodePacket(msg, binaryType, true);

        if (err.type == packet.type && err.data == packet.data) {
          // parser error in individual packet - ignoring payload
          return callback(err, 0, 1);
        }

        var ret = callback(packet, i + n, l);
        if (false === ret) return;
      }

      // advance cursor
      i += n;
      length = '';
    }
  }

  if (length != '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

};

/**
 * Encodes multiple messages (payload) as binary.
 *
 * <1 = binary, 0 = string><number from 0-9><number from 0-9>[...]<number
 * 255><data>
 *
 * Example:
 * 1 3 255 1 2 3, if the binary contents are interpreted as 8 bit integers
 *
 * @param {Array} packets
 * @return {ArrayBuffer} encoded payload
 * @api private
 */

exports.encodePayloadAsArrayBuffer = function(packets, callback) {
  if (!packets.length) {
    return callback(new ArrayBuffer(0));
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(data) {
      return doneCallback(null, data);
    });
  }

  map(packets, encodeOne, function(err, encodedPackets) {
    var totalLength = encodedPackets.reduce(function(acc, p) {
      var len;
      if (typeof p === 'string'){
        len = p.length;
      } else {
        len = p.byteLength;
      }
      return acc + len.toString().length + len + 2; // string/binary identifier + separator = 2
    }, 0);

    var resultArray = new Uint8Array(totalLength);

    var bufferIndex = 0;
    encodedPackets.forEach(function(p) {
      var isString = typeof p === 'string';
      var ab = p;
      if (isString) {
        var view = new Uint8Array(p.length);
        for (var i = 0; i < p.length; i++) {
          view[i] = p.charCodeAt(i);
        }
        ab = view.buffer;
      }

      if (isString) { // not true binary
        resultArray[bufferIndex++] = 0;
      } else { // true binary
        resultArray[bufferIndex++] = 1;
      }

      var lenStr = ab.byteLength.toString();
      for (var i = 0; i < lenStr.length; i++) {
        resultArray[bufferIndex++] = parseInt(lenStr[i]);
      }
      resultArray[bufferIndex++] = 255;

      var view = new Uint8Array(ab);
      for (var i = 0; i < view.length; i++) {
        resultArray[bufferIndex++] = view[i];
      }
    });

    return callback(resultArray.buffer);
  });
};

/**
 * Encode as Blob
 */

exports.encodePayloadAsBlob = function(packets, callback) {
  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(encoded) {
      var binaryIdentifier = new Uint8Array(1);
      binaryIdentifier[0] = 1;
      if (typeof encoded === 'string') {
        var view = new Uint8Array(encoded.length);
        for (var i = 0; i < encoded.length; i++) {
          view[i] = encoded.charCodeAt(i);
        }
        encoded = view.buffer;
        binaryIdentifier[0] = 0;
      }

      var len = (encoded instanceof ArrayBuffer)
        ? encoded.byteLength
        : encoded.size;

      var lenStr = len.toString();
      var lengthAry = new Uint8Array(lenStr.length + 1);
      for (var i = 0; i < lenStr.length; i++) {
        lengthAry[i] = parseInt(lenStr[i]);
      }
      lengthAry[lenStr.length] = 255;

      if (Blob) {
        var blob = new Blob([binaryIdentifier.buffer, lengthAry.buffer, encoded]);
        doneCallback(null, blob);
      }
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(new Blob(results));
  });
};

/*
 * Decodes data when a payload is maybe expected. Strings are decoded by
 * interpreting each byte as a key code for entries marked to start with 0. See
 * description of encodePayloadAsBinary
 *
 * @param {ArrayBuffer} data, callback method
 * @api public
 */

exports.decodePayloadAsBinary = function (data, binaryType, callback) {
  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var bufferTail = data;
  var buffers = [];

  var numberTooLong = false;
  while (bufferTail.byteLength > 0) {
    var tailArray = new Uint8Array(bufferTail);
    var isString = tailArray[0] === 0;
    var msgLength = '';

    for (var i = 1; ; i++) {
      if (tailArray[i] == 255) break;

      if (msgLength.length > 310) {
        numberTooLong = true;
        break;
      }

      msgLength += tailArray[i];
    }

    if(numberTooLong) return callback(err, 0, 1);

    bufferTail = sliceBuffer(bufferTail, 2 + msgLength.length);
    msgLength = parseInt(msgLength);

    var msg = sliceBuffer(bufferTail, 0, msgLength);
    if (isString) {
      try {
        msg = String.fromCharCode.apply(null, new Uint8Array(msg));
      } catch (e) {
        // iPhone Safari doesn't let you apply to typed arrays
        var typed = new Uint8Array(msg);
        msg = '';
        for (var i = 0; i < typed.length; i++) {
          msg += String.fromCharCode(typed[i]);
        }
      }
    }

    buffers.push(msg);
    bufferTail = sliceBuffer(bufferTail, msgLength);
  }

  var total = buffers.length;
  buffers.forEach(function(buffer, i) {
    callback(exports.decodePacket(buffer, binaryType, true), i, total);
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./keys":99,"after":100,"arraybuffer.slice":101,"base64-arraybuffer":102,"blob":103,"has-binary":111,"utf8":104}],99:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\keys.js", module);
(function(){

/**
 * Gets the keys for an object.
 *
 * @return {Array} keys
 * @api private
 */

module.exports = Object.keys || function keys (obj){
  var arr = [];
  var has = Object.prototype.hasOwnProperty;

  for (var i in obj) {
    if (has.call(obj, i)) {
      arr.push(i);
    }
  }
  return arr;
};

}).apply(this, arguments);

},{}],100:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\after\\index.js", module);
(function(){
module.exports = after

function after(count, callback, err_cb) {
    var bail = false
    err_cb = err_cb || noop
    proxy.count = count

    return (count === 0) ? callback() : proxy

    function proxy(err, result) {
        if (proxy.count <= 0) {
            throw new Error('after called too many times')
        }
        --proxy.count

        // after first error, rest are passed to err_cb
        if (err) {
            bail = true
            callback(err)
            // future error callbacks will go to error handler
            callback = err_cb
        } else if (proxy.count === 0 && !bail) {
            callback(null, result)
        }
    }
}

function noop() {}

}).apply(this, arguments);

},{}],101:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\arraybuffer.slice\\index.js", module);
(function(){
/**
 * An abstraction for slicing an arraybuffer even when
 * ArrayBuffer.prototype.slice is not supported
 *
 * @api public
 */

module.exports = function(arraybuffer, start, end) {
  var bytes = arraybuffer.byteLength;
  start = start || 0;
  end = end || bytes;

  if (arraybuffer.slice) { return arraybuffer.slice(start, end); }

  if (start < 0) { start += bytes; }
  if (end < 0) { end += bytes; }
  if (end > bytes) { end = bytes; }

  if (start >= bytes || start >= end || bytes === 0) {
    return new ArrayBuffer(0);
  }

  var abv = new Uint8Array(arraybuffer);
  var result = new Uint8Array(end - start);
  for (var i = start, ii = 0; i < end; i++, ii++) {
    result[ii] = abv[i];
  }
  return result.buffer;
};

}).apply(this, arguments);

},{}],102:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\base64-arraybuffer\\lib\\base64-arraybuffer.js", module);
(function(){
/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */
(function(chars){
  "use strict";

  exports.encode = function(arraybuffer) {
    var bytes = new Uint8Array(arraybuffer),
    i, len = bytes.length, base64 = "";

    for (i = 0; i < len; i+=3) {
      base64 += chars[bytes[i] >> 2];
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64 += chars[bytes[i + 2] & 63];
    }

    if ((len % 3) === 2) {
      base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (len % 3 === 1) {
      base64 = base64.substring(0, base64.length - 2) + "==";
    }

    return base64;
  };

  exports.decode =  function(base64) {
    var bufferLength = base64.length * 0.75,
    len = base64.length, i, p = 0,
    encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }

    var arraybuffer = new ArrayBuffer(bufferLength),
    bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i+=4) {
      encoded1 = chars.indexOf(base64[i]);
      encoded2 = chars.indexOf(base64[i+1]);
      encoded3 = chars.indexOf(base64[i+2]);
      encoded4 = chars.indexOf(base64[i+3]);

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return arraybuffer;
  };
})("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");

}).apply(this, arguments);

},{}],103:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\blob\\index.js", module);
(function(){
(function (global){
/**
 * Create a blob builder even when vendor prefixes exist
 */

var BlobBuilder = global.BlobBuilder
  || global.WebKitBlobBuilder
  || global.MSBlobBuilder
  || global.MozBlobBuilder;

/**
 * Check if Blob constructor is supported
 */

var blobSupported = (function() {
  try {
    var a = new Blob(['hi']);
    return a.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if Blob constructor supports ArrayBufferViews
 * Fails in Safari 6, so we need to map to ArrayBuffers there.
 */

var blobSupportsArrayBufferView = blobSupported && (function() {
  try {
    var b = new Blob([new Uint8Array([1,2])]);
    return b.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if BlobBuilder is supported
 */

var blobBuilderSupported = BlobBuilder
  && BlobBuilder.prototype.append
  && BlobBuilder.prototype.getBlob;

/**
 * Helper function that maps ArrayBufferViews to ArrayBuffers
 * Used by BlobBuilder constructor and old browsers that didn't
 * support it in the Blob constructor.
 */

function mapArrayBufferViews(ary) {
  for (var i = 0; i < ary.length; i++) {
    var chunk = ary[i];
    if (chunk.buffer instanceof ArrayBuffer) {
      var buf = chunk.buffer;

      // if this is a subarray, make a copy so we only
      // include the subarray region from the underlying buffer
      if (chunk.byteLength !== buf.byteLength) {
        var copy = new Uint8Array(chunk.byteLength);
        copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
        buf = copy.buffer;
      }

      ary[i] = buf;
    }
  }
}

function BlobBuilderConstructor(ary, options) {
  options = options || {};

  var bb = new BlobBuilder();
  mapArrayBufferViews(ary);

  for (var i = 0; i < ary.length; i++) {
    bb.append(ary[i]);
  }

  return (options.type) ? bb.getBlob(options.type) : bb.getBlob();
};

function BlobConstructor(ary, options) {
  mapArrayBufferViews(ary);
  return new Blob(ary, options || {});
};

module.exports = (function() {
  if (blobSupported) {
    return blobSupportsArrayBufferView ? global.Blob : BlobConstructor;
  } else if (blobBuilderSupported) {
    return BlobBuilderConstructor;
  } else {
    return undefined;
  }
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{}],104:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\utf8\\utf8.js", module);
(function(){
(function (global){
/*! https://mths.be/utf8js v2.0.0 by @mathias */
;(function(root) {

	// Detect free variables `exports`
	var freeExports = typeof exports == 'object' && exports;

	// Detect free variable `module`
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;

	// Detect free variable `global`, from Node.js or Browserified code,
	// and use it as `root`
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/*--------------------------------------------------------------------------*/

	var stringFromCharCode = String.fromCharCode;

	// Taken from https://mths.be/punycode
	function ucs2decode(string) {
		var output = [];
		var counter = 0;
		var length = string.length;
		var value;
		var extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	// Taken from https://mths.be/punycode
	function ucs2encode(array) {
		var length = array.length;
		var index = -1;
		var value;
		var output = '';
		while (++index < length) {
			value = array[index];
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
		}
		return output;
	}

	function checkScalarValue(codePoint) {
		if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
			throw Error(
				'Lone surrogate U+' + codePoint.toString(16).toUpperCase() +
				' is not a scalar value'
			);
		}
	}
	/*--------------------------------------------------------------------------*/

	function createByte(codePoint, shift) {
		return stringFromCharCode(((codePoint >> shift) & 0x3F) | 0x80);
	}

	function encodeCodePoint(codePoint) {
		if ((codePoint & 0xFFFFFF80) == 0) { // 1-byte sequence
			return stringFromCharCode(codePoint);
		}
		var symbol = '';
		if ((codePoint & 0xFFFFF800) == 0) { // 2-byte sequence
			symbol = stringFromCharCode(((codePoint >> 6) & 0x1F) | 0xC0);
		}
		else if ((codePoint & 0xFFFF0000) == 0) { // 3-byte sequence
			checkScalarValue(codePoint);
			symbol = stringFromCharCode(((codePoint >> 12) & 0x0F) | 0xE0);
			symbol += createByte(codePoint, 6);
		}
		else if ((codePoint & 0xFFE00000) == 0) { // 4-byte sequence
			symbol = stringFromCharCode(((codePoint >> 18) & 0x07) | 0xF0);
			symbol += createByte(codePoint, 12);
			symbol += createByte(codePoint, 6);
		}
		symbol += stringFromCharCode((codePoint & 0x3F) | 0x80);
		return symbol;
	}

	function utf8encode(string) {
		var codePoints = ucs2decode(string);
		var length = codePoints.length;
		var index = -1;
		var codePoint;
		var byteString = '';
		while (++index < length) {
			codePoint = codePoints[index];
			byteString += encodeCodePoint(codePoint);
		}
		return byteString;
	}

	/*--------------------------------------------------------------------------*/

	function readContinuationByte() {
		if (byteIndex >= byteCount) {
			throw Error('Invalid byte index');
		}

		var continuationByte = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		if ((continuationByte & 0xC0) == 0x80) {
			return continuationByte & 0x3F;
		}

		// If we end up here, it’s not a continuation byte
		throw Error('Invalid continuation byte');
	}

	function decodeSymbol() {
		var byte1;
		var byte2;
		var byte3;
		var byte4;
		var codePoint;

		if (byteIndex > byteCount) {
			throw Error('Invalid byte index');
		}

		if (byteIndex == byteCount) {
			return false;
		}

		// Read first byte
		byte1 = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		// 1-byte sequence (no continuation bytes)
		if ((byte1 & 0x80) == 0) {
			return byte1;
		}

		// 2-byte sequence
		if ((byte1 & 0xE0) == 0xC0) {
			var byte2 = readContinuationByte();
			codePoint = ((byte1 & 0x1F) << 6) | byte2;
			if (codePoint >= 0x80) {
				return codePoint;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 3-byte sequence (may include unpaired surrogates)
		if ((byte1 & 0xF0) == 0xE0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
			if (codePoint >= 0x0800) {
				checkScalarValue(codePoint);
				return codePoint;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 4-byte sequence
		if ((byte1 & 0xF8) == 0xF0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			byte4 = readContinuationByte();
			codePoint = ((byte1 & 0x0F) << 0x12) | (byte2 << 0x0C) |
				(byte3 << 0x06) | byte4;
			if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
				return codePoint;
			}
		}

		throw Error('Invalid UTF-8 detected');
	}

	var byteArray;
	var byteCount;
	var byteIndex;
	function utf8decode(byteString) {
		byteArray = ucs2decode(byteString);
		byteCount = byteArray.length;
		byteIndex = 0;
		var codePoints = [];
		var tmp;
		while ((tmp = decodeSymbol()) !== false) {
			codePoints.push(tmp);
		}
		return ucs2encode(codePoints);
	}

	/*--------------------------------------------------------------------------*/

	var utf8 = {
		'version': '2.0.0',
		'encode': utf8encode,
		'decode': utf8decode
	};

	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return utf8;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = utf8;
		} else { // in Narwhal or RingoJS v0.7.0-
			var object = {};
			var hasOwnProperty = object.hasOwnProperty;
			for (var key in utf8) {
				hasOwnProperty.call(utf8, key) && (freeExports[key] = utf8[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.utf8 = utf8;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{}],105:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\has-cors\\index.js", module);
(function(){

/**
 * Module dependencies.
 */

var global = require('global');

/**
 * Module exports.
 *
 * Logic borrowed from Modernizr:
 *
 *   - https://github.com/Modernizr/Modernizr/blob/master/feature-detects/cors.js
 */

try {
  module.exports = 'XMLHttpRequest' in global &&
    'withCredentials' in new global.XMLHttpRequest();
} catch (err) {
  // if XMLHttp support is disabled in IE then it will throw
  // when trying to create
  module.exports = false;
}

}).apply(this, arguments);

},{"global":106}],106:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\has-cors\\node_modules\\global\\index.js", module);
(function(){

/**
 * Returns `this`. Execute this without a "context" (i.e. without it being
 * attached to an object of the left-hand side), and `this` points to the
 * "global" scope of the current JS execution.
 */

module.exports = (function () { return this; })();

}).apply(this, arguments);

},{}],107:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parsejson\\index.js", module);
(function(){
(function (global){
/**
 * JSON parse.
 *
 * @see Based on jQuery#parseJSON (MIT) and JSON2
 * @api private
 */

var rvalidchars = /^[\],:{}\s]*$/;
var rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
var rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
var rtrimLeft = /^\s+/;
var rtrimRight = /\s+$/;

module.exports = function parsejson(data) {
  if ('string' != typeof data || !data) {
    return null;
  }

  data = data.replace(rtrimLeft, '').replace(rtrimRight, '');

  // Attempt to parse using the native JSON parser first
  if (global.JSON && JSON.parse) {
    return JSON.parse(data);
  }

  if (rvalidchars.test(data.replace(rvalidescape, '@')
      .replace(rvalidtokens, ']')
      .replace(rvalidbraces, ''))) {
    return (new Function('return ' + data))();
  }
};
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{}],108:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parseqs\\index.js", module);
(function(){
/**
 * Compiles a querystring
 * Returns string representation of the object
 *
 * @param {Object}
 * @api private
 */

exports.encode = function (obj) {
  var str = '';

  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      if (str.length) str += '&';
      str += encodeURIComponent(i) + '=' + encodeURIComponent(obj[i]);
    }
  }

  return str;
};

/**
 * Parses a simple querystring into an object
 *
 * @param {String} qs
 * @api private
 */

exports.decode = function(qs){
  var qry = {};
  var pairs = qs.split('&');
  for (var i = 0, l = pairs.length; i < l; i++) {
    var pair = pairs[i].split('=');
    qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return qry;
};

}).apply(this, arguments);

},{}],109:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parseuri\\index.js", module);
(function(){
/**
 * Parses an URI
 *
 * @author Steven Levithan <stevenlevithan.com> (MIT license)
 * @api private
 */

var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

var parts = [
    'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
];

module.exports = function parseuri(str) {
    var src = str,
        b = str.indexOf('['),
        e = str.indexOf(']');

    if (b != -1 && e != -1) {
        str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ';') + str.substring(e, str.length);
    }

    var m = re.exec(str || ''),
        uri = {},
        i = 14;

    while (i--) {
        uri[parts[i]] = m[i] || '';
    }

    if (b != -1 && e != -1) {
        uri.source = src;
        uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ':');
        uri.authority = uri.authority.replace('[', '').replace(']', '').replace(/;/g, ':');
        uri.ipv6uri = true;
    }

    return uri;
};

}).apply(this, arguments);

},{}],110:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\ws\\lib\\browser.js", module);
(function(){

/**
 * Module dependencies.
 */

var global = (function() { return this; })();

/**
 * WebSocket constructor.
 */

var WebSocket = global.WebSocket || global.MozWebSocket;

/**
 * Module exports.
 */

module.exports = WebSocket ? ws : null;

/**
 * WebSocket constructor.
 *
 * The third `opts` options object gets ignored in web browsers, since it's
 * non-standard, and throws a TypeError if passed to the constructor.
 * See: https://github.com/einaros/ws/issues/227
 *
 * @param {String} uri
 * @param {Array} protocols (optional)
 * @param {Object) opts (optional)
 * @api public
 */

function ws(uri, protocols, opts) {
  var instance;
  if (protocols) {
    instance = new WebSocket(uri, protocols);
  } else {
    instance = new WebSocket(uri);
  }
  return instance;
}

if (WebSocket) ws.prototype = WebSocket.prototype;

}).apply(this, arguments);

},{}],111:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\has-binary\\index.js", module);
(function(){
(function (global){

/*
 * Module requirements.
 */

var isArray = require('isarray');

/**
 * Module exports.
 */

module.exports = hasBinary;

/**
 * Checks for binary data.
 *
 * Right now only Buffer and ArrayBuffer are supported..
 *
 * @param {Object} anything
 * @api public
 */

function hasBinary(data) {

  function _hasBinary(obj) {
    if (!obj) return false;

    if ( (global.Buffer && global.Buffer.isBuffer(obj)) ||
         (global.ArrayBuffer && obj instanceof ArrayBuffer) ||
         (global.Blob && obj instanceof Blob) ||
         (global.File && obj instanceof File)
        ) {
      return true;
    }

    if (isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
          if (_hasBinary(obj[i])) {
              return true;
          }
      }
    } else if (obj && 'object' == typeof obj) {
      if (obj.toJSON) {
        obj = obj.toJSON();
      }

      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && _hasBinary(obj[key])) {
          return true;
        }
      }
    }

    return false;
  }

  return _hasBinary(data);
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"isarray":112}],112:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\has-binary\\node_modules\\isarray\\index.js", module);
(function(){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

}).apply(this, arguments);

},{}],113:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\indexof\\index.js", module);
(function(){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
}).apply(this, arguments);

},{}],114:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\object-component\\index.js", module);
(function(){

/**
 * HOP ref.
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Return own keys in `obj`.
 *
 * @param {Object} obj
 * @return {Array}
 * @api public
 */

exports.keys = Object.keys || function(obj){
  var keys = [];
  for (var key in obj) {
    if (has.call(obj, key)) {
      keys.push(key);
    }
  }
  return keys;
};

/**
 * Return own values in `obj`.
 *
 * @param {Object} obj
 * @return {Array}
 * @api public
 */

exports.values = function(obj){
  var vals = [];
  for (var key in obj) {
    if (has.call(obj, key)) {
      vals.push(obj[key]);
    }
  }
  return vals;
};

/**
 * Merge `b` into `a`.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api public
 */

exports.merge = function(a, b){
  for (var key in b) {
    if (has.call(b, key)) {
      a[key] = b[key];
    }
  }
  return a;
};

/**
 * Return length of `obj`.
 *
 * @param {Object} obj
 * @return {Number}
 * @api public
 */

exports.length = function(obj){
  return exports.keys(obj).length;
};

/**
 * Check if `obj` is empty.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api public
 */

exports.isEmpty = function(obj){
  return 0 == exports.length(obj);
};
}).apply(this, arguments);

},{}],115:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\parseuri\\index.js", module);
(function(){
/**
 * Parses an URI
 *
 * @author Steven Levithan <stevenlevithan.com> (MIT license)
 * @api private
 */

var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

var parts = [
    'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host'
  , 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
];

module.exports = function parseuri(str) {
  var m = re.exec(str || '')
    , uri = {}
    , i = 14;

  while (i--) {
    uri[parts[i]] = m[i] || '';
  }

  return uri;
};

}).apply(this, arguments);

},{}],116:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\binary.js", module);
(function(){
(function (global){
/*global Blob,File*/

/**
 * Module requirements
 */

var isArray = require('isarray');
var isBuf = require('./is-buffer');

/**
 * Replaces every Buffer | ArrayBuffer in packet with a numbered placeholder.
 * Anything with blobs or files should be fed through removeBlobs before coming
 * here.
 *
 * @param {Object} packet - socket.io event packet
 * @return {Object} with deconstructed packet and list of buffers
 * @api public
 */

exports.deconstructPacket = function(packet){
  var buffers = [];
  var packetData = packet.data;

  function _deconstructPacket(data) {
    if (!data) return data;

    if (isBuf(data)) {
      var placeholder = { _placeholder: true, num: buffers.length };
      buffers.push(data);
      return placeholder;
    } else if (isArray(data)) {
      var newData = new Array(data.length);
      for (var i = 0; i < data.length; i++) {
        newData[i] = _deconstructPacket(data[i]);
      }
      return newData;
    } else if ('object' == typeof data && !(data instanceof Date)) {
      var newData = {};
      for (var key in data) {
        newData[key] = _deconstructPacket(data[key]);
      }
      return newData;
    }
    return data;
  }

  var pack = packet;
  pack.data = _deconstructPacket(packetData);
  pack.attachments = buffers.length; // number of binary 'attachments'
  return {packet: pack, buffers: buffers};
};

/**
 * Reconstructs a binary packet from its placeholder packet and buffers
 *
 * @param {Object} packet - event packet with placeholders
 * @param {Array} buffers - binary buffers to put in placeholder positions
 * @return {Object} reconstructed packet
 * @api public
 */

exports.reconstructPacket = function(packet, buffers) {
  var curPlaceHolder = 0;

  function _reconstructPacket(data) {
    if (data && data._placeholder) {
      var buf = buffers[data.num]; // appropriate buffer (should be natural order anyway)
      return buf;
    } else if (isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        data[i] = _reconstructPacket(data[i]);
      }
      return data;
    } else if (data && 'object' == typeof data) {
      for (var key in data) {
        data[key] = _reconstructPacket(data[key]);
      }
      return data;
    }
    return data;
  }

  packet.data = _reconstructPacket(packet.data);
  packet.attachments = undefined; // no longer useful
  return packet;
};

/**
 * Asynchronously removes Blobs or Files from data via
 * FileReader's readAsArrayBuffer method. Used before encoding
 * data as msgpack. Calls callback with the blobless data.
 *
 * @param {Object} data
 * @param {Function} callback
 * @api private
 */

exports.removeBlobs = function(data, callback) {
  function _removeBlobs(obj, curKey, containingObject) {
    if (!obj) return obj;

    // convert any blob
    if ((global.Blob && obj instanceof Blob) ||
        (global.File && obj instanceof File)) {
      pendingBlobs++;

      // async filereader
      var fileReader = new FileReader();
      fileReader.onload = function() { // this.result == arraybuffer
        if (containingObject) {
          containingObject[curKey] = this.result;
        }
        else {
          bloblessData = this.result;
        }

        // if nothing pending its callback time
        if(! --pendingBlobs) {
          callback(bloblessData);
        }
      };

      fileReader.readAsArrayBuffer(obj); // blob -> arraybuffer
    } else if (isArray(obj)) { // handle array
      for (var i = 0; i < obj.length; i++) {
        _removeBlobs(obj[i], i, obj);
      }
    } else if (obj && 'object' == typeof obj && !isBuf(obj)) { // and object
      for (var key in obj) {
        _removeBlobs(obj[key], key, obj);
      }
    }
  }

  var pendingBlobs = 0;
  var bloblessData = data;
  _removeBlobs(bloblessData);
  if (!pendingBlobs) {
    callback(bloblessData);
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{"./is-buffer":118,"isarray":119}],117:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js", module);
(function(){

/**
 * Module dependencies.
 */

var debug = require('debug')('socket.io-parser');
var json = require('json3');
var isArray = require('isarray');
var Emitter = require('component-emitter');
var binary = require('./binary');
var isBuf = require('./is-buffer');

/**
 * Protocol version.
 *
 * @api public
 */

exports.protocol = 4;

/**
 * Packet types.
 *
 * @api public
 */

exports.types = [
  'CONNECT',
  'DISCONNECT',
  'EVENT',
  'BINARY_EVENT',
  'ACK',
  'BINARY_ACK',
  'ERROR'
];

/**
 * Packet type `connect`.
 *
 * @api public
 */

exports.CONNECT = 0;

/**
 * Packet type `disconnect`.
 *
 * @api public
 */

exports.DISCONNECT = 1;

/**
 * Packet type `event`.
 *
 * @api public
 */

exports.EVENT = 2;

/**
 * Packet type `ack`.
 *
 * @api public
 */

exports.ACK = 3;

/**
 * Packet type `error`.
 *
 * @api public
 */

exports.ERROR = 4;

/**
 * Packet type 'binary event'
 *
 * @api public
 */

exports.BINARY_EVENT = 5;

/**
 * Packet type `binary ack`. For acks with binary arguments.
 *
 * @api public
 */

exports.BINARY_ACK = 6;

/**
 * Encoder constructor.
 *
 * @api public
 */

exports.Encoder = Encoder;

/**
 * Decoder constructor.
 *
 * @api public
 */

exports.Decoder = Decoder;

/**
 * A socket.io Encoder instance
 *
 * @api public
 */

function Encoder() {}

/**
 * Encode a packet as a single string if non-binary, or as a
 * buffer sequence, depending on packet type.
 *
 * @param {Object} obj - packet object
 * @param {Function} callback - function to handle encodings (likely engine.write)
 * @return Calls callback with Array of encodings
 * @api public
 */

Encoder.prototype.encode = function(obj, callback){
  debug('encoding packet %j', obj);

  if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
    encodeAsBinary(obj, callback);
  }
  else {
    var encoding = encodeAsString(obj);
    callback([encoding]);
  }
};

/**
 * Encode packet as string.
 *
 * @param {Object} packet
 * @return {String} encoded
 * @api private
 */

function encodeAsString(obj) {
  var str = '';
  var nsp = false;

  // first is type
  str += obj.type;

  // attachments if we have them
  if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
    str += obj.attachments;
    str += '-';
  }

  // if we have a namespace other than `/`
  // we append it followed by a comma `,`
  if (obj.nsp && '/' != obj.nsp) {
    nsp = true;
    str += obj.nsp;
  }

  // immediately followed by the id
  if (null != obj.id) {
    if (nsp) {
      str += ',';
      nsp = false;
    }
    str += obj.id;
  }

  // json data
  if (null != obj.data) {
    if (nsp) str += ',';
    str += json.stringify(obj.data);
  }

  debug('encoded %j as %s', obj, str);
  return str;
}

/**
 * Encode packet as 'buffer sequence' by removing blobs, and
 * deconstructing packet into object with placeholders and
 * a list of buffers.
 *
 * @param {Object} packet
 * @return {Buffer} encoded
 * @api private
 */

function encodeAsBinary(obj, callback) {

  function writeEncoding(bloblessData) {
    var deconstruction = binary.deconstructPacket(bloblessData);
    var pack = encodeAsString(deconstruction.packet);
    var buffers = deconstruction.buffers;

    buffers.unshift(pack); // add packet info to beginning of data list
    callback(buffers); // write all the buffers
  }

  binary.removeBlobs(obj, writeEncoding);
}

/**
 * A socket.io Decoder instance
 *
 * @return {Object} decoder
 * @api public
 */

function Decoder() {
  this.reconstructor = null;
}

/**
 * Mix in `Emitter` with Decoder.
 */

Emitter(Decoder.prototype);

/**
 * Decodes an ecoded packet string into packet JSON.
 *
 * @param {String} obj - encoded packet
 * @return {Object} packet
 * @api public
 */

Decoder.prototype.add = function(obj) {
  var packet;
  if ('string' == typeof obj) {
    packet = decodeString(obj);
    if (exports.BINARY_EVENT == packet.type || exports.BINARY_ACK == packet.type) { // binary packet's json
      this.reconstructor = new BinaryReconstructor(packet);

      // no attachments, labeled binary but no binary data to follow
      if (this.reconstructor.reconPack.attachments === 0) {
        this.emit('decoded', packet);
      }
    } else { // non-binary full packet
      this.emit('decoded', packet);
    }
  }
  else if (isBuf(obj) || obj.base64) { // raw binary data
    if (!this.reconstructor) {
      throw new Error('got binary data when not reconstructing a packet');
    } else {
      packet = this.reconstructor.takeBinaryData(obj);
      if (packet) { // received final buffer
        this.reconstructor = null;
        this.emit('decoded', packet);
      }
    }
  }
  else {
    throw new Error('Unknown type: ' + obj);
  }
};

/**
 * Decode a packet String (JSON data)
 *
 * @param {String} str
 * @return {Object} packet
 * @api private
 */

function decodeString(str) {
  var p = {};
  var i = 0;

  // look up type
  p.type = Number(str.charAt(0));
  if (null == exports.types[p.type]) return error();

  // look up attachments if type binary
  if (exports.BINARY_EVENT == p.type || exports.BINARY_ACK == p.type) {
    var buf = '';
    while (str.charAt(++i) != '-') {
      buf += str.charAt(i);
      if (i == str.length) break;
    }
    if (buf != Number(buf) || str.charAt(i) != '-') {
      throw new Error('Illegal attachments');
    }
    p.attachments = Number(buf);
  }

  // look up namespace (if any)
  if ('/' == str.charAt(i + 1)) {
    p.nsp = '';
    while (++i) {
      var c = str.charAt(i);
      if (',' == c) break;
      p.nsp += c;
      if (i == str.length) break;
    }
  } else {
    p.nsp = '/';
  }

  // look up id
  var next = str.charAt(i + 1);
  if ('' !== next && Number(next) == next) {
    p.id = '';
    while (++i) {
      var c = str.charAt(i);
      if (null == c || Number(c) != c) {
        --i;
        break;
      }
      p.id += str.charAt(i);
      if (i == str.length) break;
    }
    p.id = Number(p.id);
  }

  // look up json data
  if (str.charAt(++i)) {
    try {
      p.data = json.parse(str.substr(i));
    } catch(e){
      return error();
    }
  }

  debug('decoded %s as %j', str, p);
  return p;
}

/**
 * Deallocates a parser's resources
 *
 * @api public
 */

Decoder.prototype.destroy = function() {
  if (this.reconstructor) {
    this.reconstructor.finishedReconstruction();
  }
};

/**
 * A manager of a binary event's 'buffer sequence'. Should
 * be constructed whenever a packet of type BINARY_EVENT is
 * decoded.
 *
 * @param {Object} packet
 * @return {BinaryReconstructor} initialized reconstructor
 * @api private
 */

function BinaryReconstructor(packet) {
  this.reconPack = packet;
  this.buffers = [];
}

/**
 * Method to be called when binary data received from connection
 * after a BINARY_EVENT packet.
 *
 * @param {Buffer | ArrayBuffer} binData - the raw binary data received
 * @return {null | Object} returns null if more binary data is expected or
 *   a reconstructed packet object if all buffers have been received.
 * @api private
 */

BinaryReconstructor.prototype.takeBinaryData = function(binData) {
  this.buffers.push(binData);
  if (this.buffers.length == this.reconPack.attachments) { // done with buffer list
    var packet = binary.reconstructPacket(this.reconPack, this.buffers);
    this.finishedReconstruction();
    return packet;
  }
  return null;
};

/**
 * Cleans up binary packet reconstruction variables.
 *
 * @api private
 */

BinaryReconstructor.prototype.finishedReconstruction = function() {
  this.reconPack = null;
  this.buffers = [];
};

function error(data){
  return {
    type: exports.ERROR,
    data: 'parser error'
  };
}

}).apply(this, arguments);

},{"./binary":116,"./is-buffer":118,"component-emitter":82,"debug":83,"isarray":119,"json3":120}],118:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\is-buffer.js", module);
(function(){
(function (global){

module.exports = isBuf;

/**
 * Returns true if obj is a buffer or an arraybuffer.
 *
 * @api private
 */

function isBuf(obj) {
  return (global.Buffer && global.Buffer.isBuffer(obj)) ||
         (global.ArrayBuffer && obj instanceof ArrayBuffer);
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

}).apply(this, arguments);

},{}],119:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\node_modules\\isarray\\index.js", module);
(function(){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

}).apply(this, arguments);

},{}],120:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\node_modules\\json3\\lib\\json3.js", module);
(function(){
/*! JSON v3.2.6 | http://bestiejs.github.io/json3 | Copyright 2012-2013, Kit Cambridge | http://kit.mit-license.org */
;(function (window) {
  // Convenience aliases.
  var getClass = {}.toString, isProperty, forEach, undef;

  // Detect the `define` function exposed by asynchronous module loaders. The
  // strict `define` check is necessary for compatibility with `r.js`.
  var isLoader = typeof define === "function" && define.amd;

  // Detect native implementations.
  var nativeJSON = typeof JSON == "object" && JSON;

  // Set up the JSON 3 namespace, preferring the CommonJS `exports` object if
  // available.
  var JSON3 = typeof exports == "object" && exports && !exports.nodeType && exports;

  if (JSON3 && nativeJSON) {
    // Explicitly delegate to the native `stringify` and `parse`
    // implementations in CommonJS environments.
    JSON3.stringify = nativeJSON.stringify;
    JSON3.parse = nativeJSON.parse;
  } else {
    // Export for web browsers, JavaScript engines, and asynchronous module
    // loaders, using the global `JSON` object if available.
    JSON3 = window.JSON = nativeJSON || {};
  }

  // Test the `Date#getUTC*` methods. Based on work by @Yaffle.
  var isExtended = new Date(-3509827334573292);
  try {
    // The `getUTCFullYear`, `Month`, and `Date` methods return nonsensical
    // results for certain dates in Opera >= 10.53.
    isExtended = isExtended.getUTCFullYear() == -109252 && isExtended.getUTCMonth() === 0 && isExtended.getUTCDate() === 1 &&
      // Safari < 2.0.2 stores the internal millisecond time value correctly,
      // but clips the values returned by the date methods to the range of
      // signed 32-bit integers ([-2 ** 31, 2 ** 31 - 1]).
      isExtended.getUTCHours() == 10 && isExtended.getUTCMinutes() == 37 && isExtended.getUTCSeconds() == 6 && isExtended.getUTCMilliseconds() == 708;
  } catch (exception) {}

  // Internal: Determines whether the native `JSON.stringify` and `parse`
  // implementations are spec-compliant. Based on work by Ken Snyder.
  function has(name) {
    if (has[name] !== undef) {
      // Return cached feature test result.
      return has[name];
    }

    var isSupported;
    if (name == "bug-string-char-index") {
      // IE <= 7 doesn't support accessing string characters using square
      // bracket notation. IE 8 only supports this for primitives.
      isSupported = "a"[0] != "a";
    } else if (name == "json") {
      // Indicates whether both `JSON.stringify` and `JSON.parse` are
      // supported.
      isSupported = has("json-stringify") && has("json-parse");
    } else {
      var value, serialized = '{"a":[1,true,false,null,"\\u0000\\b\\n\\f\\r\\t"]}';
      // Test `JSON.stringify`.
      if (name == "json-stringify") {
        var stringify = JSON3.stringify, stringifySupported = typeof stringify == "function" && isExtended;
        if (stringifySupported) {
          // A test function object with a custom `toJSON` method.
          (value = function () {
            return 1;
          }).toJSON = value;
          try {
            stringifySupported =
              // Firefox 3.1b1 and b2 serialize string, number, and boolean
              // primitives as object literals.
              stringify(0) === "0" &&
              // FF 3.1b1, b2, and JSON 2 serialize wrapped primitives as object
              // literals.
              stringify(new Number()) === "0" &&
              stringify(new String()) == '""' &&
              // FF 3.1b1, 2 throw an error if the value is `null`, `undefined`, or
              // does not define a canonical JSON representation (this applies to
              // objects with `toJSON` properties as well, *unless* they are nested
              // within an object or array).
              stringify(getClass) === undef &&
              // IE 8 serializes `undefined` as `"undefined"`. Safari <= 5.1.7 and
              // FF 3.1b3 pass this test.
              stringify(undef) === undef &&
              // Safari <= 5.1.7 and FF 3.1b3 throw `Error`s and `TypeError`s,
              // respectively, if the value is omitted entirely.
              stringify() === undef &&
              // FF 3.1b1, 2 throw an error if the given value is not a number,
              // string, array, object, Boolean, or `null` literal. This applies to
              // objects with custom `toJSON` methods as well, unless they are nested
              // inside object or array literals. YUI 3.0.0b1 ignores custom `toJSON`
              // methods entirely.
              stringify(value) === "1" &&
              stringify([value]) == "[1]" &&
              // Prototype <= 1.6.1 serializes `[undefined]` as `"[]"` instead of
              // `"[null]"`.
              stringify([undef]) == "[null]" &&
              // YUI 3.0.0b1 fails to serialize `null` literals.
              stringify(null) == "null" &&
              // FF 3.1b1, 2 halts serialization if an array contains a function:
              // `[1, true, getClass, 1]` serializes as "[1,true,],". FF 3.1b3
              // elides non-JSON values from objects and arrays, unless they
              // define custom `toJSON` methods.
              stringify([undef, getClass, null]) == "[null,null,null]" &&
              // Simple serialization test. FF 3.1b1 uses Unicode escape sequences
              // where character escape codes are expected (e.g., `\b` => `\u0008`).
              stringify({ "a": [value, true, false, null, "\x00\b\n\f\r\t"] }) == serialized &&
              // FF 3.1b1 and b2 ignore the `filter` and `width` arguments.
              stringify(null, value) === "1" &&
              stringify([1, 2], null, 1) == "[\n 1,\n 2\n]" &&
              // JSON 2, Prototype <= 1.7, and older WebKit builds incorrectly
              // serialize extended years.
              stringify(new Date(-8.64e15)) == '"-271821-04-20T00:00:00.000Z"' &&
              // The milliseconds are optional in ES 5, but required in 5.1.
              stringify(new Date(8.64e15)) == '"+275760-09-13T00:00:00.000Z"' &&
              // Firefox <= 11.0 incorrectly serializes years prior to 0 as negative
              // four-digit years instead of six-digit years. Credits: @Yaffle.
              stringify(new Date(-621987552e5)) == '"-000001-01-01T00:00:00.000Z"' &&
              // Safari <= 5.1.5 and Opera >= 10.53 incorrectly serialize millisecond
              // values less than 1000. Credits: @Yaffle.
              stringify(new Date(-1)) == '"1969-12-31T23:59:59.999Z"';
          } catch (exception) {
            stringifySupported = false;
          }
        }
        isSupported = stringifySupported;
      }
      // Test `JSON.parse`.
      if (name == "json-parse") {
        var parse = JSON3.parse;
        if (typeof parse == "function") {
          try {
            // FF 3.1b1, b2 will throw an exception if a bare literal is provided.
            // Conforming implementations should also coerce the initial argument to
            // a string prior to parsing.
            if (parse("0") === 0 && !parse(false)) {
              // Simple parsing test.
              value = parse(serialized);
              var parseSupported = value["a"].length == 5 && value["a"][0] === 1;
              if (parseSupported) {
                try {
                  // Safari <= 5.1.2 and FF 3.1b1 allow unescaped tabs in strings.
                  parseSupported = !parse('"\t"');
                } catch (exception) {}
                if (parseSupported) {
                  try {
                    // FF 4.0 and 4.0.1 allow leading `+` signs and leading
                    // decimal points. FF 4.0, 4.0.1, and IE 9-10 also allow
                    // certain octal literals.
                    parseSupported = parse("01") !== 1;
                  } catch (exception) {}
                }
                if (parseSupported) {
                  try {
                    // FF 4.0, 4.0.1, and Rhino 1.7R3-R4 allow trailing decimal
                    // points. These environments, along with FF 3.1b1 and 2,
                    // also allow trailing commas in JSON objects and arrays.
                    parseSupported = parse("1.") !== 1;
                  } catch (exception) {}
                }
              }
            }
          } catch (exception) {
            parseSupported = false;
          }
        }
        isSupported = parseSupported;
      }
    }
    return has[name] = !!isSupported;
  }

  if (!has("json")) {
    // Common `[[Class]]` name aliases.
    var functionClass = "[object Function]";
    var dateClass = "[object Date]";
    var numberClass = "[object Number]";
    var stringClass = "[object String]";
    var arrayClass = "[object Array]";
    var booleanClass = "[object Boolean]";

    // Detect incomplete support for accessing string characters by index.
    var charIndexBuggy = has("bug-string-char-index");

    // Define additional utility methods if the `Date` methods are buggy.
    if (!isExtended) {
      var floor = Math.floor;
      // A mapping between the months of the year and the number of days between
      // January 1st and the first of the respective month.
      var Months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      // Internal: Calculates the number of days between the Unix epoch and the
      // first day of the given month.
      var getDay = function (year, month) {
        return Months[month] + 365 * (year - 1970) + floor((year - 1969 + (month = +(month > 1))) / 4) - floor((year - 1901 + month) / 100) + floor((year - 1601 + month) / 400);
      };
    }

    // Internal: Determines if a property is a direct property of the given
    // object. Delegates to the native `Object#hasOwnProperty` method.
    if (!(isProperty = {}.hasOwnProperty)) {
      isProperty = function (property) {
        var members = {}, constructor;
        if ((members.__proto__ = null, members.__proto__ = {
          // The *proto* property cannot be set multiple times in recent
          // versions of Firefox and SeaMonkey.
          "toString": 1
        }, members).toString != getClass) {
          // Safari <= 2.0.3 doesn't implement `Object#hasOwnProperty`, but
          // supports the mutable *proto* property.
          isProperty = function (property) {
            // Capture and break the object's prototype chain (see section 8.6.2
            // of the ES 5.1 spec). The parenthesized expression prevents an
            // unsafe transformation by the Closure Compiler.
            var original = this.__proto__, result = property in (this.__proto__ = null, this);
            // Restore the original prototype chain.
            this.__proto__ = original;
            return result;
          };
        } else {
          // Capture a reference to the top-level `Object` constructor.
          constructor = members.constructor;
          // Use the `constructor` property to simulate `Object#hasOwnProperty` in
          // other environments.
          isProperty = function (property) {
            var parent = (this.constructor || constructor).prototype;
            return property in this && !(property in parent && this[property] === parent[property]);
          };
        }
        members = null;
        return isProperty.call(this, property);
      };
    }

    // Internal: A set of primitive types used by `isHostType`.
    var PrimitiveTypes = {
      'boolean': 1,
      'number': 1,
      'string': 1,
      'undefined': 1
    };

    // Internal: Determines if the given object `property` value is a
    // non-primitive.
    var isHostType = function (object, property) {
      var type = typeof object[property];
      return type == 'object' ? !!object[property] : !PrimitiveTypes[type];
    };

    // Internal: Normalizes the `for...in` iteration algorithm across
    // environments. Each enumerated key is yielded to a `callback` function.
    forEach = function (object, callback) {
      var size = 0, Properties, members, property;

      // Tests for bugs in the current environment's `for...in` algorithm. The
      // `valueOf` property inherits the non-enumerable flag from
      // `Object.prototype` in older versions of IE, Netscape, and Mozilla.
      (Properties = function () {
        this.valueOf = 0;
      }).prototype.valueOf = 0;

      // Iterate over a new instance of the `Properties` class.
      members = new Properties();
      for (property in members) {
        // Ignore all properties inherited from `Object.prototype`.
        if (isProperty.call(members, property)) {
          size++;
        }
      }
      Properties = members = null;

      // Normalize the iteration algorithm.
      if (!size) {
        // A list of non-enumerable properties inherited from `Object.prototype`.
        members = ["valueOf", "toString", "toLocaleString", "propertyIsEnumerable", "isPrototypeOf", "hasOwnProperty", "constructor"];
        // IE <= 8, Mozilla 1.0, and Netscape 6.2 ignore shadowed non-enumerable
        // properties.
        forEach = function (object, callback) {
          var isFunction = getClass.call(object) == functionClass, property, length;
          var hasProperty = !isFunction && typeof object.constructor != 'function' && isHostType(object, 'hasOwnProperty') ? object.hasOwnProperty : isProperty;
          for (property in object) {
            // Gecko <= 1.0 enumerates the `prototype` property of functions under
            // certain conditions; IE does not.
            if (!(isFunction && property == "prototype") && hasProperty.call(object, property)) {
              callback(property);
            }
          }
          // Manually invoke the callback for each non-enumerable property.
          for (length = members.length; property = members[--length]; hasProperty.call(object, property) && callback(property));
        };
      } else if (size == 2) {
        // Safari <= 2.0.4 enumerates shadowed properties twice.
        forEach = function (object, callback) {
          // Create a set of iterated properties.
          var members = {}, isFunction = getClass.call(object) == functionClass, property;
          for (property in object) {
            // Store each property name to prevent double enumeration. The
            // `prototype` property of functions is not enumerated due to cross-
            // environment inconsistencies.
            if (!(isFunction && property == "prototype") && !isProperty.call(members, property) && (members[property] = 1) && isProperty.call(object, property)) {
              callback(property);
            }
          }
        };
      } else {
        // No bugs detected; use the standard `for...in` algorithm.
        forEach = function (object, callback) {
          var isFunction = getClass.call(object) == functionClass, property, isConstructor;
          for (property in object) {
            if (!(isFunction && property == "prototype") && isProperty.call(object, property) && !(isConstructor = property === "constructor")) {
              callback(property);
            }
          }
          // Manually invoke the callback for the `constructor` property due to
          // cross-environment inconsistencies.
          if (isConstructor || isProperty.call(object, (property = "constructor"))) {
            callback(property);
          }
        };
      }
      return forEach(object, callback);
    };

    // Public: Serializes a JavaScript `value` as a JSON string. The optional
    // `filter` argument may specify either a function that alters how object and
    // array members are serialized, or an array of strings and numbers that
    // indicates which properties should be serialized. The optional `width`
    // argument may be either a string or number that specifies the indentation
    // level of the output.
    if (!has("json-stringify")) {
      // Internal: A map of control characters and their escaped equivalents.
      var Escapes = {
        92: "\\\\",
        34: '\\"',
        8: "\\b",
        12: "\\f",
        10: "\\n",
        13: "\\r",
        9: "\\t"
      };

      // Internal: Converts `value` into a zero-padded string such that its
      // length is at least equal to `width`. The `width` must be <= 6.
      var leadingZeroes = "000000";
      var toPaddedString = function (width, value) {
        // The `|| 0` expression is necessary to work around a bug in
        // Opera <= 7.54u2 where `0 == -0`, but `String(-0) !== "0"`.
        return (leadingZeroes + (value || 0)).slice(-width);
      };

      // Internal: Double-quotes a string `value`, replacing all ASCII control
      // characters (characters with code unit values between 0 and 31) with
      // their escaped equivalents. This is an implementation of the
      // `Quote(value)` operation defined in ES 5.1 section 15.12.3.
      var unicodePrefix = "\\u00";
      var quote = function (value) {
        var result = '"', index = 0, length = value.length, isLarge = length > 10 && charIndexBuggy, symbols;
        if (isLarge) {
          symbols = value.split("");
        }
        for (; index < length; index++) {
          var charCode = value.charCodeAt(index);
          // If the character is a control character, append its Unicode or
          // shorthand escape sequence; otherwise, append the character as-is.
          switch (charCode) {
            case 8: case 9: case 10: case 12: case 13: case 34: case 92:
              result += Escapes[charCode];
              break;
            default:
              if (charCode < 32) {
                result += unicodePrefix + toPaddedString(2, charCode.toString(16));
                break;
              }
              result += isLarge ? symbols[index] : charIndexBuggy ? value.charAt(index) : value[index];
          }
        }
        return result + '"';
      };

      // Internal: Recursively serializes an object. Implements the
      // `Str(key, holder)`, `JO(value)`, and `JA(value)` operations.
      var serialize = function (property, object, callback, properties, whitespace, indentation, stack) {
        var value, className, year, month, date, time, hours, minutes, seconds, milliseconds, results, element, index, length, prefix, result;
        try {
          // Necessary for host object support.
          value = object[property];
        } catch (exception) {}
        if (typeof value == "object" && value) {
          className = getClass.call(value);
          if (className == dateClass && !isProperty.call(value, "toJSON")) {
            if (value > -1 / 0 && value < 1 / 0) {
              // Dates are serialized according to the `Date#toJSON` method
              // specified in ES 5.1 section 15.9.5.44. See section 15.9.1.15
              // for the ISO 8601 date time string format.
              if (getDay) {
                // Manually compute the year, month, date, hours, minutes,
                // seconds, and milliseconds if the `getUTC*` methods are
                // buggy. Adapted from @Yaffle's `date-shim` project.
                date = floor(value / 864e5);
                for (year = floor(date / 365.2425) + 1970 - 1; getDay(year + 1, 0) <= date; year++);
                for (month = floor((date - getDay(year, 0)) / 30.42); getDay(year, month + 1) <= date; month++);
                date = 1 + date - getDay(year, month);
                // The `time` value specifies the time within the day (see ES
                // 5.1 section 15.9.1.2). The formula `(A % B + B) % B` is used
                // to compute `A modulo B`, as the `%` operator does not
                // correspond to the `modulo` operation for negative numbers.
                time = (value % 864e5 + 864e5) % 864e5;
                // The hours, minutes, seconds, and milliseconds are obtained by
                // decomposing the time within the day. See section 15.9.1.10.
                hours = floor(time / 36e5) % 24;
                minutes = floor(time / 6e4) % 60;
                seconds = floor(time / 1e3) % 60;
                milliseconds = time % 1e3;
              } else {
                year = value.getUTCFullYear();
                month = value.getUTCMonth();
                date = value.getUTCDate();
                hours = value.getUTCHours();
                minutes = value.getUTCMinutes();
                seconds = value.getUTCSeconds();
                milliseconds = value.getUTCMilliseconds();
              }
              // Serialize extended years correctly.
              value = (year <= 0 || year >= 1e4 ? (year < 0 ? "-" : "+") + toPaddedString(6, year < 0 ? -year : year) : toPaddedString(4, year)) +
                "-" + toPaddedString(2, month + 1) + "-" + toPaddedString(2, date) +
                // Months, dates, hours, minutes, and seconds should have two
                // digits; milliseconds should have three.
                "T" + toPaddedString(2, hours) + ":" + toPaddedString(2, minutes) + ":" + toPaddedString(2, seconds) +
                // Milliseconds are optional in ES 5.0, but required in 5.1.
                "." + toPaddedString(3, milliseconds) + "Z";
            } else {
              value = null;
            }
          } else if (typeof value.toJSON == "function" && ((className != numberClass && className != stringClass && className != arrayClass) || isProperty.call(value, "toJSON"))) {
            // Prototype <= 1.6.1 adds non-standard `toJSON` methods to the
            // `Number`, `String`, `Date`, and `Array` prototypes. JSON 3
            // ignores all `toJSON` methods on these objects unless they are
            // defined directly on an instance.
            value = value.toJSON(property);
          }
        }
        if (callback) {
          // If a replacement function was provided, call it to obtain the value
          // for serialization.
          value = callback.call(object, property, value);
        }
        if (value === null) {
          return "null";
        }
        className = getClass.call(value);
        if (className == booleanClass) {
          // Booleans are represented literally.
          return "" + value;
        } else if (className == numberClass) {
          // JSON numbers must be finite. `Infinity` and `NaN` are serialized as
          // `"null"`.
          return value > -1 / 0 && value < 1 / 0 ? "" + value : "null";
        } else if (className == stringClass) {
          // Strings are double-quoted and escaped.
          return quote("" + value);
        }
        // Recursively serialize objects and arrays.
        if (typeof value == "object") {
          // Check for cyclic structures. This is a linear search; performance
          // is inversely proportional to the number of unique nested objects.
          for (length = stack.length; length--;) {
            if (stack[length] === value) {
              // Cyclic structures cannot be serialized by `JSON.stringify`.
              throw TypeError();
            }
          }
          // Add the object to the stack of traversed objects.
          stack.push(value);
          results = [];
          // Save the current indentation level and indent one additional level.
          prefix = indentation;
          indentation += whitespace;
          if (className == arrayClass) {
            // Recursively serialize array elements.
            for (index = 0, length = value.length; index < length; index++) {
              element = serialize(index, value, callback, properties, whitespace, indentation, stack);
              results.push(element === undef ? "null" : element);
            }
            result = results.length ? (whitespace ? "[\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "]" : ("[" + results.join(",") + "]")) : "[]";
          } else {
            // Recursively serialize object members. Members are selected from
            // either a user-specified list of property names, or the object
            // itself.
            forEach(properties || value, function (property) {
              var element = serialize(property, value, callback, properties, whitespace, indentation, stack);
              if (element !== undef) {
                // According to ES 5.1 section 15.12.3: "If `gap` {whitespace}
                // is not the empty string, let `member` {quote(property) + ":"}
                // be the concatenation of `member` and the `space` character."
                // The "`space` character" refers to the literal space
                // character, not the `space` {width} argument provided to
                // `JSON.stringify`.
                results.push(quote(property) + ":" + (whitespace ? " " : "") + element);
              }
            });
            result = results.length ? (whitespace ? "{\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "}" : ("{" + results.join(",") + "}")) : "{}";
          }
          // Remove the object from the traversed object stack.
          stack.pop();
          return result;
        }
      };

      // Public: `JSON.stringify`. See ES 5.1 section 15.12.3.
      JSON3.stringify = function (source, filter, width) {
        var whitespace, callback, properties, className;
        if (typeof filter == "function" || typeof filter == "object" && filter) {
          if ((className = getClass.call(filter)) == functionClass) {
            callback = filter;
          } else if (className == arrayClass) {
            // Convert the property names array into a makeshift set.
            properties = {};
            for (var index = 0, length = filter.length, value; index < length; value = filter[index++], ((className = getClass.call(value)), className == stringClass || className == numberClass) && (properties[value] = 1));
          }
        }
        if (width) {
          if ((className = getClass.call(width)) == numberClass) {
            // Convert the `width` to an integer and create a string containing
            // `width` number of space characters.
            if ((width -= width % 1) > 0) {
              for (whitespace = "", width > 10 && (width = 10); whitespace.length < width; whitespace += " ");
            }
          } else if (className == stringClass) {
            whitespace = width.length <= 10 ? width : width.slice(0, 10);
          }
        }
        // Opera <= 7.54u2 discards the values associated with empty string keys
        // (`""`) only if they are used directly within an object member list
        // (e.g., `!("" in { "": 1})`).
        return serialize("", (value = {}, value[""] = source, value), callback, properties, whitespace, "", []);
      };
    }

    // Public: Parses a JSON source string.
    if (!has("json-parse")) {
      var fromCharCode = String.fromCharCode;

      // Internal: A map of escaped control characters and their unescaped
      // equivalents.
      var Unescapes = {
        92: "\\",
        34: '"',
        47: "/",
        98: "\b",
        116: "\t",
        110: "\n",
        102: "\f",
        114: "\r"
      };

      // Internal: Stores the parser state.
      var Index, Source;

      // Internal: Resets the parser state and throws a `SyntaxError`.
      var abort = function() {
        Index = Source = null;
        throw SyntaxError();
      };

      // Internal: Returns the next token, or `"$"` if the parser has reached
      // the end of the source string. A token may be a string, number, `null`
      // literal, or Boolean literal.
      var lex = function () {
        var source = Source, length = source.length, value, begin, position, isSigned, charCode;
        while (Index < length) {
          charCode = source.charCodeAt(Index);
          switch (charCode) {
            case 9: case 10: case 13: case 32:
              // Skip whitespace tokens, including tabs, carriage returns, line
              // feeds, and space characters.
              Index++;
              break;
            case 123: case 125: case 91: case 93: case 58: case 44:
              // Parse a punctuator token (`{`, `}`, `[`, `]`, `:`, or `,`) at
              // the current position.
              value = charIndexBuggy ? source.charAt(Index) : source[Index];
              Index++;
              return value;
            case 34:
              // `"` delimits a JSON string; advance to the next character and
              // begin parsing the string. String tokens are prefixed with the
              // sentinel `@` character to distinguish them from punctuators and
              // end-of-string tokens.
              for (value = "@", Index++; Index < length;) {
                charCode = source.charCodeAt(Index);
                if (charCode < 32) {
                  // Unescaped ASCII control characters (those with a code unit
                  // less than the space character) are not permitted.
                  abort();
                } else if (charCode == 92) {
                  // A reverse solidus (`\`) marks the beginning of an escaped
                  // control character (including `"`, `\`, and `/`) or Unicode
                  // escape sequence.
                  charCode = source.charCodeAt(++Index);
                  switch (charCode) {
                    case 92: case 34: case 47: case 98: case 116: case 110: case 102: case 114:
                      // Revive escaped control characters.
                      value += Unescapes[charCode];
                      Index++;
                      break;
                    case 117:
                      // `\u` marks the beginning of a Unicode escape sequence.
                      // Advance to the first character and validate the
                      // four-digit code point.
                      begin = ++Index;
                      for (position = Index + 4; Index < position; Index++) {
                        charCode = source.charCodeAt(Index);
                        // A valid sequence comprises four hexdigits (case-
                        // insensitive) that form a single hexadecimal value.
                        if (!(charCode >= 48 && charCode <= 57 || charCode >= 97 && charCode <= 102 || charCode >= 65 && charCode <= 70)) {
                          // Invalid Unicode escape sequence.
                          abort();
                        }
                      }
                      // Revive the escaped character.
                      value += fromCharCode("0x" + source.slice(begin, Index));
                      break;
                    default:
                      // Invalid escape sequence.
                      abort();
                  }
                } else {
                  if (charCode == 34) {
                    // An unescaped double-quote character marks the end of the
                    // string.
                    break;
                  }
                  charCode = source.charCodeAt(Index);
                  begin = Index;
                  // Optimize for the common case where a string is valid.
                  while (charCode >= 32 && charCode != 92 && charCode != 34) {
                    charCode = source.charCodeAt(++Index);
                  }
                  // Append the string as-is.
                  value += source.slice(begin, Index);
                }
              }
              if (source.charCodeAt(Index) == 34) {
                // Advance to the next character and return the revived string.
                Index++;
                return value;
              }
              // Unterminated string.
              abort();
            default:
              // Parse numbers and literals.
              begin = Index;
              // Advance past the negative sign, if one is specified.
              if (charCode == 45) {
                isSigned = true;
                charCode = source.charCodeAt(++Index);
              }
              // Parse an integer or floating-point value.
              if (charCode >= 48 && charCode <= 57) {
                // Leading zeroes are interpreted as octal literals.
                if (charCode == 48 && ((charCode = source.charCodeAt(Index + 1)), charCode >= 48 && charCode <= 57)) {
                  // Illegal octal literal.
                  abort();
                }
                isSigned = false;
                // Parse the integer component.
                for (; Index < length && ((charCode = source.charCodeAt(Index)), charCode >= 48 && charCode <= 57); Index++);
                // Floats cannot contain a leading decimal point; however, this
                // case is already accounted for by the parser.
                if (source.charCodeAt(Index) == 46) {
                  position = ++Index;
                  // Parse the decimal component.
                  for (; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57); position++);
                  if (position == Index) {
                    // Illegal trailing decimal.
                    abort();
                  }
                  Index = position;
                }
                // Parse exponents. The `e` denoting the exponent is
                // case-insensitive.
                charCode = source.charCodeAt(Index);
                if (charCode == 101 || charCode == 69) {
                  charCode = source.charCodeAt(++Index);
                  // Skip past the sign following the exponent, if one is
                  // specified.
                  if (charCode == 43 || charCode == 45) {
                    Index++;
                  }
                  // Parse the exponential component.
                  for (position = Index; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57); position++);
                  if (position == Index) {
                    // Illegal empty exponent.
                    abort();
                  }
                  Index = position;
                }
                // Coerce the parsed value to a JavaScript number.
                return +source.slice(begin, Index);
              }
              // A negative sign may only precede numbers.
              if (isSigned) {
                abort();
              }
              // `true`, `false`, and `null` literals.
              if (source.slice(Index, Index + 4) == "true") {
                Index += 4;
                return true;
              } else if (source.slice(Index, Index + 5) == "false") {
                Index += 5;
                return false;
              } else if (source.slice(Index, Index + 4) == "null") {
                Index += 4;
                return null;
              }
              // Unrecognized token.
              abort();
          }
        }
        // Return the sentinel `$` character if the parser has reached the end
        // of the source string.
        return "$";
      };

      // Internal: Parses a JSON `value` token.
      var get = function (value) {
        var results, hasMembers;
        if (value == "$") {
          // Unexpected end of input.
          abort();
        }
        if (typeof value == "string") {
          if ((charIndexBuggy ? value.charAt(0) : value[0]) == "@") {
            // Remove the sentinel `@` character.
            return value.slice(1);
          }
          // Parse object and array literals.
          if (value == "[") {
            // Parses a JSON array, returning a new JavaScript array.
            results = [];
            for (;; hasMembers || (hasMembers = true)) {
              value = lex();
              // A closing square bracket marks the end of the array literal.
              if (value == "]") {
                break;
              }
              // If the array literal contains elements, the current token
              // should be a comma separating the previous element from the
              // next.
              if (hasMembers) {
                if (value == ",") {
                  value = lex();
                  if (value == "]") {
                    // Unexpected trailing `,` in array literal.
                    abort();
                  }
                } else {
                  // A `,` must separate each array element.
                  abort();
                }
              }
              // Elisions and leading commas are not permitted.
              if (value == ",") {
                abort();
              }
              results.push(get(value));
            }
            return results;
          } else if (value == "{") {
            // Parses a JSON object, returning a new JavaScript object.
            results = {};
            for (;; hasMembers || (hasMembers = true)) {
              value = lex();
              // A closing curly brace marks the end of the object literal.
              if (value == "}") {
                break;
              }
              // If the object literal contains members, the current token
              // should be a comma separator.
              if (hasMembers) {
                if (value == ",") {
                  value = lex();
                  if (value == "}") {
                    // Unexpected trailing `,` in object literal.
                    abort();
                  }
                } else {
                  // A `,` must separate each object member.
                  abort();
                }
              }
              // Leading commas are not permitted, object property names must be
              // double-quoted strings, and a `:` must separate each property
              // name and value.
              if (value == "," || typeof value != "string" || (charIndexBuggy ? value.charAt(0) : value[0]) != "@" || lex() != ":") {
                abort();
              }
              results[value.slice(1)] = get(lex());
            }
            return results;
          }
          // Unexpected token encountered.
          abort();
        }
        return value;
      };

      // Internal: Updates a traversed object member.
      var update = function(source, property, callback) {
        var element = walk(source, property, callback);
        if (element === undef) {
          delete source[property];
        } else {
          source[property] = element;
        }
      };

      // Internal: Recursively traverses a parsed JSON object, invoking the
      // `callback` function for each value. This is an implementation of the
      // `Walk(holder, name)` operation defined in ES 5.1 section 15.12.2.
      var walk = function (source, property, callback) {
        var value = source[property], length;
        if (typeof value == "object" && value) {
          // `forEach` can't be used to traverse an array in Opera <= 8.54
          // because its `Object#hasOwnProperty` implementation returns `false`
          // for array indices (e.g., `![1, 2, 3].hasOwnProperty("0")`).
          if (getClass.call(value) == arrayClass) {
            for (length = value.length; length--;) {
              update(value, length, callback);
            }
          } else {
            forEach(value, function (property) {
              update(value, property, callback);
            });
          }
        }
        return callback.call(source, property, value);
      };

      // Public: `JSON.parse`. See ES 5.1 section 15.12.2.
      JSON3.parse = function (source, callback) {
        var result, value;
        Index = 0;
        Source = "" + source;
        result = get(lex());
        // If a JSON string contains multiple tokens, it is invalid.
        if (lex() != "$") {
          abort();
        }
        // Reset the parser state.
        Index = Source = null;
        return callback && getClass.call(callback) == functionClass ? walk((value = {}, value[""] = result, value), "", callback) : result;
      };
    }
  }

  // Export for asynchronous module loaders.
  if (isLoader) {
    define(function () {
      return JSON3;
    });
  }
}(this));

}).apply(this, arguments);

},{}],121:[function(require,module,exports){
_hmr["websocket:null"].initModule("node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\to-array\\index.js", module);
(function(){
module.exports = toArray

function toArray(list, index) {
    var array = []

    index = index || 0

    for (var i = index || 0; i < list.length; i++) {
        array[i - index] = list[i]
    }

    return array
}

}).apply(this, arguments);

},{}],1:[function(require,module,exports){
(function(global, _main, moduleDefs, cachedModules, _entries) {
  'use strict';

  var moduleMeta = {"node_modules\\browserify-hmr\\lib\\has.js":{"index":4,"hash":"Hky4QYVrU1+kFHIEuxPy","parents":["node_modules\\browserify-hmr\\lib\\str-set.js","node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\debug\\debug.js":{"index":83,"hash":"OtjmSmEbIU/8orJwFhDT","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\url.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\lib\\str-set.js":{"index":5,"hash":"lcrDmQK4uaqOqN+FV4/9","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arraySome.js":{"index":16,"hash":"GxeJPxJj2jUg5TzV5gLv","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalArrays.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayFilter.js":{"index":14,"hash":"BGunz0w1QzJXyqQSOdZb","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayEach.js":{"index":13,"hash":"eLxUBVsb8vpFbu0VN4KL","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\forEach.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\arrayMap.js":{"index":15,"hash":"xdr8c0JsUFapIHTuM5VE","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\parseuri\\index.js":{"index":115,"hash":"PsPou9y5yKmPMPJnjEkz","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\url.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\url.js":{"index":79,"hash":"jISfg06Caebp4aVZ1Ekx","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\on.js":{"index":77,"hash":"y5MOoFpTKKBHwE8q8jae","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\component-emitter\\index.js":{"index":82,"hash":"0uL1LSa/mOj+Llu+HTZ7","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transport.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\component-bind\\index.js":{"index":81,"hash":"4yIcVw+afwUsnTQyI0a3","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\to-array\\index.js":{"index":121,"hash":"2EoggafxX+GLXkXiaGjm","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\is-buffer.js":{"index":118,"hash":"TgmAiS1M6dQe04zksDv4","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\binary.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\node_modules\\isarray\\index.js":{"index":119,"hash":"dKtews1S4sHvaZhZ+ceq","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\binary.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\node_modules\\json3\\lib\\json3.js":{"index":120,"hash":"Z22TAqz9HSDSuQH535ZO","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\object-component\\index.js":{"index":114,"hash":"zOYybxl/D7KsteH/xJyk","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\indexof\\index.js":{"index":113,"hash":"8zMGV0j0ID5bUIeT7r+M","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\backo2\\index.js":{"index":80,"hash":"L5ry3mfVEw1wgmx9Sa+q","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isLength.js":{"index":54,"hash":"DFIKI121VzeE+pBbx1Oa","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isArrayLike.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArray.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isTypedArray.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isObjectLike.js":{"index":55,"hash":"qEGnAWJNoAetOIJ7YKiV","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isNative.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArray.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArguments.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isTypedArray.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqual.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createObjectMapper.js":{"index":43,"hash":"cp8s+Z6khiKdK5QCQ+Ms","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\mapValues.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js":{"index":19,"hash":"FDEmxoh1cXY/hddgPNGW","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createObjectMapper.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseForOwn.js":{"index":24,"hash":"sOLmHH2OosmeW92YaLK/","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createObjectMapper.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\forOwn.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\mapValues.js":{"index":70,"hash":"2HfAmVuaVGfc8pd5zIaC","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\identity.js":{"index":72,"hash":"A/cz5O4nnho2x2e5KIWS","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\bindCallback.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseSome.js":{"index":35,"hash":"lCW5AtHn9X2vSuPgS8pk","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseEach.js":{"index":21,"hash":"Ji7NLCJhdzSBlpDI+qC3","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseSome.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFilter.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMap.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\forEach.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isObject.js":{"index":64,"hash":"Go+dTLFqO1KJN+uQLb8s","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toObject.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isStrictComparable.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIterateeCall.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isFunction.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqual.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIndex.js":{"index":51,"hash":"I8y5AsjL/lwDlORDOqqM","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIterateeCall.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFilter.js":{"index":22,"hash":"yyvQag4hw8sItBFf3/9T","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js":{"index":8,"hash":"XtU5zjCqSDlYcwOLUC13","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArray.js":{"index":61,"hash":"rpMiE1Z199/XZCjno4KN","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\filter.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isKey.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toPath.js","node_modules\\browserify-hmr\\node_modules\\lodash\\array\\zipObject.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForEach.js":{"index":41,"hash":"iJtWBCzx+bzzSLwlaaRv","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\forEach.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\bindCallback.js":{"index":37,"hash":"S6iy1I+53IEzDLSGuW0j","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForOwn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createAssigner.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createForOwn.js":{"index":42,"hash":"KJqijjvJO7d1nU17Sz3c","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\forOwn.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\assignWith.js":{"index":17,"hash":"aKBKyfIKqZsNOHAbJTAI","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\assign.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js":{"index":68,"hash":"BbXGNIcfatSp32uWOBAV","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\assignWith.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseAssign.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\pairs.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseForOwn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalObjects.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\function\\restParam.js":{"index":12,"hash":"/RRH9MCtjArr1p3Qeh63","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createAssigner.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createAssigner.js":{"index":38,"hash":"X8R81jvRCofY1BnG+A/L","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\assign.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIterateeCall.js":{"index":52,"hash":"dXMnNRevAizOBisKCEes","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createAssigner.js","node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCopy.js":{"index":20,"hash":"WvGi8IywM6u7ZNXvztwg","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseAssign.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseAssign.js":{"index":18,"hash":"6VX87YoeNgDvMUyiAc/7","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\assign.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\assign.js":{"index":66,"hash":"9WOhJBREl8AO9Hs6Cr+Q","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMap.js":{"index":29,"hash":"ofv2jCE5QlahpynG4rkN","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isArrayLike.js":{"index":50,"hash":"76Awthz8ChTgjGk0JZ6Y","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMap.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isIterateeCall.js","node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArguments.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\map.js":{"index":10,"hash":"63n5x8GTiWPuxiZzm9TM","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\has-binary\\node_modules\\isarray\\index.js":{"index":112,"hash":"dKtews1S4sHvaZhZ+ceq","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\has-binary\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\has-binary\\index.js":{"index":111,"hash":"g4HzejvXgllGjJ3rdWOS","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js":{"index":78,"hash":"mVenx7k8VFtvIejsDYOl","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js":{"index":117,"hash":"BAgSAi2yJ1LAoE3Vw1D4","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\binary.js":{"index":116,"hash":"J0VrqJrphEcluGf0z9Pa","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\socket.io-parser\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseProperty.js":{"index":32,"hash":"Yuk2tpof21q0Xl2sQg89","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\property.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getLength.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseSlice.js":{"index":34,"hash":"OLgw9XVic1W0AKjehzHB","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\array\\last.js":{"index":6,"hash":"3oXXa2idWbKySVLcq3os","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseEach.js":{"index":39,"hash":"+5X3Ztm78NNPr9vQZ7fB","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseEach.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getLength.js":{"index":47,"hash":"UiZ6F0+nXZ0fiKckTqnM","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isArrayLike.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toObject.js":{"index":58,"hash":"8f3eulB97DddBRdcU+7v","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseEach.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isKey.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsMatch.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseGet.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseFor.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\pairs.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatches.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\forEach.js":{"index":9,"hash":"0Lo1RNt18PMo/HAKbHEu","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isKey.js":{"index":53,"hash":"lDpw5crcRmTRExTLVTKc","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\property.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\basePropertyDeep.js":{"index":33,"hash":"mqX1OyYdndJ183lyl/sn","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\property.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseGet.js":{"index":25,"hash":"H9EiMd3ullQpRkvooLgz","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\basePropertyDeep.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toPath.js":{"index":59,"hash":"faVQvsb+LSLI4uaMgtrQ","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\basePropertyDeep.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\utility\\property.js":{"index":73,"hash":"7IoOI/uGZCxbcY23uQDK","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsMatch.js":{"index":28,"hash":"EpuJzlg204aR35T4QKcS","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatches.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqual.js":{"index":26,"hash":"dBgoFXnhj9KH6oX3dQwa","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsMatch.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\isStrictComparable.js":{"index":56,"hash":"ofNP4/nFrz5Rkb3kGOhn","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getMatchData.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseToString.js":{"index":36,"hash":"ABFQFf14pRECi3sw8oKV","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\toPath.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\createBaseFor.js":{"index":40,"hash":"9RWlFaBOuelvwgkhYgPG","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFor.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseFor.js":{"index":23,"hash":"NGxcZ0n01+w2G1PzyBlY","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseForOwn.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\keys.js":{"index":99,"hash":"oFyKNTA0twlyQVhVzp9n","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\utf8\\utf8.js":{"index":104,"hash":"6nsqanfBwcbxn70os/89","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\after\\index.js":{"index":100,"hash":"NzPfXWECmM8rW/6fdkcj","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\arraybuffer.slice\\index.js":{"index":101,"hash":"RSb5Zx9CgX3adjzbvf/k","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\blob\\index.js":{"index":103,"hash":"ke/U4WsBcVbHUHyisAju","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\node_modules\\base64-arraybuffer\\lib\\base64-arraybuffer.js":{"index":102,"hash":"dW6cnktjBIyZ6bv9vRp2","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\engine.io-parser\\lib\\browser.js":{"index":98,"hash":"ueUqff3P8cLBtO6JwUwm","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transport.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parseqs\\index.js":{"index":108,"hash":"FI4tRELwI5Itz+ckwR+m","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parseuri\\index.js":{"index":109,"hash":"c/c7XftSI6ClFc9h2jOh","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\parsejson\\index.js":{"index":107,"hash":"U4Hij6X0PLgh6NWAowAj","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isFunction.js":{"index":62,"hash":"xkfzrZNZPGGOIf0kE8Y9","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isNative.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isNative.js":{"index":63,"hash":"2rstaALy1DW0JSDdijps","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getNative.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getNative.js":{"index":49,"hash":"7GRZ7115BSuoc/1bdaBK","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArray.js","node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\array\\zipObject.js":{"index":7,"hash":"fKfSwIzPo5SUx9d0DkgN","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\pairs.js":{"index":71,"hash":"x6Ilwx8encvg/BW5API2","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getMatchData.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\getMatchData.js":{"index":48,"hash":"n0PHWhNs6YZ+DzgYMHPx","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatches.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatches.js":{"index":30,"hash":"Cwj5GSiQv9/E8nSFBoX2","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalByTag.js":{"index":45,"hash":"+y++gesJpPvyM+2E8aNB","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isArguments.js":{"index":60,"hash":"xQ4mqbsKQMCmtsPbfQc6","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js","node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keysIn.js":{"index":69,"hash":"8POZiGR1fRHso579G46Z","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\shimKeys.js":{"index":57,"hash":"oO4aKopmxRfPxyKgRX9F","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\object\\keys.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\object\\forOwn.js":{"index":67,"hash":"LZ77PzuJW/wlgVPdvlGc","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transport.js":{"index":87,"hash":"8Wg7zuMzQpa+AwOxaesw","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalObjects.js":{"index":46,"hash":"44Iy49kDcaAZsykEdaH3","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\equalArrays.js":{"index":44,"hash":"OBJL6vuaOotu5flUeCnv","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\lang\\isTypedArray.js":{"index":65,"hash":"aVeZyIFGadrEh7EsaDRu","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqualDeep.js":{"index":27,"hash":"ltZZaMHmzp6d9jBltV3Y","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseIsEqual.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseMatchesProperty.js":{"index":31,"hash":"OudnSoeq2A4ql5lg51kc","parents":["node_modules\\browserify-hmr\\node_modules\\lodash\\internal\\baseCallback.js"]},"node_modules\\browserify-hmr\\node_modules\\lodash\\collection\\some.js":{"index":11,"hash":"9JyJFfdCx56pmR6fwM9q","parents":["node_modules\\browserify-hmr\\inc\\index.js"]},"node_modules\\browserify-hmr\\inc\\index.js":{"index":3,"hash":"azyGnExX2uVlPI7oM92b","parents":[]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\node_modules\\ms\\index.js":{"index":97,"hash":"rzSu41c+6ZW8M4Say8X9","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\debug.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\debug.js":{"index":96,"hash":"yqdR7nJc7wxIHzFDNzG+","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\browser.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\debug\\browser.js":{"index":95,"hash":"PENVCHp3HppeRm/DiJMI","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\component-inherit\\index.js":{"index":94,"hash":"T0Fqch4d4akvlr8bh7lc","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-jsonp.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\ws\\lib\\browser.js":{"index":110,"hash":"vZRI95FVw46PPRoHDauJ","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\websocket.js":{"index":92,"hash":"iZQQax7TKsS+8ZxUyrc3","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js":{"index":90,"hash":"h2SQ2f7quptV/YJbtXc/","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\xmlhttprequest.js":{"index":93,"hash":"us0FsN5s7hiT3hqVV5lx","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling.js":{"index":91,"hash":"m6eReXjm1pnBQHB07d2V","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-xhr.js","node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-jsonp.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\polling-jsonp.js":{"index":89,"hash":"75t5oGTbGnaV5vd1IWme","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\has-cors\\node_modules\\global\\index.js":{"index":106,"hash":"tDIf5GqqdOcKnNHRh2Rc","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\has-cors\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\node_modules\\has-cors\\index.js":{"index":105,"hash":"uSUdzzwBDQd7qQNKEZ4o","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\xmlhttprequest.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\transports\\index.js":{"index":88,"hash":"0vNipsx+qzJ3brfKRTIJ","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\socket.js":{"index":86,"hash":"G4S/aw98kFcaiknZ4ORu","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\lib\\index.js":{"index":85,"hash":"G6QYuSNu0EcS+G5tR9NE","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\node_modules\\engine.io-client\\index.js":{"index":84,"hash":"HQau4MkD4lAynB9tt0Wl","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\manager.js":{"index":76,"hash":"+TrOAqk4UlI3tKzIT6Dc","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\lib\\index.js":{"index":75,"hash":"lWwRhzm83+Eq08s7Nht/","parents":["node_modules\\browserify-hmr\\node_modules\\socket.io-client\\index.js"]},"node_modules\\browserify-hmr\\node_modules\\socket.io-client\\index.js":{"index":74,"hash":"ccYBPsaIqMCtG5CHCdDd","parents":[]},"main.js":{"index":2,"hash":"s+LAwvI6otQ8jwfFCBSk","parents":[]}};
  var originalEntries = ["D:\\tests\\D3-Tips-and-Tricks-Training\\main.js"];
  var updateUrl = null;
  var updateMode = "websocket";
  var supportModes = ["none","websocket"];
  var ignoreUnaccepted = true;
  var updateCacheBust = false;
  var bundleKey = "websocket:null";
  var sioPath = "./node_modules\\browserify-hmr\\node_modules\\socket.io-client\\index.js";
  var incPath = "./node_modules\\browserify-hmr\\inc\\index.js";

  if (!global._hmr) {
    try {
      Object.defineProperty(global, '_hmr', {value: {}});
    } catch(e) {
      global._hmr = {};
    }
  }

  if (!Object.prototype.hasOwnProperty.call(global._hmr, bundleKey)) {
    // Temporary hack so requiring modules works before the _hmr values are
    // correctly initialized.
    global._hmr[bundleKey] = {initModule: function(){}};
  }

  var main = require(incPath);
  var isFirstRun = main(
    moduleDefs, cachedModules, moduleMeta, updateUrl,
    updateMode, supportModes, ignoreUnaccepted, updateCacheBust, bundleKey,
    sioPath ? require(sioPath) : null,
    typeof __filename !== 'undefined' && __filename,
    typeof __dirname !== 'undefined' && __dirname
  );
  if (isFirstRun) {
    for (var i=0, len=originalEntries.length; i<len; i++) {
      require(originalEntries[i]);
    }
  }
}).call(
  this,
  typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},
  arguments[3], arguments[4], arguments[5], arguments[6]
);

},{"./node_modules\\browserify-hmr\\inc\\index.js":3,"./node_modules\\browserify-hmr\\node_modules\\socket.io-client\\index.js":74,"D:\\tests\\D3-Tips-and-Tricks-Training\\main.js":2}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJtYWluLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnktaG1yL2luYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXGxpYlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbGliXFxoYXMuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxsaWJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXGxpYlxcc3RyLXNldC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxhcnJheVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGFycmF5XFxsYXN0LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGFycmF5XFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcYXJyYXlcXHppcE9iamVjdC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxjb2xsZWN0aW9uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcY29sbGVjdGlvblxcZmlsdGVyLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGNvbGxlY3Rpb25cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxjb2xsZWN0aW9uXFxmb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGNvbGxlY3Rpb25cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxjb2xsZWN0aW9uXFxtYXAuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcY29sbGVjdGlvblxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGNvbGxlY3Rpb25cXHNvbWUuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcZnVuY3Rpb25cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxmdW5jdGlvblxccmVzdFBhcmFtLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGFycmF5RWFjaC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxhcnJheUZpbHRlci5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxhcnJheU1hcC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxhcnJheVNvbWUuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcYXNzaWduV2l0aC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlQXNzaWduLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VDYWxsYmFjay5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlQ29weS5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlRWFjaC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlRmlsdGVyLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VGb3IuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcYmFzZUZvck93bi5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlR2V0LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VJc0VxdWFsLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VJc0VxdWFsRGVlcC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlSXNNYXRjaC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiYXNlTWFwLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VNYXRjaGVzLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcYmFzZVByb3BlcnR5LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VQcm9wZXJ0eURlZXAuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcYmFzZVNsaWNlLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VTb21lLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGJhc2VUb1N0cmluZy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxiaW5kQ2FsbGJhY2suanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcY3JlYXRlQXNzaWduZXIuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcY3JlYXRlQmFzZUVhY2guanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcY3JlYXRlQmFzZUZvci5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxjcmVhdGVGb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGNyZWF0ZUZvck93bi5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxjcmVhdGVPYmplY3RNYXBwZXIuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcZXF1YWxBcnJheXMuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcZXF1YWxCeVRhZy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxlcXVhbE9iamVjdHMuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcZ2V0TGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXGdldE1hdGNoRGF0YS5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxnZXROYXRpdmUuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcaXNBcnJheUxpa2UuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcaXNJbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxpc0l0ZXJhdGVlQ2FsbC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxpc0tleS5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxpc0xlbmd0aC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxpc09iamVjdExpa2UuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxpbnRlcm5hbFxcaXNTdHJpY3RDb21wYXJhYmxlLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXHNoaW1LZXlzLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXHRvT2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGludGVybmFsXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcaW50ZXJuYWxcXHRvUGF0aC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxsYW5nXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcbGFuZ1xcaXNBcmd1bWVudHMuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcbGFuZ1xcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGxhbmdcXGlzQXJyYXkuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcbGFuZ1xcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGxhbmdcXGlzRnVuY3Rpb24uanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcbGFuZ1xcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGxhbmdcXGlzTmF0aXZlLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXGxhbmdcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxsYW5nXFxpc09iamVjdC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxsYW5nXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcbGFuZ1xcaXNUeXBlZEFycmF5LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxcYXNzaWduLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxcZm9yT3duLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXG9iamVjdFxca2V5cy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXGtleXNJbi5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXG1hcFZhbHVlcy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFxvYmplY3RcXHBhaXJzLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxsb2Rhc2hcXHV0aWxpdHlcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFx1dGlsaXR5XFxpZGVudGl0eS5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcbG9kYXNoXFx1dGlsaXR5XFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXGxvZGFzaFxcdXRpbGl0eVxccHJvcGVydHkuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXGxpYlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxsaWJcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxsaWJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbGliXFxtYW5hZ2VyLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxsaWJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbGliXFxvbi5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbGliXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXGxpYlxcc29ja2V0LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnktaG1yL25vZGVfbW9kdWxlcy9zb2NrZXQuaW8tY2xpZW50L2xpYi91cmwuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcYmFja28yXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcYmFja28yXFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxjb21wb25lbnQtYmluZFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGNvbXBvbmVudC1iaW5kXFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxjb21wb25lbnQtZW1pdHRlclxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGNvbXBvbmVudC1lbWl0dGVyXFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxkZWJ1Z1xcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGRlYnVnXFxkZWJ1Zy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbGliXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbGliXFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5LWhtci9ub2RlX21vZHVsZXMvc29ja2V0LmlvLWNsaWVudC9ub2RlX21vZHVsZXMvZW5naW5lLmlvLWNsaWVudC9saWIvc29ja2V0LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxcdHJhbnNwb3J0LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnktaG1yL25vZGVfbW9kdWxlcy9zb2NrZXQuaW8tY2xpZW50L25vZGVfbW9kdWxlcy9lbmdpbmUuaW8tY2xpZW50L2xpYi90cmFuc3BvcnRzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnktaG1yL25vZGVfbW9kdWxlcy9zb2NrZXQuaW8tY2xpZW50L25vZGVfbW9kdWxlcy9lbmdpbmUuaW8tY2xpZW50L2xpYi90cmFuc3BvcnRzL3BvbGxpbmctanNvbnAuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1jbGllbnQvbGliL3RyYW5zcG9ydHMvcG9sbGluZy14aHIuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbGliXFx0cmFuc3BvcnRzXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbGliXFx0cmFuc3BvcnRzXFxwb2xsaW5nLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxcdHJhbnNwb3J0c1xcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxcdHJhbnNwb3J0c1xcd2Vic29ja2V0LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXGxpYlxceG1saHR0cHJlcXVlc3QuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxjb21wb25lbnQtaW5oZXJpdFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcY29tcG9uZW50LWluaGVyaXRcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZGVidWdcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGRlYnVnXFxicm93c2VyLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZGVidWdcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGRlYnVnXFxkZWJ1Zy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGRlYnVnXFxub2RlX21vZHVsZXNcXG1zXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxkZWJ1Z1xcbm9kZV9tb2R1bGVzXFxtc1xcaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1wYXJzZXIvbGliL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tcGFyc2VyXFxsaWJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1wYXJzZXJcXGxpYlxca2V5cy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1wYXJzZXJcXG5vZGVfbW9kdWxlc1xcYWZ0ZXJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1wYXJzZXJcXG5vZGVfbW9kdWxlc1xcYWZ0ZXJcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLXBhcnNlclxcbm9kZV9tb2R1bGVzXFxhcnJheWJ1ZmZlci5zbGljZVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLXBhcnNlclxcbm9kZV9tb2R1bGVzXFxhcnJheWJ1ZmZlci5zbGljZVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tcGFyc2VyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1hcnJheWJ1ZmZlclxcbGliXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tcGFyc2VyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1hcnJheWJ1ZmZlclxcbGliXFxiYXNlNjQtYXJyYXlidWZmZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1wYXJzZXIvbm9kZV9tb2R1bGVzL2Jsb2IvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1wYXJzZXIvbm9kZV9tb2R1bGVzL3V0ZjgvdXRmOC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGhhcy1jb3JzXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxoYXMtY29yc1xcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcZW5naW5lLmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxoYXMtY29yc1xcbm9kZV9tb2R1bGVzXFxnbG9iYWxcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGhhcy1jb3JzXFxub2RlX21vZHVsZXNcXGdsb2JhbFxcaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2VuZ2luZS5pby1jbGllbnQvbm9kZV9tb2R1bGVzL3BhcnNlanNvbi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHBhcnNlcXNcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHBhcnNlcXNcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXGVuZ2luZS5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xccGFyc2V1cmlcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHBhcnNldXJpXFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHdzXFxsaWJcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxlbmdpbmUuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHdzXFxsaWJcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL2hhcy1iaW5hcnkvaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcaGFzLWJpbmFyeVxcbm9kZV9tb2R1bGVzXFxpc2FycmF5XFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcaGFzLWJpbmFyeVxcbm9kZV9tb2R1bGVzXFxpc2FycmF5XFxpbmRleC5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxpbmRleG9mXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcaW5kZXhvZlxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcb2JqZWN0LWNvbXBvbmVudFxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXG9iamVjdC1jb21wb25lbnRcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHBhcnNldXJpXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xccGFyc2V1cmlcXGluZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnktaG1yL25vZGVfbW9kdWxlcy9zb2NrZXQuaW8tY2xpZW50L25vZGVfbW9kdWxlcy9zb2NrZXQuaW8tcGFyc2VyL2JpbmFyeS5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tcGFyc2VyXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLXBhcnNlclxcaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS1obXIvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnQvbm9kZV9tb2R1bGVzL3NvY2tldC5pby1wYXJzZXIvaXMtYnVmZmVyLmpzIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1wYXJzZXJcXG5vZGVfbW9kdWxlc1xcaXNhcnJheVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1wYXJzZXJcXG5vZGVfbW9kdWxlc1xcaXNhcnJheVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLXBhcnNlclxcbm9kZV9tb2R1bGVzXFxqc29uM1xcbGliXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnktaG1yXFxub2RlX21vZHVsZXNcXHNvY2tldC5pby1jbGllbnRcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLXBhcnNlclxcbm9kZV9tb2R1bGVzXFxqc29uM1xcbGliXFxqc29uMy5qcyIsIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeS1obXJcXG5vZGVfbW9kdWxlc1xcc29ja2V0LmlvLWNsaWVudFxcbm9kZV9tb2R1bGVzXFx0by1hcnJheVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5LWhtclxcbm9kZV9tb2R1bGVzXFxzb2NrZXQuaW8tY2xpZW50XFxub2RlX21vZHVsZXNcXHRvLWFycmF5XFxpbmRleC5qcyIsIl9faG1yX21hbmFnZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0FDQUEsUUFBUSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLEdBQUMsdUNBQXVDLENBQUM7Ozs7Ozs7O0FDQXJGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDbHBCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDOUJBO0FBQ0E7Ozs7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDaFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ25LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDeElBO0FBQ0E7Ozs7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUNqc0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUM5SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDaFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNwUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUM3T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEU7Ozs7OztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUM5R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDbGxCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUNwUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUMxREE7QUFDQTtBQUNBOzs7Ozs7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRTs7Ozs7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEU7Ozs7OztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDN0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQy9ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQ2JBO0FBQ0E7QUFDQTs7Ozs7OztBQ0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzUxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGVudCcpLmlubmVySFRNTD1cInRlc3QgZGVwbG95IGhvbGEgc2VyZ2lvLCBjb21vIG1vbGFzc3NcIjtcclxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFzID0gcmVxdWlyZSgnLi4vbGliL2hhcycpO1xudmFyIFN0clNldCA9IHJlcXVpcmUoJy4uL2xpYi9zdHItc2V0Jyk7XG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoJ2xvZGFzaC9jb2xsZWN0aW9uL2ZvckVhY2gnKTtcbnZhciBzb21lID0gcmVxdWlyZSgnbG9kYXNoL2NvbGxlY3Rpb24vc29tZScpO1xudmFyIG1hcCA9IHJlcXVpcmUoJ2xvZGFzaC9jb2xsZWN0aW9uL21hcCcpO1xudmFyIGZpbHRlciA9IHJlcXVpcmUoJ2xvZGFzaC9jb2xsZWN0aW9uL2ZpbHRlcicpO1xudmFyIHppcE9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC9hcnJheS96aXBPYmplY3QnKTtcbnZhciBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2gvb2JqZWN0L2Zvck93bicpO1xudmFyIG1hcFZhbHVlcyA9IHJlcXVpcmUoJ2xvZGFzaC9vYmplY3QvbWFwVmFsdWVzJyk7XG52YXIgYXNzaWduID0gcmVxdWlyZSgnbG9kYXNoL29iamVjdC9hc3NpZ24nKTtcblxuZnVuY3Rpb24gZW1pdEVycm9yKGVycikge1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRocm93IGVycjtcbiAgfSwgMCk7XG59XG5cbmZ1bmN0aW9uIG1ha2VNb2R1bGVJbmRleGVzVG9OYW1lcyhtb2R1bGVNZXRhKSB7XG4gIHZhciBtb2R1bGVJbmRleGVzVG9OYW1lcyA9IHt9O1xuICBmb3JPd24obW9kdWxlTWV0YSwgZnVuY3Rpb24odmFsdWUsIG5hbWUpIHtcbiAgICBtb2R1bGVJbmRleGVzVG9OYW1lc1t2YWx1ZS5pbmRleF0gPSBuYW1lO1xuICB9KTtcbiAgcmV0dXJuIG1vZHVsZUluZGV4ZXNUb05hbWVzO1xufVxuXG52YXIgY29uc29sZSA9IGdsb2JhbC5jb25zb2xlID8gZ2xvYmFsLmNvbnNvbGUgOiB7XG4gIGVycm9yOiBmdW5jdGlvbigpe30sIGxvZzogZnVuY3Rpb24oKSB7fVxufTtcblxuZnVuY3Rpb24gbWFpbihcbiAgbW9kdWxlRGVmcywgY2FjaGVkTW9kdWxlcywgbW9kdWxlTWV0YSwgdXBkYXRlVXJsLFxuICB1cGRhdGVNb2RlLCBzdXBwb3J0TW9kZXMsIGlnbm9yZVVuYWNjZXB0ZWQsIHVwZGF0ZUNhY2hlQnVzdCwgYnVuZGxlS2V5LFxuICBzb2NrZXRpbyxcbiAgYnVuZGxlX19maWxlbmFtZSwgYnVuZGxlX19kaXJuYW1lXG4pIHtcbiAgdmFyIG1vZHVsZUluZGV4ZXNUb05hbWVzID0gbWFrZU1vZHVsZUluZGV4ZXNUb05hbWVzKG1vZHVsZU1ldGEpO1xuXG4gIHZhciBzb2NrZXQ7XG4gIHZhciBuYW1lLCBpLCBsZW47XG5cbiAgaWYgKCFnbG9iYWwuX2htcltidW5kbGVLZXldLnNldFN0YXR1cykge1xuICAgIHZhciBydW50aW1lTW9kdWxlSW5mbyA9IHt9O1xuICAgIHZhciBjcmVhdGVJbmZvRW50cnkgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXSA9IHtcbiAgICAgICAgaW5kZXg6IG1vZHVsZU1ldGFbbmFtZV0uaW5kZXgsXG4gICAgICAgIGhhc2g6IG1vZHVsZU1ldGFbbmFtZV0uaGFzaCxcbiAgICAgICAgcGFyZW50czogbmV3IFN0clNldChtb2R1bGVNZXRhW25hbWVdLnBhcmVudHMpLFxuICAgICAgICBtb2R1bGU6IG51bGwsXG4gICAgICAgIGRpc3Bvc2VEYXRhOiBudWxsLFxuICAgICAgICBhY2NlcHRlcnM6IG5ldyBTdHJTZXQoKSxcbiAgICAgICAgYWNjZXB0aW5nOiBuZXcgU3RyU2V0KCksXG4gICAgICAgIGRlY2xpbmVyczogbmV3IFN0clNldCgpLFxuICAgICAgICBkZWNsaW5pbmc6IG5ldyBTdHJTZXQoKSxcbiAgICAgICAgc2VsZkFjY2VwdENiczogW10sIC8vIG1heSBjb250YWluIG51bGwuIG5vbnplcm8gbGVuZ3RoIG1lYW5zIG1vZHVsZSBpcyBzZWxmLWFjY2VwdGluZ1xuICAgICAgICBkaXNwb3NlSGFuZGxlcnM6IFtdXG4gICAgICB9O1xuICAgIH07XG4gICAgZm9yIChuYW1lIGluIG1vZHVsZU1ldGEpIHtcbiAgICAgIGlmIChoYXMobW9kdWxlTWV0YSwgbmFtZSkpIHtcbiAgICAgICAgY3JlYXRlSW5mb0VudHJ5KG5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGxvYWRlcnMgdGFrZSBhIGNhbGxiYWNrKGVyciwgZGF0YSkuIFRoZXkgbWF5IGdpdmUgbnVsbCBmb3IgZGF0YSBpZiB0aGV5XG4gICAgLy8ga25vdyB0aGVyZSBoYXNuJ3QgYmVlbiBhbiB1cGRhdGUuXG4gICAgdmFyIGZpbGVSZWxvYWRlcnMgPSB7XG4gICAgICBmczogZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgdmFyIGZzO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZzID0gcmVxdWlyZSgnZicrJ3MnKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgY2IoZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGZzLnJlYWRGaWxlKGxvY2FsSG1yLnVwZGF0ZVVybCB8fCBidW5kbGVfX2ZpbGVuYW1lLCAndXRmOCcsIGNiKTtcbiAgICAgIH0sXG4gICAgICBhamF4OiBmdW5jdGlvbihjYikge1xuICAgICAgICB2YXIgeGhyO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICBjYihlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICBjYihudWxsLCB4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNiKG5ldyBFcnJvcihcIlJlcXVlc3QgaGFkIHJlc3BvbnNlIFwiK3hoci5zdGF0dXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHZhciB1cmwgPSBsb2NhbEhtci51cGRhdGVVcmwgKyAodXBkYXRlQ2FjaGVCdXN0Pyc/X3Y9JysoK25ldyBEYXRlKCkpOicnKTtcbiAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci5zZW5kKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBsYXN0U2NyaXB0RGF0YSA9IG51bGw7XG5cbiAgICAvLyBjYihlcnIsIGV4cGVjdFVwZGF0ZSlcbiAgICB2YXIgcmVsb2FkQW5kUnVuU2NyaXB0ID0gZnVuY3Rpb24oY2IpIHtcbiAgICAgIGlmICghaGFzKGZpbGVSZWxvYWRlcnMsIGxvY2FsSG1yLnVwZGF0ZU1vZGUpKSB7XG4gICAgICAgIGNiKG5ldyBFcnJvcihcInVwZGF0ZU1vZGUgXCIrbG9jYWxIbXIudXBkYXRlTW9kZStcIiBub3QgaW1wbGVtZW50ZWRcIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgcmVsb2FkZXIgPSBmaWxlUmVsb2FkZXJzW2xvY2FsSG1yLnVwZGF0ZU1vZGVdO1xuICAgICAgcmVsb2FkZXIoZnVuY3Rpb24oZXJyLCBkYXRhKSB7XG4gICAgICAgIGlmIChlcnIgfHwgIWRhdGEgfHwgbGFzdFNjcmlwdERhdGEgPT09IGRhdGEpIHtcbiAgICAgICAgICBjYihlcnIsIGZhbHNlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbGFzdFNjcmlwdERhdGEgPSBkYXRhO1xuICAgICAgICBsb2NhbEhtci5uZXdMb2FkID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvL2pzaGludCBldmlsOnRydWVcbiAgICAgICAgICBpZiAoYnVuZGxlX19maWxlbmFtZSB8fCBidW5kbGVfX2Rpcm5hbWUpIHtcbiAgICAgICAgICAgIG5ldyBGdW5jdGlvbigncmVxdWlyZScsICdfX2ZpbGVuYW1lJywgJ19fZGlybmFtZScsIGRhdGEpKHJlcXVpcmUsIGJ1bmRsZV9fZmlsZW5hbWUsIGJ1bmRsZV9fZGlybmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5ldyBGdW5jdGlvbigncmVxdWlyZScsIGRhdGEpKHJlcXVpcmUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBydW5uaW5nIHRoZSBmaWxlIHNldHMgX2htci5uZXdMb2FkXG4gICAgICAgIH0gY2F0Y2ggKGVycjIpIHtcbiAgICAgICAgICBsb2NhbEhtci5uZXdMb2FkID0gbnVsbDtcbiAgICAgICAgICBjYihlcnIyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFsb2NhbEhtci5uZXdMb2FkKSB7XG4gICAgICAgICAgY2IobmV3IEVycm9yKFwiUmVsb2FkZWQgc2NyaXB0IGRpZCBub3Qgc2V0IGhvdCBtb2R1bGUgcmVsb2FkIGRhdGFcIikpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjYihudWxsLCB0cnVlKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB2YXIgZ2V0T3V0ZGF0ZWRNb2R1bGVzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb3V0ZGF0ZWQgPSBbXTtcbiAgICAgIHZhciBuYW1lO1xuICAgICAgLy8gYWRkIGNoYW5nZWQgYW5kIGRlbGV0ZWQgbW9kdWxlc1xuICAgICAgZm9yIChuYW1lIGluIHJ1bnRpbWVNb2R1bGVJbmZvKSB7XG4gICAgICAgIGlmIChoYXMocnVudGltZU1vZHVsZUluZm8sIG5hbWUpKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIWhhcyhsb2NhbEhtci5uZXdMb2FkLm1vZHVsZU1ldGEsIG5hbWUpIHx8XG4gICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5oYXNoICE9PSBsb2NhbEhtci5uZXdMb2FkLm1vZHVsZU1ldGFbbmFtZV0uaGFzaFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb3V0ZGF0ZWQucHVzaChuYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIGFkZCBicmFuZCBuZXcgbW9kdWxlc1xuICAgICAgZm9yIChuYW1lIGluIGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YSkge1xuICAgICAgICBpZiAoaGFzKGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YSwgbmFtZSkpIHtcbiAgICAgICAgICBpZiAoIWhhcyhydW50aW1lTW9kdWxlSW5mbywgbmFtZSkpIHtcbiAgICAgICAgICAgIG91dGRhdGVkLnB1c2gobmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBhZGQgbW9kdWxlcyB0aGF0IGFyZSBub24tYWNjZXB0aW5nL2RlY2xpbmluZyBwYXJlbnRzIG9mIG91dGRhdGVkIG1vZHVsZXMuXG4gICAgICAvLyBpbXBvcnRhbnQ6IGlmIG91dGRhdGVkIGhhcyBuZXcgZWxlbWVudHMgYWRkZWQgZHVyaW5nIHRoZSBsb29wLFxuICAgICAgLy8gdGhlbiB3ZSBpdGVyYXRlIG92ZXIgdGhlbSB0b28uXG4gICAgICBmb3IgKHZhciBpPTA7IGk8b3V0ZGF0ZWQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbmFtZSA9IG91dGRhdGVkW2ldO1xuICAgICAgICAvL2pzaGludCAtVzA4M1xuICAgICAgICBpZiAoaGFzKHJ1bnRpbWVNb2R1bGVJbmZvLCBuYW1lKSkge1xuICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLnBhcmVudHMuZm9yRWFjaChmdW5jdGlvbihwYXJlbnROYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLnNlbGZBY2NlcHRDYnMubGVuZ3RoID09PSAwICYmXG4gICAgICAgICAgICAgICFydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5hY2NlcHRlcnMuaGFzKHBhcmVudE5hbWUpICYmXG4gICAgICAgICAgICAgICFydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5kZWNsaW5lcnMuaGFzKHBhcmVudE5hbWUpICYmXG4gICAgICAgICAgICAgIG91dGRhdGVkLmluZGV4T2YocGFyZW50TmFtZSkgPT09IC0xXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgb3V0ZGF0ZWQucHVzaChwYXJlbnROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG91dGRhdGVkO1xuICAgIH07XG5cbiAgICB2YXIgbW9kdWxlSG90Q2hlY2sgPSBmdW5jdGlvbihhdXRvQXBwbHksIGNiKSB7XG4gICAgICBpZiAodHlwZW9mIGF1dG9BcHBseSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYiA9IGF1dG9BcHBseTtcbiAgICAgICAgYXV0b0FwcGx5ID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIWNiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1vZHVsZS5ob3QuY2hlY2sgY2FsbGJhY2sgcGFyYW1ldGVyIHJlcXVpcmVkXCIpO1xuICAgICAgfVxuICAgICAgaWYgKGxvY2FsSG1yLnN0YXR1cyAhPT0gJ2lkbGUnKSB7XG4gICAgICAgIGNiKG5ldyBFcnJvcihcIm1vZHVsZS5ob3QuY2hlY2sgY2FuIG9ubHkgYmUgY2FsbGVkIHdoaWxlIHN0YXR1cyBpcyBpZGxlXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHVwZGF0ZU1vZGUgPT09ICd3ZWJzb2NrZXQnKSB7XG4gICAgICAgIGNiKG5ldyBFcnJvcihcIm1vZHVsZS5ob3QuY2hlY2sgY2FuJ3QgYmUgdXNlZCB3aGVuIHVwZGF0ZSBtb2RlIGlzIHdlYnNvY2tldFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbG9jYWxIbXIuc2V0U3RhdHVzKCdjaGVjaycpO1xuICAgICAgcmVsb2FkQW5kUnVuU2NyaXB0KGZ1bmN0aW9uKGVyciwgZXhwZWN0VXBkYXRlKSB7XG4gICAgICAgIGlmIChlcnIgfHwgIWV4cGVjdFVwZGF0ZSkge1xuICAgICAgICAgIGxvY2FsSG1yLnNldFN0YXR1cygnaWRsZScpO1xuICAgICAgICAgIGNiKGVyciwgbnVsbCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBvdXRkYXRlZE1vZHVsZXMgPSBnZXRPdXRkYXRlZE1vZHVsZXMoKTtcbiAgICAgICAgaWYgKG91dGRhdGVkTW9kdWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsb2NhbEhtci5zZXRTdGF0dXMoJ2lkbGUnKTtcbiAgICAgICAgICBjYihudWxsLCBudWxsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2NhbEhtci5zZXRTdGF0dXMoJ3JlYWR5Jyk7XG4gICAgICAgICAgaWYgKGF1dG9BcHBseSkge1xuICAgICAgICAgICAgbW9kdWxlSG90QXBwbHkoYXV0b0FwcGx5LCBjYik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNiKG51bGwsIG91dGRhdGVkTW9kdWxlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgdmFyIG1vZHVsZUhvdEFwcGx5ID0gZnVuY3Rpb24ob3B0aW9ucywgY2IpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYiA9IG9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMgPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKCFjYikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJtb2R1bGUuaG90LmFwcGx5IGNhbGxiYWNrIHBhcmFtZXRlciByZXF1aXJlZFwiKTtcbiAgICAgIH1cbiAgICAgIHZhciBpZ25vcmVVbmFjY2VwdGVkID0gISEob3B0aW9ucyAmJiBvcHRpb25zLmlnbm9yZVVuYWNjZXB0ZWQpO1xuICAgICAgaWYgKGxvY2FsSG1yLnN0YXR1cyAhPT0gJ3JlYWR5Jykge1xuICAgICAgICBjYihuZXcgRXJyb3IoXCJtb2R1bGUuaG90LmFwcGx5IGNhbiBvbmx5IGJlIGNhbGxlZCB3aGlsZSBzdGF0dXMgaXMgcmVhZHlcIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBvdXRkYXRlZE1vZHVsZXMgPSBnZXRPdXRkYXRlZE1vZHVsZXMoKTtcbiAgICAgIHZhciBpc1ZhbHVlTm90SW5PdXRkYXRlZE1vZHVsZXMgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gb3V0ZGF0ZWRNb2R1bGVzLmluZGV4T2YodmFsdWUpID09PSAtMTtcbiAgICAgIH07XG4gICAgICB2YXIgaSwgbGVuO1xuICAgICAgdmFyIGFjY2VwdGVkVXBkYXRlcyA9IGZpbHRlcihvdXRkYXRlZE1vZHVsZXMsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgaWYgKGhhcyhydW50aW1lTW9kdWxlSW5mbywgbmFtZSkpIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5kZWNsaW5lcnMuc29tZShpc1ZhbHVlTm90SW5PdXRkYXRlZE1vZHVsZXMpIHx8XG4gICAgICAgICAgICAoXG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLmFjY2VwdGVycy5zaXplKCkgPT09IDAgJiZcbiAgICAgICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bbmFtZV0uc2VsZkFjY2VwdENicy5sZW5ndGggPT09IDAgJiZcbiAgICAgICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bbmFtZV0ucGFyZW50cy5zb21lKGlzVmFsdWVOb3RJbk91dGRhdGVkTW9kdWxlcylcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KTtcbiAgICAgIGlmICghaWdub3JlVW5hY2NlcHRlZCAmJiBvdXRkYXRlZE1vZHVsZXMubGVuZ3RoICE9PSBhY2NlcHRlZFVwZGF0ZXMubGVuZ3RoKSB7XG4gICAgICAgIGxvY2FsSG1yLnNldFN0YXR1cygnaWRsZScpO1xuICAgICAgICBjYihuZXcgRXJyb3IoXCJTb21lIHVwZGF0ZXMgd2VyZSBkZWNsaW5lZFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhbjtcbiAgICAgIGZvciAoaT0wLCBsZW49YWNjZXB0ZWRVcGRhdGVzLmxlbmd0aDsgaTxsZW47IGkrKykge1xuICAgICAgICBhbiA9IGFjY2VwdGVkVXBkYXRlc1tpXTtcbiAgICAgICAgaWYgKGhhcyhydW50aW1lTW9kdWxlSW5mbywgYW4pKSB7XG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLmRpc3Bvc2VEYXRhID0ge307XG4gICAgICAgICAgZm9yICh2YXIgaj0wOyBqPHJ1bnRpbWVNb2R1bGVJbmZvW2FuXS5kaXNwb3NlSGFuZGxlcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW2FuXS5kaXNwb3NlSGFuZGxlcnNbal0uY2FsbChudWxsLCBydW50aW1lTW9kdWxlSW5mb1thbl0uZGlzcG9zZURhdGEpO1xuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIGxvY2FsSG1yLnNldFN0YXR1cygnaWRsZScpO1xuICAgICAgICAgICAgICBjYihlIHx8IG5ldyBFcnJvcihcIlVua25vd24gZGlzcG9zZSBjYWxsYmFjayBlcnJvclwiKSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBzZWxmQWNjZXB0ZXJzID0gW107XG4gICAgICBmb3IgKGk9MCwgbGVuPWFjY2VwdGVkVXBkYXRlcy5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgICAgYW4gPSBhY2NlcHRlZFVwZGF0ZXNbaV07XG4gICAgICAgIC8vanNoaW50IC1XMDgzXG4gICAgICAgIGlmICghaGFzKHJ1bnRpbWVNb2R1bGVJbmZvLCBhbikpIHtcbiAgICAgICAgICAvLyBuZXcgbW9kdWxlc1xuICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW2FuXSA9IHtcbiAgICAgICAgICAgIGluZGV4OiBhbixcbiAgICAgICAgICAgIGhhc2g6IGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YVthbl0uaGFzaCxcbiAgICAgICAgICAgIHBhcmVudHM6IG5ldyBTdHJTZXQobG9jYWxIbXIubmV3TG9hZC5tb2R1bGVNZXRhW2FuXS5wYXJlbnRzKSxcbiAgICAgICAgICAgIG1vZHVsZTogbnVsbCxcbiAgICAgICAgICAgIGRpc3Bvc2VEYXRhOiBudWxsLFxuICAgICAgICAgICAgYWNjZXB0ZXJzOiBuZXcgU3RyU2V0KCksXG4gICAgICAgICAgICBhY2NlcHRpbmc6IG5ldyBTdHJTZXQoKSxcbiAgICAgICAgICAgIGRlY2xpbmVyczogbmV3IFN0clNldCgpLFxuICAgICAgICAgICAgZGVjbGluaW5nOiBuZXcgU3RyU2V0KCksXG4gICAgICAgICAgICBzZWxmQWNjZXB0Q2JzOiBbXSxcbiAgICAgICAgICAgIGRpc3Bvc2VIYW5kbGVyczogW11cbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKCFoYXMobG9jYWxIbXIubmV3TG9hZC5tb2R1bGVNZXRhLCBhbikpIHtcbiAgICAgICAgICAvLyByZW1vdmVkIG1vZHVsZXNcbiAgICAgICAgICBkZWxldGUgY2FjaGVkTW9kdWxlc1tydW50aW1lTW9kdWxlSW5mb1thbl0uaW5kZXhdO1xuICAgICAgICAgIGRlbGV0ZSBydW50aW1lTW9kdWxlSW5mb1thbl07XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gdXBkYXRlZCBtb2R1bGVzXG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLmhhc2ggPSBsb2NhbEhtci5uZXdMb2FkLm1vZHVsZU1ldGFbYW5dLmhhc2g7XG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLnBhcmVudHMgPSBuZXcgU3RyU2V0KGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YVthbl0ucGFyZW50cyk7XG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLm1vZHVsZSA9IG51bGw7XG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLmFjY2VwdGluZy5mb3JFYWNoKGZ1bmN0aW9uKGFjY2VwdGVkKSB7XG4gICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1thY2NlcHRlZF0uYWNjZXB0ZXJzLmRlbChhbik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bYW5dLmFjY2VwdGluZyA9IG5ldyBTdHJTZXQoKTtcbiAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1thbl0uZGVjbGluaW5nLmZvckVhY2goZnVuY3Rpb24oYWNjZXB0ZWQpIHtcbiAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW2FjY2VwdGVkXS5kZWNsaW5lcnMuZGVsKGFuKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1thbl0uZGVjbGluaW5nID0gbmV3IFN0clNldCgpO1xuICAgICAgICAgIGZvckVhY2gocnVudGltZU1vZHVsZUluZm9bYW5dLnNlbGZBY2NlcHRDYnMsIGZ1bmN0aW9uKGNiKSB7XG4gICAgICAgICAgICBzZWxmQWNjZXB0ZXJzLnB1c2goe25hbWU6IGFuLCBjYjogY2J9KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1thbl0uc2VsZkFjY2VwdENicyA9IFtdO1xuICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW2FuXS5kaXNwb3NlSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIG1vZHVsZURlZnNbcnVudGltZU1vZHVsZUluZm9bYW5dLmluZGV4XSA9IFtcbiAgICAgICAgICAvLyBtb2R1bGUgZnVuY3Rpb25cbiAgICAgICAgICBsb2NhbEhtci5uZXdMb2FkLm1vZHVsZURlZnNbbG9jYWxIbXIubmV3TG9hZC5tb2R1bGVNZXRhW2FuXS5pbmRleF1bMF0sXG4gICAgICAgICAgLy8gbW9kdWxlIGRlcHNcbiAgICAgICAgICBtYXBWYWx1ZXMobG9jYWxIbXIubmV3TG9hZC5tb2R1bGVEZWZzW2xvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YVthbl0uaW5kZXhdWzFdLCBmdW5jdGlvbihkZXBJbmRleCwgZGVwUmVmKSB7XG4gICAgICAgICAgICB2YXIgZGVwTmFtZSA9IGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlSW5kZXhlc1RvTmFtZXNbZGVwSW5kZXhdO1xuICAgICAgICAgICAgaWYgKGhhcyhsb2NhbEhtci5ydW50aW1lTW9kdWxlSW5mbywgZGVwTmFtZSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGxvY2FsSG1yLnJ1bnRpbWVNb2R1bGVJbmZvW2RlcE5hbWVdLmluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRlcE5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICAgICAgY2FjaGVkTW9kdWxlc1tydW50aW1lTW9kdWxlSW5mb1thbl0uaW5kZXhdID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gVXBkYXRlIHRoZSBhY2NlcHQgaGFuZGxlcnMgbGlzdCBhbmQgY2FsbCB0aGUgcmlnaHQgb25lc1xuICAgICAgdmFyIGVyckNhbldhaXQgPSBudWxsO1xuICAgICAgdmFyIHVwZGF0ZWROYW1lcyA9IG5ldyBTdHJTZXQoYWNjZXB0ZWRVcGRhdGVzKTtcbiAgICAgIHZhciBvbGRVcGRhdGVIYW5kbGVycyA9IGxvY2FsSG1yLnVwZGF0ZUhhbmRsZXJzO1xuICAgICAgdmFyIHJlbGV2YW50VXBkYXRlSGFuZGxlcnMgPSBbXTtcbiAgICAgIHZhciBuZXdVcGRhdGVIYW5kbGVycyA9IFtdO1xuICAgICAgZm9yIChpPTAsIGxlbj1vbGRVcGRhdGVIYW5kbGVycy5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgICAgaWYgKCF1cGRhdGVkTmFtZXMuaGFzKG9sZFVwZGF0ZUhhbmRsZXJzW2ldLmFjY2VwdGVyKSkge1xuICAgICAgICAgIG5ld1VwZGF0ZUhhbmRsZXJzLnB1c2gob2xkVXBkYXRlSGFuZGxlcnNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1cGRhdGVkTmFtZXMuaGFzSW50ZXJzZWN0aW9uKG9sZFVwZGF0ZUhhbmRsZXJzW2ldLmRlcHMpKSB7XG4gICAgICAgICAgcmVsZXZhbnRVcGRhdGVIYW5kbGVycy5wdXNoKG9sZFVwZGF0ZUhhbmRsZXJzW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9jYWxIbXIudXBkYXRlSGFuZGxlcnMgPSBuZXdVcGRhdGVIYW5kbGVycztcbiAgICAgIGZvciAoaT0wLCBsZW49cmVsZXZhbnRVcGRhdGVIYW5kbGVycy5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZWxldmFudFVwZGF0ZUhhbmRsZXJzW2ldLmNiLmNhbGwobnVsbCwgYWNjZXB0ZWRVcGRhdGVzKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYgKGVyckNhbldhaXQpIGVtaXRFcnJvcihlcnJDYW5XYWl0KTtcbiAgICAgICAgICBlcnJDYW5XYWl0ID0gZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDYWxsIHRoZSBzZWxmLWFjY2VwdGluZyBtb2R1bGVzXG4gICAgICBmb3JFYWNoKHNlbGZBY2NlcHRlcnMsIGZ1bmN0aW9uKG9iaikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVpcmUocnVudGltZU1vZHVsZUluZm9bb2JqLm5hbWVdLmluZGV4KTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYgKG9iai5jYikge1xuICAgICAgICAgICAgb2JqLmNiLmNhbGwobnVsbCwgZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChlcnJDYW5XYWl0KSBlbWl0RXJyb3IoZXJyQ2FuV2FpdCk7XG4gICAgICAgICAgICBlcnJDYW5XYWl0ID0gZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBsb2NhbEhtci5zZXRTdGF0dXMoJ2lkbGUnKTtcbiAgICAgIGNiKGVyckNhbldhaXQsIGFjY2VwdGVkVXBkYXRlcyk7XG4gICAgfTtcblxuICAgIHZhciBtb2R1bGVIb3RTZXRVcGRhdGVNb2RlID0gZnVuY3Rpb24obW9kZSwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgIGlmIChzdXBwb3J0TW9kZXMuaW5kZXhPZihtb2RlKSA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTW9kZSBcIittb2RlK1wiIG5vdCBpbiBzdXBwb3J0TW9kZXMuIFBsZWFzZSBjaGVjayB0aGUgQnJvd3NlcmlmeS1ITVIgcGx1Z2luIG9wdGlvbnMuXCIpO1xuICAgICAgfVxuICAgICAgaWYgKG1vZGUgPT09ICdhamF4JyAmJiAhb3B0aW9ucy51cmwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidXJsIHJlcXVpcmVkIGZvciBhamF4IHVwZGF0ZSBtb2RlXCIpO1xuICAgICAgfVxuICAgICAgaWYgKGxvY2FsSG1yLnN0YXR1cyAhPT0gJ2lkbGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1vZHVsZS5ob3Quc2V0VXBkYXRlTW9kZSBjYW4gb25seSBiZSBjYWxsZWQgd2hpbGUgc3RhdHVzIGlzIGlkbGVcIik7XG4gICAgICB9XG5cbiAgICAgIGxvY2FsSG1yLm5ld0xvYWQgPSBudWxsO1xuICAgICAgbG9jYWxIbXIudXBkYXRlTW9kZSA9IHVwZGF0ZU1vZGUgPSBtb2RlO1xuICAgICAgbG9jYWxIbXIudXBkYXRlVXJsID0gdXBkYXRlVXJsID0gb3B0aW9ucy51cmw7XG4gICAgICB1cGRhdGVDYWNoZUJ1c3QgPSBvcHRpb25zLmNhY2hlQnVzdDtcbiAgICAgIGlnbm9yZVVuYWNjZXB0ZWQgPSBoYXMob3B0aW9ucywgJ2lnbm9yZVVuYWNjZXB0ZWQnKSA/IG9wdGlvbnMuaWdub3JlVW5hY2NlcHRlZCA6IHRydWU7XG5cbiAgICAgIGlmIChzb2NrZXQpIHtcbiAgICAgICAgc29ja2V0LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgc29ja2V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb2RlID09PSAnd2Vic29ja2V0Jykge1xuICAgICAgICBzb2NrZXQgPSBzZXR1cFNvY2tldCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgc2V0dXBTb2NrZXQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciB1cmwgPSB1cGRhdGVVcmwgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzEyMyc7XG4gICAgICB2YXIgc29ja2V0ID0gc29ja2V0aW8odXJsLCB7J2ZvcmNlIG5ldyBjb25uZWN0aW9uJzogdHJ1ZX0pO1xuICAgICAgY29uc29sZS5sb2coJ1tITVJdIEF0dGVtcHRpbmcgd2Vic29ja2V0IGNvbm5lY3Rpb24gdG8nLCB1cmwpO1xuXG4gICAgICB2YXIgaXNBY2NlcHRpbmdNZXNzYWdlcyA9IGZhbHNlO1xuICAgICAgc29ja2V0Lm9uKCdjb25uZWN0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlzQWNjZXB0aW5nTWVzc2FnZXMgPSBmYWxzZTtcbiAgICAgICAgdmFyIHN5bmNNc2cgPSBtYXBWYWx1ZXMocnVudGltZU1vZHVsZUluZm8sIGZ1bmN0aW9uKHZhbHVlLCBuYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhhc2g6IHZhbHVlLmhhc2hcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0LmVtaXQoJ3N5bmMnLCBzeW5jTXNnKTtcbiAgICAgIH0pO1xuICAgICAgdmFyIGlzVXBkYXRpbmcgPSBmYWxzZTtcbiAgICAgIHZhciBxdWV1ZWRVcGRhdGVNZXNzYWdlcyA9IFtdO1xuICAgICAgc29ja2V0Lm9uKCdzeW5jIGNvbmZpcm0nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tITVJdIFdlYnNvY2tldCBjb25uZWN0aW9uIHN1Y2Nlc3NmdWwuJyk7XG4gICAgICAgIGlzQWNjZXB0aW5nTWVzc2FnZXMgPSB0cnVlO1xuICAgICAgICBxdWV1ZWRVcGRhdGVNZXNzYWdlcyA9IFtdO1xuICAgICAgfSk7XG4gICAgICBzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tITVJdIFdlYnNvY2tldCBjb25uZWN0aW9uIGxvc3QuJyk7XG4gICAgICB9KTtcbiAgICAgIHZhciBhY2NlcHROZXdNb2R1bGVzID0gZnVuY3Rpb24obXNnKSB7XG4gICAgICAgIC8vIE1ha2Ugc3VyZSB3ZSBkb24ndCBhY2NlcHQgbmV3IG1vZHVsZXMgYmVmb3JlIHdlJ3ZlIHN5bmNlZCBvdXJzZWx2ZXMuXG4gICAgICAgIGlmICghaXNBY2NlcHRpbmdNZXNzYWdlcykgcmV0dXJuO1xuICAgICAgICBpZiAoaXNVcGRhdGluZykge1xuICAgICAgICAgIHF1ZXVlZFVwZGF0ZU1lc3NhZ2VzLnB1c2gobXNnKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGFrZSB0aGUgbWVzc2FnZSBhbmQgY3JlYXRlIGEgbG9jYWxIbXIubmV3TG9hZCB2YWx1ZSBhcyBpZiB0aGVcbiAgICAgICAgLy8gYnVuZGxlIGhhZCBiZWVuIHJlLWV4ZWN1dGVkLCB0aGVuIGNhbGwgbW9kdWxlSG90QXBwbHkuXG4gICAgICAgIGlzVXBkYXRpbmcgPSB0cnVlO1xuXG4gICAgICAgIC8vIHJhbmRvbSBpZCBzbyB3ZSBjYW4gbWFrZSB0aGUgbm9ybWFsbHkgdW5uYW1lZCBhcmdzIGhhdmUgcmFuZG9tIG5hbWVzXG4gICAgICAgIHZhciByaWQgPSBTdHJpbmcoTWF0aC5yYW5kb20oKSkucmVwbGFjZSgvW14wLTldL2csICcnKTtcblxuICAgICAgICB2YXIgbmV3TW9kdWxlRGVmcyA9IGxvY2FsSG1yLm5ld0xvYWQgPyBsb2NhbEhtci5uZXdMb2FkLm1vZHVsZURlZnMgOiBhc3NpZ24oe30sIG1vZHVsZURlZnMpO1xuICAgICAgICB2YXIgbmV3TW9kdWxlTWV0YSA9IGxvY2FsSG1yLm5ld0xvYWQgP1xuICAgICAgICAgIGxvY2FsSG1yLm5ld0xvYWQubW9kdWxlTWV0YSA6IG1hcFZhbHVlcyhydW50aW1lTW9kdWxlSW5mbywgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgaW5kZXg6IHZhbHVlLmluZGV4LFxuICAgICAgICAgICAgICBoYXNoOiB2YWx1ZS5oYXNoLFxuICAgICAgICAgICAgICBwYXJlbnRzOiB2YWx1ZS5wYXJlbnRzLnRvQXJyYXkoKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgZm9yT3duKG1zZy5uZXdNb2R1bGVEYXRhLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgbmV3TW9kdWxlTWV0YVtrZXldID0ge1xuICAgICAgICAgICAgaW5kZXg6IHZhbHVlLmluZGV4LFxuICAgICAgICAgICAgaGFzaDogdmFsdWUuaGFzaCxcbiAgICAgICAgICAgIHBhcmVudHM6IHZhbHVlLnBhcmVudHNcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZm9yRWFjaChtc2cucmVtb3ZlZE1vZHVsZXMsIGZ1bmN0aW9uKHJlbW92ZWROYW1lKSB7XG4gICAgICAgICAgZGVsZXRlIG5ld01vZHVsZURlZnNbcnVudGltZU1vZHVsZUluZm9bcmVtb3ZlZE5hbWVdLmluZGV4XTtcbiAgICAgICAgICBkZWxldGUgbmV3TW9kdWxlTWV0YVtyZW1vdmVkTmFtZV07XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgbmV3TW9kdWxlSW5kZXhlc1RvTmFtZXMgPSBtYWtlTW9kdWxlSW5kZXhlc1RvTmFtZXMobmV3TW9kdWxlTWV0YSk7XG4gICAgICAgIGZvck93bihtc2cubmV3TW9kdWxlRGF0YSwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICAgIC8vIHRoaXMgcGFydCBuZWVkcyB0byBydW4gYWZ0ZXIgbmV3TW9kdWxlTWV0YSBhbmRcbiAgICAgICAgICAvLyBuZXdNb2R1bGVJbmRleGVzVG9OYW1lcyBhcmUgcG9wdWxhdGVkLlxuICAgICAgICAgIHZhciBuZXdNb2R1bGVGdW5jdGlvbiA9IChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBmbjtcbiAgICAgICAgICAgIC8vanNoaW50IGV2aWw6dHJ1ZVxuICAgICAgICAgICAgaWYgKGJ1bmRsZV9fZmlsZW5hbWUgfHwgYnVuZGxlX19kaXJuYW1lKSB7XG4gICAgICAgICAgICAgIGZuID0gbmV3IEZ1bmN0aW9uKCdyZXF1aXJlJywgJ21vZHVsZScsICdleHBvcnRzJywgJ191MScrcmlkLCAnX3UyJytyaWQsICdfX3UzJytyaWQsICdfX3U0JytyaWQsICdfX2ZpbGVuYW1lJywgJ19fZGlybmFtZScsIHZhbHVlLnNvdXJjZSk7XG4gICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihyZXF1aXJlLCBtb2R1bGUsIGV4cG9ydHMsIF91MSwgX3UyLCBfdTMsIF91NCkge1xuICAgICAgICAgICAgICAgIGdsb2JhbC5faG1yW2J1bmRsZUtleV0uaW5pdE1vZHVsZShrZXksIG1vZHVsZSk7XG4gICAgICAgICAgICAgICAgZm4uY2FsbCh0aGlzLCByZXF1aXJlLCBtb2R1bGUsIGV4cG9ydHMsIF91MSwgX3UyLCBfdTMsIF91NCwgYnVuZGxlX19maWxlbmFtZSwgYnVuZGxlX19kaXJuYW1lKTtcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZuID0gbmV3IEZ1bmN0aW9uKCdyZXF1aXJlJywgJ21vZHVsZScsICdleHBvcnRzJywgICdfdTEnK3JpZCwgJ191MicrcmlkLCAnX191MycrcmlkLCAnX191NCcrcmlkLCB2YWx1ZS5zb3VyY2UpO1xuICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24ocmVxdWlyZSwgbW9kdWxlLCBleHBvcnRzLCBfdTEsIF91MiwgX3UzLCBfdTQpIHtcbiAgICAgICAgICAgICAgICBnbG9iYWwuX2htcltidW5kbGVLZXldLmluaXRNb2R1bGUoa2V5LCBtb2R1bGUpO1xuICAgICAgICAgICAgICAgIGZuLmNhbGwodGhpcywgcmVxdWlyZSwgbW9kdWxlLCBleHBvcnRzLCBfdTEsIF91MiwgX3UzLCBfdTQpO1xuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICBuZXdNb2R1bGVEZWZzW25ld01vZHVsZU1ldGFba2V5XS5pbmRleF0gPSBbXG4gICAgICAgICAgICAvLyBtb2R1bGUgZnVuY3Rpb25cbiAgICAgICAgICAgIG5ld01vZHVsZUZ1bmN0aW9uLFxuICAgICAgICAgICAgLy8gbW9kdWxlIGRlcHNcbiAgICAgICAgICAgIG1hcFZhbHVlcyh2YWx1ZS5kZXBzLCBmdW5jdGlvbihkZXBJbmRleCwgZGVwUmVmKSB7XG4gICAgICAgICAgICAgIHZhciBkZXBOYW1lID0gbmV3TW9kdWxlSW5kZXhlc1RvTmFtZXNbZGVwSW5kZXhdO1xuICAgICAgICAgICAgICBpZiAoaGFzKG5ld01vZHVsZU1ldGEsIGRlcE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ld01vZHVsZU1ldGFbZGVwTmFtZV0uaW5kZXg7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlcE5hbWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxvY2FsSG1yLm5ld0xvYWQgPSB7XG4gICAgICAgICAgbW9kdWxlRGVmczogbmV3TW9kdWxlRGVmcyxcbiAgICAgICAgICBtb2R1bGVNZXRhOiBuZXdNb2R1bGVNZXRhLFxuICAgICAgICAgIG1vZHVsZUluZGV4ZXNUb05hbWVzOiBuZXdNb2R1bGVJbmRleGVzVG9OYW1lc1xuICAgICAgICB9O1xuICAgICAgICBsb2NhbEhtci5zZXRTdGF0dXMoJ3JlYWR5Jyk7XG4gICAgICAgIHZhciBvdXRkYXRlZE1vZHVsZXMgPSBnZXRPdXRkYXRlZE1vZHVsZXMoKTtcbiAgICAgICAgbW9kdWxlSG90QXBwbHkoe2lnbm9yZVVuYWNjZXB0ZWQ6IGlnbm9yZVVuYWNjZXB0ZWR9LCBmdW5jdGlvbihlcnIsIHVwZGF0ZWROYW1lcykge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tITVJdIEVycm9yIGFwcGx5aW5nIHVwZGF0ZScsIGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGVkTmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbSE1SXSBVcGRhdGVkIG1vZHVsZXMnLCB1cGRhdGVkTmFtZXMpO1xuICAgICAgICAgICAgaWYgKG91dGRhdGVkTW9kdWxlcy5sZW5ndGggIT09IHVwZGF0ZWROYW1lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgdmFyIG5vdFVwZGF0ZWROYW1lcyA9IGZpbHRlcihvdXRkYXRlZE1vZHVsZXMsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdXBkYXRlZE5hbWVzLmluZGV4T2YobmFtZSkgPT09IC0xO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1tITVJdIFNvbWUgbW9kdWxlcyB3ZXJlIG5vdCB1cGRhdGVkJywgbm90VXBkYXRlZE5hbWVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaXNVcGRhdGluZyA9IGZhbHNlO1xuICAgICAgICAgIHZhciBxdWV1ZWRNc2c7XG4gICAgICAgICAgd2hpbGUgKChxdWV1ZWRNc2cgPSBxdWV1ZWRVcGRhdGVNZXNzYWdlcy5zaGlmdCgpKSkge1xuICAgICAgICAgICAgYWNjZXB0TmV3TW9kdWxlcyhxdWV1ZWRNc2cpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgc29ja2V0Lm9uKCduZXcgbW9kdWxlcycsIGFjY2VwdE5ld01vZHVsZXMpO1xuICAgICAgcmV0dXJuIHNvY2tldDtcbiAgICB9O1xuXG4gICAgdmFyIGxvY2FsSG1yID0ge1xuICAgICAgdXBkYXRlVXJsOiB1cGRhdGVVcmwsXG4gICAgICB1cGRhdGVNb2RlOiB1cGRhdGVNb2RlLFxuICAgICAgcnVudGltZU1vZHVsZUluZm86IHJ1bnRpbWVNb2R1bGVJbmZvLFxuXG4gICAgICBzdGF0dXM6IFwiaWRsZVwiLFxuICAgICAgc2V0U3RhdHVzOiBmdW5jdGlvbihzdGF0dXMpIHtcbiAgICAgICAgdGhpcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgIHZhciBzdGF0dXNIYW5kbGVycyA9IHRoaXMuc3RhdHVzSGFuZGxlcnMuc2xpY2UoKTtcbiAgICAgICAgZm9yICh2YXIgaT0wLCBsZW49c3RhdHVzSGFuZGxlcnMubGVuZ3RoOyBpPGxlbjsgaSsrKSB7XG4gICAgICAgICAgc3RhdHVzSGFuZGxlcnNbaV0uY2FsbChudWxsLCBzdGF0dXMpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgc3RhdHVzSGFuZGxlcnM6IFtdLFxuICAgICAgdXBkYXRlSGFuZGxlcnM6IFtdLFxuXG4gICAgICAvLyBkdXJpbmcgYSByZWxvYWQgdGhpcyBpcyBzZXQgdG8gYW4gb2JqZWN0IHdpdGggbW9kdWxlRGVmcyxcbiAgICAgIC8vIG1vZHVsZU1ldGEsIGFuZCBtb2R1bGVJbmRleGVzVG9OYW1lcyBwcm9wZXJ0aWVzXG4gICAgICBuZXdMb2FkOiBudWxsLFxuXG4gICAgICBpbml0TW9kdWxlOiBmdW5jdGlvbihuYW1lLCBtb2R1bGUpIHtcbiAgICAgICAgcnVudGltZU1vZHVsZUluZm9bbmFtZV0ubW9kdWxlID0gbW9kdWxlO1xuICAgICAgICBtb2R1bGUuaG90ID0ge1xuICAgICAgICAgIGFjY2VwdDogZnVuY3Rpb24oZGVwcywgY2IpIHtcbiAgICAgICAgICAgIGlmICghY2IgJiYgKCFkZXBzIHx8IHR5cGVvZiBkZXBzID09PSAnZnVuY3Rpb24nKSkgeyAvLyBzZWxmXG4gICAgICAgICAgICAgIGNiID0gZGVwcztcbiAgICAgICAgICAgICAgZGVwcyA9IG51bGw7XG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLnNlbGZBY2NlcHRDYnMucHVzaChjYik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIGRlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgZGVwcyA9IFtkZXBzXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2YXIgZGVwTmFtZXMgPSBuZXcgU3RyU2V0KCk7XG4gICAgICAgICAgICAgIGZvciAodmFyIGk9MCwgZGVwc0xlbj1kZXBzLmxlbmd0aDsgaTxkZXBzTGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZGVwSW5kZXggPSBtb2R1bGVEZWZzW3J1bnRpbWVNb2R1bGVJbmZvW25hbWVdLmluZGV4XVsxXVtkZXBzW2ldXTtcbiAgICAgICAgICAgICAgICBpZiAoZGVwSW5kZXggPT09IHVuZGVmaW5lZCB8fCAhaGFzKG1vZHVsZUluZGV4ZXNUb05hbWVzLCBkZXBJbmRleCkpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZpbGUgZG9lcyBub3QgdXNlIGRlcGVuZGVuY3k6IFwiK2RlcHNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZXBOYW1lcy5hZGQobW9kdWxlSW5kZXhlc1RvTmFtZXNbZGVwSW5kZXhdKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBkZXBzID0gbnVsbDtcbiAgICAgICAgICAgICAgZGVwTmFtZXMuZm9yRWFjaChmdW5jdGlvbihkZXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bZGVwTmFtZV0uYWNjZXB0ZXJzLmFkZChuYW1lKTtcbiAgICAgICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5hY2NlcHRpbmcuYWRkKGRlcE5hbWUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgaWYgKGNiKSB7XG4gICAgICAgICAgICAgICAgbG9jYWxIbXIudXBkYXRlSGFuZGxlcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICBhY2NlcHRlcjogbmFtZSxcbiAgICAgICAgICAgICAgICAgIGRlcHM6IGRlcE5hbWVzLFxuICAgICAgICAgICAgICAgICAgY2I6IGNiXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlY2xpbmU6IGZ1bmN0aW9uKGRlcHMpIHtcbiAgICAgICAgICAgIGlmICghZGVwcykgeyAvLyBzZWxmXG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLmRlY2xpbmVycy5hZGQobmFtZSk7XG4gICAgICAgICAgICAgIHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLmRlY2xpbmluZy5hZGQobmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIGRlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgZGVwcyA9IFtkZXBzXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBmb3IgKHZhciBpPTAsIGRlcHNMZW49ZGVwcy5sZW5ndGg7IGk8ZGVwc0xlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlcEluZGV4ID0gbW9kdWxlRGVmc1tydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5pbmRleF1bMV1bZGVwc1tpXV07XG4gICAgICAgICAgICAgICAgaWYgKGRlcEluZGV4ID09PSB1bmRlZmluZWQgfHwgIWhhcyhtb2R1bGVJbmRleGVzVG9OYW1lcywgZGVwSW5kZXgpKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGaWxlIGRvZXMgbm90IHVzZSBkZXBlbmRlbmN5OiBcIitkZXBzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGRlcE5hbWUgPSBtb2R1bGVJbmRleGVzVG9OYW1lc1tkZXBJbmRleF07XG4gICAgICAgICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bZGVwTmFtZV0uZGVjbGluZXJzLmFkZChuYW1lKTtcbiAgICAgICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5kZWNsaW5pbmcuYWRkKGRlcE5hbWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBkYXRhOiBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5kaXNwb3NlRGF0YSxcbiAgICAgICAgICBkaXNwb3NlOiBmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRkRGlzcG9zZUhhbmRsZXIoY2IpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgYWRkRGlzcG9zZUhhbmRsZXI6IGZ1bmN0aW9uKGNiKSB7XG4gICAgICAgICAgICBydW50aW1lTW9kdWxlSW5mb1tuYW1lXS5kaXNwb3NlSGFuZGxlcnMucHVzaChjYik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZW1vdmVEaXNwb3NlSGFuZGxlcjogZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgICAgIHZhciBpeCA9IHJ1bnRpbWVNb2R1bGVJbmZvW25hbWVdLmRpc3Bvc2VIYW5kbGVycy5pbmRleE9mKGNiKTtcbiAgICAgICAgICAgIGlmIChpeCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgcnVudGltZU1vZHVsZUluZm9bbmFtZV0uZGlzcG9zZUhhbmRsZXJzLnNwbGljZShpeCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcblxuICAgICAgICAgIC8vIE1hbmFnZW1lbnRcbiAgICAgICAgICBjaGVjazogbW9kdWxlSG90Q2hlY2ssXG4gICAgICAgICAgYXBwbHk6IG1vZHVsZUhvdEFwcGx5LFxuICAgICAgICAgIHN0YXR1czogZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgICAgIGlmIChjYikge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGRTdGF0dXNIYW5kbGVyKGNiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBsb2NhbEhtci5zdGF0dXM7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhZGRTdGF0dXNIYW5kbGVyOiBmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgbG9jYWxIbXIuc3RhdHVzSGFuZGxlcnMucHVzaChjYik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZW1vdmVTdGF0dXNIYW5kbGVyOiBmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgdmFyIGl4ID0gbG9jYWxIbXIuc3RhdHVzSGFuZGxlcnMuaW5kZXhPZihjYik7XG4gICAgICAgICAgICBpZiAoaXggIT09IC0xKSB7XG4gICAgICAgICAgICAgIGxvY2FsSG1yLnN0YXR1c0hhbmRsZXJzLnNwbGljZShpeCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZXRVcGRhdGVNb2RlOiBtb2R1bGVIb3RTZXRVcGRhdGVNb2RlXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfTtcbiAgICBnbG9iYWwuX2htcltidW5kbGVLZXldID0gbG9jYWxIbXI7XG5cbiAgICBpZiAodXBkYXRlTW9kZSA9PT0gJ3dlYnNvY2tldCcpIHtcbiAgICAgIHNvY2tldCA9IHNldHVwU29ja2V0KCk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgeyAvLyBXZSdyZSBpbiBhIHJlbG9hZCFcbiAgICBnbG9iYWwuX2htcltidW5kbGVLZXldLm5ld0xvYWQgPSB7XG4gICAgICBtb2R1bGVEZWZzOiBtb2R1bGVEZWZzLFxuICAgICAgbW9kdWxlTWV0YTogbW9kdWxlTWV0YSxcbiAgICAgIG1vZHVsZUluZGV4ZXNUb05hbWVzOiBtb2R1bGVJbmRleGVzVG9OYW1lc1xuICAgIH07XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbWFpbjtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gaGFzKG9iamVjdCwgcHJvcE5hbWUpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIHByb3BOYW1lKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gaGFzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFzID0gcmVxdWlyZSgnLi9oYXMnKTtcblxuZnVuY3Rpb24gU3RyU2V0KG90aGVyKSB7XG4gIHRoaXMuX21hcCA9IHt9O1xuICB0aGlzLl9zaXplID0gMDtcbiAgaWYgKG90aGVyKSB7XG4gICAgZm9yICh2YXIgaT0wLGxlbj1vdGhlci5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgIHRoaXMuYWRkKG90aGVyW2ldKTtcbiAgICB9XG4gIH1cbn1cblN0clNldC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgaWYgKCF0aGlzLmhhcyh2YWx1ZSkpIHtcbiAgICB0aGlzLl9tYXBbdmFsdWVdID0gdHJ1ZTtcbiAgICB0aGlzLl9zaXplKys7XG4gIH1cbn07XG5TdHJTZXQucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiBoYXModGhpcy5fbWFwLCB2YWx1ZSk7XG59O1xuU3RyU2V0LnByb3RvdHlwZS5kZWwgPSBmdW5jdGlvbih2YWx1ZSkge1xuICBpZiAodGhpcy5oYXModmFsdWUpKSB7XG4gICAgZGVsZXRlIHRoaXMuX21hcFt2YWx1ZV07XG4gICAgdGhpcy5fc2l6ZS0tO1xuICB9XG59O1xuU3RyU2V0LnByb3RvdHlwZS5zaXplID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLl9zaXplO1xufTtcblN0clNldC5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uKGNiKSB7XG4gIGZvciAodmFyIHZhbHVlIGluIHRoaXMuX21hcCkge1xuICAgIGlmIChoYXModGhpcy5fbWFwLCB2YWx1ZSkpIHtcbiAgICAgIGNiKHZhbHVlKTtcbiAgICB9XG4gIH1cbn07XG5TdHJTZXQucHJvdG90eXBlLnNvbWUgPSBmdW5jdGlvbihjYikge1xuICBmb3IgKHZhciB2YWx1ZSBpbiB0aGlzLl9tYXApIHtcbiAgICBpZiAoaGFzKHRoaXMuX21hcCwgdmFsdWUpKSB7XG4gICAgICBpZiAoY2IodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuU3RyU2V0LnByb3RvdHlwZS5ldmVyeSA9IGZ1bmN0aW9uKGNiKSB7XG4gIHJldHVybiAhdGhpcy5zb21lKGZ1bmN0aW9uKHgpIHtcbiAgICByZXR1cm4gIWNiKHgpO1xuICB9KTtcbn07XG5TdHJTZXQucHJvdG90eXBlLmhhc0ludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKG90aGVyU3RyU2V0KSB7XG4gIHZhciB2YWx1ZTtcbiAgaWYgKHRoaXMuX3NpemUgPCBvdGhlclN0clNldC5fc2l6ZSkge1xuICAgIHJldHVybiB0aGlzLnNvbWUoZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiBvdGhlclN0clNldC5oYXModmFsdWUpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gb3RoZXJTdHJTZXQuc29tZShmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIHNlbGYuaGFzKHZhbHVlKTtcbiAgICB9KTtcbiAgfVxufTtcblN0clNldC5wcm90b3R5cGUudG9BcnJheSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYXJyID0gW107XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSkge1xuICAgIGFyci5wdXNoKHZhbHVlKTtcbiAgfSk7XG4gIHJldHVybiBhcnI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFN0clNldDtcbiIsIi8qKlxuICogR2V0cyB0aGUgbGFzdCBlbGVtZW50IG9mIGBhcnJheWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBBcnJheVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHF1ZXJ5LlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGxhc3QgZWxlbWVudCBvZiBgYXJyYXlgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmxhc3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IDNcbiAqL1xuZnVuY3Rpb24gbGFzdChhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwO1xuICByZXR1cm4gbGVuZ3RoID8gYXJyYXlbbGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbGFzdDtcbiIsInZhciBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5Jyk7XG5cbi8qKlxuICogVGhlIGludmVyc2Ugb2YgYF8ucGFpcnNgOyB0aGlzIG1ldGhvZCByZXR1cm5zIGFuIG9iamVjdCBjb21wb3NlZCBmcm9tIGFycmF5c1xuICogb2YgcHJvcGVydHkgbmFtZXMgYW5kIHZhbHVlcy4gUHJvdmlkZSBlaXRoZXIgYSBzaW5nbGUgdHdvIGRpbWVuc2lvbmFsIGFycmF5LFxuICogZS5nLiBgW1trZXkxLCB2YWx1ZTFdLCBba2V5MiwgdmFsdWUyXV1gIG9yIHR3byBhcnJheXMsIG9uZSBvZiBwcm9wZXJ0eSBuYW1lc1xuICogYW5kIG9uZSBvZiBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIG9iamVjdFxuICogQGNhdGVnb3J5IEFycmF5XG4gKiBAcGFyYW0ge0FycmF5fSBwcm9wcyBUaGUgcHJvcGVydHkgbmFtZXMuXG4gKiBAcGFyYW0ge0FycmF5fSBbdmFsdWVzPVtdXSBUaGUgcHJvcGVydHkgdmFsdWVzLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgbmV3IG9iamVjdC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy56aXBPYmplY3QoW1snZnJlZCcsIDMwXSwgWydiYXJuZXknLCA0MF1dKTtcbiAqIC8vID0+IHsgJ2ZyZWQnOiAzMCwgJ2Jhcm5leSc6IDQwIH1cbiAqXG4gKiBfLnppcE9iamVjdChbJ2ZyZWQnLCAnYmFybmV5J10sIFszMCwgNDBdKTtcbiAqIC8vID0+IHsgJ2ZyZWQnOiAzMCwgJ2Jhcm5leSc6IDQwIH1cbiAqL1xuZnVuY3Rpb24gemlwT2JqZWN0KHByb3BzLCB2YWx1ZXMpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBwcm9wcyA/IHByb3BzLmxlbmd0aCA6IDAsXG4gICAgICByZXN1bHQgPSB7fTtcblxuICBpZiAobGVuZ3RoICYmICF2YWx1ZXMgJiYgIWlzQXJyYXkocHJvcHNbMF0pKSB7XG4gICAgdmFsdWVzID0gW107XG4gIH1cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gdmFsdWVzW2luZGV4XTtcbiAgICB9IGVsc2UgaWYgKGtleSkge1xuICAgICAgcmVzdWx0W2tleVswXV0gPSBrZXlbMV07XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gemlwT2JqZWN0O1xuIiwidmFyIGFycmF5RmlsdGVyID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlGaWx0ZXInKSxcbiAgICBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2FsbGJhY2snKSxcbiAgICBiYXNlRmlsdGVyID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZUZpbHRlcicpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKTtcblxuLyoqXG4gKiBJdGVyYXRlcyBvdmVyIGVsZW1lbnRzIG9mIGBjb2xsZWN0aW9uYCwgcmV0dXJuaW5nIGFuIGFycmF5IG9mIGFsbCBlbGVtZW50c1xuICogYHByZWRpY2F0ZWAgcmV0dXJucyB0cnV0aHkgZm9yLiBUaGUgcHJlZGljYXRlIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmRcbiAqIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM6ICh2YWx1ZSwgaW5kZXh8a2V5LCBjb2xsZWN0aW9uKS5cbiAqXG4gKiBJZiBhIHByb3BlcnR5IG5hbWUgaXMgcHJvdmlkZWQgZm9yIGBwcmVkaWNhdGVgIHRoZSBjcmVhdGVkIGBfLnByb3BlcnR5YFxuICogc3R5bGUgY2FsbGJhY2sgcmV0dXJucyB0aGUgcHJvcGVydHkgdmFsdWUgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXG4gKlxuICogSWYgYSB2YWx1ZSBpcyBhbHNvIHByb3ZpZGVkIGZvciBgdGhpc0FyZ2AgdGhlIGNyZWF0ZWQgYF8ubWF0Y2hlc1Byb3BlcnR5YFxuICogc3R5bGUgY2FsbGJhY2sgcmV0dXJucyBgdHJ1ZWAgZm9yIGVsZW1lbnRzIHRoYXQgaGF2ZSBhIG1hdGNoaW5nIHByb3BlcnR5XG4gKiB2YWx1ZSwgZWxzZSBgZmFsc2VgLlxuICpcbiAqIElmIGFuIG9iamVjdCBpcyBwcm92aWRlZCBmb3IgYHByZWRpY2F0ZWAgdGhlIGNyZWF0ZWQgYF8ubWF0Y2hlc2Agc3R5bGVcbiAqIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGdpdmVuXG4gKiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIHNlbGVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtwcmVkaWNhdGU9Xy5pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGludm9rZWRcbiAqICBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBwcmVkaWNhdGVgLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgZmlsdGVyZWQgYXJyYXkuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZmlsdGVyKFs0LCA1LCA2XSwgZnVuY3Rpb24obikge1xuICogICByZXR1cm4gbiAlIDIgPT0gMDtcbiAqIH0pO1xuICogLy8gPT4gWzQsIDZdXG4gKlxuICogdmFyIHVzZXJzID0gW1xuICogICB7ICd1c2VyJzogJ2Jhcm5leScsICdhZ2UnOiAzNiwgJ2FjdGl2ZSc6IHRydWUgfSxcbiAqICAgeyAndXNlcic6ICdmcmVkJywgICAnYWdlJzogNDAsICdhY3RpdmUnOiBmYWxzZSB9XG4gKiBdO1xuICpcbiAqIC8vIHVzaW5nIHRoZSBgXy5tYXRjaGVzYCBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8ucGx1Y2soXy5maWx0ZXIodXNlcnMsIHsgJ2FnZSc6IDM2LCAnYWN0aXZlJzogdHJ1ZSB9KSwgJ3VzZXInKTtcbiAqIC8vID0+IFsnYmFybmV5J11cbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ubWF0Y2hlc1Byb3BlcnR5YCBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8ucGx1Y2soXy5maWx0ZXIodXNlcnMsICdhY3RpdmUnLCBmYWxzZSksICd1c2VyJyk7XG4gKiAvLyA9PiBbJ2ZyZWQnXVxuICpcbiAqIC8vIHVzaW5nIHRoZSBgXy5wcm9wZXJ0eWAgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLnBsdWNrKF8uZmlsdGVyKHVzZXJzLCAnYWN0aXZlJyksICd1c2VyJyk7XG4gKiAvLyA9PiBbJ2Jhcm5leSddXG4gKi9cbmZ1bmN0aW9uIGZpbHRlcihjb2xsZWN0aW9uLCBwcmVkaWNhdGUsIHRoaXNBcmcpIHtcbiAgdmFyIGZ1bmMgPSBpc0FycmF5KGNvbGxlY3Rpb24pID8gYXJyYXlGaWx0ZXIgOiBiYXNlRmlsdGVyO1xuICBwcmVkaWNhdGUgPSBiYXNlQ2FsbGJhY2socHJlZGljYXRlLCB0aGlzQXJnLCAzKTtcbiAgcmV0dXJuIGZ1bmMoY29sbGVjdGlvbiwgcHJlZGljYXRlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmaWx0ZXI7XG4iLCJ2YXIgYXJyYXlFYWNoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlFYWNoJyksXG4gICAgYmFzZUVhY2ggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlRWFjaCcpLFxuICAgIGNyZWF0ZUZvckVhY2ggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9jcmVhdGVGb3JFYWNoJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBlbGVtZW50cyBvZiBgY29sbGVjdGlvbmAgaW52b2tpbmcgYGl0ZXJhdGVlYCBmb3IgZWFjaCBlbGVtZW50LlxuICogVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWUgYXJndW1lbnRzOlxuICogKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLiBJdGVyYXRlZSBmdW5jdGlvbnMgbWF5IGV4aXQgaXRlcmF0aW9uIGVhcmx5XG4gKiBieSBleHBsaWNpdGx5IHJldHVybmluZyBgZmFsc2VgLlxuICpcbiAqICoqTm90ZToqKiBBcyB3aXRoIG90aGVyIFwiQ29sbGVjdGlvbnNcIiBtZXRob2RzLCBvYmplY3RzIHdpdGggYSBcImxlbmd0aFwiIHByb3BlcnR5XG4gKiBhcmUgaXRlcmF0ZWQgbGlrZSBhcnJheXMuIFRvIGF2b2lkIHRoaXMgYmVoYXZpb3IgYF8uZm9ySW5gIG9yIGBfLmZvck93bmBcbiAqIG1heSBiZSB1c2VkIGZvciBvYmplY3QgaXRlcmF0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgZWFjaFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXRlcmF0ZWU9Xy5pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgaXRlcmF0ZWVgLlxuICogQHJldHVybnMge0FycmF5fE9iamVjdHxzdHJpbmd9IFJldHVybnMgYGNvbGxlY3Rpb25gLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfKFsxLCAyXSkuZm9yRWFjaChmdW5jdGlvbihuKSB7XG4gKiAgIGNvbnNvbGUubG9nKG4pO1xuICogfSkudmFsdWUoKTtcbiAqIC8vID0+IGxvZ3MgZWFjaCB2YWx1ZSBmcm9tIGxlZnQgdG8gcmlnaHQgYW5kIHJldHVybnMgdGhlIGFycmF5XG4gKlxuICogXy5mb3JFYWNoKHsgJ2EnOiAxLCAnYic6IDIgfSwgZnVuY3Rpb24obiwga2V5KSB7XG4gKiAgIGNvbnNvbGUubG9nKG4sIGtleSk7XG4gKiB9KTtcbiAqIC8vID0+IGxvZ3MgZWFjaCB2YWx1ZS1rZXkgcGFpciBhbmQgcmV0dXJucyB0aGUgb2JqZWN0IChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbnZhciBmb3JFYWNoID0gY3JlYXRlRm9yRWFjaChhcnJheUVhY2gsIGJhc2VFYWNoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoO1xuIiwidmFyIGFycmF5TWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlNYXAnKSxcbiAgICBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2FsbGJhY2snKSxcbiAgICBiYXNlTWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZU1hcCcpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyBieSBydW5uaW5nIGVhY2ggZWxlbWVudCBpbiBgY29sbGVjdGlvbmAgdGhyb3VnaFxuICogYGl0ZXJhdGVlYC4gVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWVcbiAqIGFyZ3VtZW50czogKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLlxuICpcbiAqIElmIGEgcHJvcGVydHkgbmFtZSBpcyBwcm92aWRlZCBmb3IgYGl0ZXJhdGVlYCB0aGUgY3JlYXRlZCBgXy5wcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGEgdmFsdWUgaXMgYWxzbyBwcm92aWRlZCBmb3IgYHRoaXNBcmdgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNQcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgYSBtYXRjaGluZyBwcm9wZXJ0eVxuICogdmFsdWUsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBpdGVyYXRlZWAgdGhlIGNyZWF0ZWQgYF8ubWF0Y2hlc2Agc3R5bGVcbiAqIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGdpdmVuXG4gKiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBNYW55IGxvZGFzaCBtZXRob2RzIGFyZSBndWFyZGVkIHRvIHdvcmsgYXMgaXRlcmF0ZWVzIGZvciBtZXRob2RzIGxpa2VcbiAqIGBfLmV2ZXJ5YCwgYF8uZmlsdGVyYCwgYF8ubWFwYCwgYF8ubWFwVmFsdWVzYCwgYF8ucmVqZWN0YCwgYW5kIGBfLnNvbWVgLlxuICpcbiAqIFRoZSBndWFyZGVkIG1ldGhvZHMgYXJlOlxuICogYGFyeWAsIGBjYWxsYmFja2AsIGBjaHVua2AsIGBjbG9uZWAsIGBjcmVhdGVgLCBgY3VycnlgLCBgY3VycnlSaWdodGAsXG4gKiBgZHJvcGAsIGBkcm9wUmlnaHRgLCBgZXZlcnlgLCBgZmlsbGAsIGBmbGF0dGVuYCwgYGludmVydGAsIGBtYXhgLCBgbWluYCxcbiAqIGBwYXJzZUludGAsIGBzbGljZWAsIGBzb3J0QnlgLCBgdGFrZWAsIGB0YWtlUmlnaHRgLCBgdGVtcGxhdGVgLCBgdHJpbWAsXG4gKiBgdHJpbUxlZnRgLCBgdHJpbVJpZ2h0YCwgYHRydW5jYCwgYHJhbmRvbWAsIGByYW5nZWAsIGBzYW1wbGVgLCBgc29tZWAsXG4gKiBgc3VtYCwgYHVuaXFgLCBhbmQgYHdvcmRzYFxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgY29sbGVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtpdGVyYXRlZT1fLmlkZW50aXR5XSBUaGUgZnVuY3Rpb24gaW52b2tlZFxuICogIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGl0ZXJhdGVlYC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gdGltZXNUaHJlZShuKSB7XG4gKiAgIHJldHVybiBuICogMztcbiAqIH1cbiAqXG4gKiBfLm1hcChbMSwgMl0sIHRpbWVzVGhyZWUpO1xuICogLy8gPT4gWzMsIDZdXG4gKlxuICogXy5tYXAoeyAnYSc6IDEsICdiJzogMiB9LCB0aW1lc1RocmVlKTtcbiAqIC8vID0+IFszLCA2XSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICpcbiAqIHZhciB1c2VycyA9IFtcbiAqICAgeyAndXNlcic6ICdiYXJuZXknIH0sXG4gKiAgIHsgJ3VzZXInOiAnZnJlZCcgfVxuICogXTtcbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ucHJvcGVydHlgIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5tYXAodXNlcnMsICd1c2VyJyk7XG4gKiAvLyA9PiBbJ2Jhcm5leScsICdmcmVkJ11cbiAqL1xuZnVuY3Rpb24gbWFwKGNvbGxlY3Rpb24sIGl0ZXJhdGVlLCB0aGlzQXJnKSB7XG4gIHZhciBmdW5jID0gaXNBcnJheShjb2xsZWN0aW9uKSA/IGFycmF5TWFwIDogYmFzZU1hcDtcbiAgaXRlcmF0ZWUgPSBiYXNlQ2FsbGJhY2soaXRlcmF0ZWUsIHRoaXNBcmcsIDMpO1xuICByZXR1cm4gZnVuYyhjb2xsZWN0aW9uLCBpdGVyYXRlZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbWFwO1xuIiwidmFyIGFycmF5U29tZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2FycmF5U29tZScpLFxuICAgIGJhc2VDYWxsYmFjayA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VDYWxsYmFjaycpLFxuICAgIGJhc2VTb21lID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZVNvbWUnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5JyksXG4gICAgaXNJdGVyYXRlZUNhbGwgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0l0ZXJhdGVlQ2FsbCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgcHJlZGljYXRlYCByZXR1cm5zIHRydXRoeSBmb3IgKiphbnkqKiBlbGVtZW50IG9mIGBjb2xsZWN0aW9uYC5cbiAqIFRoZSBmdW5jdGlvbiByZXR1cm5zIGFzIHNvb24gYXMgaXQgZmluZHMgYSBwYXNzaW5nIHZhbHVlIGFuZCBkb2VzIG5vdCBpdGVyYXRlXG4gKiBvdmVyIHRoZSBlbnRpcmUgY29sbGVjdGlvbi4gVGhlIHByZWRpY2F0ZSBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWRcbiAqIHdpdGggdGhyZWUgYXJndW1lbnRzOiAodmFsdWUsIGluZGV4fGtleSwgY29sbGVjdGlvbikuXG4gKlxuICogSWYgYSBwcm9wZXJ0eSBuYW1lIGlzIHByb3ZpZGVkIGZvciBgcHJlZGljYXRlYCB0aGUgY3JlYXRlZCBgXy5wcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGEgdmFsdWUgaXMgYWxzbyBwcm92aWRlZCBmb3IgYHRoaXNBcmdgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNQcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgYSBtYXRjaGluZyBwcm9wZXJ0eVxuICogdmFsdWUsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBwcmVkaWNhdGVgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNgIHN0eWxlXG4gKiBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlblxuICogb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyBhbnlcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbnxPYmplY3R8c3RyaW5nfSBbcHJlZGljYXRlPV8uaWRlbnRpdHldIFRoZSBmdW5jdGlvbiBpbnZva2VkXG4gKiAgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgcHJlZGljYXRlYC5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBhbnkgZWxlbWVudCBwYXNzZXMgdGhlIHByZWRpY2F0ZSBjaGVjayxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uc29tZShbbnVsbCwgMCwgJ3llcycsIGZhbHNlXSwgQm9vbGVhbik7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogdmFyIHVzZXJzID0gW1xuICogICB7ICd1c2VyJzogJ2Jhcm5leScsICdhY3RpdmUnOiB0cnVlIH0sXG4gKiAgIHsgJ3VzZXInOiAnZnJlZCcsICAgJ2FjdGl2ZSc6IGZhbHNlIH1cbiAqIF07XG4gKlxuICogLy8gdXNpbmcgdGhlIGBfLm1hdGNoZXNgIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5zb21lKHVzZXJzLCB7ICd1c2VyJzogJ2Jhcm5leScsICdhY3RpdmUnOiBmYWxzZSB9KTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogLy8gdXNpbmcgdGhlIGBfLm1hdGNoZXNQcm9wZXJ0eWAgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLnNvbWUodXNlcnMsICdhY3RpdmUnLCBmYWxzZSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogLy8gdXNpbmcgdGhlIGBfLnByb3BlcnR5YCBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8uc29tZSh1c2VycywgJ2FjdGl2ZScpO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBzb21lKGNvbGxlY3Rpb24sIHByZWRpY2F0ZSwgdGhpc0FyZykge1xuICB2YXIgZnVuYyA9IGlzQXJyYXkoY29sbGVjdGlvbikgPyBhcnJheVNvbWUgOiBiYXNlU29tZTtcbiAgaWYgKHRoaXNBcmcgJiYgaXNJdGVyYXRlZUNhbGwoY29sbGVjdGlvbiwgcHJlZGljYXRlLCB0aGlzQXJnKSkge1xuICAgIHByZWRpY2F0ZSA9IHVuZGVmaW5lZDtcbiAgfVxuICBpZiAodHlwZW9mIHByZWRpY2F0ZSAhPSAnZnVuY3Rpb24nIHx8IHRoaXNBcmcgIT09IHVuZGVmaW5lZCkge1xuICAgIHByZWRpY2F0ZSA9IGJhc2VDYWxsYmFjayhwcmVkaWNhdGUsIHRoaXNBcmcsIDMpO1xuICB9XG4gIHJldHVybiBmdW5jKGNvbGxlY3Rpb24sIHByZWRpY2F0ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc29tZTtcbiIsIi8qKiBVc2VkIGFzIHRoZSBgVHlwZUVycm9yYCBtZXNzYWdlIGZvciBcIkZ1bmN0aW9uc1wiIG1ldGhvZHMuICovXG52YXIgRlVOQ19FUlJPUl9URVhUID0gJ0V4cGVjdGVkIGEgZnVuY3Rpb24nO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZU1heCA9IE1hdGgubWF4O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmdW5jdGlvbiB0aGF0IGludm9rZXMgYGZ1bmNgIHdpdGggdGhlIGB0aGlzYCBiaW5kaW5nIG9mIHRoZVxuICogY3JlYXRlZCBmdW5jdGlvbiBhbmQgYXJndW1lbnRzIGZyb20gYHN0YXJ0YCBhbmQgYmV5b25kIHByb3ZpZGVkIGFzIGFuIGFycmF5LlxuICpcbiAqICoqTm90ZToqKiBUaGlzIG1ldGhvZCBpcyBiYXNlZCBvbiB0aGUgW3Jlc3QgcGFyYW1ldGVyXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvRnVuY3Rpb25zL3Jlc3RfcGFyYW1ldGVycykuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYXBwbHkgYSByZXN0IHBhcmFtZXRlciB0by5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnQ9ZnVuYy5sZW5ndGgtMV0gVGhlIHN0YXJ0IHBvc2l0aW9uIG9mIHRoZSByZXN0IHBhcmFtZXRlci5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgc2F5ID0gXy5yZXN0UGFyYW0oZnVuY3Rpb24od2hhdCwgbmFtZXMpIHtcbiAqICAgcmV0dXJuIHdoYXQgKyAnICcgKyBfLmluaXRpYWwobmFtZXMpLmpvaW4oJywgJykgK1xuICogICAgIChfLnNpemUobmFtZXMpID4gMSA/ICcsICYgJyA6ICcnKSArIF8ubGFzdChuYW1lcyk7XG4gKiB9KTtcbiAqXG4gKiBzYXkoJ2hlbGxvJywgJ2ZyZWQnLCAnYmFybmV5JywgJ3BlYmJsZXMnKTtcbiAqIC8vID0+ICdoZWxsbyBmcmVkLCBiYXJuZXksICYgcGViYmxlcydcbiAqL1xuZnVuY3Rpb24gcmVzdFBhcmFtKGZ1bmMsIHN0YXJ0KSB7XG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xuICB9XG4gIHN0YXJ0ID0gbmF0aXZlTWF4KHN0YXJ0ID09PSB1bmRlZmluZWQgPyAoZnVuYy5sZW5ndGggLSAxKSA6ICgrc3RhcnQgfHwgMCksIDApO1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsXG4gICAgICAgIGluZGV4ID0gLTEsXG4gICAgICAgIGxlbmd0aCA9IG5hdGl2ZU1heChhcmdzLmxlbmd0aCAtIHN0YXJ0LCAwKSxcbiAgICAgICAgcmVzdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgcmVzdFtpbmRleF0gPSBhcmdzW3N0YXJ0ICsgaW5kZXhdO1xuICAgIH1cbiAgICBzd2l0Y2ggKHN0YXJ0KSB7XG4gICAgICBjYXNlIDA6IHJldHVybiBmdW5jLmNhbGwodGhpcywgcmVzdCk7XG4gICAgICBjYXNlIDE6IHJldHVybiBmdW5jLmNhbGwodGhpcywgYXJnc1swXSwgcmVzdCk7XG4gICAgICBjYXNlIDI6IHJldHVybiBmdW5jLmNhbGwodGhpcywgYXJnc1swXSwgYXJnc1sxXSwgcmVzdCk7XG4gICAgfVxuICAgIHZhciBvdGhlckFyZ3MgPSBBcnJheShzdGFydCArIDEpO1xuICAgIGluZGV4ID0gLTE7XG4gICAgd2hpbGUgKCsraW5kZXggPCBzdGFydCkge1xuICAgICAgb3RoZXJBcmdzW2luZGV4XSA9IGFyZ3NbaW5kZXhdO1xuICAgIH1cbiAgICBvdGhlckFyZ3Nbc3RhcnRdID0gcmVzdDtcbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBvdGhlckFyZ3MpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlc3RQYXJhbTtcbiIsIi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBfLmZvckVhY2hgIGZvciBhcnJheXMgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGBhcnJheWAuXG4gKi9cbmZ1bmN0aW9uIGFycmF5RWFjaChhcnJheSwgaXRlcmF0ZWUpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBpZiAoaXRlcmF0ZWUoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpID09PSBmYWxzZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIHJldHVybiBhcnJheTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheUVhY2g7XG4iLCIvKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgXy5maWx0ZXJgIGZvciBhcnJheXMgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBwcmVkaWNhdGUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGZpbHRlcmVkIGFycmF5LlxuICovXG5mdW5jdGlvbiBhcnJheUZpbHRlcihhcnJheSwgcHJlZGljYXRlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgcmVzSW5kZXggPSAtMSxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdO1xuICAgIGlmIChwcmVkaWNhdGUodmFsdWUsIGluZGV4LCBhcnJheSkpIHtcbiAgICAgIHJlc3VsdFsrK3Jlc0luZGV4XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5RmlsdGVyO1xuIiwiLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYF8ubWFwYCBmb3IgYXJyYXlzIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYXJyYXlNYXAoYXJyYXksIGl0ZXJhdGVlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBpdGVyYXRlZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheU1hcDtcbiIsIi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBfLnNvbWVgIGZvciBhcnJheXMgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBwcmVkaWNhdGUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBhbnkgZWxlbWVudCBwYXNzZXMgdGhlIHByZWRpY2F0ZSBjaGVjayxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGFycmF5U29tZShhcnJheSwgcHJlZGljYXRlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYXJyYXlTb21lO1xuIiwidmFyIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3Qva2V5cycpO1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgXy5hc3NpZ25gIGZvciBjdXN0b21pemluZyBhc3NpZ25lZCB2YWx1ZXMgd2l0aG91dFxuICogc3VwcG9ydCBmb3IgYXJndW1lbnQganVnZ2xpbmcsIG11bHRpcGxlIHNvdXJjZXMsIGFuZCBgdGhpc2AgYmluZGluZyBgY3VzdG9taXplcmBcbiAqIGZ1bmN0aW9ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgc291cmNlIG9iamVjdC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGN1c3RvbWl6ZXIgVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBhc3NpZ25lZCB2YWx1ZXMuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBhc3NpZ25XaXRoKG9iamVjdCwgc291cmNlLCBjdXN0b21pemVyKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgcHJvcHMgPSBrZXlzKHNvdXJjZSksXG4gICAgICBsZW5ndGggPSBwcm9wcy5sZW5ndGg7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdLFxuICAgICAgICB2YWx1ZSA9IG9iamVjdFtrZXldLFxuICAgICAgICByZXN1bHQgPSBjdXN0b21pemVyKHZhbHVlLCBzb3VyY2Vba2V5XSwga2V5LCBvYmplY3QsIHNvdXJjZSk7XG5cbiAgICBpZiAoKHJlc3VsdCA9PT0gcmVzdWx0ID8gKHJlc3VsdCAhPT0gdmFsdWUpIDogKHZhbHVlID09PSB2YWx1ZSkpIHx8XG4gICAgICAgICh2YWx1ZSA9PT0gdW5kZWZpbmVkICYmICEoa2V5IGluIG9iamVjdCkpKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHJlc3VsdDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhc3NpZ25XaXRoO1xuIiwidmFyIGJhc2VDb3B5ID0gcmVxdWlyZSgnLi9iYXNlQ29weScpLFxuICAgIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3Qva2V5cycpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmFzc2lnbmAgd2l0aG91dCBzdXBwb3J0IGZvciBhcmd1bWVudCBqdWdnbGluZyxcbiAqIG11bHRpcGxlIHNvdXJjZXMsIGFuZCBgY3VzdG9taXplcmAgZnVuY3Rpb25zLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBkZXN0aW5hdGlvbiBvYmplY3QuXG4gKiBAcGFyYW0ge09iamVjdH0gc291cmNlIFRoZSBzb3VyY2Ugb2JqZWN0LlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqL1xuZnVuY3Rpb24gYmFzZUFzc2lnbihvYmplY3QsIHNvdXJjZSkge1xuICByZXR1cm4gc291cmNlID09IG51bGxcbiAgICA/IG9iamVjdFxuICAgIDogYmFzZUNvcHkoc291cmNlLCBrZXlzKHNvdXJjZSksIG9iamVjdCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUFzc2lnbjtcbiIsInZhciBiYXNlTWF0Y2hlcyA9IHJlcXVpcmUoJy4vYmFzZU1hdGNoZXMnKSxcbiAgICBiYXNlTWF0Y2hlc1Byb3BlcnR5ID0gcmVxdWlyZSgnLi9iYXNlTWF0Y2hlc1Byb3BlcnR5JyksXG4gICAgYmluZENhbGxiYWNrID0gcmVxdWlyZSgnLi9iaW5kQ2FsbGJhY2snKSxcbiAgICBpZGVudGl0eSA9IHJlcXVpcmUoJy4uL3V0aWxpdHkvaWRlbnRpdHknKSxcbiAgICBwcm9wZXJ0eSA9IHJlcXVpcmUoJy4uL3V0aWxpdHkvcHJvcGVydHknKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5jYWxsYmFja2Agd2hpY2ggc3VwcG9ydHMgc3BlY2lmeWluZyB0aGVcbiAqIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gW2Z1bmM9Xy5pZGVudGl0eV0gVGhlIHZhbHVlIHRvIGNvbnZlcnQgdG8gYSBjYWxsYmFjay5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgZnVuY2AuXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyZ0NvdW50XSBUaGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0byBwcm92aWRlIHRvIGBmdW5jYC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgY2FsbGJhY2suXG4gKi9cbmZ1bmN0aW9uIGJhc2VDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiBmdW5jO1xuICBpZiAodHlwZSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIHRoaXNBcmcgPT09IHVuZGVmaW5lZFxuICAgICAgPyBmdW5jXG4gICAgICA6IGJpbmRDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCk7XG4gIH1cbiAgaWYgKGZ1bmMgPT0gbnVsbCkge1xuICAgIHJldHVybiBpZGVudGl0eTtcbiAgfVxuICBpZiAodHlwZSA9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBiYXNlTWF0Y2hlcyhmdW5jKTtcbiAgfVxuICByZXR1cm4gdGhpc0FyZyA9PT0gdW5kZWZpbmVkXG4gICAgPyBwcm9wZXJ0eShmdW5jKVxuICAgIDogYmFzZU1hdGNoZXNQcm9wZXJ0eShmdW5jLCB0aGlzQXJnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ2FsbGJhY2s7XG4iLCIvKipcbiAqIENvcGllcyBwcm9wZXJ0aWVzIG9mIGBzb3VyY2VgIHRvIGBvYmplY3RgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gc291cmNlIFRoZSBvYmplY3QgdG8gY29weSBwcm9wZXJ0aWVzIGZyb20uXG4gKiBAcGFyYW0ge0FycmF5fSBwcm9wcyBUaGUgcHJvcGVydHkgbmFtZXMgdG8gY29weS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0PXt9XSBUaGUgb2JqZWN0IHRvIGNvcHkgcHJvcGVydGllcyB0by5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VDb3B5KHNvdXJjZSwgcHJvcHMsIG9iamVjdCkge1xuICBvYmplY3QgfHwgKG9iamVjdCA9IHt9KTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgb2JqZWN0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VDb3B5O1xuIiwidmFyIGJhc2VGb3JPd24gPSByZXF1aXJlKCcuL2Jhc2VGb3JPd24nKSxcbiAgICBjcmVhdGVCYXNlRWFjaCA9IHJlcXVpcmUoJy4vY3JlYXRlQmFzZUVhY2gnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5mb3JFYWNoYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7QXJyYXl8T2JqZWN0fHN0cmluZ30gUmV0dXJucyBgY29sbGVjdGlvbmAuXG4gKi9cbnZhciBiYXNlRWFjaCA9IGNyZWF0ZUJhc2VFYWNoKGJhc2VGb3JPd24pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VFYWNoO1xuIiwidmFyIGJhc2VFYWNoID0gcmVxdWlyZSgnLi9iYXNlRWFjaCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZpbHRlcmAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBwcmVkaWNhdGUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGZpbHRlcmVkIGFycmF5LlxuICovXG5mdW5jdGlvbiBiYXNlRmlsdGVyKGNvbGxlY3Rpb24sIHByZWRpY2F0ZSkge1xuICB2YXIgcmVzdWx0ID0gW107XG4gIGJhc2VFYWNoKGNvbGxlY3Rpb24sIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgIGlmIChwcmVkaWNhdGUodmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSkge1xuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZpbHRlcjtcbiIsInZhciBjcmVhdGVCYXNlRm9yID0gcmVxdWlyZSgnLi9jcmVhdGVCYXNlRm9yJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYGJhc2VGb3JJbmAgYW5kIGBiYXNlRm9yT3duYCB3aGljaCBpdGVyYXRlc1xuICogb3ZlciBgb2JqZWN0YCBwcm9wZXJ0aWVzIHJldHVybmVkIGJ5IGBrZXlzRnVuY2AgaW52b2tpbmcgYGl0ZXJhdGVlYCBmb3JcbiAqIGVhY2ggcHJvcGVydHkuIEl0ZXJhdGVlIGZ1bmN0aW9ucyBtYXkgZXhpdCBpdGVyYXRpb24gZWFybHkgYnkgZXhwbGljaXRseVxuICogcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHtGdW5jdGlvbn0ga2V5c0Z1bmMgVGhlIGZ1bmN0aW9uIHRvIGdldCB0aGUga2V5cyBvZiBgb2JqZWN0YC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKi9cbnZhciBiYXNlRm9yID0gY3JlYXRlQmFzZUZvcigpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGb3I7XG4iLCJ2YXIgYmFzZUZvciA9IHJlcXVpcmUoJy4vYmFzZUZvcicpLFxuICAgIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3Qva2V5cycpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZvck93bmAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqL1xuZnVuY3Rpb24gYmFzZUZvck93bihvYmplY3QsIGl0ZXJhdGVlKSB7XG4gIHJldHVybiBiYXNlRm9yKG9iamVjdCwgaXRlcmF0ZWUsIGtleXMpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGb3JPd247XG4iLCJ2YXIgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYGdldGAgd2l0aG91dCBzdXBwb3J0IGZvciBzdHJpbmcgcGF0aHNcbiAqIGFuZCBkZWZhdWx0IHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHBhcmFtIHtBcnJheX0gcGF0aCBUaGUgcGF0aCBvZiB0aGUgcHJvcGVydHkgdG8gZ2V0LlxuICogQHBhcmFtIHtzdHJpbmd9IFtwYXRoS2V5XSBUaGUga2V5IHJlcHJlc2VudGF0aW9uIG9mIHBhdGguXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgcmVzb2x2ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIGJhc2VHZXQob2JqZWN0LCBwYXRoLCBwYXRoS2V5KSB7XG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocGF0aEtleSAhPT0gdW5kZWZpbmVkICYmIHBhdGhLZXkgaW4gdG9PYmplY3Qob2JqZWN0KSkge1xuICAgIHBhdGggPSBbcGF0aEtleV07XG4gIH1cbiAgdmFyIGluZGV4ID0gMCxcbiAgICAgIGxlbmd0aCA9IHBhdGgubGVuZ3RoO1xuXG4gIHdoaWxlIChvYmplY3QgIT0gbnVsbCAmJiBpbmRleCA8IGxlbmd0aCkge1xuICAgIG9iamVjdCA9IG9iamVjdFtwYXRoW2luZGV4KytdXTtcbiAgfVxuICByZXR1cm4gKGluZGV4ICYmIGluZGV4ID09IGxlbmd0aCkgPyBvYmplY3QgOiB1bmRlZmluZWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUdldDtcbiIsInZhciBiYXNlSXNFcXVhbERlZXAgPSByZXF1aXJlKCcuL2Jhc2VJc0VxdWFsRGVlcCcpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4vaXNPYmplY3RMaWtlJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uaXNFcXVhbGAgd2l0aG91dCBzdXBwb3J0IGZvciBgdGhpc2AgYmluZGluZ1xuICogYGN1c3RvbWl6ZXJgIGZ1bmN0aW9ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7Kn0gb3RoZXIgVGhlIG90aGVyIHZhbHVlIHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgdmFsdWVzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNMb29zZV0gU3BlY2lmeSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBXSBUcmFja3MgdHJhdmVyc2VkIGB2YWx1ZWAgb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0JdIFRyYWNrcyB0cmF2ZXJzZWQgYG90aGVyYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUlzRXF1YWwodmFsdWUsIG90aGVyLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQikge1xuICBpZiAodmFsdWUgPT09IG90aGVyKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlID09IG51bGwgfHwgb3RoZXIgPT0gbnVsbCB8fCAoIWlzT2JqZWN0KHZhbHVlKSAmJiAhaXNPYmplY3RMaWtlKG90aGVyKSkpIHtcbiAgICByZXR1cm4gdmFsdWUgIT09IHZhbHVlICYmIG90aGVyICE9PSBvdGhlcjtcbiAgfVxuICByZXR1cm4gYmFzZUlzRXF1YWxEZWVwKHZhbHVlLCBvdGhlciwgYmFzZUlzRXF1YWwsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNFcXVhbDtcbiIsInZhciBlcXVhbEFycmF5cyA9IHJlcXVpcmUoJy4vZXF1YWxBcnJheXMnKSxcbiAgICBlcXVhbEJ5VGFnID0gcmVxdWlyZSgnLi9lcXVhbEJ5VGFnJyksXG4gICAgZXF1YWxPYmplY3RzID0gcmVxdWlyZSgnLi9lcXVhbE9iamVjdHMnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5JyksXG4gICAgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc1R5cGVkQXJyYXknKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFyZ3NUYWcgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUlzRXF1YWxgIGZvciBhcnJheXMgYW5kIG9iamVjdHMgd2hpY2ggcGVyZm9ybXNcbiAqIGRlZXAgY29tcGFyaXNvbnMgYW5kIHRyYWNrcyB0cmF2ZXJzZWQgb2JqZWN0cyBlbmFibGluZyBvYmplY3RzIHdpdGggY2lyY3VsYXJcbiAqIHJlZmVyZW5jZXMgdG8gYmUgY29tcGFyZWQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG90aGVyIFRoZSBvdGhlciBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVxdWFsRnVuYyBUaGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGVxdWl2YWxlbnRzIG9mIHZhbHVlcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyBvYmplY3RzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNMb29zZV0gU3BlY2lmeSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBPVtdXSBUcmFja3MgdHJhdmVyc2VkIGB2YWx1ZWAgb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0I9W11dIFRyYWNrcyB0cmF2ZXJzZWQgYG90aGVyYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBvYmplY3RzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJc0VxdWFsRGVlcChvYmplY3QsIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIHZhciBvYmpJc0FyciA9IGlzQXJyYXkob2JqZWN0KSxcbiAgICAgIG90aElzQXJyID0gaXNBcnJheShvdGhlciksXG4gICAgICBvYmpUYWcgPSBhcnJheVRhZyxcbiAgICAgIG90aFRhZyA9IGFycmF5VGFnO1xuXG4gIGlmICghb2JqSXNBcnIpIHtcbiAgICBvYmpUYWcgPSBvYmpUb1N0cmluZy5jYWxsKG9iamVjdCk7XG4gICAgaWYgKG9ialRhZyA9PSBhcmdzVGFnKSB7XG4gICAgICBvYmpUYWcgPSBvYmplY3RUYWc7XG4gICAgfSBlbHNlIGlmIChvYmpUYWcgIT0gb2JqZWN0VGFnKSB7XG4gICAgICBvYmpJc0FyciA9IGlzVHlwZWRBcnJheShvYmplY3QpO1xuICAgIH1cbiAgfVxuICBpZiAoIW90aElzQXJyKSB7XG4gICAgb3RoVGFnID0gb2JqVG9TdHJpbmcuY2FsbChvdGhlcik7XG4gICAgaWYgKG90aFRhZyA9PSBhcmdzVGFnKSB7XG4gICAgICBvdGhUYWcgPSBvYmplY3RUYWc7XG4gICAgfSBlbHNlIGlmIChvdGhUYWcgIT0gb2JqZWN0VGFnKSB7XG4gICAgICBvdGhJc0FyciA9IGlzVHlwZWRBcnJheShvdGhlcik7XG4gICAgfVxuICB9XG4gIHZhciBvYmpJc09iaiA9IG9ialRhZyA9PSBvYmplY3RUYWcsXG4gICAgICBvdGhJc09iaiA9IG90aFRhZyA9PSBvYmplY3RUYWcsXG4gICAgICBpc1NhbWVUYWcgPSBvYmpUYWcgPT0gb3RoVGFnO1xuXG4gIGlmIChpc1NhbWVUYWcgJiYgIShvYmpJc0FyciB8fCBvYmpJc09iaikpIHtcbiAgICByZXR1cm4gZXF1YWxCeVRhZyhvYmplY3QsIG90aGVyLCBvYmpUYWcpO1xuICB9XG4gIGlmICghaXNMb29zZSkge1xuICAgIHZhciBvYmpJc1dyYXBwZWQgPSBvYmpJc09iaiAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ19fd3JhcHBlZF9fJyksXG4gICAgICAgIG90aElzV3JhcHBlZCA9IG90aElzT2JqICYmIGhhc093blByb3BlcnR5LmNhbGwob3RoZXIsICdfX3dyYXBwZWRfXycpO1xuXG4gICAgaWYgKG9iaklzV3JhcHBlZCB8fCBvdGhJc1dyYXBwZWQpIHtcbiAgICAgIHJldHVybiBlcXVhbEZ1bmMob2JqSXNXcmFwcGVkID8gb2JqZWN0LnZhbHVlKCkgOiBvYmplY3QsIG90aElzV3JhcHBlZCA/IG90aGVyLnZhbHVlKCkgOiBvdGhlciwgY3VzdG9taXplciwgaXNMb29zZSwgc3RhY2tBLCBzdGFja0IpO1xuICAgIH1cbiAgfVxuICBpZiAoIWlzU2FtZVRhZykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBBc3N1bWUgY3ljbGljIHZhbHVlcyBhcmUgZXF1YWwuXG4gIC8vIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGRldGVjdGluZyBjaXJjdWxhciByZWZlcmVuY2VzIHNlZSBodHRwczovL2VzNS5naXRodWIuaW8vI0pPLlxuICBzdGFja0EgfHwgKHN0YWNrQSA9IFtdKTtcbiAgc3RhY2tCIHx8IChzdGFja0IgPSBbXSk7XG5cbiAgdmFyIGxlbmd0aCA9IHN0YWNrQS5sZW5ndGg7XG4gIHdoaWxlIChsZW5ndGgtLSkge1xuICAgIGlmIChzdGFja0FbbGVuZ3RoXSA9PSBvYmplY3QpIHtcbiAgICAgIHJldHVybiBzdGFja0JbbGVuZ3RoXSA9PSBvdGhlcjtcbiAgICB9XG4gIH1cbiAgLy8gQWRkIGBvYmplY3RgIGFuZCBgb3RoZXJgIHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgc3RhY2tBLnB1c2gob2JqZWN0KTtcbiAgc3RhY2tCLnB1c2gob3RoZXIpO1xuXG4gIHZhciByZXN1bHQgPSAob2JqSXNBcnIgPyBlcXVhbEFycmF5cyA6IGVxdWFsT2JqZWN0cykob2JqZWN0LCBvdGhlciwgZXF1YWxGdW5jLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQik7XG5cbiAgc3RhY2tBLnBvcCgpO1xuICBzdGFja0IucG9wKCk7XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNFcXVhbERlZXA7XG4iLCJ2YXIgYmFzZUlzRXF1YWwgPSByZXF1aXJlKCcuL2Jhc2VJc0VxdWFsJyksXG4gICAgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uaXNNYXRjaGAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHBhcmFtIHtBcnJheX0gbWF0Y2hEYXRhIFRoZSBwcm9wZXJ5IG5hbWVzLCB2YWx1ZXMsIGFuZCBjb21wYXJlIGZsYWdzIHRvIG1hdGNoLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY29tcGFyaW5nIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYG9iamVjdGAgaXMgYSBtYXRjaCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBiYXNlSXNNYXRjaChvYmplY3QsIG1hdGNoRGF0YSwgY3VzdG9taXplcikge1xuICB2YXIgaW5kZXggPSBtYXRjaERhdGEubGVuZ3RoLFxuICAgICAgbGVuZ3RoID0gaW5kZXgsXG4gICAgICBub0N1c3RvbWl6ZXIgPSAhY3VzdG9taXplcjtcblxuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICByZXR1cm4gIWxlbmd0aDtcbiAgfVxuICBvYmplY3QgPSB0b09iamVjdChvYmplY3QpO1xuICB3aGlsZSAoaW5kZXgtLSkge1xuICAgIHZhciBkYXRhID0gbWF0Y2hEYXRhW2luZGV4XTtcbiAgICBpZiAoKG5vQ3VzdG9taXplciAmJiBkYXRhWzJdKVxuICAgICAgICAgID8gZGF0YVsxXSAhPT0gb2JqZWN0W2RhdGFbMF1dXG4gICAgICAgICAgOiAhKGRhdGFbMF0gaW4gb2JqZWN0KVxuICAgICAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBkYXRhID0gbWF0Y2hEYXRhW2luZGV4XTtcbiAgICB2YXIga2V5ID0gZGF0YVswXSxcbiAgICAgICAgb2JqVmFsdWUgPSBvYmplY3Rba2V5XSxcbiAgICAgICAgc3JjVmFsdWUgPSBkYXRhWzFdO1xuXG4gICAgaWYgKG5vQ3VzdG9taXplciAmJiBkYXRhWzJdKSB7XG4gICAgICBpZiAob2JqVmFsdWUgPT09IHVuZGVmaW5lZCAmJiAhKGtleSBpbiBvYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc3VsdCA9IGN1c3RvbWl6ZXIgPyBjdXN0b21pemVyKG9ialZhbHVlLCBzcmNWYWx1ZSwga2V5KSA6IHVuZGVmaW5lZDtcbiAgICAgIGlmICghKHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gYmFzZUlzRXF1YWwoc3JjVmFsdWUsIG9ialZhbHVlLCBjdXN0b21pemVyLCB0cnVlKSA6IHJlc3VsdCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNNYXRjaDtcbiIsInZhciBiYXNlRWFjaCA9IHJlcXVpcmUoJy4vYmFzZUVhY2gnKSxcbiAgICBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXNBcnJheUxpa2UnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5tYXBgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICogYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYmFzZU1hcChjb2xsZWN0aW9uLCBpdGVyYXRlZSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIHJlc3VsdCA9IGlzQXJyYXlMaWtlKGNvbGxlY3Rpb24pID8gQXJyYXkoY29sbGVjdGlvbi5sZW5ndGgpIDogW107XG5cbiAgYmFzZUVhY2goY29sbGVjdGlvbiwgZnVuY3Rpb24odmFsdWUsIGtleSwgY29sbGVjdGlvbikge1xuICAgIHJlc3VsdFsrK2luZGV4XSA9IGl0ZXJhdGVlKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlTWFwO1xuIiwidmFyIGJhc2VJc01hdGNoID0gcmVxdWlyZSgnLi9iYXNlSXNNYXRjaCcpLFxuICAgIGdldE1hdGNoRGF0YSA9IHJlcXVpcmUoJy4vZ2V0TWF0Y2hEYXRhJyksXG4gICAgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ubWF0Y2hlc2Agd2hpY2ggZG9lcyBub3QgY2xvbmUgYHNvdXJjZWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb3VyY2UgVGhlIG9iamVjdCBvZiBwcm9wZXJ0eSB2YWx1ZXMgdG8gbWF0Y2guXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZU1hdGNoZXMoc291cmNlKSB7XG4gIHZhciBtYXRjaERhdGEgPSBnZXRNYXRjaERhdGEoc291cmNlKTtcbiAgaWYgKG1hdGNoRGF0YS5sZW5ndGggPT0gMSAmJiBtYXRjaERhdGFbMF1bMl0pIHtcbiAgICB2YXIga2V5ID0gbWF0Y2hEYXRhWzBdWzBdLFxuICAgICAgICB2YWx1ZSA9IG1hdGNoRGF0YVswXVsxXTtcblxuICAgIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqZWN0W2tleV0gPT09IHZhbHVlICYmICh2YWx1ZSAhPT0gdW5kZWZpbmVkIHx8IChrZXkgaW4gdG9PYmplY3Qob2JqZWN0KSkpO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHJldHVybiBiYXNlSXNNYXRjaChvYmplY3QsIG1hdGNoRGF0YSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZU1hdGNoZXM7XG4iLCJ2YXIgYmFzZUdldCA9IHJlcXVpcmUoJy4vYmFzZUdldCcpLFxuICAgIGJhc2VJc0VxdWFsID0gcmVxdWlyZSgnLi9iYXNlSXNFcXVhbCcpLFxuICAgIGJhc2VTbGljZSA9IHJlcXVpcmUoJy4vYmFzZVNsaWNlJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIGlzS2V5ID0gcmVxdWlyZSgnLi9pc0tleScpLFxuICAgIGlzU3RyaWN0Q29tcGFyYWJsZSA9IHJlcXVpcmUoJy4vaXNTdHJpY3RDb21wYXJhYmxlJyksXG4gICAgbGFzdCA9IHJlcXVpcmUoJy4uL2FycmF5L2xhc3QnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKSxcbiAgICB0b1BhdGggPSByZXF1aXJlKCcuL3RvUGF0aCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLm1hdGNoZXNQcm9wZXJ0eWAgd2hpY2ggZG9lcyBub3QgY2xvbmUgYHNyY1ZhbHVlYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtzdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIHByb3BlcnR5IHRvIGdldC5cbiAqIEBwYXJhbSB7Kn0gc3JjVmFsdWUgVGhlIHZhbHVlIHRvIGNvbXBhcmUuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZU1hdGNoZXNQcm9wZXJ0eShwYXRoLCBzcmNWYWx1ZSkge1xuICB2YXIgaXNBcnIgPSBpc0FycmF5KHBhdGgpLFxuICAgICAgaXNDb21tb24gPSBpc0tleShwYXRoKSAmJiBpc1N0cmljdENvbXBhcmFibGUoc3JjVmFsdWUpLFxuICAgICAgcGF0aEtleSA9IChwYXRoICsgJycpO1xuXG4gIHBhdGggPSB0b1BhdGgocGF0aCk7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdmFyIGtleSA9IHBhdGhLZXk7XG4gICAgb2JqZWN0ID0gdG9PYmplY3Qob2JqZWN0KTtcbiAgICBpZiAoKGlzQXJyIHx8ICFpc0NvbW1vbikgJiYgIShrZXkgaW4gb2JqZWN0KSkge1xuICAgICAgb2JqZWN0ID0gcGF0aC5sZW5ndGggPT0gMSA/IG9iamVjdCA6IGJhc2VHZXQob2JqZWN0LCBiYXNlU2xpY2UocGF0aCwgMCwgLTEpKTtcbiAgICAgIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBrZXkgPSBsYXN0KHBhdGgpO1xuICAgICAgb2JqZWN0ID0gdG9PYmplY3Qob2JqZWN0KTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdFtrZXldID09PSBzcmNWYWx1ZVxuICAgICAgPyAoc3JjVmFsdWUgIT09IHVuZGVmaW5lZCB8fCAoa2V5IGluIG9iamVjdCkpXG4gICAgICA6IGJhc2VJc0VxdWFsKHNyY1ZhbHVlLCBvYmplY3Rba2V5XSwgdW5kZWZpbmVkLCB0cnVlKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlTWF0Y2hlc1Byb3BlcnR5O1xuIiwiLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5wcm9wZXJ0eWAgd2l0aG91dCBzdXBwb3J0IGZvciBkZWVwIHBhdGhzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBrZXkgb2YgdGhlIHByb3BlcnR5IHRvIGdldC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlUHJvcGVydHkoa2V5KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3Rba2V5XTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlUHJvcGVydHk7XG4iLCJ2YXIgYmFzZUdldCA9IHJlcXVpcmUoJy4vYmFzZUdldCcpLFxuICAgIHRvUGF0aCA9IHJlcXVpcmUoJy4vdG9QYXRoJyk7XG5cbi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBiYXNlUHJvcGVydHlgIHdoaWNoIHN1cHBvcnRzIGRlZXAgcGF0aHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8c3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZVByb3BlcnR5RGVlcChwYXRoKSB7XG4gIHZhciBwYXRoS2V5ID0gKHBhdGggKyAnJyk7XG4gIHBhdGggPSB0b1BhdGgocGF0aCk7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4gYmFzZUdldChvYmplY3QsIHBhdGgsIHBhdGhLZXkpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VQcm9wZXJ0eURlZXA7XG4iLCIvKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLnNsaWNlYCB3aXRob3V0IGFuIGl0ZXJhdGVlIGNhbGwgZ3VhcmQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBzbGljZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnQ9MF0gVGhlIHN0YXJ0IHBvc2l0aW9uLlxuICogQHBhcmFtIHtudW1iZXJ9IFtlbmQ9YXJyYXkubGVuZ3RoXSBUaGUgZW5kIHBvc2l0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBzbGljZSBvZiBgYXJyYXlgLlxuICovXG5mdW5jdGlvbiBiYXNlU2xpY2UoYXJyYXksIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cbiAgc3RhcnQgPSBzdGFydCA9PSBudWxsID8gMCA6ICgrc3RhcnQgfHwgMCk7XG4gIGlmIChzdGFydCA8IDApIHtcbiAgICBzdGFydCA9IC1zdGFydCA+IGxlbmd0aCA/IDAgOiAobGVuZ3RoICsgc3RhcnQpO1xuICB9XG4gIGVuZCA9IChlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPiBsZW5ndGgpID8gbGVuZ3RoIDogKCtlbmQgfHwgMCk7XG4gIGlmIChlbmQgPCAwKSB7XG4gICAgZW5kICs9IGxlbmd0aDtcbiAgfVxuICBsZW5ndGggPSBzdGFydCA+IGVuZCA/IDAgOiAoKGVuZCAtIHN0YXJ0KSA+Pj4gMCk7XG4gIHN0YXJ0ID4+Pj0gMDtcblxuICB2YXIgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICByZXN1bHRbaW5kZXhdID0gYXJyYXlbaW5kZXggKyBzdGFydF07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlU2xpY2U7XG4iLCJ2YXIgYmFzZUVhY2ggPSByZXF1aXJlKCcuL2Jhc2VFYWNoJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uc29tZWAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzXG4gKiBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBwcmVkaWNhdGUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBhbnkgZWxlbWVudCBwYXNzZXMgdGhlIHByZWRpY2F0ZSBjaGVjayxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VTb21lKGNvbGxlY3Rpb24sIHByZWRpY2F0ZSkge1xuICB2YXIgcmVzdWx0O1xuXG4gIGJhc2VFYWNoKGNvbGxlY3Rpb24sIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgIHJlc3VsdCA9IHByZWRpY2F0ZSh2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIHJldHVybiAhcmVzdWx0O1xuICB9KTtcbiAgcmV0dXJuICEhcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VTb21lO1xuIiwiLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgc3RyaW5nIGlmIGl0J3Mgbm90IG9uZS4gQW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkXG4gKiBmb3IgYG51bGxgIG9yIGB1bmRlZmluZWRgIHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gYmFzZVRvU3RyaW5nKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PSBudWxsID8gJycgOiAodmFsdWUgKyAnJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVRvU3RyaW5nO1xuIiwidmFyIGlkZW50aXR5ID0gcmVxdWlyZSgnLi4vdXRpbGl0eS9pZGVudGl0eScpO1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUNhbGxiYWNrYCB3aGljaCBvbmx5IHN1cHBvcnRzIGB0aGlzYCBiaW5kaW5nXG4gKiBhbmQgc3BlY2lmeWluZyB0aGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0byBwcm92aWRlIHRvIGBmdW5jYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYmluZC5cbiAqIEBwYXJhbSB7Kn0gdGhpc0FyZyBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGZ1bmNgLlxuICogQHBhcmFtIHtudW1iZXJ9IFthcmdDb3VudF0gVGhlIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIGNhbGxiYWNrLlxuICovXG5mdW5jdGlvbiBiaW5kQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gaWRlbnRpdHk7XG4gIH1cbiAgaWYgKHRoaXNBcmcgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmdW5jO1xuICB9XG4gIHN3aXRjaCAoYXJnQ291bnQpIHtcbiAgICBjYXNlIDE6IHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCB2YWx1ZSk7XG4gICAgfTtcbiAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICB9O1xuICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDU6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgb3RoZXIsIGtleSwgb2JqZWN0LCBzb3VyY2UpIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUsIG90aGVyLCBrZXksIG9iamVjdCwgc291cmNlKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmd1bWVudHMpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJpbmRDYWxsYmFjaztcbiIsInZhciBiaW5kQ2FsbGJhY2sgPSByZXF1aXJlKCcuL2JpbmRDYWxsYmFjaycpLFxuICAgIGlzSXRlcmF0ZWVDYWxsID0gcmVxdWlyZSgnLi9pc0l0ZXJhdGVlQ2FsbCcpLFxuICAgIHJlc3RQYXJhbSA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL3Jlc3RQYXJhbScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBgXy5hc3NpZ25gLCBgXy5kZWZhdWx0c2AsIG9yIGBfLm1lcmdlYCBmdW5jdGlvbi5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gYXNzaWduZXIgVGhlIGZ1bmN0aW9uIHRvIGFzc2lnbiB2YWx1ZXMuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBhc3NpZ25lciBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlQXNzaWduZXIoYXNzaWduZXIpIHtcbiAgcmV0dXJuIHJlc3RQYXJhbShmdW5jdGlvbihvYmplY3QsIHNvdXJjZXMpIHtcbiAgICB2YXIgaW5kZXggPSAtMSxcbiAgICAgICAgbGVuZ3RoID0gb2JqZWN0ID09IG51bGwgPyAwIDogc291cmNlcy5sZW5ndGgsXG4gICAgICAgIGN1c3RvbWl6ZXIgPSBsZW5ndGggPiAyID8gc291cmNlc1tsZW5ndGggLSAyXSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZ3VhcmQgPSBsZW5ndGggPiAyID8gc291cmNlc1syXSA6IHVuZGVmaW5lZCxcbiAgICAgICAgdGhpc0FyZyA9IGxlbmd0aCA+IDEgPyBzb3VyY2VzW2xlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXG4gICAgaWYgKHR5cGVvZiBjdXN0b21pemVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGN1c3RvbWl6ZXIgPSBiaW5kQ2FsbGJhY2soY3VzdG9taXplciwgdGhpc0FyZywgNSk7XG4gICAgICBsZW5ndGggLT0gMjtcbiAgICB9IGVsc2Uge1xuICAgICAgY3VzdG9taXplciA9IHR5cGVvZiB0aGlzQXJnID09ICdmdW5jdGlvbicgPyB0aGlzQXJnIDogdW5kZWZpbmVkO1xuICAgICAgbGVuZ3RoIC09IChjdXN0b21pemVyID8gMSA6IDApO1xuICAgIH1cbiAgICBpZiAoZ3VhcmQgJiYgaXNJdGVyYXRlZUNhbGwoc291cmNlc1swXSwgc291cmNlc1sxXSwgZ3VhcmQpKSB7XG4gICAgICBjdXN0b21pemVyID0gbGVuZ3RoIDwgMyA/IHVuZGVmaW5lZCA6IGN1c3RvbWl6ZXI7XG4gICAgICBsZW5ndGggPSAxO1xuICAgIH1cbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgdmFyIHNvdXJjZSA9IHNvdXJjZXNbaW5kZXhdO1xuICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICBhc3NpZ25lcihvYmplY3QsIHNvdXJjZSwgY3VzdG9taXplcik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvYmplY3Q7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUFzc2lnbmVyO1xuIiwidmFyIGdldExlbmd0aCA9IHJlcXVpcmUoJy4vZ2V0TGVuZ3RoJyksXG4gICAgaXNMZW5ndGggPSByZXF1aXJlKCcuL2lzTGVuZ3RoJyksXG4gICAgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGBiYXNlRWFjaGAgb3IgYGJhc2VFYWNoUmlnaHRgIGZ1bmN0aW9uLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlYWNoRnVuYyBUaGUgZnVuY3Rpb24gdG8gaXRlcmF0ZSBvdmVyIGEgY29sbGVjdGlvbi5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2Zyb21SaWdodF0gU3BlY2lmeSBpdGVyYXRpbmcgZnJvbSByaWdodCB0byBsZWZ0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgYmFzZSBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlQmFzZUVhY2goZWFjaEZ1bmMsIGZyb21SaWdodCkge1xuICByZXR1cm4gZnVuY3Rpb24oY29sbGVjdGlvbiwgaXRlcmF0ZWUpIHtcbiAgICB2YXIgbGVuZ3RoID0gY29sbGVjdGlvbiA/IGdldExlbmd0aChjb2xsZWN0aW9uKSA6IDA7XG4gICAgaWYgKCFpc0xlbmd0aChsZW5ndGgpKSB7XG4gICAgICByZXR1cm4gZWFjaEZ1bmMoY29sbGVjdGlvbiwgaXRlcmF0ZWUpO1xuICAgIH1cbiAgICB2YXIgaW5kZXggPSBmcm9tUmlnaHQgPyBsZW5ndGggOiAtMSxcbiAgICAgICAgaXRlcmFibGUgPSB0b09iamVjdChjb2xsZWN0aW9uKTtcblxuICAgIHdoaWxlICgoZnJvbVJpZ2h0ID8gaW5kZXgtLSA6ICsraW5kZXggPCBsZW5ndGgpKSB7XG4gICAgICBpZiAoaXRlcmF0ZWUoaXRlcmFibGVbaW5kZXhdLCBpbmRleCwgaXRlcmFibGUpID09PSBmYWxzZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvbGxlY3Rpb247XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQmFzZUVhY2g7XG4iLCJ2YXIgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGJhc2UgZnVuY3Rpb24gZm9yIGBfLmZvckluYCBvciBgXy5mb3JJblJpZ2h0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtib29sZWFufSBbZnJvbVJpZ2h0XSBTcGVjaWZ5IGl0ZXJhdGluZyBmcm9tIHJpZ2h0IHRvIGxlZnQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBiYXNlIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBjcmVhdGVCYXNlRm9yKGZyb21SaWdodCkge1xuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0LCBpdGVyYXRlZSwga2V5c0Z1bmMpIHtcbiAgICB2YXIgaXRlcmFibGUgPSB0b09iamVjdChvYmplY3QpLFxuICAgICAgICBwcm9wcyA9IGtleXNGdW5jKG9iamVjdCksXG4gICAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aCxcbiAgICAgICAgaW5kZXggPSBmcm9tUmlnaHQgPyBsZW5ndGggOiAtMTtcblxuICAgIHdoaWxlICgoZnJvbVJpZ2h0ID8gaW5kZXgtLSA6ICsraW5kZXggPCBsZW5ndGgpKSB7XG4gICAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgICAgaWYgKGl0ZXJhdGVlKGl0ZXJhYmxlW2tleV0sIGtleSwgaXRlcmFibGUpID09PSBmYWxzZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVCYXNlRm9yO1xuIiwidmFyIGJpbmRDYWxsYmFjayA9IHJlcXVpcmUoJy4vYmluZENhbGxiYWNrJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmdW5jdGlvbiBmb3IgYF8uZm9yRWFjaGAgb3IgYF8uZm9yRWFjaFJpZ2h0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gYXJyYXlGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYW4gYXJyYXkuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlYWNoRnVuYyBUaGUgZnVuY3Rpb24gdG8gaXRlcmF0ZSBvdmVyIGEgY29sbGVjdGlvbi5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGVhY2ggZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZvckVhY2goYXJyYXlGdW5jLCBlYWNoRnVuYykge1xuICByZXR1cm4gZnVuY3Rpb24oY29sbGVjdGlvbiwgaXRlcmF0ZWUsIHRoaXNBcmcpIHtcbiAgICByZXR1cm4gKHR5cGVvZiBpdGVyYXRlZSA9PSAnZnVuY3Rpb24nICYmIHRoaXNBcmcgPT09IHVuZGVmaW5lZCAmJiBpc0FycmF5KGNvbGxlY3Rpb24pKVxuICAgICAgPyBhcnJheUZ1bmMoY29sbGVjdGlvbiwgaXRlcmF0ZWUpXG4gICAgICA6IGVhY2hGdW5jKGNvbGxlY3Rpb24sIGJpbmRDYWxsYmFjayhpdGVyYXRlZSwgdGhpc0FyZywgMykpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUZvckVhY2g7XG4iLCJ2YXIgYmluZENhbGxiYWNrID0gcmVxdWlyZSgnLi9iaW5kQ2FsbGJhY2snKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gZm9yIGBfLmZvck93bmAgb3IgYF8uZm9yT3duUmlnaHRgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvYmplY3RGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYW4gb2JqZWN0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZWFjaCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlRm9yT3duKG9iamVjdEZ1bmMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCwgaXRlcmF0ZWUsIHRoaXNBcmcpIHtcbiAgICBpZiAodHlwZW9mIGl0ZXJhdGVlICE9ICdmdW5jdGlvbicgfHwgdGhpc0FyZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpdGVyYXRlZSA9IGJpbmRDYWxsYmFjayhpdGVyYXRlZSwgdGhpc0FyZywgMyk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RGdW5jKG9iamVjdCwgaXRlcmF0ZWUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUZvck93bjtcbiIsInZhciBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuL2Jhc2VDYWxsYmFjaycpLFxuICAgIGJhc2VGb3JPd24gPSByZXF1aXJlKCcuL2Jhc2VGb3JPd24nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gZm9yIGBfLm1hcEtleXNgIG9yIGBfLm1hcFZhbHVlc2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzTWFwS2V5c10gU3BlY2lmeSBtYXBwaW5nIGtleXMgaW5zdGVhZCBvZiB2YWx1ZXMuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBtYXAgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU9iamVjdE1hcHBlcihpc01hcEtleXMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCwgaXRlcmF0ZWUsIHRoaXNBcmcpIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgaXRlcmF0ZWUgPSBiYXNlQ2FsbGJhY2soaXRlcmF0ZWUsIHRoaXNBcmcsIDMpO1xuXG4gICAgYmFzZUZvck93bihvYmplY3QsIGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iamVjdCkge1xuICAgICAgdmFyIG1hcHBlZCA9IGl0ZXJhdGVlKHZhbHVlLCBrZXksIG9iamVjdCk7XG4gICAgICBrZXkgPSBpc01hcEtleXMgPyBtYXBwZWQgOiBrZXk7XG4gICAgICB2YWx1ZSA9IGlzTWFwS2V5cyA/IHZhbHVlIDogbWFwcGVkO1xuICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZU9iamVjdE1hcHBlcjtcbiIsInZhciBhcnJheVNvbWUgPSByZXF1aXJlKCcuL2FycmF5U29tZScpO1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUlzRXF1YWxEZWVwYCBmb3IgYXJyYXlzIHdpdGggc3VwcG9ydCBmb3JcbiAqIHBhcnRpYWwgZGVlcCBjb21wYXJpc29ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge0FycmF5fSBvdGhlciBUaGUgb3RoZXIgYXJyYXkgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVxdWFsRnVuYyBUaGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGVxdWl2YWxlbnRzIG9mIHZhbHVlcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyBhcnJheXMuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0xvb3NlXSBTcGVjaWZ5IHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0FdIFRyYWNrcyB0cmF2ZXJzZWQgYHZhbHVlYCBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQl0gVHJhY2tzIHRyYXZlcnNlZCBgb3RoZXJgIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGFycmF5cyBhcmUgZXF1aXZhbGVudCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBlcXVhbEFycmF5cyhhcnJheSwgb3RoZXIsIGVxdWFsRnVuYywgY3VzdG9taXplciwgaXNMb29zZSwgc3RhY2tBLCBzdGFja0IpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBhcnJMZW5ndGggPSBhcnJheS5sZW5ndGgsXG4gICAgICBvdGhMZW5ndGggPSBvdGhlci5sZW5ndGg7XG5cbiAgaWYgKGFyckxlbmd0aCAhPSBvdGhMZW5ndGggJiYgIShpc0xvb3NlICYmIG90aExlbmd0aCA+IGFyckxlbmd0aCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gSWdub3JlIG5vbi1pbmRleCBwcm9wZXJ0aWVzLlxuICB3aGlsZSAoKytpbmRleCA8IGFyckxlbmd0aCkge1xuICAgIHZhciBhcnJWYWx1ZSA9IGFycmF5W2luZGV4XSxcbiAgICAgICAgb3RoVmFsdWUgPSBvdGhlcltpbmRleF0sXG4gICAgICAgIHJlc3VsdCA9IGN1c3RvbWl6ZXIgPyBjdXN0b21pemVyKGlzTG9vc2UgPyBvdGhWYWx1ZSA6IGFyclZhbHVlLCBpc0xvb3NlID8gYXJyVmFsdWUgOiBvdGhWYWx1ZSwgaW5kZXgpIDogdW5kZWZpbmVkO1xuXG4gICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIGFycmF5cyAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpLlxuICAgIGlmIChpc0xvb3NlKSB7XG4gICAgICBpZiAoIWFycmF5U29tZShvdGhlciwgZnVuY3Rpb24ob3RoVmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnJWYWx1ZSA9PT0gb3RoVmFsdWUgfHwgZXF1YWxGdW5jKGFyclZhbHVlLCBvdGhWYWx1ZSwgY3VzdG9taXplciwgaXNMb29zZSwgc3RhY2tBLCBzdGFja0IpO1xuICAgICAgICAgIH0pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCEoYXJyVmFsdWUgPT09IG90aFZhbHVlIHx8IGVxdWFsRnVuYyhhcnJWYWx1ZSwgb3RoVmFsdWUsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXF1YWxBcnJheXM7XG4iLCIvKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYm9vbFRhZyA9ICdbb2JqZWN0IEJvb2xlYW5dJyxcbiAgICBkYXRlVGFnID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIGVycm9yVGFnID0gJ1tvYmplY3QgRXJyb3JdJyxcbiAgICBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICByZWdleHBUYWcgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzdHJpbmdUYWcgPSAnW29iamVjdCBTdHJpbmddJztcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VJc0VxdWFsRGVlcGAgZm9yIGNvbXBhcmluZyBvYmplY3RzIG9mXG4gKiB0aGUgc2FtZSBgdG9TdHJpbmdUYWdgLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIG9ubHkgc3VwcG9ydHMgY29tcGFyaW5nIHZhbHVlcyB3aXRoIHRhZ3Mgb2ZcbiAqIGBCb29sZWFuYCwgYERhdGVgLCBgRXJyb3JgLCBgTnVtYmVyYCwgYFJlZ0V4cGAsIG9yIGBTdHJpbmdgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvdGhlciBUaGUgb3RoZXIgb2JqZWN0IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnIFRoZSBgdG9TdHJpbmdUYWdgIG9mIHRoZSBvYmplY3RzIHRvIGNvbXBhcmUuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIG9iamVjdHMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gZXF1YWxCeVRhZyhvYmplY3QsIG90aGVyLCB0YWcpIHtcbiAgc3dpdGNoICh0YWcpIHtcbiAgICBjYXNlIGJvb2xUYWc6XG4gICAgY2FzZSBkYXRlVGFnOlxuICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1iZXJzLCBkYXRlcyB0byBtaWxsaXNlY29uZHMgYW5kIGJvb2xlYW5zXG4gICAgICAvLyB0byBgMWAgb3IgYDBgIHRyZWF0aW5nIGludmFsaWQgZGF0ZXMgY29lcmNlZCB0byBgTmFOYCBhcyBub3QgZXF1YWwuXG4gICAgICByZXR1cm4gK29iamVjdCA9PSArb3RoZXI7XG5cbiAgICBjYXNlIGVycm9yVGFnOlxuICAgICAgcmV0dXJuIG9iamVjdC5uYW1lID09IG90aGVyLm5hbWUgJiYgb2JqZWN0Lm1lc3NhZ2UgPT0gb3RoZXIubWVzc2FnZTtcblxuICAgIGNhc2UgbnVtYmVyVGFnOlxuICAgICAgLy8gVHJlYXQgYE5hTmAgdnMuIGBOYU5gIGFzIGVxdWFsLlxuICAgICAgcmV0dXJuIChvYmplY3QgIT0gK29iamVjdClcbiAgICAgICAgPyBvdGhlciAhPSArb3RoZXJcbiAgICAgICAgOiBvYmplY3QgPT0gK290aGVyO1xuXG4gICAgY2FzZSByZWdleHBUYWc6XG4gICAgY2FzZSBzdHJpbmdUYWc6XG4gICAgICAvLyBDb2VyY2UgcmVnZXhlcyB0byBzdHJpbmdzIGFuZCB0cmVhdCBzdHJpbmdzIHByaW1pdGl2ZXMgYW5kIHN0cmluZ1xuICAgICAgLy8gb2JqZWN0cyBhcyBlcXVhbC4gU2VlIGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jeDE1LjEwLjYuNCBmb3IgbW9yZSBkZXRhaWxzLlxuICAgICAgcmV0dXJuIG9iamVjdCA9PSAob3RoZXIgKyAnJyk7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVxdWFsQnlUYWc7XG4iLCJ2YXIga2V5cyA9IHJlcXVpcmUoJy4uL29iamVjdC9rZXlzJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUlzRXF1YWxEZWVwYCBmb3Igb2JqZWN0cyB3aXRoIHN1cHBvcnQgZm9yXG4gKiBwYXJ0aWFsIGRlZXAgY29tcGFyaXNvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG90aGVyIFRoZSBvdGhlciBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVxdWFsRnVuYyBUaGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGVxdWl2YWxlbnRzIG9mIHZhbHVlcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0xvb3NlXSBTcGVjaWZ5IHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0FdIFRyYWNrcyB0cmF2ZXJzZWQgYHZhbHVlYCBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQl0gVHJhY2tzIHRyYXZlcnNlZCBgb3RoZXJgIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIG9iamVjdHMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gZXF1YWxPYmplY3RzKG9iamVjdCwgb3RoZXIsIGVxdWFsRnVuYywgY3VzdG9taXplciwgaXNMb29zZSwgc3RhY2tBLCBzdGFja0IpIHtcbiAgdmFyIG9ialByb3BzID0ga2V5cyhvYmplY3QpLFxuICAgICAgb2JqTGVuZ3RoID0gb2JqUHJvcHMubGVuZ3RoLFxuICAgICAgb3RoUHJvcHMgPSBrZXlzKG90aGVyKSxcbiAgICAgIG90aExlbmd0aCA9IG90aFByb3BzLmxlbmd0aDtcblxuICBpZiAob2JqTGVuZ3RoICE9IG90aExlbmd0aCAmJiAhaXNMb29zZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgaW5kZXggPSBvYmpMZW5ndGg7XG4gIHdoaWxlIChpbmRleC0tKSB7XG4gICAgdmFyIGtleSA9IG9ialByb3BzW2luZGV4XTtcbiAgICBpZiAoIShpc0xvb3NlID8ga2V5IGluIG90aGVyIDogaGFzT3duUHJvcGVydHkuY2FsbChvdGhlciwga2V5KSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgdmFyIHNraXBDdG9yID0gaXNMb29zZTtcbiAgd2hpbGUgKCsraW5kZXggPCBvYmpMZW5ndGgpIHtcbiAgICBrZXkgPSBvYmpQcm9wc1tpbmRleF07XG4gICAgdmFyIG9ialZhbHVlID0gb2JqZWN0W2tleV0sXG4gICAgICAgIG90aFZhbHVlID0gb3RoZXJba2V5XSxcbiAgICAgICAgcmVzdWx0ID0gY3VzdG9taXplciA/IGN1c3RvbWl6ZXIoaXNMb29zZSA/IG90aFZhbHVlIDogb2JqVmFsdWUsIGlzTG9vc2U/IG9ialZhbHVlIDogb3RoVmFsdWUsIGtleSkgOiB1bmRlZmluZWQ7XG5cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICBpZiAoIShyZXN1bHQgPT09IHVuZGVmaW5lZCA/IGVxdWFsRnVuYyhvYmpWYWx1ZSwgb3RoVmFsdWUsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSA6IHJlc3VsdCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc2tpcEN0b3IgfHwgKHNraXBDdG9yID0ga2V5ID09ICdjb25zdHJ1Y3RvcicpO1xuICB9XG4gIGlmICghc2tpcEN0b3IpIHtcbiAgICB2YXIgb2JqQ3RvciA9IG9iamVjdC5jb25zdHJ1Y3RvcixcbiAgICAgICAgb3RoQ3RvciA9IG90aGVyLmNvbnN0cnVjdG9yO1xuXG4gICAgLy8gTm9uIGBPYmplY3RgIG9iamVjdCBpbnN0YW5jZXMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1YWwuXG4gICAgaWYgKG9iakN0b3IgIT0gb3RoQ3RvciAmJlxuICAgICAgICAoJ2NvbnN0cnVjdG9yJyBpbiBvYmplY3QgJiYgJ2NvbnN0cnVjdG9yJyBpbiBvdGhlcikgJiZcbiAgICAgICAgISh0eXBlb2Ygb2JqQ3RvciA9PSAnZnVuY3Rpb24nICYmIG9iakN0b3IgaW5zdGFuY2VvZiBvYmpDdG9yICYmXG4gICAgICAgICAgdHlwZW9mIG90aEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBvdGhDdG9yIGluc3RhbmNlb2Ygb3RoQ3RvcikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXF1YWxPYmplY3RzO1xuIiwidmFyIGJhc2VQcm9wZXJ0eSA9IHJlcXVpcmUoJy4vYmFzZVByb3BlcnR5Jyk7XG5cbi8qKlxuICogR2V0cyB0aGUgXCJsZW5ndGhcIiBwcm9wZXJ0eSB2YWx1ZSBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIHRvIGF2b2lkIGEgW0pJVCBidWddKGh0dHBzOi8vYnVncy53ZWJraXQub3JnL3Nob3dfYnVnLmNnaT9pZD0xNDI3OTIpXG4gKiB0aGF0IGFmZmVjdHMgU2FmYXJpIG9uIGF0IGxlYXN0IGlPUyA4LjEtOC4zIEFSTTY0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgXCJsZW5ndGhcIiB2YWx1ZS5cbiAqL1xudmFyIGdldExlbmd0aCA9IGJhc2VQcm9wZXJ0eSgnbGVuZ3RoJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0TGVuZ3RoO1xuIiwidmFyIGlzU3RyaWN0Q29tcGFyYWJsZSA9IHJlcXVpcmUoJy4vaXNTdHJpY3RDb21wYXJhYmxlJyksXG4gICAgcGFpcnMgPSByZXF1aXJlKCcuLi9vYmplY3QvcGFpcnMnKTtcblxuLyoqXG4gKiBHZXRzIHRoZSBwcm9wZXJ5IG5hbWVzLCB2YWx1ZXMsIGFuZCBjb21wYXJlIGZsYWdzIG9mIGBvYmplY3RgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG1hdGNoIGRhdGEgb2YgYG9iamVjdGAuXG4gKi9cbmZ1bmN0aW9uIGdldE1hdGNoRGF0YShvYmplY3QpIHtcbiAgdmFyIHJlc3VsdCA9IHBhaXJzKG9iamVjdCksXG4gICAgICBsZW5ndGggPSByZXN1bHQubGVuZ3RoO1xuXG4gIHdoaWxlIChsZW5ndGgtLSkge1xuICAgIHJlc3VsdFtsZW5ndGhdWzJdID0gaXNTdHJpY3RDb21wYXJhYmxlKHJlc3VsdFtsZW5ndGhdWzFdKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGdldE1hdGNoRGF0YTtcbiIsInZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNOYXRpdmUnKTtcblxuLyoqXG4gKiBHZXRzIHRoZSBuYXRpdmUgZnVuY3Rpb24gYXQgYGtleWAgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIGtleSBvZiB0aGUgbWV0aG9kIHRvIGdldC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBmdW5jdGlvbiBpZiBpdCdzIG5hdGl2ZSwgZWxzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gZ2V0TmF0aXZlKG9iamVjdCwga2V5KSB7XG4gIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIHJldHVybiBpc05hdGl2ZSh2YWx1ZSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXROYXRpdmU7XG4iLCJ2YXIgZ2V0TGVuZ3RoID0gcmVxdWlyZSgnLi9nZXRMZW5ndGgnKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4vaXNMZW5ndGgnKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFycmF5LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgaXNMZW5ndGgoZ2V0TGVuZ3RoKHZhbHVlKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheUxpa2U7XG4iLCIvKiogVXNlZCB0byBkZXRlY3QgdW5zaWduZWQgaW50ZWdlciB2YWx1ZXMuICovXG52YXIgcmVJc1VpbnQgPSAvXlxcZCskLztcblxuLyoqXG4gKiBVc2VkIGFzIHRoZSBbbWF4aW11bSBsZW5ndGhdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW51bWJlci5tYXhfc2FmZV9pbnRlZ2VyKVxuICogb2YgYW4gYXJyYXktbGlrZSB2YWx1ZS5cbiAqL1xudmFyIE1BWF9TQUZFX0lOVEVHRVIgPSA5MDA3MTk5MjU0NzQwOTkxO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgYXJyYXktbGlrZSBpbmRleC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcGFyYW0ge251bWJlcn0gW2xlbmd0aD1NQVhfU0FGRV9JTlRFR0VSXSBUaGUgdXBwZXIgYm91bmRzIG9mIGEgdmFsaWQgaW5kZXguXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGluZGV4LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzSW5kZXgodmFsdWUsIGxlbmd0aCkge1xuICB2YWx1ZSA9ICh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgfHwgcmVJc1VpbnQudGVzdCh2YWx1ZSkpID8gK3ZhbHVlIDogLTE7XG4gIGxlbmd0aCA9IGxlbmd0aCA9PSBudWxsID8gTUFYX1NBRkVfSU5URUdFUiA6IGxlbmd0aDtcbiAgcmV0dXJuIHZhbHVlID4gLTEgJiYgdmFsdWUgJSAxID09IDAgJiYgdmFsdWUgPCBsZW5ndGg7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNJbmRleDtcbiIsInZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXNBcnJheUxpa2UnKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi9pc0luZGV4JyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0Jyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBwcm92aWRlZCBhcmd1bWVudHMgYXJlIGZyb20gYW4gaXRlcmF0ZWUgY2FsbC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgcG90ZW50aWFsIGl0ZXJhdGVlIHZhbHVlIGFyZ3VtZW50LlxuICogQHBhcmFtIHsqfSBpbmRleCBUaGUgcG90ZW50aWFsIGl0ZXJhdGVlIGluZGV4IG9yIGtleSBhcmd1bWVudC5cbiAqIEBwYXJhbSB7Kn0gb2JqZWN0IFRoZSBwb3RlbnRpYWwgaXRlcmF0ZWUgb2JqZWN0IGFyZ3VtZW50LlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBhcmd1bWVudHMgYXJlIGZyb20gYW4gaXRlcmF0ZWUgY2FsbCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc0l0ZXJhdGVlQ2FsbCh2YWx1ZSwgaW5kZXgsIG9iamVjdCkge1xuICBpZiAoIWlzT2JqZWN0KG9iamVjdCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHR5cGUgPSB0eXBlb2YgaW5kZXg7XG4gIGlmICh0eXBlID09ICdudW1iZXInXG4gICAgICA/IChpc0FycmF5TGlrZShvYmplY3QpICYmIGlzSW5kZXgoaW5kZXgsIG9iamVjdC5sZW5ndGgpKVxuICAgICAgOiAodHlwZSA9PSAnc3RyaW5nJyAmJiBpbmRleCBpbiBvYmplY3QpKSB7XG4gICAgdmFyIG90aGVyID0gb2JqZWN0W2luZGV4XTtcbiAgICByZXR1cm4gdmFsdWUgPT09IHZhbHVlID8gKHZhbHVlID09PSBvdGhlcikgOiAob3RoZXIgIT09IG90aGVyKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNJdGVyYXRlZUNhbGw7XG4iLCJ2YXIgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIHRvT2JqZWN0ID0gcmVxdWlyZSgnLi90b09iamVjdCcpO1xuXG4vKiogVXNlZCB0byBtYXRjaCBwcm9wZXJ0eSBuYW1lcyB3aXRoaW4gcHJvcGVydHkgcGF0aHMuICovXG52YXIgcmVJc0RlZXBQcm9wID0gL1xcLnxcXFsoPzpbXltcXF1dKnwoW1wiJ10pKD86KD8hXFwxKVteXFxuXFxcXF18XFxcXC4pKj9cXDEpXFxdLyxcbiAgICByZUlzUGxhaW5Qcm9wID0gL15cXHcqJC87XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBwcm9wZXJ0eSBuYW1lIGFuZCBub3QgYSBwcm9wZXJ0eSBwYXRoLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0XSBUaGUgb2JqZWN0IHRvIHF1ZXJ5IGtleXMgb24uXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHByb3BlcnR5IG5hbWUsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNLZXkodmFsdWUsIG9iamVjdCkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgaWYgKCh0eXBlID09ICdzdHJpbmcnICYmIHJlSXNQbGFpblByb3AudGVzdCh2YWx1ZSkpIHx8IHR5cGUgPT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHJlc3VsdCA9ICFyZUlzRGVlcFByb3AudGVzdCh2YWx1ZSk7XG4gIHJldHVybiByZXN1bHQgfHwgKG9iamVjdCAhPSBudWxsICYmIHZhbHVlIGluIHRvT2JqZWN0KG9iamVjdCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzS2V5O1xuIiwiLyoqXG4gKiBVc2VkIGFzIHRoZSBbbWF4aW11bSBsZW5ndGhdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW51bWJlci5tYXhfc2FmZV9pbnRlZ2VyKVxuICogb2YgYW4gYXJyYXktbGlrZSB2YWx1ZS5cbiAqL1xudmFyIE1BWF9TQUZFX0lOVEVHRVIgPSA5MDA3MTk5MjU0NzQwOTkxO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgYXJyYXktbGlrZSBsZW5ndGguXG4gKlxuICogKipOb3RlOioqIFRoaXMgZnVuY3Rpb24gaXMgYmFzZWQgb24gW2BUb0xlbmd0aGBdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLXRvbGVuZ3RoKS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGxlbmd0aCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc0xlbmd0aCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdudW1iZXInICYmIHZhbHVlID4gLTEgJiYgdmFsdWUgJSAxID09IDAgJiYgdmFsdWUgPD0gTUFYX1NBRkVfSU5URUdFUjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0xlbmd0aDtcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc09iamVjdExpa2U7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0Jyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgc3VpdGFibGUgZm9yIHN0cmljdCBlcXVhbGl0eSBjb21wYXJpc29ucywgaS5lLiBgPT09YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpZiBzdWl0YWJsZSBmb3Igc3RyaWN0XG4gKiAgZXF1YWxpdHkgY29tcGFyaXNvbnMsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNTdHJpY3RDb21wYXJhYmxlKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gdmFsdWUgJiYgIWlzT2JqZWN0KHZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1N0cmljdENvbXBhcmFibGU7XG4iLCJ2YXIgaXNBcmd1bWVudHMgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJndW1lbnRzJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIGlzSW5kZXggPSByZXF1aXJlKCcuL2lzSW5kZXgnKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4vaXNMZW5ndGgnKSxcbiAgICBrZXlzSW4gPSByZXF1aXJlKCcuLi9vYmplY3Qva2V5c0luJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIEEgZmFsbGJhY2sgaW1wbGVtZW50YXRpb24gb2YgYE9iamVjdC5rZXlzYCB3aGljaCBjcmVhdGVzIGFuIGFycmF5IG9mIHRoZVxuICogb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKi9cbmZ1bmN0aW9uIHNoaW1LZXlzKG9iamVjdCkge1xuICB2YXIgcHJvcHMgPSBrZXlzSW4ob2JqZWN0KSxcbiAgICAgIHByb3BzTGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgbGVuZ3RoID0gcHJvcHNMZW5ndGggJiYgb2JqZWN0Lmxlbmd0aDtcblxuICB2YXIgYWxsb3dJbmRleGVzID0gISFsZW5ndGggJiYgaXNMZW5ndGgobGVuZ3RoKSAmJlxuICAgIChpc0FycmF5KG9iamVjdCkgfHwgaXNBcmd1bWVudHMob2JqZWN0KSk7XG5cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICB3aGlsZSAoKytpbmRleCA8IHByb3BzTGVuZ3RoKSB7XG4gICAgdmFyIGtleSA9IHByb3BzW2luZGV4XTtcbiAgICBpZiAoKGFsbG93SW5kZXhlcyAmJiBpc0luZGV4KGtleSwgbGVuZ3RoKSkgfHwgaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGtleSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2hpbUtleXM7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0Jyk7XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhbiBvYmplY3QgaWYgaXQncyBub3Qgb25lLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBwcm9jZXNzLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgb2JqZWN0LlxuICovXG5mdW5jdGlvbiB0b09iamVjdCh2YWx1ZSkge1xuICByZXR1cm4gaXNPYmplY3QodmFsdWUpID8gdmFsdWUgOiBPYmplY3QodmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRvT2JqZWN0O1xuIiwidmFyIGJhc2VUb1N0cmluZyA9IHJlcXVpcmUoJy4vYmFzZVRvU3RyaW5nJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpO1xuXG4vKiogVXNlZCB0byBtYXRjaCBwcm9wZXJ0eSBuYW1lcyB3aXRoaW4gcHJvcGVydHkgcGF0aHMuICovXG52YXIgcmVQcm9wTmFtZSA9IC9bXi5bXFxdXSt8XFxbKD86KC0/XFxkKyg/OlxcLlxcZCspPyl8KFtcIiddKSgoPzooPyFcXDIpW15cXG5cXFxcXXxcXFxcLikqPylcXDIpXFxdL2c7XG5cbi8qKiBVc2VkIHRvIG1hdGNoIGJhY2tzbGFzaGVzIGluIHByb3BlcnR5IHBhdGhzLiAqL1xudmFyIHJlRXNjYXBlQ2hhciA9IC9cXFxcKFxcXFwpPy9nO1xuXG4vKipcbiAqIENvbnZlcnRzIGB2YWx1ZWAgdG8gcHJvcGVydHkgcGF0aCBhcnJheSBpZiBpdCdzIG5vdCBvbmUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHByb2Nlc3MuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIHByb3BlcnR5IHBhdGggYXJyYXkuXG4gKi9cbmZ1bmN0aW9uIHRvUGF0aCh2YWx1ZSkge1xuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgdmFyIHJlc3VsdCA9IFtdO1xuICBiYXNlVG9TdHJpbmcodmFsdWUpLnJlcGxhY2UocmVQcm9wTmFtZSwgZnVuY3Rpb24obWF0Y2gsIG51bWJlciwgcXVvdGUsIHN0cmluZykge1xuICAgIHJlc3VsdC5wdXNoKHF1b3RlID8gc3RyaW5nLnJlcGxhY2UocmVFc2NhcGVDaGFyLCAnJDEnKSA6IChudW1iZXIgfHwgbWF0Y2gpKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdG9QYXRoO1xuIiwidmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNBcnJheUxpa2UnKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgcHJvcGVydHlJc0VudW1lcmFibGUgPSBvYmplY3RQcm90by5wcm9wZXJ0eUlzRW51bWVyYWJsZTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGFuIGBhcmd1bWVudHNgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0FyZ3VtZW50cyhmdW5jdGlvbigpIHsgcmV0dXJuIGFyZ3VtZW50czsgfSgpKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJndW1lbnRzKFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0FyZ3VtZW50cyh2YWx1ZSkge1xuICByZXR1cm4gaXNPYmplY3RMaWtlKHZhbHVlKSAmJiBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcbiAgICBoYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCAnY2FsbGVlJykgJiYgIXByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwodmFsdWUsICdjYWxsZWUnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FyZ3VtZW50cztcbiIsInZhciBnZXROYXRpdmUgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9nZXROYXRpdmUnKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzTGVuZ3RoJyksXG4gICAgaXNPYmplY3RMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNPYmplY3RMaWtlJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUlzQXJyYXkgPSBnZXROYXRpdmUoQXJyYXksICdpc0FycmF5Jyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhbiBgQXJyYXlgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0FycmF5KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0FycmF5KGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xudmFyIGlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIGlzTGVuZ3RoKHZhbHVlLmxlbmd0aCkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJyYXlUYWc7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXk7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2lzT2JqZWN0Jyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBmdW5jVGFnID0gJ1tvYmplY3QgRnVuY3Rpb25dJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBGdW5jdGlvbmAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oXyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0Z1bmN0aW9uKC9hYmMvKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgLy8gVGhlIHVzZSBvZiBgT2JqZWN0I3RvU3RyaW5nYCBhdm9pZHMgaXNzdWVzIHdpdGggdGhlIGB0eXBlb2ZgIG9wZXJhdG9yXG4gIC8vIGluIG9sZGVyIHZlcnNpb25zIG9mIENocm9tZSBhbmQgU2FmYXJpIHdoaWNoIHJldHVybiAnZnVuY3Rpb24nIGZvciByZWdleGVzXG4gIC8vIGFuZCBTYWZhcmkgOCB3aGljaCByZXR1cm5zICdvYmplY3QnIGZvciB0eXBlZCBhcnJheSBjb25zdHJ1Y3RvcnMuXG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gZnVuY1RhZztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uO1xuIiwidmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2lzRnVuY3Rpb24nKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA1KS4gKi9cbnZhciByZUlzSG9zdEN0b3IgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zLiAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUuICovXG52YXIgcmVJc05hdGl2ZSA9IFJlZ0V4cCgnXicgK1xuICBmblRvU3RyaW5nLmNhbGwoaGFzT3duUHJvcGVydHkpLnJlcGxhY2UoL1tcXFxcXiQuKis/KClbXFxde318XS9nLCAnXFxcXCQmJylcbiAgLnJlcGxhY2UoL2hhc093blByb3BlcnR5fChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2csICckMS4qPycpICsgJyQnXG4pO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbiwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTmF0aXZlKEFycmF5LnByb3RvdHlwZS5wdXNoKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTmF0aXZlKF8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOYXRpdmUodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgcmV0dXJuIHJlSXNOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3RMaWtlKHZhbHVlKSAmJiByZUlzSG9zdEN0b3IudGVzdCh2YWx1ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOYXRpdmU7XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KDEpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgLy8gQXZvaWQgYSBWOCBKSVQgYnVnIGluIENocm9tZSAxOS0yMC5cbiAgLy8gU2VlIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxIGZvciBtb3JlIGRldGFpbHMuXG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzT2JqZWN0O1xuIiwidmFyIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNMZW5ndGgnKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFyZ3NUYWcgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgYm9vbFRhZyA9ICdbb2JqZWN0IEJvb2xlYW5dJyxcbiAgICBkYXRlVGFnID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIGVycm9yVGFnID0gJ1tvYmplY3QgRXJyb3JdJyxcbiAgICBmdW5jVGFnID0gJ1tvYmplY3QgRnVuY3Rpb25dJyxcbiAgICBtYXBUYWcgPSAnW29iamVjdCBNYXBdJyxcbiAgICBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICBvYmplY3RUYWcgPSAnW29iamVjdCBPYmplY3RdJyxcbiAgICByZWdleHBUYWcgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzZXRUYWcgPSAnW29iamVjdCBTZXRdJyxcbiAgICBzdHJpbmdUYWcgPSAnW29iamVjdCBTdHJpbmddJyxcbiAgICB3ZWFrTWFwVGFnID0gJ1tvYmplY3QgV2Vha01hcF0nO1xuXG52YXIgYXJyYXlCdWZmZXJUYWcgPSAnW29iamVjdCBBcnJheUJ1ZmZlcl0nLFxuICAgIGZsb2F0MzJUYWcgPSAnW29iamVjdCBGbG9hdDMyQXJyYXldJyxcbiAgICBmbG9hdDY0VGFnID0gJ1tvYmplY3QgRmxvYXQ2NEFycmF5XScsXG4gICAgaW50OFRhZyA9ICdbb2JqZWN0IEludDhBcnJheV0nLFxuICAgIGludDE2VGFnID0gJ1tvYmplY3QgSW50MTZBcnJheV0nLFxuICAgIGludDMyVGFnID0gJ1tvYmplY3QgSW50MzJBcnJheV0nLFxuICAgIHVpbnQ4VGFnID0gJ1tvYmplY3QgVWludDhBcnJheV0nLFxuICAgIHVpbnQ4Q2xhbXBlZFRhZyA9ICdbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XScsXG4gICAgdWludDE2VGFnID0gJ1tvYmplY3QgVWludDE2QXJyYXldJyxcbiAgICB1aW50MzJUYWcgPSAnW29iamVjdCBVaW50MzJBcnJheV0nO1xuXG4vKiogVXNlZCB0byBpZGVudGlmeSBgdG9TdHJpbmdUYWdgIHZhbHVlcyBvZiB0eXBlZCBhcnJheXMuICovXG52YXIgdHlwZWRBcnJheVRhZ3MgPSB7fTtcbnR5cGVkQXJyYXlUYWdzW2Zsb2F0MzJUYWddID0gdHlwZWRBcnJheVRhZ3NbZmxvYXQ2NFRhZ10gPVxudHlwZWRBcnJheVRhZ3NbaW50OFRhZ10gPSB0eXBlZEFycmF5VGFnc1tpbnQxNlRhZ10gPVxudHlwZWRBcnJheVRhZ3NbaW50MzJUYWddID0gdHlwZWRBcnJheVRhZ3NbdWludDhUYWddID1cbnR5cGVkQXJyYXlUYWdzW3VpbnQ4Q2xhbXBlZFRhZ10gPSB0eXBlZEFycmF5VGFnc1t1aW50MTZUYWddID1cbnR5cGVkQXJyYXlUYWdzW3VpbnQzMlRhZ10gPSB0cnVlO1xudHlwZWRBcnJheVRhZ3NbYXJnc1RhZ10gPSB0eXBlZEFycmF5VGFnc1thcnJheVRhZ10gPVxudHlwZWRBcnJheVRhZ3NbYXJyYXlCdWZmZXJUYWddID0gdHlwZWRBcnJheVRhZ3NbYm9vbFRhZ10gPVxudHlwZWRBcnJheVRhZ3NbZGF0ZVRhZ10gPSB0eXBlZEFycmF5VGFnc1tlcnJvclRhZ10gPVxudHlwZWRBcnJheVRhZ3NbZnVuY1RhZ10gPSB0eXBlZEFycmF5VGFnc1ttYXBUYWddID1cbnR5cGVkQXJyYXlUYWdzW251bWJlclRhZ10gPSB0eXBlZEFycmF5VGFnc1tvYmplY3RUYWddID1cbnR5cGVkQXJyYXlUYWdzW3JlZ2V4cFRhZ10gPSB0eXBlZEFycmF5VGFnc1tzZXRUYWddID1cbnR5cGVkQXJyYXlUYWdzW3N0cmluZ1RhZ10gPSB0eXBlZEFycmF5VGFnc1t3ZWFrTWFwVGFnXSA9IGZhbHNlO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgdHlwZWQgYXJyYXkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGNvcnJlY3RseSBjbGFzc2lmaWVkLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNUeXBlZEFycmF5KG5ldyBVaW50OEFycmF5KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzVHlwZWRBcnJheShbXSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc1R5cGVkQXJyYXkodmFsdWUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgaXNMZW5ndGgodmFsdWUubGVuZ3RoKSAmJiAhIXR5cGVkQXJyYXlUYWdzW29ialRvU3RyaW5nLmNhbGwodmFsdWUpXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1R5cGVkQXJyYXk7XG4iLCJ2YXIgYXNzaWduV2l0aCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Fzc2lnbldpdGgnKSxcbiAgICBiYXNlQXNzaWduID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZUFzc2lnbicpLFxuICAgIGNyZWF0ZUFzc2lnbmVyID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvY3JlYXRlQXNzaWduZXInKTtcblxuLyoqXG4gKiBBc3NpZ25zIG93biBlbnVtZXJhYmxlIHByb3BlcnRpZXMgb2Ygc291cmNlIG9iamVjdChzKSB0byB0aGUgZGVzdGluYXRpb25cbiAqIG9iamVjdC4gU3Vic2VxdWVudCBzb3VyY2VzIG92ZXJ3cml0ZSBwcm9wZXJ0eSBhc3NpZ25tZW50cyBvZiBwcmV2aW91cyBzb3VyY2VzLlxuICogSWYgYGN1c3RvbWl6ZXJgIGlzIHByb3ZpZGVkIGl0J3MgaW52b2tlZCB0byBwcm9kdWNlIHRoZSBhc3NpZ25lZCB2YWx1ZXMuXG4gKiBUaGUgYGN1c3RvbWl6ZXJgIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIGZpdmUgYXJndW1lbnRzOlxuICogKG9iamVjdFZhbHVlLCBzb3VyY2VWYWx1ZSwga2V5LCBvYmplY3QsIHNvdXJjZSkuXG4gKlxuICogKipOb3RlOioqIFRoaXMgbWV0aG9kIG11dGF0ZXMgYG9iamVjdGAgYW5kIGlzIGJhc2VkIG9uXG4gKiBbYE9iamVjdC5hc3NpZ25gXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QuYXNzaWduKS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIGV4dGVuZFxuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQHBhcmFtIHsuLi5PYmplY3R9IFtzb3VyY2VzXSBUaGUgc291cmNlIG9iamVjdHMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBhc3NpZ25lZCB2YWx1ZXMuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGN1c3RvbWl6ZXJgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5hc3NpZ24oeyAndXNlcic6ICdiYXJuZXknIH0sIHsgJ2FnZSc6IDQwIH0sIHsgJ3VzZXInOiAnZnJlZCcgfSk7XG4gKiAvLyA9PiB7ICd1c2VyJzogJ2ZyZWQnLCAnYWdlJzogNDAgfVxuICpcbiAqIC8vIHVzaW5nIGEgY3VzdG9taXplciBjYWxsYmFja1xuICogdmFyIGRlZmF1bHRzID0gXy5wYXJ0aWFsUmlnaHQoXy5hc3NpZ24sIGZ1bmN0aW9uKHZhbHVlLCBvdGhlcikge1xuICogICByZXR1cm4gXy5pc1VuZGVmaW5lZCh2YWx1ZSkgPyBvdGhlciA6IHZhbHVlO1xuICogfSk7XG4gKlxuICogZGVmYXVsdHMoeyAndXNlcic6ICdiYXJuZXknIH0sIHsgJ2FnZSc6IDM2IH0sIHsgJ3VzZXInOiAnZnJlZCcgfSk7XG4gKiAvLyA9PiB7ICd1c2VyJzogJ2Jhcm5leScsICdhZ2UnOiAzNiB9XG4gKi9cbnZhciBhc3NpZ24gPSBjcmVhdGVBc3NpZ25lcihmdW5jdGlvbihvYmplY3QsIHNvdXJjZSwgY3VzdG9taXplcikge1xuICByZXR1cm4gY3VzdG9taXplclxuICAgID8gYXNzaWduV2l0aChvYmplY3QsIHNvdXJjZSwgY3VzdG9taXplcilcbiAgICA6IGJhc2VBc3NpZ24ob2JqZWN0LCBzb3VyY2UpO1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gYXNzaWduO1xuIiwidmFyIGJhc2VGb3JPd24gPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlRm9yT3duJyksXG4gICAgY3JlYXRlRm9yT3duID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvY3JlYXRlRm9yT3duJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBvd24gZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIGFuIG9iamVjdCBpbnZva2luZyBgaXRlcmF0ZWVgXG4gKiBmb3IgZWFjaCBwcm9wZXJ0eS4gVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGhcbiAqIHRocmVlIGFyZ3VtZW50czogKHZhbHVlLCBrZXksIG9iamVjdCkuIEl0ZXJhdGVlIGZ1bmN0aW9ucyBtYXkgZXhpdCBpdGVyYXRpb25cbiAqIGVhcmx5IGJ5IGV4cGxpY2l0bHkgcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXRlcmF0ZWU9Xy5pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgaXRlcmF0ZWVgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogICB0aGlzLmIgPSAyO1xuICogfVxuICpcbiAqIEZvby5wcm90b3R5cGUuYyA9IDM7XG4gKlxuICogXy5mb3JPd24obmV3IEZvbywgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICogICBjb25zb2xlLmxvZyhrZXkpO1xuICogfSk7XG4gKiAvLyA9PiBsb2dzICdhJyBhbmQgJ2InIChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbnZhciBmb3JPd24gPSBjcmVhdGVGb3JPd24oYmFzZUZvck93bik7XG5cbm1vZHVsZS5leHBvcnRzID0gZm9yT3duO1xuIiwidmFyIGdldE5hdGl2ZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2dldE5hdGl2ZScpLFxuICAgIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNBcnJheUxpa2UnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKSxcbiAgICBzaGltS2V5cyA9IHJlcXVpcmUoJy4uL2ludGVybmFsL3NoaW1LZXlzJyk7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlS2V5cyA9IGdldE5hdGl2ZShPYmplY3QsICdrZXlzJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB0aGUgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIE5vbi1vYmplY3QgdmFsdWVzIGFyZSBjb2VyY2VkIHRvIG9iamVjdHMuIFNlZSB0aGVcbiAqIFtFUyBzcGVjXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3Qua2V5cylcbiAqIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqICAgdGhpcy5iID0gMjtcbiAqIH1cbiAqXG4gKiBGb28ucHJvdG90eXBlLmMgPSAzO1xuICpcbiAqIF8ua2V5cyhuZXcgRm9vKTtcbiAqIC8vID0+IFsnYScsICdiJ10gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqXG4gKiBfLmtleXMoJ2hpJyk7XG4gKiAvLyA9PiBbJzAnLCAnMSddXG4gKi9cbnZhciBrZXlzID0gIW5hdGl2ZUtleXMgPyBzaGltS2V5cyA6IGZ1bmN0aW9uKG9iamVjdCkge1xuICB2YXIgQ3RvciA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0LmNvbnN0cnVjdG9yO1xuICBpZiAoKHR5cGVvZiBDdG9yID09ICdmdW5jdGlvbicgJiYgQ3Rvci5wcm90b3R5cGUgPT09IG9iamVjdCkgfHxcbiAgICAgICh0eXBlb2Ygb2JqZWN0ICE9ICdmdW5jdGlvbicgJiYgaXNBcnJheUxpa2Uob2JqZWN0KSkpIHtcbiAgICByZXR1cm4gc2hpbUtleXMob2JqZWN0KTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3Qob2JqZWN0KSA/IG5hdGl2ZUtleXMob2JqZWN0KSA6IFtdO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBrZXlzO1xuIiwidmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNJbmRleCcpLFxuICAgIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNMZW5ndGgnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB0aGUgb3duIGFuZCBpbmhlcml0ZWQgZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogTm9uLW9iamVjdCB2YWx1ZXMgYXJlIGNvZXJjZWQgdG8gb2JqZWN0cy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogICB0aGlzLmIgPSAyO1xuICogfVxuICpcbiAqIEZvby5wcm90b3R5cGUuYyA9IDM7XG4gKlxuICogXy5rZXlzSW4obmV3IEZvbyk7XG4gKiAvLyA9PiBbJ2EnLCAnYicsICdjJ10gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqL1xuZnVuY3Rpb24ga2V5c0luKG9iamVjdCkge1xuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSB7XG4gICAgb2JqZWN0ID0gT2JqZWN0KG9iamVjdCk7XG4gIH1cbiAgdmFyIGxlbmd0aCA9IG9iamVjdC5sZW5ndGg7XG4gIGxlbmd0aCA9IChsZW5ndGggJiYgaXNMZW5ndGgobGVuZ3RoKSAmJlxuICAgIChpc0FycmF5KG9iamVjdCkgfHwgaXNBcmd1bWVudHMob2JqZWN0KSkgJiYgbGVuZ3RoKSB8fCAwO1xuXG4gIHZhciBDdG9yID0gb2JqZWN0LmNvbnN0cnVjdG9yLFxuICAgICAgaW5kZXggPSAtMSxcbiAgICAgIGlzUHJvdG8gPSB0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmIEN0b3IucHJvdG90eXBlID09PSBvYmplY3QsXG4gICAgICByZXN1bHQgPSBBcnJheShsZW5ndGgpLFxuICAgICAgc2tpcEluZGV4ZXMgPSBsZW5ndGggPiAwO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0W2luZGV4XSA9IChpbmRleCArICcnKTtcbiAgfVxuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKCEoc2tpcEluZGV4ZXMgJiYgaXNJbmRleChrZXksIGxlbmd0aCkpICYmXG4gICAgICAgICEoa2V5ID09ICdjb25zdHJ1Y3RvcicgJiYgKGlzUHJvdG8gfHwgIWhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpKSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ga2V5c0luO1xuIiwidmFyIGNyZWF0ZU9iamVjdE1hcHBlciA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2NyZWF0ZU9iamVjdE1hcHBlcicpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JqZWN0IHdpdGggdGhlIHNhbWUga2V5cyBhcyBgb2JqZWN0YCBhbmQgdmFsdWVzIGdlbmVyYXRlZCBieVxuICogcnVubmluZyBlYWNoIG93biBlbnVtZXJhYmxlIHByb3BlcnR5IG9mIGBvYmplY3RgIHRocm91Z2ggYGl0ZXJhdGVlYC4gVGhlXG4gKiBpdGVyYXRlZSBmdW5jdGlvbiBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM6XG4gKiAodmFsdWUsIGtleSwgb2JqZWN0KS5cbiAqXG4gKiBJZiBhIHByb3BlcnR5IG5hbWUgaXMgcHJvdmlkZWQgZm9yIGBpdGVyYXRlZWAgdGhlIGNyZWF0ZWQgYF8ucHJvcGVydHlgXG4gKiBzdHlsZSBjYWxsYmFjayByZXR1cm5zIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAqXG4gKiBJZiBhIHZhbHVlIGlzIGFsc28gcHJvdmlkZWQgZm9yIGB0aGlzQXJnYCB0aGUgY3JlYXRlZCBgXy5tYXRjaGVzUHJvcGVydHlgXG4gKiBzdHlsZSBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIGEgbWF0Y2hpbmcgcHJvcGVydHlcbiAqIHZhbHVlLCBlbHNlIGBmYWxzZWAuXG4gKlxuICogSWYgYW4gb2JqZWN0IGlzIHByb3ZpZGVkIGZvciBgaXRlcmF0ZWVgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNgIHN0eWxlXG4gKiBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlblxuICogb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtpdGVyYXRlZT1fLmlkZW50aXR5XSBUaGUgZnVuY3Rpb24gaW52b2tlZFxuICogIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGl0ZXJhdGVlYC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgdGhlIG5ldyBtYXBwZWQgb2JqZWN0LlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLm1hcFZhbHVlcyh7ICdhJzogMSwgJ2InOiAyIH0sIGZ1bmN0aW9uKG4pIHtcbiAqICAgcmV0dXJuIG4gKiAzO1xuICogfSk7XG4gKiAvLyA9PiB7ICdhJzogMywgJ2InOiA2IH1cbiAqXG4gKiB2YXIgdXNlcnMgPSB7XG4gKiAgICdmcmVkJzogICAgeyAndXNlcic6ICdmcmVkJywgICAgJ2FnZSc6IDQwIH0sXG4gKiAgICdwZWJibGVzJzogeyAndXNlcic6ICdwZWJibGVzJywgJ2FnZSc6IDEgfVxuICogfTtcbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ucHJvcGVydHlgIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5tYXBWYWx1ZXModXNlcnMsICdhZ2UnKTtcbiAqIC8vID0+IHsgJ2ZyZWQnOiA0MCwgJ3BlYmJsZXMnOiAxIH0gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqL1xudmFyIG1hcFZhbHVlcyA9IGNyZWF0ZU9iamVjdE1hcHBlcigpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1hcFZhbHVlcztcbiIsInZhciBrZXlzID0gcmVxdWlyZSgnLi9rZXlzJyksXG4gICAgdG9PYmplY3QgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC90b09iamVjdCcpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSB0d28gZGltZW5zaW9uYWwgYXJyYXkgb2YgdGhlIGtleS12YWx1ZSBwYWlycyBmb3IgYG9iamVjdGAsXG4gKiBlLmcuIGBbW2tleTEsIHZhbHVlMV0sIFtrZXkyLCB2YWx1ZTJdXWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGFycmF5IG9mIGtleS12YWx1ZSBwYWlycy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5wYWlycyh7ICdiYXJuZXknOiAzNiwgJ2ZyZWQnOiA0MCB9KTtcbiAqIC8vID0+IFtbJ2Jhcm5leScsIDM2XSwgWydmcmVkJywgNDBdXSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICovXG5mdW5jdGlvbiBwYWlycyhvYmplY3QpIHtcbiAgb2JqZWN0ID0gdG9PYmplY3Qob2JqZWN0KTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIHByb3BzID0ga2V5cyhvYmplY3QpLFxuICAgICAgbGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgcmVzdWx0W2luZGV4XSA9IFtrZXksIG9iamVjdFtrZXldXTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhaXJzO1xuIiwiLyoqXG4gKiBUaGlzIG1ldGhvZCByZXR1cm5zIHRoZSBmaXJzdCBhcmd1bWVudCBwcm92aWRlZCB0byBpdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdHlcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgQW55IHZhbHVlLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgYHZhbHVlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ3VzZXInOiAnZnJlZCcgfTtcbiAqXG4gKiBfLmlkZW50aXR5KG9iamVjdCkgPT09IG9iamVjdDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaWRlbnRpdHkodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlkZW50aXR5O1xuIiwidmFyIGJhc2VQcm9wZXJ0eSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VQcm9wZXJ0eScpLFxuICAgIGJhc2VQcm9wZXJ0eURlZXAgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlUHJvcGVydHlEZWVwJyksXG4gICAgaXNLZXkgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0tleScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIGF0IGBwYXRoYCBvbiBhXG4gKiBnaXZlbiBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXR5XG4gKiBAcGFyYW0ge0FycmF5fHN0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgcHJvcGVydHkgdG8gZ2V0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3RzID0gW1xuICogICB7ICdhJzogeyAnYic6IHsgJ2MnOiAyIH0gfSB9LFxuICogICB7ICdhJzogeyAnYic6IHsgJ2MnOiAxIH0gfSB9XG4gKiBdO1xuICpcbiAqIF8ubWFwKG9iamVjdHMsIF8ucHJvcGVydHkoJ2EuYi5jJykpO1xuICogLy8gPT4gWzIsIDFdXG4gKlxuICogXy5wbHVjayhfLnNvcnRCeShvYmplY3RzLCBfLnByb3BlcnR5KFsnYScsICdiJywgJ2MnXSkpLCAnYS5iLmMnKTtcbiAqIC8vID0+IFsxLCAyXVxuICovXG5mdW5jdGlvbiBwcm9wZXJ0eShwYXRoKSB7XG4gIHJldHVybiBpc0tleShwYXRoKSA/IGJhc2VQcm9wZXJ0eShwYXRoKSA6IGJhc2VQcm9wZXJ0eURlZXAocGF0aCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcHJvcGVydHk7XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvJyk7XG4iLCJcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgdXJsID0gcmVxdWlyZSgnLi91cmwnKTtcbnZhciBwYXJzZXIgPSByZXF1aXJlKCdzb2NrZXQuaW8tcGFyc2VyJyk7XG52YXIgTWFuYWdlciA9IHJlcXVpcmUoJy4vbWFuYWdlcicpO1xudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnc29ja2V0LmlvLWNsaWVudCcpO1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IGxvb2t1cDtcblxuLyoqXG4gKiBNYW5hZ2VycyBjYWNoZS5cbiAqL1xuXG52YXIgY2FjaGUgPSBleHBvcnRzLm1hbmFnZXJzID0ge307XG5cbi8qKlxuICogTG9va3MgdXAgYW4gZXhpc3RpbmcgYE1hbmFnZXJgIGZvciBtdWx0aXBsZXhpbmcuXG4gKiBJZiB0aGUgdXNlciBzdW1tb25zOlxuICpcbiAqICAgYGlvKCdodHRwOi8vbG9jYWxob3N0L2EnKTtgXG4gKiAgIGBpbygnaHR0cDovL2xvY2FsaG9zdC9iJyk7YFxuICpcbiAqIFdlIHJldXNlIHRoZSBleGlzdGluZyBpbnN0YW5jZSBiYXNlZCBvbiBzYW1lIHNjaGVtZS9wb3J0L2hvc3QsXG4gKiBhbmQgd2UgaW5pdGlhbGl6ZSBzb2NrZXRzIGZvciBlYWNoIG5hbWVzcGFjZS5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvb2t1cCh1cmksIG9wdHMpIHtcbiAgaWYgKHR5cGVvZiB1cmkgPT0gJ29iamVjdCcpIHtcbiAgICBvcHRzID0gdXJpO1xuICAgIHVyaSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuXG4gIHZhciBwYXJzZWQgPSB1cmwodXJpKTtcbiAgdmFyIHNvdXJjZSA9IHBhcnNlZC5zb3VyY2U7XG4gIHZhciBpZCA9IHBhcnNlZC5pZDtcbiAgdmFyIGlvO1xuXG4gIGlmIChvcHRzLmZvcmNlTmV3IHx8IG9wdHNbJ2ZvcmNlIG5ldyBjb25uZWN0aW9uJ10gfHwgZmFsc2UgPT09IG9wdHMubXVsdGlwbGV4KSB7XG4gICAgZGVidWcoJ2lnbm9yaW5nIHNvY2tldCBjYWNoZSBmb3IgJXMnLCBzb3VyY2UpO1xuICAgIGlvID0gTWFuYWdlcihzb3VyY2UsIG9wdHMpO1xuICB9IGVsc2Uge1xuICAgIGlmICghY2FjaGVbaWRdKSB7XG4gICAgICBkZWJ1ZygnbmV3IGlvIGluc3RhbmNlIGZvciAlcycsIHNvdXJjZSk7XG4gICAgICBjYWNoZVtpZF0gPSBNYW5hZ2VyKHNvdXJjZSwgb3B0cyk7XG4gICAgfVxuICAgIGlvID0gY2FjaGVbaWRdO1xuICB9XG5cbiAgcmV0dXJuIGlvLnNvY2tldChwYXJzZWQucGF0aCk7XG59XG5cbi8qKlxuICogUHJvdG9jb2wgdmVyc2lvbi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMucHJvdG9jb2wgPSBwYXJzZXIucHJvdG9jb2w7XG5cbi8qKlxuICogYGNvbm5lY3RgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmlcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5jb25uZWN0ID0gbG9va3VwO1xuXG4vKipcbiAqIEV4cG9zZSBjb25zdHJ1Y3RvcnMgZm9yIHN0YW5kYWxvbmUgYnVpbGQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLk1hbmFnZXIgPSByZXF1aXJlKCcuL21hbmFnZXInKTtcbmV4cG9ydHMuU29ja2V0ID0gcmVxdWlyZSgnLi9zb2NrZXQnKTtcbiIsIlxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciB1cmwgPSByZXF1aXJlKCcuL3VybCcpO1xudmFyIGVpbyA9IHJlcXVpcmUoJ2VuZ2luZS5pby1jbGllbnQnKTtcbnZhciBTb2NrZXQgPSByZXF1aXJlKCcuL3NvY2tldCcpO1xudmFyIEVtaXR0ZXIgPSByZXF1aXJlKCdjb21wb25lbnQtZW1pdHRlcicpO1xudmFyIHBhcnNlciA9IHJlcXVpcmUoJ3NvY2tldC5pby1wYXJzZXInKTtcbnZhciBvbiA9IHJlcXVpcmUoJy4vb24nKTtcbnZhciBiaW5kID0gcmVxdWlyZSgnY29tcG9uZW50LWJpbmQnKTtcbnZhciBvYmplY3QgPSByZXF1aXJlKCdvYmplY3QtY29tcG9uZW50Jyk7XG52YXIgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCdzb2NrZXQuaW8tY2xpZW50Om1hbmFnZXInKTtcbnZhciBpbmRleE9mID0gcmVxdWlyZSgnaW5kZXhvZicpO1xudmFyIEJhY2tvZmYgPSByZXF1aXJlKCdiYWNrbzInKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0c1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gTWFuYWdlcjtcblxuLyoqXG4gKiBgTWFuYWdlcmAgY29uc3RydWN0b3IuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGVuZ2luZSBpbnN0YW5jZSBvciBlbmdpbmUgdXJpL29wdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1hbmFnZXIodXJpLCBvcHRzKXtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1hbmFnZXIpKSByZXR1cm4gbmV3IE1hbmFnZXIodXJpLCBvcHRzKTtcbiAgaWYgKHVyaSAmJiAoJ29iamVjdCcgPT0gdHlwZW9mIHVyaSkpIHtcbiAgICBvcHRzID0gdXJpO1xuICAgIHVyaSA9IHVuZGVmaW5lZDtcbiAgfVxuICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICBvcHRzLnBhdGggPSBvcHRzLnBhdGggfHwgJy9zb2NrZXQuaW8nO1xuICB0aGlzLm5zcHMgPSB7fTtcbiAgdGhpcy5zdWJzID0gW107XG4gIHRoaXMub3B0cyA9IG9wdHM7XG4gIHRoaXMucmVjb25uZWN0aW9uKG9wdHMucmVjb25uZWN0aW9uICE9PSBmYWxzZSk7XG4gIHRoaXMucmVjb25uZWN0aW9uQXR0ZW1wdHMob3B0cy5yZWNvbm5lY3Rpb25BdHRlbXB0cyB8fCBJbmZpbml0eSk7XG4gIHRoaXMucmVjb25uZWN0aW9uRGVsYXkob3B0cy5yZWNvbm5lY3Rpb25EZWxheSB8fCAxMDAwKTtcbiAgdGhpcy5yZWNvbm5lY3Rpb25EZWxheU1heChvcHRzLnJlY29ubmVjdGlvbkRlbGF5TWF4IHx8IDUwMDApO1xuICB0aGlzLnJhbmRvbWl6YXRpb25GYWN0b3Iob3B0cy5yYW5kb21pemF0aW9uRmFjdG9yIHx8IDAuNSk7XG4gIHRoaXMuYmFja29mZiA9IG5ldyBCYWNrb2ZmKHtcbiAgICBtaW46IHRoaXMucmVjb25uZWN0aW9uRGVsYXkoKSxcbiAgICBtYXg6IHRoaXMucmVjb25uZWN0aW9uRGVsYXlNYXgoKSxcbiAgICBqaXR0ZXI6IHRoaXMucmFuZG9taXphdGlvbkZhY3RvcigpXG4gIH0pO1xuICB0aGlzLnRpbWVvdXQobnVsbCA9PSBvcHRzLnRpbWVvdXQgPyAyMDAwMCA6IG9wdHMudGltZW91dCk7XG4gIHRoaXMucmVhZHlTdGF0ZSA9ICdjbG9zZWQnO1xuICB0aGlzLnVyaSA9IHVyaTtcbiAgdGhpcy5jb25uZWN0ZWQgPSBbXTtcbiAgdGhpcy5lbmNvZGluZyA9IGZhbHNlO1xuICB0aGlzLnBhY2tldEJ1ZmZlciA9IFtdO1xuICB0aGlzLmVuY29kZXIgPSBuZXcgcGFyc2VyLkVuY29kZXIoKTtcbiAgdGhpcy5kZWNvZGVyID0gbmV3IHBhcnNlci5EZWNvZGVyKCk7XG4gIHRoaXMuYXV0b0Nvbm5lY3QgPSBvcHRzLmF1dG9Db25uZWN0ICE9PSBmYWxzZTtcbiAgaWYgKHRoaXMuYXV0b0Nvbm5lY3QpIHRoaXMub3BlbigpO1xufVxuXG4vKipcbiAqIFByb3BhZ2F0ZSBnaXZlbiBldmVudCB0byBzb2NrZXRzIGFuZCBlbWl0IG9uIGB0aGlzYFxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLmVtaXRBbGwgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5lbWl0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIGZvciAodmFyIG5zcCBpbiB0aGlzLm5zcHMpIHtcbiAgICB0aGlzLm5zcHNbbnNwXS5lbWl0LmFwcGx5KHRoaXMubnNwc1tuc3BdLCBhcmd1bWVudHMpO1xuICB9XG59O1xuXG4vKipcbiAqIFVwZGF0ZSBgc29ja2V0LmlkYCBvZiBhbGwgc29ja2V0c1xuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnVwZGF0ZVNvY2tldElkcyA9IGZ1bmN0aW9uKCl7XG4gIGZvciAodmFyIG5zcCBpbiB0aGlzLm5zcHMpIHtcbiAgICB0aGlzLm5zcHNbbnNwXS5pZCA9IHRoaXMuZW5naW5lLmlkO1xuICB9XG59O1xuXG4vKipcbiAqIE1peCBpbiBgRW1pdHRlcmAuXG4gKi9cblxuRW1pdHRlcihNYW5hZ2VyLnByb3RvdHlwZSk7XG5cbi8qKlxuICogU2V0cyB0aGUgYHJlY29ubmVjdGlvbmAgY29uZmlnLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gdHJ1ZS9mYWxzZSBpZiBpdCBzaG91bGQgYXV0b21hdGljYWxseSByZWNvbm5lY3RcbiAqIEByZXR1cm4ge01hbmFnZXJ9IHNlbGYgb3IgdmFsdWVcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTWFuYWdlci5wcm90b3R5cGUucmVjb25uZWN0aW9uID0gZnVuY3Rpb24odil7XG4gIGlmICghYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3JlY29ubmVjdGlvbjtcbiAgdGhpcy5fcmVjb25uZWN0aW9uID0gISF2O1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgcmVjb25uZWN0aW9uIGF0dGVtcHRzIGNvbmZpZy5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbWF4IHJlY29ubmVjdGlvbiBhdHRlbXB0cyBiZWZvcmUgZ2l2aW5nIHVwXG4gKiBAcmV0dXJuIHtNYW5hZ2VyfSBzZWxmIG9yIHZhbHVlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnJlY29ubmVjdGlvbkF0dGVtcHRzID0gZnVuY3Rpb24odil7XG4gIGlmICghYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3JlY29ubmVjdGlvbkF0dGVtcHRzO1xuICB0aGlzLl9yZWNvbm5lY3Rpb25BdHRlbXB0cyA9IHY7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSBkZWxheSBiZXR3ZWVuIHJlY29ubmVjdGlvbnMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGRlbGF5XG4gKiBAcmV0dXJuIHtNYW5hZ2VyfSBzZWxmIG9yIHZhbHVlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnJlY29ubmVjdGlvbkRlbGF5ID0gZnVuY3Rpb24odil7XG4gIGlmICghYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3JlY29ubmVjdGlvbkRlbGF5O1xuICB0aGlzLl9yZWNvbm5lY3Rpb25EZWxheSA9IHY7XG4gIHRoaXMuYmFja29mZiAmJiB0aGlzLmJhY2tvZmYuc2V0TWluKHYpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbk1hbmFnZXIucHJvdG90eXBlLnJhbmRvbWl6YXRpb25GYWN0b3IgPSBmdW5jdGlvbih2KXtcbiAgaWYgKCFhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fcmFuZG9taXphdGlvbkZhY3RvcjtcbiAgdGhpcy5fcmFuZG9taXphdGlvbkZhY3RvciA9IHY7XG4gIHRoaXMuYmFja29mZiAmJiB0aGlzLmJhY2tvZmYuc2V0Sml0dGVyKHYpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgbWF4aW11bSBkZWxheSBiZXR3ZWVuIHJlY29ubmVjdGlvbnMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGRlbGF5XG4gKiBAcmV0dXJuIHtNYW5hZ2VyfSBzZWxmIG9yIHZhbHVlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnJlY29ubmVjdGlvbkRlbGF5TWF4ID0gZnVuY3Rpb24odil7XG4gIGlmICghYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3JlY29ubmVjdGlvbkRlbGF5TWF4O1xuICB0aGlzLl9yZWNvbm5lY3Rpb25EZWxheU1heCA9IHY7XG4gIHRoaXMuYmFja29mZiAmJiB0aGlzLmJhY2tvZmYuc2V0TWF4KHYpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgY29ubmVjdGlvbiB0aW1lb3V0LiBgZmFsc2VgIHRvIGRpc2FibGVcbiAqXG4gKiBAcmV0dXJuIHtNYW5hZ2VyfSBzZWxmIG9yIHZhbHVlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbih2KXtcbiAgaWYgKCFhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdGltZW91dDtcbiAgdGhpcy5fdGltZW91dCA9IHY7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTdGFydHMgdHJ5aW5nIHRvIHJlY29ubmVjdCBpZiByZWNvbm5lY3Rpb24gaXMgZW5hYmxlZCBhbmQgd2UgaGF2ZSBub3RcbiAqIHN0YXJ0ZWQgcmVjb25uZWN0aW5nIHlldFxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLm1heWJlUmVjb25uZWN0T25PcGVuID0gZnVuY3Rpb24oKSB7XG4gIC8vIE9ubHkgdHJ5IHRvIHJlY29ubmVjdCBpZiBpdCdzIHRoZSBmaXJzdCB0aW1lIHdlJ3JlIGNvbm5lY3RpbmdcbiAgaWYgKCF0aGlzLnJlY29ubmVjdGluZyAmJiB0aGlzLl9yZWNvbm5lY3Rpb24gJiYgdGhpcy5iYWNrb2ZmLmF0dGVtcHRzID09PSAwKSB7XG4gICAgLy8ga2VlcHMgcmVjb25uZWN0aW9uIGZyb20gZmlyaW5nIHR3aWNlIGZvciB0aGUgc2FtZSByZWNvbm5lY3Rpb24gbG9vcFxuICAgIHRoaXMucmVjb25uZWN0KCk7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBTZXRzIHRoZSBjdXJyZW50IHRyYW5zcG9ydCBgc29ja2V0YC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25hbCwgY2FsbGJhY2tcbiAqIEByZXR1cm4ge01hbmFnZXJ9IHNlbGZcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTWFuYWdlci5wcm90b3R5cGUub3BlbiA9XG5NYW5hZ2VyLnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24oZm4pe1xuICBkZWJ1ZygncmVhZHlTdGF0ZSAlcycsIHRoaXMucmVhZHlTdGF0ZSk7XG4gIGlmICh+dGhpcy5yZWFkeVN0YXRlLmluZGV4T2YoJ29wZW4nKSkgcmV0dXJuIHRoaXM7XG5cbiAgZGVidWcoJ29wZW5pbmcgJXMnLCB0aGlzLnVyaSk7XG4gIHRoaXMuZW5naW5lID0gZWlvKHRoaXMudXJpLCB0aGlzLm9wdHMpO1xuICB2YXIgc29ja2V0ID0gdGhpcy5lbmdpbmU7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5yZWFkeVN0YXRlID0gJ29wZW5pbmcnO1xuICB0aGlzLnNraXBSZWNvbm5lY3QgPSBmYWxzZTtcblxuICAvLyBlbWl0IGBvcGVuYFxuICB2YXIgb3BlblN1YiA9IG9uKHNvY2tldCwgJ29wZW4nLCBmdW5jdGlvbigpIHtcbiAgICBzZWxmLm9ub3BlbigpO1xuICAgIGZuICYmIGZuKCk7XG4gIH0pO1xuXG4gIC8vIGVtaXQgYGNvbm5lY3RfZXJyb3JgXG4gIHZhciBlcnJvclN1YiA9IG9uKHNvY2tldCwgJ2Vycm9yJywgZnVuY3Rpb24oZGF0YSl7XG4gICAgZGVidWcoJ2Nvbm5lY3RfZXJyb3InKTtcbiAgICBzZWxmLmNsZWFudXAoKTtcbiAgICBzZWxmLnJlYWR5U3RhdGUgPSAnY2xvc2VkJztcbiAgICBzZWxmLmVtaXRBbGwoJ2Nvbm5lY3RfZXJyb3InLCBkYXRhKTtcbiAgICBpZiAoZm4pIHtcbiAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gZXJyb3InKTtcbiAgICAgIGVyci5kYXRhID0gZGF0YTtcbiAgICAgIGZuKGVycik7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE9ubHkgZG8gdGhpcyBpZiB0aGVyZSBpcyBubyBmbiB0byBoYW5kbGUgdGhlIGVycm9yXG4gICAgICBzZWxmLm1heWJlUmVjb25uZWN0T25PcGVuKCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBlbWl0IGBjb25uZWN0X3RpbWVvdXRgXG4gIGlmIChmYWxzZSAhPT0gdGhpcy5fdGltZW91dCkge1xuICAgIHZhciB0aW1lb3V0ID0gdGhpcy5fdGltZW91dDtcbiAgICBkZWJ1ZygnY29ubmVjdCBhdHRlbXB0IHdpbGwgdGltZW91dCBhZnRlciAlZCcsIHRpbWVvdXQpO1xuXG4gICAgLy8gc2V0IHRpbWVyXG4gICAgdmFyIHRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgZGVidWcoJ2Nvbm5lY3QgYXR0ZW1wdCB0aW1lZCBvdXQgYWZ0ZXIgJWQnLCB0aW1lb3V0KTtcbiAgICAgIG9wZW5TdWIuZGVzdHJveSgpO1xuICAgICAgc29ja2V0LmNsb3NlKCk7XG4gICAgICBzb2NrZXQuZW1pdCgnZXJyb3InLCAndGltZW91dCcpO1xuICAgICAgc2VsZi5lbWl0QWxsKCdjb25uZWN0X3RpbWVvdXQnLCB0aW1lb3V0KTtcbiAgICB9LCB0aW1lb3V0KTtcblxuICAgIHRoaXMuc3Vicy5wdXNoKHtcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uKCl7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICB0aGlzLnN1YnMucHVzaChvcGVuU3ViKTtcbiAgdGhpcy5zdWJzLnB1c2goZXJyb3JTdWIpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiB0cmFuc3BvcnQgb3Blbi5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5vbm9wZW4gPSBmdW5jdGlvbigpe1xuICBkZWJ1Zygnb3BlbicpO1xuXG4gIC8vIGNsZWFyIG9sZCBzdWJzXG4gIHRoaXMuY2xlYW51cCgpO1xuXG4gIC8vIG1hcmsgYXMgb3BlblxuICB0aGlzLnJlYWR5U3RhdGUgPSAnb3Blbic7XG4gIHRoaXMuZW1pdCgnb3BlbicpO1xuXG4gIC8vIGFkZCBuZXcgc3Vic1xuICB2YXIgc29ja2V0ID0gdGhpcy5lbmdpbmU7XG4gIHRoaXMuc3Vicy5wdXNoKG9uKHNvY2tldCwgJ2RhdGEnLCBiaW5kKHRoaXMsICdvbmRhdGEnKSkpO1xuICB0aGlzLnN1YnMucHVzaChvbih0aGlzLmRlY29kZXIsICdkZWNvZGVkJywgYmluZCh0aGlzLCAnb25kZWNvZGVkJykpKTtcbiAgdGhpcy5zdWJzLnB1c2gob24oc29ja2V0LCAnZXJyb3InLCBiaW5kKHRoaXMsICdvbmVycm9yJykpKTtcbiAgdGhpcy5zdWJzLnB1c2gob24oc29ja2V0LCAnY2xvc2UnLCBiaW5kKHRoaXMsICdvbmNsb3NlJykpKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHdpdGggZGF0YS5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5vbmRhdGEgPSBmdW5jdGlvbihkYXRhKXtcbiAgdGhpcy5kZWNvZGVyLmFkZChkYXRhKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gcGFyc2VyIGZ1bGx5IGRlY29kZXMgYSBwYWNrZXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTWFuYWdlci5wcm90b3R5cGUub25kZWNvZGVkID0gZnVuY3Rpb24ocGFja2V0KSB7XG4gIHRoaXMuZW1pdCgncGFja2V0JywgcGFja2V0KTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gc29ja2V0IGVycm9yLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLm9uZXJyb3IgPSBmdW5jdGlvbihlcnIpe1xuICBkZWJ1ZygnZXJyb3InLCBlcnIpO1xuICB0aGlzLmVtaXRBbGwoJ2Vycm9yJywgZXJyKTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBzb2NrZXQgZm9yIHRoZSBnaXZlbiBgbnNwYC5cbiAqXG4gKiBAcmV0dXJuIHtTb2NrZXR9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnNvY2tldCA9IGZ1bmN0aW9uKG5zcCl7XG4gIHZhciBzb2NrZXQgPSB0aGlzLm5zcHNbbnNwXTtcbiAgaWYgKCFzb2NrZXQpIHtcbiAgICBzb2NrZXQgPSBuZXcgU29ja2V0KHRoaXMsIG5zcCk7XG4gICAgdGhpcy5uc3BzW25zcF0gPSBzb2NrZXQ7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNvY2tldC5vbignY29ubmVjdCcsIGZ1bmN0aW9uKCl7XG4gICAgICBzb2NrZXQuaWQgPSBzZWxmLmVuZ2luZS5pZDtcbiAgICAgIGlmICghfmluZGV4T2Yoc2VsZi5jb25uZWN0ZWQsIHNvY2tldCkpIHtcbiAgICAgICAgc2VsZi5jb25uZWN0ZWQucHVzaChzb2NrZXQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBzb2NrZXQ7XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIGEgc29ja2V0IGNsb3NlLlxuICpcbiAqIEBwYXJhbSB7U29ja2V0fSBzb2NrZXRcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oc29ja2V0KXtcbiAgdmFyIGluZGV4ID0gaW5kZXhPZih0aGlzLmNvbm5lY3RlZCwgc29ja2V0KTtcbiAgaWYgKH5pbmRleCkgdGhpcy5jb25uZWN0ZWQuc3BsaWNlKGluZGV4LCAxKTtcbiAgaWYgKHRoaXMuY29ubmVjdGVkLmxlbmd0aCkgcmV0dXJuO1xuXG4gIHRoaXMuY2xvc2UoKTtcbn07XG5cbi8qKlxuICogV3JpdGVzIGEgcGFja2V0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnBhY2tldCA9IGZ1bmN0aW9uKHBhY2tldCl7XG4gIGRlYnVnKCd3cml0aW5nIHBhY2tldCAlaicsIHBhY2tldCk7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoIXNlbGYuZW5jb2RpbmcpIHtcbiAgICAvLyBlbmNvZGUsIHRoZW4gd3JpdGUgdG8gZW5naW5lIHdpdGggcmVzdWx0XG4gICAgc2VsZi5lbmNvZGluZyA9IHRydWU7XG4gICAgdGhpcy5lbmNvZGVyLmVuY29kZShwYWNrZXQsIGZ1bmN0aW9uKGVuY29kZWRQYWNrZXRzKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVuY29kZWRQYWNrZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNlbGYuZW5naW5lLndyaXRlKGVuY29kZWRQYWNrZXRzW2ldKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuZW5jb2RpbmcgPSBmYWxzZTtcbiAgICAgIHNlbGYucHJvY2Vzc1BhY2tldFF1ZXVlKCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7IC8vIGFkZCBwYWNrZXQgdG8gdGhlIHF1ZXVlXG4gICAgc2VsZi5wYWNrZXRCdWZmZXIucHVzaChwYWNrZXQpO1xuICB9XG59O1xuXG4vKipcbiAqIElmIHBhY2tldCBidWZmZXIgaXMgbm9uLWVtcHR5LCBiZWdpbnMgZW5jb2RpbmcgdGhlXG4gKiBuZXh0IHBhY2tldCBpbiBsaW5lLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLnByb2Nlc3NQYWNrZXRRdWV1ZSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5wYWNrZXRCdWZmZXIubGVuZ3RoID4gMCAmJiAhdGhpcy5lbmNvZGluZykge1xuICAgIHZhciBwYWNrID0gdGhpcy5wYWNrZXRCdWZmZXIuc2hpZnQoKTtcbiAgICB0aGlzLnBhY2tldChwYWNrKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDbGVhbiB1cCB0cmFuc3BvcnQgc3Vic2NyaXB0aW9ucyBhbmQgcGFja2V0IGJ1ZmZlci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5jbGVhbnVwID0gZnVuY3Rpb24oKXtcbiAgdmFyIHN1YjtcbiAgd2hpbGUgKHN1YiA9IHRoaXMuc3Vicy5zaGlmdCgpKSBzdWIuZGVzdHJveSgpO1xuXG4gIHRoaXMucGFja2V0QnVmZmVyID0gW107XG4gIHRoaXMuZW5jb2RpbmcgPSBmYWxzZTtcblxuICB0aGlzLmRlY29kZXIuZGVzdHJveSgpO1xufTtcblxuLyoqXG4gKiBDbG9zZSB0aGUgY3VycmVudCBzb2NrZXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTWFuYWdlci5wcm90b3R5cGUuY2xvc2UgPVxuTWFuYWdlci5wcm90b3R5cGUuZGlzY29ubmVjdCA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMuc2tpcFJlY29ubmVjdCA9IHRydWU7XG4gIHRoaXMuYmFja29mZi5yZXNldCgpO1xuICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2VkJztcbiAgdGhpcy5lbmdpbmUgJiYgdGhpcy5lbmdpbmUuY2xvc2UoKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gZW5naW5lIGNsb3NlLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1hbmFnZXIucHJvdG90eXBlLm9uY2xvc2UgPSBmdW5jdGlvbihyZWFzb24pe1xuICBkZWJ1ZygnY2xvc2UnKTtcbiAgdGhpcy5jbGVhbnVwKCk7XG4gIHRoaXMuYmFja29mZi5yZXNldCgpO1xuICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2VkJztcbiAgdGhpcy5lbWl0KCdjbG9zZScsIHJlYXNvbik7XG4gIGlmICh0aGlzLl9yZWNvbm5lY3Rpb24gJiYgIXRoaXMuc2tpcFJlY29ubmVjdCkge1xuICAgIHRoaXMucmVjb25uZWN0KCk7XG4gIH1cbn07XG5cbi8qKlxuICogQXR0ZW1wdCBhIHJlY29ubmVjdGlvbi5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5yZWNvbm5lY3QgPSBmdW5jdGlvbigpe1xuICBpZiAodGhpcy5yZWNvbm5lY3RpbmcgfHwgdGhpcy5za2lwUmVjb25uZWN0KSByZXR1cm4gdGhpcztcblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuYmFja29mZi5hdHRlbXB0cyA+PSB0aGlzLl9yZWNvbm5lY3Rpb25BdHRlbXB0cykge1xuICAgIGRlYnVnKCdyZWNvbm5lY3QgZmFpbGVkJyk7XG4gICAgdGhpcy5iYWNrb2ZmLnJlc2V0KCk7XG4gICAgdGhpcy5lbWl0QWxsKCdyZWNvbm5lY3RfZmFpbGVkJyk7XG4gICAgdGhpcy5yZWNvbm5lY3RpbmcgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgZGVsYXkgPSB0aGlzLmJhY2tvZmYuZHVyYXRpb24oKTtcbiAgICBkZWJ1Zygnd2lsbCB3YWl0ICVkbXMgYmVmb3JlIHJlY29ubmVjdCBhdHRlbXB0JywgZGVsYXkpO1xuXG4gICAgdGhpcy5yZWNvbm5lY3RpbmcgPSB0cnVlO1xuICAgIHZhciB0aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIGlmIChzZWxmLnNraXBSZWNvbm5lY3QpIHJldHVybjtcblxuICAgICAgZGVidWcoJ2F0dGVtcHRpbmcgcmVjb25uZWN0Jyk7XG4gICAgICBzZWxmLmVtaXRBbGwoJ3JlY29ubmVjdF9hdHRlbXB0Jywgc2VsZi5iYWNrb2ZmLmF0dGVtcHRzKTtcbiAgICAgIHNlbGYuZW1pdEFsbCgncmVjb25uZWN0aW5nJywgc2VsZi5iYWNrb2ZmLmF0dGVtcHRzKTtcblxuICAgICAgLy8gY2hlY2sgYWdhaW4gZm9yIHRoZSBjYXNlIHNvY2tldCBjbG9zZWQgaW4gYWJvdmUgZXZlbnRzXG4gICAgICBpZiAoc2VsZi5za2lwUmVjb25uZWN0KSByZXR1cm47XG5cbiAgICAgIHNlbGYub3BlbihmdW5jdGlvbihlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgZGVidWcoJ3JlY29ubmVjdCBhdHRlbXB0IGVycm9yJyk7XG4gICAgICAgICAgc2VsZi5yZWNvbm5lY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICBzZWxmLnJlY29ubmVjdCgpO1xuICAgICAgICAgIHNlbGYuZW1pdEFsbCgncmVjb25uZWN0X2Vycm9yJywgZXJyLmRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlYnVnKCdyZWNvbm5lY3Qgc3VjY2VzcycpO1xuICAgICAgICAgIHNlbGYub25yZWNvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSwgZGVsYXkpO1xuXG4gICAgdGhpcy5zdWJzLnB1c2goe1xuICAgICAgZGVzdHJveTogZnVuY3Rpb24oKXtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBzdWNjZXNzZnVsIHJlY29ubmVjdC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5NYW5hZ2VyLnByb3RvdHlwZS5vbnJlY29ubmVjdCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBhdHRlbXB0ID0gdGhpcy5iYWNrb2ZmLmF0dGVtcHRzO1xuICB0aGlzLnJlY29ubmVjdGluZyA9IGZhbHNlO1xuICB0aGlzLmJhY2tvZmYucmVzZXQoKTtcbiAgdGhpcy51cGRhdGVTb2NrZXRJZHMoKTtcbiAgdGhpcy5lbWl0QWxsKCdyZWNvbm5lY3QnLCBhdHRlbXB0KTtcbn07XG4iLCJcbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBvbjtcblxuLyoqXG4gKiBIZWxwZXIgZm9yIHN1YnNjcmlwdGlvbnMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R8RXZlbnRFbWl0dGVyfSBvYmogd2l0aCBgRW1pdHRlcmAgbWl4aW4gb3IgYEV2ZW50RW1pdHRlcmBcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBvbihvYmosIGV2LCBmbikge1xuICBvYmoub24oZXYsIGZuKTtcbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95OiBmdW5jdGlvbigpe1xuICAgICAgb2JqLnJlbW92ZUxpc3RlbmVyKGV2LCBmbik7XG4gICAgfVxuICB9O1xufVxuIiwiXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHBhcnNlciA9IHJlcXVpcmUoJ3NvY2tldC5pby1wYXJzZXInKTtcbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKTtcbnZhciB0b0FycmF5ID0gcmVxdWlyZSgndG8tYXJyYXknKTtcbnZhciBvbiA9IHJlcXVpcmUoJy4vb24nKTtcbnZhciBiaW5kID0gcmVxdWlyZSgnY29tcG9uZW50LWJpbmQnKTtcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3NvY2tldC5pby1jbGllbnQ6c29ja2V0Jyk7XG52YXIgaGFzQmluID0gcmVxdWlyZSgnaGFzLWJpbmFyeScpO1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IFNvY2tldDtcblxuLyoqXG4gKiBJbnRlcm5hbCBldmVudHMgKGJsYWNrbGlzdGVkKS5cbiAqIFRoZXNlIGV2ZW50cyBjYW4ndCBiZSBlbWl0dGVkIGJ5IHRoZSB1c2VyLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnZhciBldmVudHMgPSB7XG4gIGNvbm5lY3Q6IDEsXG4gIGNvbm5lY3RfZXJyb3I6IDEsXG4gIGNvbm5lY3RfdGltZW91dDogMSxcbiAgZGlzY29ubmVjdDogMSxcbiAgZXJyb3I6IDEsXG4gIHJlY29ubmVjdDogMSxcbiAgcmVjb25uZWN0X2F0dGVtcHQ6IDEsXG4gIHJlY29ubmVjdF9mYWlsZWQ6IDEsXG4gIHJlY29ubmVjdF9lcnJvcjogMSxcbiAgcmVjb25uZWN0aW5nOiAxXG59O1xuXG4vKipcbiAqIFNob3J0Y3V0IHRvIGBFbWl0dGVyI2VtaXRgLlxuICovXG5cbnZhciBlbWl0ID0gRW1pdHRlci5wcm90b3R5cGUuZW1pdDtcblxuLyoqXG4gKiBgU29ja2V0YCBjb25zdHJ1Y3Rvci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFNvY2tldChpbywgbnNwKXtcbiAgdGhpcy5pbyA9IGlvO1xuICB0aGlzLm5zcCA9IG5zcDtcbiAgdGhpcy5qc29uID0gdGhpczsgLy8gY29tcGF0XG4gIHRoaXMuaWRzID0gMDtcbiAgdGhpcy5hY2tzID0ge307XG4gIGlmICh0aGlzLmlvLmF1dG9Db25uZWN0KSB0aGlzLm9wZW4oKTtcbiAgdGhpcy5yZWNlaXZlQnVmZmVyID0gW107XG4gIHRoaXMuc2VuZEJ1ZmZlciA9IFtdO1xuICB0aGlzLmNvbm5lY3RlZCA9IGZhbHNlO1xuICB0aGlzLmRpc2Nvbm5lY3RlZCA9IHRydWU7XG59XG5cbi8qKlxuICogTWl4IGluIGBFbWl0dGVyYC5cbiAqL1xuXG5FbWl0dGVyKFNvY2tldC5wcm90b3R5cGUpO1xuXG4vKipcbiAqIFN1YnNjcmliZSB0byBvcGVuLCBjbG9zZSBhbmQgcGFja2V0IGV2ZW50c1xuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUuc3ViRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnN1YnMpIHJldHVybjtcblxuICB2YXIgaW8gPSB0aGlzLmlvO1xuICB0aGlzLnN1YnMgPSBbXG4gICAgb24oaW8sICdvcGVuJywgYmluZCh0aGlzLCAnb25vcGVuJykpLFxuICAgIG9uKGlvLCAncGFja2V0JywgYmluZCh0aGlzLCAnb25wYWNrZXQnKSksXG4gICAgb24oaW8sICdjbG9zZScsIGJpbmQodGhpcywgJ29uY2xvc2UnKSlcbiAgXTtcbn07XG5cbi8qKlxuICogXCJPcGVuc1wiIHRoZSBzb2NrZXQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9wZW4gPVxuU29ja2V0LnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMuY29ubmVjdGVkKSByZXR1cm4gdGhpcztcblxuICB0aGlzLnN1YkV2ZW50cygpO1xuICB0aGlzLmlvLm9wZW4oKTsgLy8gZW5zdXJlIG9wZW5cbiAgaWYgKCdvcGVuJyA9PSB0aGlzLmlvLnJlYWR5U3RhdGUpIHRoaXMub25vcGVuKCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZW5kcyBhIGBtZXNzYWdlYCBldmVudC5cbiAqXG4gKiBAcmV0dXJuIHtTb2NrZXR9IHNlbGZcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oKXtcbiAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gIGFyZ3MudW5zaGlmdCgnbWVzc2FnZScpO1xuICB0aGlzLmVtaXQuYXBwbHkodGhpcywgYXJncyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBPdmVycmlkZSBgZW1pdGAuXG4gKiBJZiB0aGUgZXZlbnQgaXMgaW4gYGV2ZW50c2AsIGl0J3MgZW1pdHRlZCBub3JtYWxseS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgbmFtZVxuICogQHJldHVybiB7U29ja2V0fSBzZWxmXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblNvY2tldC5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKGV2KXtcbiAgaWYgKGV2ZW50cy5oYXNPd25Qcm9wZXJ0eShldikpIHtcbiAgICBlbWl0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgdmFyIHBhcnNlclR5cGUgPSBwYXJzZXIuRVZFTlQ7IC8vIGRlZmF1bHRcbiAgaWYgKGhhc0JpbihhcmdzKSkgeyBwYXJzZXJUeXBlID0gcGFyc2VyLkJJTkFSWV9FVkVOVDsgfSAvLyBiaW5hcnlcbiAgdmFyIHBhY2tldCA9IHsgdHlwZTogcGFyc2VyVHlwZSwgZGF0YTogYXJncyB9O1xuXG4gIC8vIGV2ZW50IGFjayBjYWxsYmFja1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgYXJnc1thcmdzLmxlbmd0aCAtIDFdKSB7XG4gICAgZGVidWcoJ2VtaXR0aW5nIHBhY2tldCB3aXRoIGFjayBpZCAlZCcsIHRoaXMuaWRzKTtcbiAgICB0aGlzLmFja3NbdGhpcy5pZHNdID0gYXJncy5wb3AoKTtcbiAgICBwYWNrZXQuaWQgPSB0aGlzLmlkcysrO1xuICB9XG5cbiAgaWYgKHRoaXMuY29ubmVjdGVkKSB7XG4gICAgdGhpcy5wYWNrZXQocGFja2V0KTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnNlbmRCdWZmZXIucHVzaChwYWNrZXQpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNlbmRzIGEgcGFja2V0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUucGFja2V0ID0gZnVuY3Rpb24ocGFja2V0KXtcbiAgcGFja2V0Lm5zcCA9IHRoaXMubnNwO1xuICB0aGlzLmlvLnBhY2tldChwYWNrZXQpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBlbmdpbmUgYG9wZW5gLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUub25vcGVuID0gZnVuY3Rpb24oKXtcbiAgZGVidWcoJ3RyYW5zcG9ydCBpcyBvcGVuIC0gY29ubmVjdGluZycpO1xuXG4gIC8vIHdyaXRlIGNvbm5lY3QgcGFja2V0IGlmIG5lY2Vzc2FyeVxuICBpZiAoJy8nICE9IHRoaXMubnNwKSB7XG4gICAgdGhpcy5wYWNrZXQoeyB0eXBlOiBwYXJzZXIuQ09OTkVDVCB9KTtcbiAgfVxufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBlbmdpbmUgYGNsb3NlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcmVhc29uXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uY2xvc2UgPSBmdW5jdGlvbihyZWFzb24pe1xuICBkZWJ1ZygnY2xvc2UgKCVzKScsIHJlYXNvbik7XG4gIHRoaXMuY29ubmVjdGVkID0gZmFsc2U7XG4gIHRoaXMuZGlzY29ubmVjdGVkID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuaWQ7XG4gIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcsIHJlYXNvbik7XG59O1xuXG4vKipcbiAqIENhbGxlZCB3aXRoIHNvY2tldCBwYWNrZXQuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHBhY2tldFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbnBhY2tldCA9IGZ1bmN0aW9uKHBhY2tldCl7XG4gIGlmIChwYWNrZXQubnNwICE9IHRoaXMubnNwKSByZXR1cm47XG5cbiAgc3dpdGNoIChwYWNrZXQudHlwZSkge1xuICAgIGNhc2UgcGFyc2VyLkNPTk5FQ1Q6XG4gICAgICB0aGlzLm9uY29ubmVjdCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIHBhcnNlci5FVkVOVDpcbiAgICAgIHRoaXMub25ldmVudChwYWNrZXQpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIHBhcnNlci5CSU5BUllfRVZFTlQ6XG4gICAgICB0aGlzLm9uZXZlbnQocGFja2V0KTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBwYXJzZXIuQUNLOlxuICAgICAgdGhpcy5vbmFjayhwYWNrZXQpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIHBhcnNlci5CSU5BUllfQUNLOlxuICAgICAgdGhpcy5vbmFjayhwYWNrZXQpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIHBhcnNlci5ESVNDT05ORUNUOlxuICAgICAgdGhpcy5vbmRpc2Nvbm5lY3QoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBwYXJzZXIuRVJST1I6XG4gICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgcGFja2V0LmRhdGEpO1xuICAgICAgYnJlYWs7XG4gIH1cbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gYSBzZXJ2ZXIgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHBhY2tldFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbmV2ZW50ID0gZnVuY3Rpb24ocGFja2V0KXtcbiAgdmFyIGFyZ3MgPSBwYWNrZXQuZGF0YSB8fCBbXTtcbiAgZGVidWcoJ2VtaXR0aW5nIGV2ZW50ICVqJywgYXJncyk7XG5cbiAgaWYgKG51bGwgIT0gcGFja2V0LmlkKSB7XG4gICAgZGVidWcoJ2F0dGFjaGluZyBhY2sgY2FsbGJhY2sgdG8gZXZlbnQnKTtcbiAgICBhcmdzLnB1c2godGhpcy5hY2socGFja2V0LmlkKSk7XG4gIH1cblxuICBpZiAodGhpcy5jb25uZWN0ZWQpIHtcbiAgICBlbWl0LmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMucmVjZWl2ZUJ1ZmZlci5wdXNoKGFyZ3MpO1xuICB9XG59O1xuXG4vKipcbiAqIFByb2R1Y2VzIGFuIGFjayBjYWxsYmFjayB0byBlbWl0IHdpdGggYW4gZXZlbnQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5hY2sgPSBmdW5jdGlvbihpZCl7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHNlbnQgPSBmYWxzZTtcbiAgcmV0dXJuIGZ1bmN0aW9uKCl7XG4gICAgLy8gcHJldmVudCBkb3VibGUgY2FsbGJhY2tzXG4gICAgaWYgKHNlbnQpIHJldHVybjtcbiAgICBzZW50ID0gdHJ1ZTtcbiAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICBkZWJ1Zygnc2VuZGluZyBhY2sgJWonLCBhcmdzKTtcblxuICAgIHZhciB0eXBlID0gaGFzQmluKGFyZ3MpID8gcGFyc2VyLkJJTkFSWV9BQ0sgOiBwYXJzZXIuQUNLO1xuICAgIHNlbGYucGFja2V0KHtcbiAgICAgIHR5cGU6IHR5cGUsXG4gICAgICBpZDogaWQsXG4gICAgICBkYXRhOiBhcmdzXG4gICAgfSk7XG4gIH07XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIGEgc2VydmVyIGFja25vd2xlZ2VtZW50LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUub25hY2sgPSBmdW5jdGlvbihwYWNrZXQpe1xuICBkZWJ1ZygnY2FsbGluZyBhY2sgJXMgd2l0aCAlaicsIHBhY2tldC5pZCwgcGFja2V0LmRhdGEpO1xuICB2YXIgZm4gPSB0aGlzLmFja3NbcGFja2V0LmlkXTtcbiAgZm4uYXBwbHkodGhpcywgcGFja2V0LmRhdGEpO1xuICBkZWxldGUgdGhpcy5hY2tzW3BhY2tldC5pZF07XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIHNlcnZlciBjb25uZWN0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUub25jb25uZWN0ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5jb25uZWN0ZWQgPSB0cnVlO1xuICB0aGlzLmRpc2Nvbm5lY3RlZCA9IGZhbHNlO1xuICB0aGlzLmVtaXQoJ2Nvbm5lY3QnKTtcbiAgdGhpcy5lbWl0QnVmZmVyZWQoKTtcbn07XG5cbi8qKlxuICogRW1pdCBidWZmZXJlZCBldmVudHMgKHJlY2VpdmVkIGFuZCBlbWl0dGVkKS5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLmVtaXRCdWZmZXJlZCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBpO1xuICBmb3IgKGkgPSAwOyBpIDwgdGhpcy5yZWNlaXZlQnVmZmVyLmxlbmd0aDsgaSsrKSB7XG4gICAgZW1pdC5hcHBseSh0aGlzLCB0aGlzLnJlY2VpdmVCdWZmZXJbaV0pO1xuICB9XG4gIHRoaXMucmVjZWl2ZUJ1ZmZlciA9IFtdO1xuXG4gIGZvciAoaSA9IDA7IGkgPCB0aGlzLnNlbmRCdWZmZXIubGVuZ3RoOyBpKyspIHtcbiAgICB0aGlzLnBhY2tldCh0aGlzLnNlbmRCdWZmZXJbaV0pO1xuICB9XG4gIHRoaXMuc2VuZEJ1ZmZlciA9IFtdO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBzZXJ2ZXIgZGlzY29ubmVjdC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uZGlzY29ubmVjdCA9IGZ1bmN0aW9uKCl7XG4gIGRlYnVnKCdzZXJ2ZXIgZGlzY29ubmVjdCAoJXMpJywgdGhpcy5uc3ApO1xuICB0aGlzLmRlc3Ryb3koKTtcbiAgdGhpcy5vbmNsb3NlKCdpbyBzZXJ2ZXIgZGlzY29ubmVjdCcpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBmb3JjZWQgY2xpZW50L3NlcnZlciBzaWRlIGRpc2Nvbm5lY3Rpb25zLFxuICogdGhpcyBtZXRob2QgZW5zdXJlcyB0aGUgbWFuYWdlciBzdG9wcyB0cmFja2luZyB1cyBhbmRcbiAqIHRoYXQgcmVjb25uZWN0aW9ucyBkb24ndCBnZXQgdHJpZ2dlcmVkIGZvciB0aGlzLlxuICpcbiAqIEBhcGkgcHJpdmF0ZS5cbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbigpe1xuICBpZiAodGhpcy5zdWJzKSB7XG4gICAgLy8gY2xlYW4gc3Vic2NyaXB0aW9ucyB0byBhdm9pZCByZWNvbm5lY3Rpb25zXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnN1YnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMuc3Vic1tpXS5kZXN0cm95KCk7XG4gICAgfVxuICAgIHRoaXMuc3VicyA9IG51bGw7XG4gIH1cblxuICB0aGlzLmlvLmRlc3Ryb3kodGhpcyk7XG59O1xuXG4vKipcbiAqIERpc2Nvbm5lY3RzIHRoZSBzb2NrZXQgbWFudWFsbHkuXG4gKlxuICogQHJldHVybiB7U29ja2V0fSBzZWxmXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblNvY2tldC5wcm90b3R5cGUuY2xvc2UgPVxuU29ja2V0LnByb3RvdHlwZS5kaXNjb25uZWN0ID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMuY29ubmVjdGVkKSB7XG4gICAgZGVidWcoJ3BlcmZvcm1pbmcgZGlzY29ubmVjdCAoJXMpJywgdGhpcy5uc3ApO1xuICAgIHRoaXMucGFja2V0KHsgdHlwZTogcGFyc2VyLkRJU0NPTk5FQ1QgfSk7XG4gIH1cblxuICAvLyByZW1vdmUgc29ja2V0IGZyb20gcG9vbFxuICB0aGlzLmRlc3Ryb3koKTtcblxuICBpZiAodGhpcy5jb25uZWN0ZWQpIHtcbiAgICAvLyBmaXJlIGV2ZW50c1xuICAgIHRoaXMub25jbG9zZSgnaW8gY2xpZW50IGRpc2Nvbm5lY3QnKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG4iLCJcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcGFyc2V1cmkgPSByZXF1aXJlKCdwYXJzZXVyaScpO1xudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnc29ja2V0LmlvLWNsaWVudDp1cmwnKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHVybDtcblxuLyoqXG4gKiBVUkwgcGFyc2VyLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7T2JqZWN0fSBBbiBvYmplY3QgbWVhbnQgdG8gbWltaWMgd2luZG93LmxvY2F0aW9uLlxuICogICAgICAgICAgICAgICAgIERlZmF1bHRzIHRvIHdpbmRvdy5sb2NhdGlvbi5cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gdXJsKHVyaSwgbG9jKXtcbiAgdmFyIG9iaiA9IHVyaTtcblxuICAvLyBkZWZhdWx0IHRvIHdpbmRvdy5sb2NhdGlvblxuICB2YXIgbG9jID0gbG9jIHx8IGdsb2JhbC5sb2NhdGlvbjtcbiAgaWYgKG51bGwgPT0gdXJpKSB1cmkgPSBsb2MucHJvdG9jb2wgKyAnLy8nICsgbG9jLmhvc3Q7XG5cbiAgLy8gcmVsYXRpdmUgcGF0aCBzdXBwb3J0XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdXJpKSB7XG4gICAgaWYgKCcvJyA9PSB1cmkuY2hhckF0KDApKSB7XG4gICAgICBpZiAoJy8nID09IHVyaS5jaGFyQXQoMSkpIHtcbiAgICAgICAgdXJpID0gbG9jLnByb3RvY29sICsgdXJpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdXJpID0gbG9jLmhvc3RuYW1lICsgdXJpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghL14oaHR0cHM/fHdzcz8pOlxcL1xcLy8udGVzdCh1cmkpKSB7XG4gICAgICBkZWJ1ZygncHJvdG9jb2wtbGVzcyB1cmwgJXMnLCB1cmkpO1xuICAgICAgaWYgKCd1bmRlZmluZWQnICE9IHR5cGVvZiBsb2MpIHtcbiAgICAgICAgdXJpID0gbG9jLnByb3RvY29sICsgJy8vJyArIHVyaTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHVyaSA9ICdodHRwczovLycgKyB1cmk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcGFyc2VcbiAgICBkZWJ1ZygncGFyc2UgJXMnLCB1cmkpO1xuICAgIG9iaiA9IHBhcnNldXJpKHVyaSk7XG4gIH1cblxuICAvLyBtYWtlIHN1cmUgd2UgdHJlYXQgYGxvY2FsaG9zdDo4MGAgYW5kIGBsb2NhbGhvc3RgIGVxdWFsbHlcbiAgaWYgKCFvYmoucG9ydCkge1xuICAgIGlmICgvXihodHRwfHdzKSQvLnRlc3Qob2JqLnByb3RvY29sKSkge1xuICAgICAgb2JqLnBvcnQgPSAnODAnO1xuICAgIH1cbiAgICBlbHNlIGlmICgvXihodHRwfHdzKXMkLy50ZXN0KG9iai5wcm90b2NvbCkpIHtcbiAgICAgIG9iai5wb3J0ID0gJzQ0Myc7XG4gICAgfVxuICB9XG5cbiAgb2JqLnBhdGggPSBvYmoucGF0aCB8fCAnLyc7XG5cbiAgLy8gZGVmaW5lIHVuaXF1ZSBpZFxuICBvYmouaWQgPSBvYmoucHJvdG9jb2wgKyAnOi8vJyArIG9iai5ob3N0ICsgJzonICsgb2JqLnBvcnQ7XG4gIC8vIGRlZmluZSBocmVmXG4gIG9iai5ocmVmID0gb2JqLnByb3RvY29sICsgJzovLycgKyBvYmouaG9zdCArIChsb2MgJiYgbG9jLnBvcnQgPT0gb2JqLnBvcnQgPyAnJyA6ICgnOicgKyBvYmoucG9ydCkpO1xuXG4gIHJldHVybiBvYmo7XG59XG4iLCJcbi8qKlxuICogRXhwb3NlIGBCYWNrb2ZmYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tvZmY7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBiYWNrb2ZmIHRpbWVyIHdpdGggYG9wdHNgLlxuICpcbiAqIC0gYG1pbmAgaW5pdGlhbCB0aW1lb3V0IGluIG1pbGxpc2Vjb25kcyBbMTAwXVxuICogLSBgbWF4YCBtYXggdGltZW91dCBbMTAwMDBdXG4gKiAtIGBqaXR0ZXJgIFswXVxuICogLSBgZmFjdG9yYCBbMl1cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBCYWNrb2ZmKG9wdHMpIHtcbiAgb3B0cyA9IG9wdHMgfHwge307XG4gIHRoaXMubXMgPSBvcHRzLm1pbiB8fCAxMDA7XG4gIHRoaXMubWF4ID0gb3B0cy5tYXggfHwgMTAwMDA7XG4gIHRoaXMuZmFjdG9yID0gb3B0cy5mYWN0b3IgfHwgMjtcbiAgdGhpcy5qaXR0ZXIgPSBvcHRzLmppdHRlciA+IDAgJiYgb3B0cy5qaXR0ZXIgPD0gMSA/IG9wdHMuaml0dGVyIDogMDtcbiAgdGhpcy5hdHRlbXB0cyA9IDA7XG59XG5cbi8qKlxuICogUmV0dXJuIHRoZSBiYWNrb2ZmIGR1cmF0aW9uLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQmFja29mZi5wcm90b3R5cGUuZHVyYXRpb24gPSBmdW5jdGlvbigpe1xuICB2YXIgbXMgPSB0aGlzLm1zICogTWF0aC5wb3codGhpcy5mYWN0b3IsIHRoaXMuYXR0ZW1wdHMrKyk7XG4gIGlmICh0aGlzLmppdHRlcikge1xuICAgIHZhciByYW5kID0gIE1hdGgucmFuZG9tKCk7XG4gICAgdmFyIGRldmlhdGlvbiA9IE1hdGguZmxvb3IocmFuZCAqIHRoaXMuaml0dGVyICogbXMpO1xuICAgIG1zID0gKE1hdGguZmxvb3IocmFuZCAqIDEwKSAmIDEpID09IDAgID8gbXMgLSBkZXZpYXRpb24gOiBtcyArIGRldmlhdGlvbjtcbiAgfVxuICByZXR1cm4gTWF0aC5taW4obXMsIHRoaXMubWF4KSB8IDA7XG59O1xuXG4vKipcbiAqIFJlc2V0IHRoZSBudW1iZXIgb2YgYXR0ZW1wdHMuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5CYWNrb2ZmLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMuYXR0ZW1wdHMgPSAwO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIG1pbmltdW0gZHVyYXRpb25cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkJhY2tvZmYucHJvdG90eXBlLnNldE1pbiA9IGZ1bmN0aW9uKG1pbil7XG4gIHRoaXMubXMgPSBtaW47XG59O1xuXG4vKipcbiAqIFNldCB0aGUgbWF4aW11bSBkdXJhdGlvblxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQmFja29mZi5wcm90b3R5cGUuc2V0TWF4ID0gZnVuY3Rpb24obWF4KXtcbiAgdGhpcy5tYXggPSBtYXg7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgaml0dGVyXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5CYWNrb2ZmLnByb3RvdHlwZS5zZXRKaXR0ZXIgPSBmdW5jdGlvbihqaXR0ZXIpe1xuICB0aGlzLmppdHRlciA9IGppdHRlcjtcbn07XG5cbiIsIi8qKlxuICogU2xpY2UgcmVmZXJlbmNlLlxuICovXG5cbnZhciBzbGljZSA9IFtdLnNsaWNlO1xuXG4vKipcbiAqIEJpbmQgYG9iamAgdG8gYGZuYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufFN0cmluZ30gZm4gb3Igc3RyaW5nXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIGZuKXtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBmbikgZm4gPSBvYmpbZm5dO1xuICBpZiAoJ2Z1bmN0aW9uJyAhPSB0eXBlb2YgZm4pIHRocm93IG5ldyBFcnJvcignYmluZCgpIHJlcXVpcmVzIGEgZnVuY3Rpb24nKTtcbiAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gIHJldHVybiBmdW5jdGlvbigpe1xuICAgIHJldHVybiBmbi5hcHBseShvYmosIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICB9XG59O1xuIiwiXG4vKipcbiAqIEV4cG9zZSBgRW1pdHRlcmAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBFbWl0dGVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEVtaXR0ZXJgLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRW1pdHRlcihvYmopIHtcbiAgaWYgKG9iaikgcmV0dXJuIG1peGluKG9iaik7XG59O1xuXG4vKipcbiAqIE1peGluIHRoZSBlbWl0dGVyIHByb3BlcnRpZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbWl4aW4ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBFbWl0dGVyLnByb3RvdHlwZSkge1xuICAgIG9ialtrZXldID0gRW1pdHRlci5wcm90b3R5cGVba2V5XTtcbiAgfVxuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIExpc3RlbiBvbiB0aGUgZ2l2ZW4gYGV2ZW50YCB3aXRoIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUub24gPVxuRW1pdHRlci5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcbiAgKHRoaXMuX2NhbGxiYWNrc1tldmVudF0gPSB0aGlzLl9jYWxsYmFja3NbZXZlbnRdIHx8IFtdKVxuICAgIC5wdXNoKGZuKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZHMgYW4gYGV2ZW50YCBsaXN0ZW5lciB0aGF0IHdpbGwgYmUgaW52b2tlZCBhIHNpbmdsZVxuICogdGltZSB0aGVuIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG5cbiAgZnVuY3Rpb24gb24oKSB7XG4gICAgc2VsZi5vZmYoZXZlbnQsIG9uKTtcbiAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgb24uZm4gPSBmbjtcbiAgdGhpcy5vbihldmVudCwgb24pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlIHRoZSBnaXZlbiBjYWxsYmFjayBmb3IgYGV2ZW50YCBvciBhbGxcbiAqIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLm9mZiA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPVxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcblxuICAvLyBhbGxcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIHRoaXMuX2NhbGxiYWNrcyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gc3BlY2lmaWMgZXZlbnRcbiAgdmFyIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1tldmVudF07XG4gIGlmICghY2FsbGJhY2tzKSByZXR1cm4gdGhpcztcblxuICAvLyByZW1vdmUgYWxsIGhhbmRsZXJzXG4gIGlmICgxID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICBkZWxldGUgdGhpcy5fY2FsbGJhY2tzW2V2ZW50XTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHJlbW92ZSBzcGVjaWZpYyBoYW5kbGVyXG4gIHZhciBjYjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICBjYiA9IGNhbGxiYWNrc1tpXTtcbiAgICBpZiAoY2IgPT09IGZuIHx8IGNiLmZuID09PSBmbikge1xuICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRW1pdCBgZXZlbnRgIHdpdGggdGhlIGdpdmVuIGFyZ3MuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge01peGVkfSAuLi5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgICwgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzW2V2ZW50XTtcblxuICBpZiAoY2FsbGJhY2tzKSB7XG4gICAgY2FsbGJhY2tzID0gY2FsbGJhY2tzLnNsaWNlKDApO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBjYWxsYmFja3MubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgIGNhbGxiYWNrc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJuIGFycmF5IG9mIGNhbGxiYWNrcyBmb3IgYGV2ZW50YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcbiAgcmV0dXJuIHRoaXMuX2NhbGxiYWNrc1tldmVudF0gfHwgW107XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIHRoaXMgZW1pdHRlciBoYXMgYGV2ZW50YCBoYW5kbGVycy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLmhhc0xpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgcmV0dXJuICEhIHRoaXMubGlzdGVuZXJzKGV2ZW50KS5sZW5ndGg7XG59O1xuIiwiXG4vKipcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7VHlwZX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVidWcobmFtZSkge1xuICBpZiAoIWRlYnVnLmVuYWJsZWQobmFtZSkpIHJldHVybiBmdW5jdGlvbigpe307XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGZtdCl7XG4gICAgZm10ID0gY29lcmNlKGZtdCk7XG5cbiAgICB2YXIgY3VyciA9IG5ldyBEYXRlO1xuICAgIHZhciBtcyA9IGN1cnIgLSAoZGVidWdbbmFtZV0gfHwgY3Vycik7XG4gICAgZGVidWdbbmFtZV0gPSBjdXJyO1xuXG4gICAgZm10ID0gbmFtZVxuICAgICAgKyAnICdcbiAgICAgICsgZm10XG4gICAgICArICcgKycgKyBkZWJ1Zy5odW1hbml6ZShtcyk7XG5cbiAgICAvLyBUaGlzIGhhY2tlcnkgaXMgcmVxdWlyZWQgZm9yIElFOFxuICAgIC8vIHdoZXJlIGBjb25zb2xlLmxvZ2AgZG9lc24ndCBoYXZlICdhcHBseSdcbiAgICB3aW5kb3cuY29uc29sZVxuICAgICAgJiYgY29uc29sZS5sb2dcbiAgICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xuICB9XG59XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcy5cbiAqL1xuXG5kZWJ1Zy5uYW1lcyA9IFtdO1xuZGVidWcuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmRlYnVnLmVuYWJsZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgdHJ5IHtcbiAgICBsb2NhbFN0b3JhZ2UuZGVidWcgPSBuYW1lO1xuICB9IGNhdGNoKGUpe31cblxuICB2YXIgc3BsaXQgPSAobmFtZSB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKVxuICAgICwgbGVuID0gc3BsaXQubGVuZ3RoO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBuYW1lID0gc3BsaXRbaV0ucmVwbGFjZSgnKicsICcuKj8nKTtcbiAgICBpZiAobmFtZVswXSA9PT0gJy0nKSB7XG4gICAgICBkZWJ1Zy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZS5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBkZWJ1Zy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZSArICckJykpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmRlYnVnLmRpc2FibGUgPSBmdW5jdGlvbigpe1xuICBkZWJ1Zy5lbmFibGUoJycpO1xufTtcblxuLyoqXG4gKiBIdW1hbml6ZSB0aGUgZ2l2ZW4gYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZGVidWcuaHVtYW5pemUgPSBmdW5jdGlvbihtcykge1xuICB2YXIgc2VjID0gMTAwMFxuICAgICwgbWluID0gNjAgKiAxMDAwXG4gICAgLCBob3VyID0gNjAgKiBtaW47XG5cbiAgaWYgKG1zID49IGhvdXIpIHJldHVybiAobXMgLyBob3VyKS50b0ZpeGVkKDEpICsgJ2gnO1xuICBpZiAobXMgPj0gbWluKSByZXR1cm4gKG1zIC8gbWluKS50b0ZpeGVkKDEpICsgJ20nO1xuICBpZiAobXMgPj0gc2VjKSByZXR1cm4gKG1zIC8gc2VjIHwgMCkgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZGVidWcuZW5hYmxlZCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRlYnVnLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGRlYnVnLnNraXBzW2ldLnRlc3QobmFtZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRlYnVnLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGRlYnVnLm5hbWVzW2ldLnRlc3QobmFtZSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqL1xuXG5mdW5jdGlvbiBjb2VyY2UodmFsKSB7XG4gIGlmICh2YWwgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIHZhbC5zdGFjayB8fCB2YWwubWVzc2FnZTtcbiAgcmV0dXJuIHZhbDtcbn1cblxuLy8gcGVyc2lzdFxuXG50cnkge1xuICBpZiAod2luZG93LmxvY2FsU3RvcmFnZSkgZGVidWcuZW5hYmxlKGxvY2FsU3RvcmFnZS5kZWJ1Zyk7XG59IGNhdGNoKGUpe31cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSAgcmVxdWlyZSgnLi9saWIvJyk7XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zb2NrZXQnKTtcblxuLyoqXG4gKiBFeHBvcnRzIHBhcnNlclxuICpcbiAqIEBhcGkgcHVibGljXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHRyYW5zcG9ydHMgPSByZXF1aXJlKCcuL3RyYW5zcG9ydHMnKTtcbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKTtcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ2VuZ2luZS5pby1jbGllbnQ6c29ja2V0Jyk7XG52YXIgaW5kZXggPSByZXF1aXJlKCdpbmRleG9mJyk7XG52YXIgcGFyc2VyID0gcmVxdWlyZSgnZW5naW5lLmlvLXBhcnNlcicpO1xudmFyIHBhcnNldXJpID0gcmVxdWlyZSgncGFyc2V1cmknKTtcbnZhciBwYXJzZWpzb24gPSByZXF1aXJlKCdwYXJzZWpzb24nKTtcbnZhciBwYXJzZXFzID0gcmVxdWlyZSgncGFyc2VxcycpO1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gU29ja2V0O1xuXG4vKipcbiAqIE5vb3AgZnVuY3Rpb24uXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbm9vcCgpe31cblxuLyoqXG4gKiBTb2NrZXQgY29uc3RydWN0b3IuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fSB1cmkgb3Igb3B0aW9uc1xuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gU29ja2V0KHVyaSwgb3B0cyl7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTb2NrZXQpKSByZXR1cm4gbmV3IFNvY2tldCh1cmksIG9wdHMpO1xuXG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuXG4gIGlmICh1cmkgJiYgJ29iamVjdCcgPT0gdHlwZW9mIHVyaSkge1xuICAgIG9wdHMgPSB1cmk7XG4gICAgdXJpID0gbnVsbDtcbiAgfVxuXG4gIGlmICh1cmkpIHtcbiAgICB1cmkgPSBwYXJzZXVyaSh1cmkpO1xuICAgIG9wdHMuaG9zdCA9IHVyaS5ob3N0O1xuICAgIG9wdHMuc2VjdXJlID0gdXJpLnByb3RvY29sID09ICdodHRwcycgfHwgdXJpLnByb3RvY29sID09ICd3c3MnO1xuICAgIG9wdHMucG9ydCA9IHVyaS5wb3J0O1xuICAgIGlmICh1cmkucXVlcnkpIG9wdHMucXVlcnkgPSB1cmkucXVlcnk7XG4gIH1cblxuICB0aGlzLnNlY3VyZSA9IG51bGwgIT0gb3B0cy5zZWN1cmUgPyBvcHRzLnNlY3VyZSA6XG4gICAgKGdsb2JhbC5sb2NhdGlvbiAmJiAnaHR0cHM6JyA9PSBsb2NhdGlvbi5wcm90b2NvbCk7XG5cbiAgaWYgKG9wdHMuaG9zdCkge1xuICAgIHZhciBwaWVjZXMgPSBvcHRzLmhvc3Quc3BsaXQoJzonKTtcbiAgICBvcHRzLmhvc3RuYW1lID0gcGllY2VzLnNoaWZ0KCk7XG4gICAgaWYgKHBpZWNlcy5sZW5ndGgpIHtcbiAgICAgIG9wdHMucG9ydCA9IHBpZWNlcy5wb3AoKTtcbiAgICB9IGVsc2UgaWYgKCFvcHRzLnBvcnQpIHtcbiAgICAgIC8vIGlmIG5vIHBvcnQgaXMgc3BlY2lmaWVkIG1hbnVhbGx5LCB1c2UgdGhlIHByb3RvY29sIGRlZmF1bHRcbiAgICAgIG9wdHMucG9ydCA9IHRoaXMuc2VjdXJlID8gJzQ0MycgOiAnODAnO1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuYWdlbnQgPSBvcHRzLmFnZW50IHx8IGZhbHNlO1xuICB0aGlzLmhvc3RuYW1lID0gb3B0cy5ob3N0bmFtZSB8fFxuICAgIChnbG9iYWwubG9jYXRpb24gPyBsb2NhdGlvbi5ob3N0bmFtZSA6ICdsb2NhbGhvc3QnKTtcbiAgdGhpcy5wb3J0ID0gb3B0cy5wb3J0IHx8IChnbG9iYWwubG9jYXRpb24gJiYgbG9jYXRpb24ucG9ydCA/XG4gICAgICAgbG9jYXRpb24ucG9ydCA6XG4gICAgICAgKHRoaXMuc2VjdXJlID8gNDQzIDogODApKTtcbiAgdGhpcy5xdWVyeSA9IG9wdHMucXVlcnkgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdGhpcy5xdWVyeSkgdGhpcy5xdWVyeSA9IHBhcnNlcXMuZGVjb2RlKHRoaXMucXVlcnkpO1xuICB0aGlzLnVwZ3JhZGUgPSBmYWxzZSAhPT0gb3B0cy51cGdyYWRlO1xuICB0aGlzLnBhdGggPSAob3B0cy5wYXRoIHx8ICcvZW5naW5lLmlvJykucmVwbGFjZSgvXFwvJC8sICcnKSArICcvJztcbiAgdGhpcy5mb3JjZUpTT05QID0gISFvcHRzLmZvcmNlSlNPTlA7XG4gIHRoaXMuanNvbnAgPSBmYWxzZSAhPT0gb3B0cy5qc29ucDtcbiAgdGhpcy5mb3JjZUJhc2U2NCA9ICEhb3B0cy5mb3JjZUJhc2U2NDtcbiAgdGhpcy5lbmFibGVzWERSID0gISFvcHRzLmVuYWJsZXNYRFI7XG4gIHRoaXMudGltZXN0YW1wUGFyYW0gPSBvcHRzLnRpbWVzdGFtcFBhcmFtIHx8ICd0JztcbiAgdGhpcy50aW1lc3RhbXBSZXF1ZXN0cyA9IG9wdHMudGltZXN0YW1wUmVxdWVzdHM7XG4gIHRoaXMudHJhbnNwb3J0cyA9IG9wdHMudHJhbnNwb3J0cyB8fCBbJ3BvbGxpbmcnLCAnd2Vic29ja2V0J107XG4gIHRoaXMucmVhZHlTdGF0ZSA9ICcnO1xuICB0aGlzLndyaXRlQnVmZmVyID0gW107XG4gIHRoaXMuY2FsbGJhY2tCdWZmZXIgPSBbXTtcbiAgdGhpcy5wb2xpY3lQb3J0ID0gb3B0cy5wb2xpY3lQb3J0IHx8IDg0MztcbiAgdGhpcy5yZW1lbWJlclVwZ3JhZGUgPSBvcHRzLnJlbWVtYmVyVXBncmFkZSB8fCBmYWxzZTtcbiAgdGhpcy5iaW5hcnlUeXBlID0gbnVsbDtcbiAgdGhpcy5vbmx5QmluYXJ5VXBncmFkZXMgPSBvcHRzLm9ubHlCaW5hcnlVcGdyYWRlcztcblxuICAvLyBTU0wgb3B0aW9ucyBmb3IgTm9kZS5qcyBjbGllbnRcbiAgdGhpcy5wZnggPSBvcHRzLnBmeCB8fCBudWxsO1xuICB0aGlzLmtleSA9IG9wdHMua2V5IHx8IG51bGw7XG4gIHRoaXMucGFzc3BocmFzZSA9IG9wdHMucGFzc3BocmFzZSB8fCBudWxsO1xuICB0aGlzLmNlcnQgPSBvcHRzLmNlcnQgfHwgbnVsbDtcbiAgdGhpcy5jYSA9IG9wdHMuY2EgfHwgbnVsbDtcbiAgdGhpcy5jaXBoZXJzID0gb3B0cy5jaXBoZXJzIHx8IG51bGw7XG4gIHRoaXMucmVqZWN0VW5hdXRob3JpemVkID0gb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQgfHwgbnVsbDtcblxuICB0aGlzLm9wZW4oKTtcbn1cblxuU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9IGZhbHNlO1xuXG4vKipcbiAqIE1peCBpbiBgRW1pdHRlcmAuXG4gKi9cblxuRW1pdHRlcihTb2NrZXQucHJvdG90eXBlKTtcblxuLyoqXG4gKiBQcm90b2NvbCB2ZXJzaW9uLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU29ja2V0LnByb3RvY29sID0gcGFyc2VyLnByb3RvY29sOyAvLyB0aGlzIGlzIGFuIGludFxuXG4vKipcbiAqIEV4cG9zZSBkZXBzIGZvciBsZWdhY3kgY29tcGF0aWJpbGl0eVxuICogYW5kIHN0YW5kYWxvbmUgYnJvd3NlciBhY2Nlc3MuXG4gKi9cblxuU29ja2V0LlNvY2tldCA9IFNvY2tldDtcblNvY2tldC5UcmFuc3BvcnQgPSByZXF1aXJlKCcuL3RyYW5zcG9ydCcpO1xuU29ja2V0LnRyYW5zcG9ydHMgPSByZXF1aXJlKCcuL3RyYW5zcG9ydHMnKTtcblNvY2tldC5wYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG5cbi8qKlxuICogQ3JlYXRlcyB0cmFuc3BvcnQgb2YgdGhlIGdpdmVuIHR5cGUuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRyYW5zcG9ydCBuYW1lXG4gKiBAcmV0dXJuIHtUcmFuc3BvcnR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLmNyZWF0ZVRyYW5zcG9ydCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIGRlYnVnKCdjcmVhdGluZyB0cmFuc3BvcnQgXCIlc1wiJywgbmFtZSk7XG4gIHZhciBxdWVyeSA9IGNsb25lKHRoaXMucXVlcnkpO1xuXG4gIC8vIGFwcGVuZCBlbmdpbmUuaW8gcHJvdG9jb2wgaWRlbnRpZmllclxuICBxdWVyeS5FSU8gPSBwYXJzZXIucHJvdG9jb2w7XG5cbiAgLy8gdHJhbnNwb3J0IG5hbWVcbiAgcXVlcnkudHJhbnNwb3J0ID0gbmFtZTtcblxuICAvLyBzZXNzaW9uIGlkIGlmIHdlIGFscmVhZHkgaGF2ZSBvbmVcbiAgaWYgKHRoaXMuaWQpIHF1ZXJ5LnNpZCA9IHRoaXMuaWQ7XG5cbiAgdmFyIHRyYW5zcG9ydCA9IG5ldyB0cmFuc3BvcnRzW25hbWVdKHtcbiAgICBhZ2VudDogdGhpcy5hZ2VudCxcbiAgICBob3N0bmFtZTogdGhpcy5ob3N0bmFtZSxcbiAgICBwb3J0OiB0aGlzLnBvcnQsXG4gICAgc2VjdXJlOiB0aGlzLnNlY3VyZSxcbiAgICBwYXRoOiB0aGlzLnBhdGgsXG4gICAgcXVlcnk6IHF1ZXJ5LFxuICAgIGZvcmNlSlNPTlA6IHRoaXMuZm9yY2VKU09OUCxcbiAgICBqc29ucDogdGhpcy5qc29ucCxcbiAgICBmb3JjZUJhc2U2NDogdGhpcy5mb3JjZUJhc2U2NCxcbiAgICBlbmFibGVzWERSOiB0aGlzLmVuYWJsZXNYRFIsXG4gICAgdGltZXN0YW1wUmVxdWVzdHM6IHRoaXMudGltZXN0YW1wUmVxdWVzdHMsXG4gICAgdGltZXN0YW1wUGFyYW06IHRoaXMudGltZXN0YW1wUGFyYW0sXG4gICAgcG9saWN5UG9ydDogdGhpcy5wb2xpY3lQb3J0LFxuICAgIHNvY2tldDogdGhpcyxcbiAgICBwZng6IHRoaXMucGZ4LFxuICAgIGtleTogdGhpcy5rZXksXG4gICAgcGFzc3BocmFzZTogdGhpcy5wYXNzcGhyYXNlLFxuICAgIGNlcnQ6IHRoaXMuY2VydCxcbiAgICBjYTogdGhpcy5jYSxcbiAgICBjaXBoZXJzOiB0aGlzLmNpcGhlcnMsXG4gICAgcmVqZWN0VW5hdXRob3JpemVkOiB0aGlzLnJlamVjdFVuYXV0aG9yaXplZFxuICB9KTtcblxuICByZXR1cm4gdHJhbnNwb3J0O1xufTtcblxuZnVuY3Rpb24gY2xvbmUgKG9iaikge1xuICB2YXIgbyA9IHt9O1xuICBmb3IgKHZhciBpIGluIG9iaikge1xuICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgIG9baV0gPSBvYmpbaV07XG4gICAgfVxuICB9XG4gIHJldHVybiBvO1xufVxuXG4vKipcbiAqIEluaXRpYWxpemVzIHRyYW5zcG9ydCB0byB1c2UgYW5kIHN0YXJ0cyBwcm9iZS5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuU29ja2V0LnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24gKCkge1xuICB2YXIgdHJhbnNwb3J0O1xuICBpZiAodGhpcy5yZW1lbWJlclVwZ3JhZGUgJiYgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyAmJiB0aGlzLnRyYW5zcG9ydHMuaW5kZXhPZignd2Vic29ja2V0JykgIT0gLTEpIHtcbiAgICB0cmFuc3BvcnQgPSAnd2Vic29ja2V0JztcbiAgfSBlbHNlIGlmICgwID09IHRoaXMudHJhbnNwb3J0cy5sZW5ndGgpIHtcbiAgICAvLyBFbWl0IGVycm9yIG9uIG5leHQgdGljayBzbyBpdCBjYW4gYmUgbGlzdGVuZWQgdG9cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCAnTm8gdHJhbnNwb3J0cyBhdmFpbGFibGUnKTtcbiAgICB9LCAwKTtcbiAgICByZXR1cm47XG4gIH0gZWxzZSB7XG4gICAgdHJhbnNwb3J0ID0gdGhpcy50cmFuc3BvcnRzWzBdO1xuICB9XG4gIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuaW5nJztcblxuICAvLyBSZXRyeSB3aXRoIHRoZSBuZXh0IHRyYW5zcG9ydCBpZiB0aGUgdHJhbnNwb3J0IGlzIGRpc2FibGVkIChqc29ucDogZmFsc2UpXG4gIHZhciB0cmFuc3BvcnQ7XG4gIHRyeSB7XG4gICAgdHJhbnNwb3J0ID0gdGhpcy5jcmVhdGVUcmFuc3BvcnQodHJhbnNwb3J0KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRoaXMudHJhbnNwb3J0cy5zaGlmdCgpO1xuICAgIHRoaXMub3BlbigpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRyYW5zcG9ydC5vcGVuKCk7XG4gIHRoaXMuc2V0VHJhbnNwb3J0KHRyYW5zcG9ydCk7XG59O1xuXG4vKipcbiAqIFNldHMgdGhlIGN1cnJlbnQgdHJhbnNwb3J0LiBEaXNhYmxlcyB0aGUgZXhpc3Rpbmcgb25lIChpZiBhbnkpLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUuc2V0VHJhbnNwb3J0ID0gZnVuY3Rpb24odHJhbnNwb3J0KXtcbiAgZGVidWcoJ3NldHRpbmcgdHJhbnNwb3J0ICVzJywgdHJhbnNwb3J0Lm5hbWUpO1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHRoaXMudHJhbnNwb3J0KSB7XG4gICAgZGVidWcoJ2NsZWFyaW5nIGV4aXN0aW5nIHRyYW5zcG9ydCAlcycsIHRoaXMudHJhbnNwb3J0Lm5hbWUpO1xuICAgIHRoaXMudHJhbnNwb3J0LnJlbW92ZUFsbExpc3RlbmVycygpO1xuICB9XG5cbiAgLy8gc2V0IHVwIHRyYW5zcG9ydFxuICB0aGlzLnRyYW5zcG9ydCA9IHRyYW5zcG9ydDtcblxuICAvLyBzZXQgdXAgdHJhbnNwb3J0IGxpc3RlbmVyc1xuICB0cmFuc3BvcnRcbiAgLm9uKCdkcmFpbicsIGZ1bmN0aW9uKCl7XG4gICAgc2VsZi5vbkRyYWluKCk7XG4gIH0pXG4gIC5vbigncGFja2V0JywgZnVuY3Rpb24ocGFja2V0KXtcbiAgICBzZWxmLm9uUGFja2V0KHBhY2tldCk7XG4gIH0pXG4gIC5vbignZXJyb3InLCBmdW5jdGlvbihlKXtcbiAgICBzZWxmLm9uRXJyb3IoZSk7XG4gIH0pXG4gIC5vbignY2xvc2UnLCBmdW5jdGlvbigpe1xuICAgIHNlbGYub25DbG9zZSgndHJhbnNwb3J0IGNsb3NlJyk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBQcm9iZXMgYSB0cmFuc3BvcnQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRyYW5zcG9ydCBuYW1lXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLnByb2JlID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgZGVidWcoJ3Byb2JpbmcgdHJhbnNwb3J0IFwiJXNcIicsIG5hbWUpO1xuICB2YXIgdHJhbnNwb3J0ID0gdGhpcy5jcmVhdGVUcmFuc3BvcnQobmFtZSwgeyBwcm9iZTogMSB9KVxuICAgICwgZmFpbGVkID0gZmFsc2VcbiAgICAsIHNlbGYgPSB0aGlzO1xuXG4gIFNvY2tldC5wcmlvcldlYnNvY2tldFN1Y2Nlc3MgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBvblRyYW5zcG9ydE9wZW4oKXtcbiAgICBpZiAoc2VsZi5vbmx5QmluYXJ5VXBncmFkZXMpIHtcbiAgICAgIHZhciB1cGdyYWRlTG9zZXNCaW5hcnkgPSAhdGhpcy5zdXBwb3J0c0JpbmFyeSAmJiBzZWxmLnRyYW5zcG9ydC5zdXBwb3J0c0JpbmFyeTtcbiAgICAgIGZhaWxlZCA9IGZhaWxlZCB8fCB1cGdyYWRlTG9zZXNCaW5hcnk7XG4gICAgfVxuICAgIGlmIChmYWlsZWQpIHJldHVybjtcblxuICAgIGRlYnVnKCdwcm9iZSB0cmFuc3BvcnQgXCIlc1wiIG9wZW5lZCcsIG5hbWUpO1xuICAgIHRyYW5zcG9ydC5zZW5kKFt7IHR5cGU6ICdwaW5nJywgZGF0YTogJ3Byb2JlJyB9XSk7XG4gICAgdHJhbnNwb3J0Lm9uY2UoJ3BhY2tldCcsIGZ1bmN0aW9uIChtc2cpIHtcbiAgICAgIGlmIChmYWlsZWQpIHJldHVybjtcbiAgICAgIGlmICgncG9uZycgPT0gbXNnLnR5cGUgJiYgJ3Byb2JlJyA9PSBtc2cuZGF0YSkge1xuICAgICAgICBkZWJ1ZygncHJvYmUgdHJhbnNwb3J0IFwiJXNcIiBwb25nJywgbmFtZSk7XG4gICAgICAgIHNlbGYudXBncmFkaW5nID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5lbWl0KCd1cGdyYWRpbmcnLCB0cmFuc3BvcnQpO1xuICAgICAgICBpZiAoIXRyYW5zcG9ydCkgcmV0dXJuO1xuICAgICAgICBTb2NrZXQucHJpb3JXZWJzb2NrZXRTdWNjZXNzID0gJ3dlYnNvY2tldCcgPT0gdHJhbnNwb3J0Lm5hbWU7XG5cbiAgICAgICAgZGVidWcoJ3BhdXNpbmcgY3VycmVudCB0cmFuc3BvcnQgXCIlc1wiJywgc2VsZi50cmFuc3BvcnQubmFtZSk7XG4gICAgICAgIHNlbGYudHJhbnNwb3J0LnBhdXNlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpZiAoZmFpbGVkKSByZXR1cm47XG4gICAgICAgICAgaWYgKCdjbG9zZWQnID09IHNlbGYucmVhZHlTdGF0ZSkgcmV0dXJuO1xuICAgICAgICAgIGRlYnVnKCdjaGFuZ2luZyB0cmFuc3BvcnQgYW5kIHNlbmRpbmcgdXBncmFkZSBwYWNrZXQnKTtcblxuICAgICAgICAgIGNsZWFudXAoKTtcblxuICAgICAgICAgIHNlbGYuc2V0VHJhbnNwb3J0KHRyYW5zcG9ydCk7XG4gICAgICAgICAgdHJhbnNwb3J0LnNlbmQoW3sgdHlwZTogJ3VwZ3JhZGUnIH1dKTtcbiAgICAgICAgICBzZWxmLmVtaXQoJ3VwZ3JhZGUnLCB0cmFuc3BvcnQpO1xuICAgICAgICAgIHRyYW5zcG9ydCA9IG51bGw7XG4gICAgICAgICAgc2VsZi51cGdyYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICBzZWxmLmZsdXNoKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ3Byb2JlIHRyYW5zcG9ydCBcIiVzXCIgZmFpbGVkJywgbmFtZSk7XG4gICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ3Byb2JlIGVycm9yJyk7XG4gICAgICAgIGVyci50cmFuc3BvcnQgPSB0cmFuc3BvcnQubmFtZTtcbiAgICAgICAgc2VsZi5lbWl0KCd1cGdyYWRlRXJyb3InLCBlcnIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZnJlZXplVHJhbnNwb3J0KCkge1xuICAgIGlmIChmYWlsZWQpIHJldHVybjtcblxuICAgIC8vIEFueSBjYWxsYmFjayBjYWxsZWQgYnkgdHJhbnNwb3J0IHNob3VsZCBiZSBpZ25vcmVkIHNpbmNlIG5vd1xuICAgIGZhaWxlZCA9IHRydWU7XG5cbiAgICBjbGVhbnVwKCk7XG5cbiAgICB0cmFuc3BvcnQuY2xvc2UoKTtcbiAgICB0cmFuc3BvcnQgPSBudWxsO1xuICB9XG5cbiAgLy9IYW5kbGUgYW55IGVycm9yIHRoYXQgaGFwcGVucyB3aGlsZSBwcm9iaW5nXG4gIGZ1bmN0aW9uIG9uZXJyb3IoZXJyKSB7XG4gICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdwcm9iZSBlcnJvcjogJyArIGVycik7XG4gICAgZXJyb3IudHJhbnNwb3J0ID0gdHJhbnNwb3J0Lm5hbWU7XG5cbiAgICBmcmVlemVUcmFuc3BvcnQoKTtcblxuICAgIGRlYnVnKCdwcm9iZSB0cmFuc3BvcnQgXCIlc1wiIGZhaWxlZCBiZWNhdXNlIG9mIGVycm9yOiAlcycsIG5hbWUsIGVycik7XG5cbiAgICBzZWxmLmVtaXQoJ3VwZ3JhZGVFcnJvcicsIGVycm9yKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uVHJhbnNwb3J0Q2xvc2UoKXtcbiAgICBvbmVycm9yKFwidHJhbnNwb3J0IGNsb3NlZFwiKTtcbiAgfVxuXG4gIC8vV2hlbiB0aGUgc29ja2V0IGlzIGNsb3NlZCB3aGlsZSB3ZSdyZSBwcm9iaW5nXG4gIGZ1bmN0aW9uIG9uY2xvc2UoKXtcbiAgICBvbmVycm9yKFwic29ja2V0IGNsb3NlZFwiKTtcbiAgfVxuXG4gIC8vV2hlbiB0aGUgc29ja2V0IGlzIHVwZ3JhZGVkIHdoaWxlIHdlJ3JlIHByb2JpbmdcbiAgZnVuY3Rpb24gb251cGdyYWRlKHRvKXtcbiAgICBpZiAodHJhbnNwb3J0ICYmIHRvLm5hbWUgIT0gdHJhbnNwb3J0Lm5hbWUpIHtcbiAgICAgIGRlYnVnKCdcIiVzXCIgd29ya3MgLSBhYm9ydGluZyBcIiVzXCInLCB0by5uYW1lLCB0cmFuc3BvcnQubmFtZSk7XG4gICAgICBmcmVlemVUcmFuc3BvcnQoKTtcbiAgICB9XG4gIH1cblxuICAvL1JlbW92ZSBhbGwgbGlzdGVuZXJzIG9uIHRoZSB0cmFuc3BvcnQgYW5kIG9uIHNlbGZcbiAgZnVuY3Rpb24gY2xlYW51cCgpe1xuICAgIHRyYW5zcG9ydC5yZW1vdmVMaXN0ZW5lcignb3BlbicsIG9uVHJhbnNwb3J0T3Blbik7XG4gICAgdHJhbnNwb3J0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuICAgIHRyYW5zcG9ydC5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvblRyYW5zcG9ydENsb3NlKTtcbiAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uY2xvc2UpO1xuICAgIHNlbGYucmVtb3ZlTGlzdGVuZXIoJ3VwZ3JhZGluZycsIG9udXBncmFkZSk7XG4gIH1cblxuICB0cmFuc3BvcnQub25jZSgnb3BlbicsIG9uVHJhbnNwb3J0T3Blbik7XG4gIHRyYW5zcG9ydC5vbmNlKCdlcnJvcicsIG9uZXJyb3IpO1xuICB0cmFuc3BvcnQub25jZSgnY2xvc2UnLCBvblRyYW5zcG9ydENsb3NlKTtcblxuICB0aGlzLm9uY2UoJ2Nsb3NlJywgb25jbG9zZSk7XG4gIHRoaXMub25jZSgndXBncmFkaW5nJywgb251cGdyYWRlKTtcblxuICB0cmFuc3BvcnQub3BlbigpO1xuXG59O1xuXG4vKipcbiAqIENhbGxlZCB3aGVuIGNvbm5lY3Rpb24gaXMgZGVlbWVkIG9wZW4uXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uT3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgZGVidWcoJ3NvY2tldCBvcGVuJyk7XG4gIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuJztcbiAgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9ICd3ZWJzb2NrZXQnID09IHRoaXMudHJhbnNwb3J0Lm5hbWU7XG4gIHRoaXMuZW1pdCgnb3BlbicpO1xuICB0aGlzLmZsdXNoKCk7XG5cbiAgLy8gd2UgY2hlY2sgZm9yIGByZWFkeVN0YXRlYCBpbiBjYXNlIGFuIGBvcGVuYFxuICAvLyBsaXN0ZW5lciBhbHJlYWR5IGNsb3NlZCB0aGUgc29ja2V0XG4gIGlmICgnb3BlbicgPT0gdGhpcy5yZWFkeVN0YXRlICYmIHRoaXMudXBncmFkZSAmJiB0aGlzLnRyYW5zcG9ydC5wYXVzZSkge1xuICAgIGRlYnVnKCdzdGFydGluZyB1cGdyYWRlIHByb2JlcycpO1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy51cGdyYWRlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHRoaXMucHJvYmUodGhpcy51cGdyYWRlc1tpXSk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgYSBwYWNrZXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vblBhY2tldCA9IGZ1bmN0aW9uIChwYWNrZXQpIHtcbiAgaWYgKCdvcGVuaW5nJyA9PSB0aGlzLnJlYWR5U3RhdGUgfHwgJ29wZW4nID09IHRoaXMucmVhZHlTdGF0ZSkge1xuICAgIGRlYnVnKCdzb2NrZXQgcmVjZWl2ZTogdHlwZSBcIiVzXCIsIGRhdGEgXCIlc1wiJywgcGFja2V0LnR5cGUsIHBhY2tldC5kYXRhKTtcblxuICAgIHRoaXMuZW1pdCgncGFja2V0JywgcGFja2V0KTtcblxuICAgIC8vIFNvY2tldCBpcyBsaXZlIC0gYW55IHBhY2tldCBjb3VudHNcbiAgICB0aGlzLmVtaXQoJ2hlYXJ0YmVhdCcpO1xuXG4gICAgc3dpdGNoIChwYWNrZXQudHlwZSkge1xuICAgICAgY2FzZSAnb3Blbic6XG4gICAgICAgIHRoaXMub25IYW5kc2hha2UocGFyc2Vqc29uKHBhY2tldC5kYXRhKSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdwb25nJzpcbiAgICAgICAgdGhpcy5zZXRQaW5nKCk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdlcnJvcic6XG4gICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ3NlcnZlciBlcnJvcicpO1xuICAgICAgICBlcnIuY29kZSA9IHBhY2tldC5kYXRhO1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ21lc3NhZ2UnOlxuICAgICAgICB0aGlzLmVtaXQoJ2RhdGEnLCBwYWNrZXQuZGF0YSk7XG4gICAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIHBhY2tldC5kYXRhKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGRlYnVnKCdwYWNrZXQgcmVjZWl2ZWQgd2l0aCBzb2NrZXQgcmVhZHlTdGF0ZSBcIiVzXCInLCB0aGlzLnJlYWR5U3RhdGUpO1xuICB9XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIGhhbmRzaGFrZSBjb21wbGV0aW9uLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBoYW5kc2hha2Ugb2JqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uSGFuZHNoYWtlID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgdGhpcy5lbWl0KCdoYW5kc2hha2UnLCBkYXRhKTtcbiAgdGhpcy5pZCA9IGRhdGEuc2lkO1xuICB0aGlzLnRyYW5zcG9ydC5xdWVyeS5zaWQgPSBkYXRhLnNpZDtcbiAgdGhpcy51cGdyYWRlcyA9IHRoaXMuZmlsdGVyVXBncmFkZXMoZGF0YS51cGdyYWRlcyk7XG4gIHRoaXMucGluZ0ludGVydmFsID0gZGF0YS5waW5nSW50ZXJ2YWw7XG4gIHRoaXMucGluZ1RpbWVvdXQgPSBkYXRhLnBpbmdUaW1lb3V0O1xuICB0aGlzLm9uT3BlbigpO1xuICAvLyBJbiBjYXNlIG9wZW4gaGFuZGxlciBjbG9zZXMgc29ja2V0XG4gIGlmICAoJ2Nsb3NlZCcgPT0gdGhpcy5yZWFkeVN0YXRlKSByZXR1cm47XG4gIHRoaXMuc2V0UGluZygpO1xuXG4gIC8vIFByb2xvbmcgbGl2ZW5lc3Mgb2Ygc29ja2V0IG9uIGhlYXJ0YmVhdFxuICB0aGlzLnJlbW92ZUxpc3RlbmVyKCdoZWFydGJlYXQnLCB0aGlzLm9uSGVhcnRiZWF0KTtcbiAgdGhpcy5vbignaGVhcnRiZWF0JywgdGhpcy5vbkhlYXJ0YmVhdCk7XG59O1xuXG4vKipcbiAqIFJlc2V0cyBwaW5nIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkhlYXJ0YmVhdCA9IGZ1bmN0aW9uICh0aW1lb3V0KSB7XG4gIGNsZWFyVGltZW91dCh0aGlzLnBpbmdUaW1lb3V0VGltZXIpO1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYucGluZ1RpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgIGlmICgnY2xvc2VkJyA9PSBzZWxmLnJlYWR5U3RhdGUpIHJldHVybjtcbiAgICBzZWxmLm9uQ2xvc2UoJ3BpbmcgdGltZW91dCcpO1xuICB9LCB0aW1lb3V0IHx8IChzZWxmLnBpbmdJbnRlcnZhbCArIHNlbGYucGluZ1RpbWVvdXQpKTtcbn07XG5cbi8qKlxuICogUGluZ3Mgc2VydmVyIGV2ZXJ5IGB0aGlzLnBpbmdJbnRlcnZhbGAgYW5kIGV4cGVjdHMgcmVzcG9uc2VcbiAqIHdpdGhpbiBgdGhpcy5waW5nVGltZW91dGAgb3IgY2xvc2VzIGNvbm5lY3Rpb24uXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5zZXRQaW5nID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGNsZWFyVGltZW91dChzZWxmLnBpbmdJbnRlcnZhbFRpbWVyKTtcbiAgc2VsZi5waW5nSW50ZXJ2YWxUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgIGRlYnVnKCd3cml0aW5nIHBpbmcgcGFja2V0IC0gZXhwZWN0aW5nIHBvbmcgd2l0aGluICVzbXMnLCBzZWxmLnBpbmdUaW1lb3V0KTtcbiAgICBzZWxmLnBpbmcoKTtcbiAgICBzZWxmLm9uSGVhcnRiZWF0KHNlbGYucGluZ1RpbWVvdXQpO1xuICB9LCBzZWxmLnBpbmdJbnRlcnZhbCk7XG59O1xuXG4vKipcbiogU2VuZHMgYSBwaW5nIHBhY2tldC5cbipcbiogQGFwaSBwdWJsaWNcbiovXG5cblNvY2tldC5wcm90b3R5cGUucGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5zZW5kUGFja2V0KCdwaW5nJyk7XG59O1xuXG4vKipcbiAqIENhbGxlZCBvbiBgZHJhaW5gIGV2ZW50XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkRyYWluID0gZnVuY3Rpb24oKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5wcmV2QnVmZmVyTGVuOyBpKyspIHtcbiAgICBpZiAodGhpcy5jYWxsYmFja0J1ZmZlcltpXSkge1xuICAgICAgdGhpcy5jYWxsYmFja0J1ZmZlcltpXSgpO1xuICAgIH1cbiAgfVxuXG4gIHRoaXMud3JpdGVCdWZmZXIuc3BsaWNlKDAsIHRoaXMucHJldkJ1ZmZlckxlbik7XG4gIHRoaXMuY2FsbGJhY2tCdWZmZXIuc3BsaWNlKDAsIHRoaXMucHJldkJ1ZmZlckxlbik7XG5cbiAgLy8gc2V0dGluZyBwcmV2QnVmZmVyTGVuID0gMCBpcyB2ZXJ5IGltcG9ydGFudFxuICAvLyBmb3IgZXhhbXBsZSwgd2hlbiB1cGdyYWRpbmcsIHVwZ3JhZGUgcGFja2V0IGlzIHNlbnQgb3ZlcixcbiAgLy8gYW5kIGEgbm9uemVybyBwcmV2QnVmZmVyTGVuIGNvdWxkIGNhdXNlIHByb2JsZW1zIG9uIGBkcmFpbmBcbiAgdGhpcy5wcmV2QnVmZmVyTGVuID0gMDtcblxuICBpZiAodGhpcy53cml0ZUJ1ZmZlci5sZW5ndGggPT0gMCkge1xuICAgIHRoaXMuZW1pdCgnZHJhaW4nKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmZsdXNoKCk7XG4gIH1cbn07XG5cbi8qKlxuICogRmx1c2ggd3JpdGUgYnVmZmVycy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLmZsdXNoID0gZnVuY3Rpb24gKCkge1xuICBpZiAoJ2Nsb3NlZCcgIT0gdGhpcy5yZWFkeVN0YXRlICYmIHRoaXMudHJhbnNwb3J0LndyaXRhYmxlICYmXG4gICAgIXRoaXMudXBncmFkaW5nICYmIHRoaXMud3JpdGVCdWZmZXIubGVuZ3RoKSB7XG4gICAgZGVidWcoJ2ZsdXNoaW5nICVkIHBhY2tldHMgaW4gc29ja2V0JywgdGhpcy53cml0ZUJ1ZmZlci5sZW5ndGgpO1xuICAgIHRoaXMudHJhbnNwb3J0LnNlbmQodGhpcy53cml0ZUJ1ZmZlcik7XG4gICAgLy8ga2VlcCB0cmFjayBvZiBjdXJyZW50IGxlbmd0aCBvZiB3cml0ZUJ1ZmZlclxuICAgIC8vIHNwbGljZSB3cml0ZUJ1ZmZlciBhbmQgY2FsbGJhY2tCdWZmZXIgb24gYGRyYWluYFxuICAgIHRoaXMucHJldkJ1ZmZlckxlbiA9IHRoaXMud3JpdGVCdWZmZXIubGVuZ3RoO1xuICAgIHRoaXMuZW1pdCgnZmx1c2gnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBTZW5kcyBhIG1lc3NhZ2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbi5cbiAqIEByZXR1cm4ge1NvY2tldH0gZm9yIGNoYWluaW5nLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLndyaXRlID1cblNvY2tldC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChtc2csIGZuKSB7XG4gIHRoaXMuc2VuZFBhY2tldCgnbWVzc2FnZScsIG1zZywgZm4pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2VuZHMgYSBwYWNrZXQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhY2tldCB0eXBlLlxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbi5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUuc2VuZFBhY2tldCA9IGZ1bmN0aW9uICh0eXBlLCBkYXRhLCBmbikge1xuICBpZiAoJ2Nsb3NpbmcnID09IHRoaXMucmVhZHlTdGF0ZSB8fCAnY2xvc2VkJyA9PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGFja2V0ID0geyB0eXBlOiB0eXBlLCBkYXRhOiBkYXRhIH07XG4gIHRoaXMuZW1pdCgncGFja2V0Q3JlYXRlJywgcGFja2V0KTtcbiAgdGhpcy53cml0ZUJ1ZmZlci5wdXNoKHBhY2tldCk7XG4gIHRoaXMuY2FsbGJhY2tCdWZmZXIucHVzaChmbik7XG4gIHRoaXMuZmx1c2goKTtcbn07XG5cbi8qKlxuICogQ2xvc2VzIHRoZSBjb25uZWN0aW9uLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICgnb3BlbmluZycgPT0gdGhpcy5yZWFkeVN0YXRlIHx8ICdvcGVuJyA9PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2luZyc7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBmdW5jdGlvbiBjbG9zZSgpIHtcbiAgICAgIHNlbGYub25DbG9zZSgnZm9yY2VkIGNsb3NlJyk7XG4gICAgICBkZWJ1Zygnc29ja2V0IGNsb3NpbmcgLSB0ZWxsaW5nIHRyYW5zcG9ydCB0byBjbG9zZScpO1xuICAgICAgc2VsZi50cmFuc3BvcnQuY2xvc2UoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhbnVwQW5kQ2xvc2UoKSB7XG4gICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCd1cGdyYWRlJywgY2xlYW51cEFuZENsb3NlKTtcbiAgICAgIHNlbGYucmVtb3ZlTGlzdGVuZXIoJ3VwZ3JhZGVFcnJvcicsIGNsZWFudXBBbmRDbG9zZSk7XG4gICAgICBjbG9zZSgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhaXRGb3JVcGdyYWRlKCkge1xuICAgICAgLy8gd2FpdCBmb3IgdXBncmFkZSB0byBmaW5pc2ggc2luY2Ugd2UgY2FuJ3Qgc2VuZCBwYWNrZXRzIHdoaWxlIHBhdXNpbmcgYSB0cmFuc3BvcnRcbiAgICAgIHNlbGYub25jZSgndXBncmFkZScsIGNsZWFudXBBbmRDbG9zZSk7XG4gICAgICBzZWxmLm9uY2UoJ3VwZ3JhZGVFcnJvcicsIGNsZWFudXBBbmRDbG9zZSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMud3JpdGVCdWZmZXIubGVuZ3RoKSB7XG4gICAgICB0aGlzLm9uY2UoJ2RyYWluJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnVwZ3JhZGluZykge1xuICAgICAgICAgIHdhaXRGb3JVcGdyYWRlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnVwZ3JhZGluZykge1xuICAgICAgd2FpdEZvclVwZ3JhZGUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2xvc2UoKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gdHJhbnNwb3J0IGVycm9yXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICBkZWJ1Zygnc29ja2V0IGVycm9yICVqJywgZXJyKTtcbiAgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9IGZhbHNlO1xuICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgdGhpcy5vbkNsb3NlKCd0cmFuc3BvcnQgZXJyb3InLCBlcnIpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiB0cmFuc3BvcnQgY2xvc2UuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkNsb3NlID0gZnVuY3Rpb24gKHJlYXNvbiwgZGVzYykge1xuICBpZiAoJ29wZW5pbmcnID09IHRoaXMucmVhZHlTdGF0ZSB8fCAnb3BlbicgPT0gdGhpcy5yZWFkeVN0YXRlIHx8ICdjbG9zaW5nJyA9PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICBkZWJ1Zygnc29ja2V0IGNsb3NlIHdpdGggcmVhc29uOiBcIiVzXCInLCByZWFzb24pO1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIGNsZWFyIHRpbWVyc1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnBpbmdJbnRlcnZhbFRpbWVyKTtcbiAgICBjbGVhclRpbWVvdXQodGhpcy5waW5nVGltZW91dFRpbWVyKTtcblxuICAgIC8vIGNsZWFuIGJ1ZmZlcnMgaW4gbmV4dCB0aWNrLCBzbyBkZXZlbG9wZXJzIGNhbiBzdGlsbFxuICAgIC8vIGdyYWIgdGhlIGJ1ZmZlcnMgb24gYGNsb3NlYCBldmVudFxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBzZWxmLndyaXRlQnVmZmVyID0gW107XG4gICAgICBzZWxmLmNhbGxiYWNrQnVmZmVyID0gW107XG4gICAgICBzZWxmLnByZXZCdWZmZXJMZW4gPSAwO1xuICAgIH0sIDApO1xuXG4gICAgLy8gc3RvcCBldmVudCBmcm9tIGZpcmluZyBhZ2FpbiBmb3IgdHJhbnNwb3J0XG4gICAgdGhpcy50cmFuc3BvcnQucmVtb3ZlQWxsTGlzdGVuZXJzKCdjbG9zZScpO1xuXG4gICAgLy8gZW5zdXJlIHRyYW5zcG9ydCB3b24ndCBzdGF5IG9wZW5cbiAgICB0aGlzLnRyYW5zcG9ydC5jbG9zZSgpO1xuXG4gICAgLy8gaWdub3JlIGZ1cnRoZXIgdHJhbnNwb3J0IGNvbW11bmljYXRpb25cbiAgICB0aGlzLnRyYW5zcG9ydC5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcblxuICAgIC8vIHNldCByZWFkeSBzdGF0ZVxuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjbG9zZWQnO1xuXG4gICAgLy8gY2xlYXIgc2Vzc2lvbiBpZFxuICAgIHRoaXMuaWQgPSBudWxsO1xuXG4gICAgLy8gZW1pdCBjbG9zZSBldmVudFxuICAgIHRoaXMuZW1pdCgnY2xvc2UnLCByZWFzb24sIGRlc2MpO1xuICB9XG59O1xuXG4vKipcbiAqIEZpbHRlcnMgdXBncmFkZXMsIHJldHVybmluZyBvbmx5IHRob3NlIG1hdGNoaW5nIGNsaWVudCB0cmFuc3BvcnRzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHNlcnZlciB1cGdyYWRlc1xuICogQGFwaSBwcml2YXRlXG4gKlxuICovXG5cblNvY2tldC5wcm90b3R5cGUuZmlsdGVyVXBncmFkZXMgPSBmdW5jdGlvbiAodXBncmFkZXMpIHtcbiAgdmFyIGZpbHRlcmVkVXBncmFkZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGogPSB1cGdyYWRlcy5sZW5ndGg7IGk8ajsgaSsrKSB7XG4gICAgaWYgKH5pbmRleCh0aGlzLnRyYW5zcG9ydHMsIHVwZ3JhZGVzW2ldKSkgZmlsdGVyZWRVcGdyYWRlcy5wdXNoKHVwZ3JhZGVzW2ldKTtcbiAgfVxuICByZXR1cm4gZmlsdGVyZWRVcGdyYWRlcztcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHBhcnNlciA9IHJlcXVpcmUoJ2VuZ2luZS5pby1wYXJzZXInKTtcbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRyYW5zcG9ydDtcblxuLyoqXG4gKiBUcmFuc3BvcnQgYWJzdHJhY3QgY29uc3RydWN0b3IuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBUcmFuc3BvcnQgKG9wdHMpIHtcbiAgdGhpcy5wYXRoID0gb3B0cy5wYXRoO1xuICB0aGlzLmhvc3RuYW1lID0gb3B0cy5ob3N0bmFtZTtcbiAgdGhpcy5wb3J0ID0gb3B0cy5wb3J0O1xuICB0aGlzLnNlY3VyZSA9IG9wdHMuc2VjdXJlO1xuICB0aGlzLnF1ZXJ5ID0gb3B0cy5xdWVyeTtcbiAgdGhpcy50aW1lc3RhbXBQYXJhbSA9IG9wdHMudGltZXN0YW1wUGFyYW07XG4gIHRoaXMudGltZXN0YW1wUmVxdWVzdHMgPSBvcHRzLnRpbWVzdGFtcFJlcXVlc3RzO1xuICB0aGlzLnJlYWR5U3RhdGUgPSAnJztcbiAgdGhpcy5hZ2VudCA9IG9wdHMuYWdlbnQgfHwgZmFsc2U7XG4gIHRoaXMuc29ja2V0ID0gb3B0cy5zb2NrZXQ7XG4gIHRoaXMuZW5hYmxlc1hEUiA9IG9wdHMuZW5hYmxlc1hEUjtcblxuICAvLyBTU0wgb3B0aW9ucyBmb3IgTm9kZS5qcyBjbGllbnRcbiAgdGhpcy5wZnggPSBvcHRzLnBmeDtcbiAgdGhpcy5rZXkgPSBvcHRzLmtleTtcbiAgdGhpcy5wYXNzcGhyYXNlID0gb3B0cy5wYXNzcGhyYXNlO1xuICB0aGlzLmNlcnQgPSBvcHRzLmNlcnQ7XG4gIHRoaXMuY2EgPSBvcHRzLmNhO1xuICB0aGlzLmNpcGhlcnMgPSBvcHRzLmNpcGhlcnM7XG4gIHRoaXMucmVqZWN0VW5hdXRob3JpemVkID0gb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQ7XG59XG5cbi8qKlxuICogTWl4IGluIGBFbWl0dGVyYC5cbiAqL1xuXG5FbWl0dGVyKFRyYW5zcG9ydC5wcm90b3R5cGUpO1xuXG4vKipcbiAqIEEgY291bnRlciB1c2VkIHRvIHByZXZlbnQgY29sbGlzaW9ucyBpbiB0aGUgdGltZXN0YW1wcyB1c2VkXG4gKiBmb3IgY2FjaGUgYnVzdGluZy5cbiAqL1xuXG5UcmFuc3BvcnQudGltZXN0YW1wcyA9IDA7XG5cbi8qKlxuICogRW1pdHMgYW4gZXJyb3IuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7VHJhbnNwb3J0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuVHJhbnNwb3J0LnByb3RvdHlwZS5vbkVycm9yID0gZnVuY3Rpb24gKG1zZywgZGVzYykge1xuICB2YXIgZXJyID0gbmV3IEVycm9yKG1zZyk7XG4gIGVyci50eXBlID0gJ1RyYW5zcG9ydEVycm9yJztcbiAgZXJyLmRlc2NyaXB0aW9uID0gZGVzYztcbiAgdGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBPcGVucyB0aGUgdHJhbnNwb3J0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuVHJhbnNwb3J0LnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24gKCkge1xuICBpZiAoJ2Nsb3NlZCcgPT0gdGhpcy5yZWFkeVN0YXRlIHx8ICcnID09IHRoaXMucmVhZHlTdGF0ZSkge1xuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuaW5nJztcbiAgICB0aGlzLmRvT3BlbigpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIENsb3NlcyB0aGUgdHJhbnNwb3J0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICgnb3BlbmluZycgPT0gdGhpcy5yZWFkeVN0YXRlIHx8ICdvcGVuJyA9PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICB0aGlzLmRvQ2xvc2UoKTtcbiAgICB0aGlzLm9uQ2xvc2UoKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZW5kcyBtdWx0aXBsZSBwYWNrZXRzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhY2tldHNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKHBhY2tldHMpe1xuICBpZiAoJ29wZW4nID09IHRoaXMucmVhZHlTdGF0ZSkge1xuICAgIHRoaXMud3JpdGUocGFja2V0cyk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUcmFuc3BvcnQgbm90IG9wZW4nKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBvcGVuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuVHJhbnNwb3J0LnByb3RvdHlwZS5vbk9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuJztcbiAgdGhpcy53cml0YWJsZSA9IHRydWU7XG4gIHRoaXMuZW1pdCgnb3BlbicpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgd2l0aCBkYXRhLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5UcmFuc3BvcnQucHJvdG90eXBlLm9uRGF0YSA9IGZ1bmN0aW9uKGRhdGEpe1xuICB2YXIgcGFja2V0ID0gcGFyc2VyLmRlY29kZVBhY2tldChkYXRhLCB0aGlzLnNvY2tldC5iaW5hcnlUeXBlKTtcbiAgdGhpcy5vblBhY2tldChwYWNrZXQpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgd2l0aCBhIGRlY29kZWQgcGFja2V0LlxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUub25QYWNrZXQgPSBmdW5jdGlvbiAocGFja2V0KSB7XG4gIHRoaXMuZW1pdCgncGFja2V0JywgcGFja2V0KTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gY2xvc2UuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuVHJhbnNwb3J0LnByb3RvdHlwZS5vbkNsb3NlID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2VkJztcbiAgdGhpcy5lbWl0KCdjbG9zZScpO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBYTUxIdHRwUmVxdWVzdCA9IHJlcXVpcmUoJ3htbGh0dHByZXF1ZXN0Jyk7XG52YXIgWEhSID0gcmVxdWlyZSgnLi9wb2xsaW5nLXhocicpO1xudmFyIEpTT05QID0gcmVxdWlyZSgnLi9wb2xsaW5nLWpzb25wJyk7XG52YXIgd2Vic29ja2V0ID0gcmVxdWlyZSgnLi93ZWJzb2NrZXQnKTtcblxuLyoqXG4gKiBFeHBvcnQgdHJhbnNwb3J0cy5cbiAqL1xuXG5leHBvcnRzLnBvbGxpbmcgPSBwb2xsaW5nO1xuZXhwb3J0cy53ZWJzb2NrZXQgPSB3ZWJzb2NrZXQ7XG5cbi8qKlxuICogUG9sbGluZyB0cmFuc3BvcnQgcG9seW1vcnBoaWMgY29uc3RydWN0b3IuXG4gKiBEZWNpZGVzIG9uIHhociB2cyBqc29ucCBiYXNlZCBvbiBmZWF0dXJlIGRldGVjdGlvbi5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwb2xsaW5nKG9wdHMpe1xuICB2YXIgeGhyO1xuICB2YXIgeGQgPSBmYWxzZTtcbiAgdmFyIHhzID0gZmFsc2U7XG4gIHZhciBqc29ucCA9IGZhbHNlICE9PSBvcHRzLmpzb25wO1xuXG4gIGlmIChnbG9iYWwubG9jYXRpb24pIHtcbiAgICB2YXIgaXNTU0wgPSAnaHR0cHM6JyA9PSBsb2NhdGlvbi5wcm90b2NvbDtcbiAgICB2YXIgcG9ydCA9IGxvY2F0aW9uLnBvcnQ7XG5cbiAgICAvLyBzb21lIHVzZXIgYWdlbnRzIGhhdmUgZW1wdHkgYGxvY2F0aW9uLnBvcnRgXG4gICAgaWYgKCFwb3J0KSB7XG4gICAgICBwb3J0ID0gaXNTU0wgPyA0NDMgOiA4MDtcbiAgICB9XG5cbiAgICB4ZCA9IG9wdHMuaG9zdG5hbWUgIT0gbG9jYXRpb24uaG9zdG5hbWUgfHwgcG9ydCAhPSBvcHRzLnBvcnQ7XG4gICAgeHMgPSBvcHRzLnNlY3VyZSAhPSBpc1NTTDtcbiAgfVxuXG4gIG9wdHMueGRvbWFpbiA9IHhkO1xuICBvcHRzLnhzY2hlbWUgPSB4cztcbiAgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KG9wdHMpO1xuXG4gIGlmICgnb3BlbicgaW4geGhyICYmICFvcHRzLmZvcmNlSlNPTlApIHtcbiAgICByZXR1cm4gbmV3IFhIUihvcHRzKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoIWpzb25wKSB0aHJvdyBuZXcgRXJyb3IoJ0pTT05QIGRpc2FibGVkJyk7XG4gICAgcmV0dXJuIG5ldyBKU09OUChvcHRzKTtcbiAgfVxufVxuIiwiXG4vKipcbiAqIE1vZHVsZSByZXF1aXJlbWVudHMuXG4gKi9cblxudmFyIFBvbGxpbmcgPSByZXF1aXJlKCcuL3BvbGxpbmcnKTtcbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnY29tcG9uZW50LWluaGVyaXQnKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEpTT05QUG9sbGluZztcblxuLyoqXG4gKiBDYWNoZWQgcmVndWxhciBleHByZXNzaW9ucy5cbiAqL1xuXG52YXIgck5ld2xpbmUgPSAvXFxuL2c7XG52YXIgckVzY2FwZWROZXdsaW5lID0gL1xcXFxuL2c7XG5cbi8qKlxuICogR2xvYmFsIEpTT05QIGNhbGxiYWNrcy5cbiAqL1xuXG52YXIgY2FsbGJhY2tzO1xuXG4vKipcbiAqIENhbGxiYWNrcyBjb3VudC5cbiAqL1xuXG52YXIgaW5kZXggPSAwO1xuXG4vKipcbiAqIE5vb3AuXG4gKi9cblxuZnVuY3Rpb24gZW1wdHkgKCkgeyB9XG5cbi8qKlxuICogSlNPTlAgUG9sbGluZyBjb25zdHJ1Y3Rvci5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cy5cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gSlNPTlBQb2xsaW5nIChvcHRzKSB7XG4gIFBvbGxpbmcuY2FsbCh0aGlzLCBvcHRzKTtcblxuICB0aGlzLnF1ZXJ5ID0gdGhpcy5xdWVyeSB8fCB7fTtcblxuICAvLyBkZWZpbmUgZ2xvYmFsIGNhbGxiYWNrcyBhcnJheSBpZiBub3QgcHJlc2VudFxuICAvLyB3ZSBkbyB0aGlzIGhlcmUgKGxhemlseSkgdG8gYXZvaWQgdW5uZWVkZWQgZ2xvYmFsIHBvbGx1dGlvblxuICBpZiAoIWNhbGxiYWNrcykge1xuICAgIC8vIHdlIG5lZWQgdG8gY29uc2lkZXIgbXVsdGlwbGUgZW5naW5lcyBpbiB0aGUgc2FtZSBwYWdlXG4gICAgaWYgKCFnbG9iYWwuX19fZWlvKSBnbG9iYWwuX19fZWlvID0gW107XG4gICAgY2FsbGJhY2tzID0gZ2xvYmFsLl9fX2VpbztcbiAgfVxuXG4gIC8vIGNhbGxiYWNrIGlkZW50aWZpZXJcbiAgdGhpcy5pbmRleCA9IGNhbGxiYWNrcy5sZW5ndGg7XG5cbiAgLy8gYWRkIGNhbGxiYWNrIHRvIGpzb25wIGdsb2JhbFxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGNhbGxiYWNrcy5wdXNoKGZ1bmN0aW9uIChtc2cpIHtcbiAgICBzZWxmLm9uRGF0YShtc2cpO1xuICB9KTtcblxuICAvLyBhcHBlbmQgdG8gcXVlcnkgc3RyaW5nXG4gIHRoaXMucXVlcnkuaiA9IHRoaXMuaW5kZXg7XG5cbiAgLy8gcHJldmVudCBzcHVyaW91cyBlcnJvcnMgZnJvbSBiZWluZyBlbWl0dGVkIHdoZW4gdGhlIHdpbmRvdyBpcyB1bmxvYWRlZFxuICBpZiAoZ2xvYmFsLmRvY3VtZW50ICYmIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLnNjcmlwdCkgc2VsZi5zY3JpcHQub25lcnJvciA9IGVtcHR5O1xuICAgIH0sIGZhbHNlKTtcbiAgfVxufVxuXG4vKipcbiAqIEluaGVyaXRzIGZyb20gUG9sbGluZy5cbiAqL1xuXG5pbmhlcml0KEpTT05QUG9sbGluZywgUG9sbGluZyk7XG5cbi8qXG4gKiBKU09OUCBvbmx5IHN1cHBvcnRzIGJpbmFyeSBhcyBiYXNlNjQgZW5jb2RlZCBzdHJpbmdzXG4gKi9cblxuSlNPTlBQb2xsaW5nLnByb3RvdHlwZS5zdXBwb3J0c0JpbmFyeSA9IGZhbHNlO1xuXG4vKipcbiAqIENsb3NlcyB0aGUgc29ja2V0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkpTT05QUG9sbGluZy5wcm90b3R5cGUuZG9DbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgdGhpcy5zY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLnNjcmlwdCk7XG4gICAgdGhpcy5zY3JpcHQgPSBudWxsO1xuICB9XG5cbiAgaWYgKHRoaXMuZm9ybSkge1xuICAgIHRoaXMuZm9ybS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZm9ybSk7XG4gICAgdGhpcy5mb3JtID0gbnVsbDtcbiAgICB0aGlzLmlmcmFtZSA9IG51bGw7XG4gIH1cblxuICBQb2xsaW5nLnByb3RvdHlwZS5kb0Nsb3NlLmNhbGwodGhpcyk7XG59O1xuXG4vKipcbiAqIFN0YXJ0cyBhIHBvbGwgY3ljbGUuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuSlNPTlBQb2xsaW5nLnByb3RvdHlwZS5kb1BvbGwgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXG4gIGlmICh0aGlzLnNjcmlwdCkge1xuICAgIHRoaXMuc2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5zY3JpcHQpO1xuICAgIHRoaXMuc2NyaXB0ID0gbnVsbDtcbiAgfVxuXG4gIHNjcmlwdC5hc3luYyA9IHRydWU7XG4gIHNjcmlwdC5zcmMgPSB0aGlzLnVyaSgpO1xuICBzY3JpcHQub25lcnJvciA9IGZ1bmN0aW9uKGUpe1xuICAgIHNlbGYub25FcnJvcignanNvbnAgcG9sbCBlcnJvcicsZSk7XG4gIH07XG5cbiAgdmFyIGluc2VydEF0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICBpbnNlcnRBdC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShzY3JpcHQsIGluc2VydEF0KTtcbiAgdGhpcy5zY3JpcHQgPSBzY3JpcHQ7XG5cbiAgdmFyIGlzVUFnZWNrbyA9ICd1bmRlZmluZWQnICE9IHR5cGVvZiBuYXZpZ2F0b3IgJiYgL2dlY2tvL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcbiAgXG4gIGlmIChpc1VBZ2Vja28pIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcbiAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoaWZyYW1lKTtcbiAgICB9LCAxMDApO1xuICB9XG59O1xuXG4vKipcbiAqIFdyaXRlcyB3aXRoIGEgaGlkZGVuIGlmcmFtZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSB0byBzZW5kXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsZWQgdXBvbiBmbHVzaC5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkpTT05QUG9sbGluZy5wcm90b3R5cGUuZG9Xcml0ZSA9IGZ1bmN0aW9uIChkYXRhLCBmbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCF0aGlzLmZvcm0pIHtcbiAgICB2YXIgZm9ybSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zvcm0nKTtcbiAgICB2YXIgYXJlYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG4gICAgdmFyIGlkID0gdGhpcy5pZnJhbWVJZCA9ICdlaW9faWZyYW1lXycgKyB0aGlzLmluZGV4O1xuICAgIHZhciBpZnJhbWU7XG5cbiAgICBmb3JtLmNsYXNzTmFtZSA9ICdzb2NrZXRpbyc7XG4gICAgZm9ybS5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgZm9ybS5zdHlsZS50b3AgPSAnLTEwMDBweCc7XG4gICAgZm9ybS5zdHlsZS5sZWZ0ID0gJy0xMDAwcHgnO1xuICAgIGZvcm0udGFyZ2V0ID0gaWQ7XG4gICAgZm9ybS5tZXRob2QgPSAnUE9TVCc7XG4gICAgZm9ybS5zZXRBdHRyaWJ1dGUoJ2FjY2VwdC1jaGFyc2V0JywgJ3V0Zi04Jyk7XG4gICAgYXJlYS5uYW1lID0gJ2QnO1xuICAgIGZvcm0uYXBwZW5kQ2hpbGQoYXJlYSk7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmb3JtKTtcblxuICAgIHRoaXMuZm9ybSA9IGZvcm07XG4gICAgdGhpcy5hcmVhID0gYXJlYTtcbiAgfVxuXG4gIHRoaXMuZm9ybS5hY3Rpb24gPSB0aGlzLnVyaSgpO1xuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlICgpIHtcbiAgICBpbml0SWZyYW1lKCk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRJZnJhbWUgKCkge1xuICAgIGlmIChzZWxmLmlmcmFtZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc2VsZi5mb3JtLnJlbW92ZUNoaWxkKHNlbGYuaWZyYW1lKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc2VsZi5vbkVycm9yKCdqc29ucCBwb2xsaW5nIGlmcmFtZSByZW1vdmFsIGVycm9yJywgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIGllNiBkeW5hbWljIGlmcmFtZXMgd2l0aCB0YXJnZXQ9XCJcIiBzdXBwb3J0ICh0aGFua3MgQ2hyaXMgTGFtYmFjaGVyKVxuICAgICAgdmFyIGh0bWwgPSAnPGlmcmFtZSBzcmM9XCJqYXZhc2NyaXB0OjBcIiBuYW1lPVwiJysgc2VsZi5pZnJhbWVJZCArJ1wiPic7XG4gICAgICBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KGh0bWwpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuICAgICAgaWZyYW1lLm5hbWUgPSBzZWxmLmlmcmFtZUlkO1xuICAgICAgaWZyYW1lLnNyYyA9ICdqYXZhc2NyaXB0OjAnO1xuICAgIH1cblxuICAgIGlmcmFtZS5pZCA9IHNlbGYuaWZyYW1lSWQ7XG5cbiAgICBzZWxmLmZvcm0uYXBwZW5kQ2hpbGQoaWZyYW1lKTtcbiAgICBzZWxmLmlmcmFtZSA9IGlmcmFtZTtcbiAgfVxuXG4gIGluaXRJZnJhbWUoKTtcblxuICAvLyBlc2NhcGUgXFxuIHRvIHByZXZlbnQgaXQgZnJvbSBiZWluZyBjb252ZXJ0ZWQgaW50byBcXHJcXG4gYnkgc29tZSBVQXNcbiAgLy8gZG91YmxlIGVzY2FwaW5nIGlzIHJlcXVpcmVkIGZvciBlc2NhcGVkIG5ldyBsaW5lcyBiZWNhdXNlIHVuZXNjYXBpbmcgb2YgbmV3IGxpbmVzIGNhbiBiZSBkb25lIHNhZmVseSBvbiBzZXJ2ZXItc2lkZVxuICBkYXRhID0gZGF0YS5yZXBsYWNlKHJFc2NhcGVkTmV3bGluZSwgJ1xcXFxcXG4nKTtcbiAgdGhpcy5hcmVhLnZhbHVlID0gZGF0YS5yZXBsYWNlKHJOZXdsaW5lLCAnXFxcXG4nKTtcblxuICB0cnkge1xuICAgIHRoaXMuZm9ybS5zdWJtaXQoKTtcbiAgfSBjYXRjaChlKSB7fVxuXG4gIGlmICh0aGlzLmlmcmFtZS5hdHRhY2hFdmVudCkge1xuICAgIHRoaXMuaWZyYW1lLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCl7XG4gICAgICBpZiAoc2VsZi5pZnJhbWUucmVhZHlTdGF0ZSA9PSAnY29tcGxldGUnKSB7XG4gICAgICAgIGNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmlmcmFtZS5vbmxvYWQgPSBjb21wbGV0ZTtcbiAgfVxufTtcbiIsIi8qKlxuICogTW9kdWxlIHJlcXVpcmVtZW50cy5cbiAqL1xuXG52YXIgWE1MSHR0cFJlcXVlc3QgPSByZXF1aXJlKCd4bWxodHRwcmVxdWVzdCcpO1xudmFyIFBvbGxpbmcgPSByZXF1aXJlKCcuL3BvbGxpbmcnKTtcbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKTtcbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnY29tcG9uZW50LWluaGVyaXQnKTtcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ2VuZ2luZS5pby1jbGllbnQ6cG9sbGluZy14aHInKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFhIUjtcbm1vZHVsZS5leHBvcnRzLlJlcXVlc3QgPSBSZXF1ZXN0O1xuXG4vKipcbiAqIEVtcHR5IGZ1bmN0aW9uXG4gKi9cblxuZnVuY3Rpb24gZW1wdHkoKXt9XG5cbi8qKlxuICogWEhSIFBvbGxpbmcgY29uc3RydWN0b3IuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gWEhSKG9wdHMpe1xuICBQb2xsaW5nLmNhbGwodGhpcywgb3B0cyk7XG5cbiAgaWYgKGdsb2JhbC5sb2NhdGlvbikge1xuICAgIHZhciBpc1NTTCA9ICdodHRwczonID09IGxvY2F0aW9uLnByb3RvY29sO1xuICAgIHZhciBwb3J0ID0gbG9jYXRpb24ucG9ydDtcblxuICAgIC8vIHNvbWUgdXNlciBhZ2VudHMgaGF2ZSBlbXB0eSBgbG9jYXRpb24ucG9ydGBcbiAgICBpZiAoIXBvcnQpIHtcbiAgICAgIHBvcnQgPSBpc1NTTCA/IDQ0MyA6IDgwO1xuICAgIH1cblxuICAgIHRoaXMueGQgPSBvcHRzLmhvc3RuYW1lICE9IGdsb2JhbC5sb2NhdGlvbi5ob3N0bmFtZSB8fFxuICAgICAgcG9ydCAhPSBvcHRzLnBvcnQ7XG4gICAgdGhpcy54cyA9IG9wdHMuc2VjdXJlICE9IGlzU1NMO1xuICB9XG59XG5cbi8qKlxuICogSW5oZXJpdHMgZnJvbSBQb2xsaW5nLlxuICovXG5cbmluaGVyaXQoWEhSLCBQb2xsaW5nKTtcblxuLyoqXG4gKiBYSFIgc3VwcG9ydHMgYmluYXJ5XG4gKi9cblxuWEhSLnByb3RvdHlwZS5zdXBwb3J0c0JpbmFyeSA9IHRydWU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHJlcXVlc3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuWEhSLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24ob3B0cyl7XG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuICBvcHRzLnVyaSA9IHRoaXMudXJpKCk7XG4gIG9wdHMueGQgPSB0aGlzLnhkO1xuICBvcHRzLnhzID0gdGhpcy54cztcbiAgb3B0cy5hZ2VudCA9IHRoaXMuYWdlbnQgfHwgZmFsc2U7XG4gIG9wdHMuc3VwcG9ydHNCaW5hcnkgPSB0aGlzLnN1cHBvcnRzQmluYXJ5O1xuICBvcHRzLmVuYWJsZXNYRFIgPSB0aGlzLmVuYWJsZXNYRFI7XG5cbiAgLy8gU1NMIG9wdGlvbnMgZm9yIE5vZGUuanMgY2xpZW50XG4gIG9wdHMucGZ4ID0gdGhpcy5wZng7XG4gIG9wdHMua2V5ID0gdGhpcy5rZXk7XG4gIG9wdHMucGFzc3BocmFzZSA9IHRoaXMucGFzc3BocmFzZTtcbiAgb3B0cy5jZXJ0ID0gdGhpcy5jZXJ0O1xuICBvcHRzLmNhID0gdGhpcy5jYTtcbiAgb3B0cy5jaXBoZXJzID0gdGhpcy5jaXBoZXJzO1xuICBvcHRzLnJlamVjdFVuYXV0aG9yaXplZCA9IHRoaXMucmVqZWN0VW5hdXRob3JpemVkO1xuXG4gIHJldHVybiBuZXcgUmVxdWVzdChvcHRzKTtcbn07XG5cbi8qKlxuICogU2VuZHMgZGF0YS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSB0byBzZW5kLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGVkIHVwb24gZmx1c2guXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5YSFIucHJvdG90eXBlLmRvV3JpdGUgPSBmdW5jdGlvbihkYXRhLCBmbil7XG4gIHZhciBpc0JpbmFyeSA9IHR5cGVvZiBkYXRhICE9PSAnc3RyaW5nJyAmJiBkYXRhICE9PSB1bmRlZmluZWQ7XG4gIHZhciByZXEgPSB0aGlzLnJlcXVlc3QoeyBtZXRob2Q6ICdQT1NUJywgZGF0YTogZGF0YSwgaXNCaW5hcnk6IGlzQmluYXJ5IH0pO1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHJlcS5vbignc3VjY2VzcycsIGZuKTtcbiAgcmVxLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgc2VsZi5vbkVycm9yKCd4aHIgcG9zdCBlcnJvcicsIGVycik7XG4gIH0pO1xuICB0aGlzLnNlbmRYaHIgPSByZXE7XG59O1xuXG4vKipcbiAqIFN0YXJ0cyBhIHBvbGwgY3ljbGUuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuWEhSLnByb3RvdHlwZS5kb1BvbGwgPSBmdW5jdGlvbigpe1xuICBkZWJ1ZygneGhyIHBvbGwnKTtcbiAgdmFyIHJlcSA9IHRoaXMucmVxdWVzdCgpO1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHJlcS5vbignZGF0YScsIGZ1bmN0aW9uKGRhdGEpe1xuICAgIHNlbGYub25EYXRhKGRhdGEpO1xuICB9KTtcbiAgcmVxLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgc2VsZi5vbkVycm9yKCd4aHIgcG9sbCBlcnJvcicsIGVycik7XG4gIH0pO1xuICB0aGlzLnBvbGxYaHIgPSByZXE7XG59O1xuXG4vKipcbiAqIFJlcXVlc3QgY29uc3RydWN0b3JcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSZXF1ZXN0KG9wdHMpe1xuICB0aGlzLm1ldGhvZCA9IG9wdHMubWV0aG9kIHx8ICdHRVQnO1xuICB0aGlzLnVyaSA9IG9wdHMudXJpO1xuICB0aGlzLnhkID0gISFvcHRzLnhkO1xuICB0aGlzLnhzID0gISFvcHRzLnhzO1xuICB0aGlzLmFzeW5jID0gZmFsc2UgIT09IG9wdHMuYXN5bmM7XG4gIHRoaXMuZGF0YSA9IHVuZGVmaW5lZCAhPSBvcHRzLmRhdGEgPyBvcHRzLmRhdGEgOiBudWxsO1xuICB0aGlzLmFnZW50ID0gb3B0cy5hZ2VudDtcbiAgdGhpcy5pc0JpbmFyeSA9IG9wdHMuaXNCaW5hcnk7XG4gIHRoaXMuc3VwcG9ydHNCaW5hcnkgPSBvcHRzLnN1cHBvcnRzQmluYXJ5O1xuICB0aGlzLmVuYWJsZXNYRFIgPSBvcHRzLmVuYWJsZXNYRFI7XG5cbiAgLy8gU1NMIG9wdGlvbnMgZm9yIE5vZGUuanMgY2xpZW50XG4gIHRoaXMucGZ4ID0gb3B0cy5wZng7XG4gIHRoaXMua2V5ID0gb3B0cy5rZXk7XG4gIHRoaXMucGFzc3BocmFzZSA9IG9wdHMucGFzc3BocmFzZTtcbiAgdGhpcy5jZXJ0ID0gb3B0cy5jZXJ0O1xuICB0aGlzLmNhID0gb3B0cy5jYTtcbiAgdGhpcy5jaXBoZXJzID0gb3B0cy5jaXBoZXJzO1xuICB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCA9IG9wdHMucmVqZWN0VW5hdXRob3JpemVkO1xuXG4gIHRoaXMuY3JlYXRlKCk7XG59XG5cbi8qKlxuICogTWl4IGluIGBFbWl0dGVyYC5cbiAqL1xuXG5FbWl0dGVyKFJlcXVlc3QucHJvdG90eXBlKTtcblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBYSFIgb2JqZWN0IGFuZCBzZW5kcyB0aGUgcmVxdWVzdC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbigpe1xuICB2YXIgb3B0cyA9IHsgYWdlbnQ6IHRoaXMuYWdlbnQsIHhkb21haW46IHRoaXMueGQsIHhzY2hlbWU6IHRoaXMueHMsIGVuYWJsZXNYRFI6IHRoaXMuZW5hYmxlc1hEUiB9O1xuXG4gIC8vIFNTTCBvcHRpb25zIGZvciBOb2RlLmpzIGNsaWVudFxuICBvcHRzLnBmeCA9IHRoaXMucGZ4O1xuICBvcHRzLmtleSA9IHRoaXMua2V5O1xuICBvcHRzLnBhc3NwaHJhc2UgPSB0aGlzLnBhc3NwaHJhc2U7XG4gIG9wdHMuY2VydCA9IHRoaXMuY2VydDtcbiAgb3B0cy5jYSA9IHRoaXMuY2E7XG4gIG9wdHMuY2lwaGVycyA9IHRoaXMuY2lwaGVycztcbiAgb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQgPSB0aGlzLnJlamVjdFVuYXV0aG9yaXplZDtcblxuICB2YXIgeGhyID0gdGhpcy54aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3Qob3B0cyk7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB0cnkge1xuICAgIGRlYnVnKCd4aHIgb3BlbiAlczogJXMnLCB0aGlzLm1ldGhvZCwgdGhpcy51cmkpO1xuICAgIHhoci5vcGVuKHRoaXMubWV0aG9kLCB0aGlzLnVyaSwgdGhpcy5hc3luYyk7XG4gICAgaWYgKHRoaXMuc3VwcG9ydHNCaW5hcnkpIHtcbiAgICAgIC8vIFRoaXMgaGFzIHRvIGJlIGRvbmUgYWZ0ZXIgb3BlbiBiZWNhdXNlIEZpcmVmb3ggaXMgc3R1cGlkXG4gICAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEzMjE2OTAzL2dldC1iaW5hcnktZGF0YS13aXRoLXhtbGh0dHByZXF1ZXN0LWluLWEtZmlyZWZveC1leHRlbnNpb25cbiAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgIH1cblxuICAgIGlmICgnUE9TVCcgPT0gdGhpcy5tZXRob2QpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICh0aGlzLmlzQmluYXJ5KSB7XG4gICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtdHlwZScsICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC10eXBlJywgJ3RleHQvcGxhaW47Y2hhcnNldD1VVEYtOCcpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH1cblxuICAgIC8vIGllNiBjaGVja1xuICAgIGlmICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpIHtcbiAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmhhc1hEUigpKSB7XG4gICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24oKXtcbiAgICAgICAgc2VsZi5vbkxvYWQoKTtcbiAgICAgIH07XG4gICAgICB4aHIub25lcnJvciA9IGZ1bmN0aW9uKCl7XG4gICAgICAgIHNlbGYub25FcnJvcih4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpe1xuICAgICAgICBpZiAoNCAhPSB4aHIucmVhZHlTdGF0ZSkgcmV0dXJuO1xuICAgICAgICBpZiAoMjAwID09IHhoci5zdGF0dXMgfHwgMTIyMyA9PSB4aHIuc3RhdHVzKSB7XG4gICAgICAgICAgc2VsZi5vbkxvYWQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBtYWtlIHN1cmUgdGhlIGBlcnJvcmAgZXZlbnQgaGFuZGxlciB0aGF0J3MgdXNlci1zZXRcbiAgICAgICAgICAvLyBkb2VzIG5vdCB0aHJvdyBpbiB0aGUgc2FtZSB0aWNrIGFuZCBnZXRzIGNhdWdodCBoZXJlXG4gICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgc2VsZi5vbkVycm9yKHhoci5zdGF0dXMpO1xuICAgICAgICAgIH0sIDApO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1cblxuICAgIGRlYnVnKCd4aHIgZGF0YSAlcycsIHRoaXMuZGF0YSk7XG4gICAgeGhyLnNlbmQodGhpcy5kYXRhKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8vIE5lZWQgdG8gZGVmZXIgc2luY2UgLmNyZWF0ZSgpIGlzIGNhbGxlZCBkaXJlY3RseSBmaHJvbSB0aGUgY29uc3RydWN0b3JcbiAgICAvLyBhbmQgdGh1cyB0aGUgJ2Vycm9yJyBldmVudCBjYW4gb25seSBiZSBvbmx5IGJvdW5kICphZnRlciogdGhpcyBleGNlcHRpb25cbiAgICAvLyBvY2N1cnMuICBUaGVyZWZvcmUsIGFsc28sIHdlIGNhbm5vdCB0aHJvdyBoZXJlIGF0IGFsbC5cbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgc2VsZi5vbkVycm9yKGUpO1xuICAgIH0sIDApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChnbG9iYWwuZG9jdW1lbnQpIHtcbiAgICB0aGlzLmluZGV4ID0gUmVxdWVzdC5yZXF1ZXN0c0NvdW50Kys7XG4gICAgUmVxdWVzdC5yZXF1ZXN0c1t0aGlzLmluZGV4XSA9IHRoaXM7XG4gIH1cbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gc3VjY2Vzc2Z1bCByZXNwb25zZS5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5vblN1Y2Nlc3MgPSBmdW5jdGlvbigpe1xuICB0aGlzLmVtaXQoJ3N1Y2Nlc3MnKTtcbiAgdGhpcy5jbGVhbnVwKCk7XG59O1xuXG4vKipcbiAqIENhbGxlZCBpZiB3ZSBoYXZlIGRhdGEuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24oZGF0YSl7XG4gIHRoaXMuZW1pdCgnZGF0YScsIGRhdGEpO1xuICB0aGlzLm9uU3VjY2VzcygpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBlcnJvci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5vbkVycm9yID0gZnVuY3Rpb24oZXJyKXtcbiAgdGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG4gIHRoaXMuY2xlYW51cCh0cnVlKTtcbn07XG5cbi8qKlxuICogQ2xlYW5zIHVwIGhvdXNlLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNsZWFudXAgPSBmdW5jdGlvbihmcm9tRXJyb3Ipe1xuICBpZiAoJ3VuZGVmaW5lZCcgPT0gdHlwZW9mIHRoaXMueGhyIHx8IG51bGwgPT09IHRoaXMueGhyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIHhtbGh0dHByZXF1ZXN0XG4gIGlmICh0aGlzLmhhc1hEUigpKSB7XG4gICAgdGhpcy54aHIub25sb2FkID0gdGhpcy54aHIub25lcnJvciA9IGVtcHR5O1xuICB9IGVsc2Uge1xuICAgIHRoaXMueGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGVtcHR5O1xuICB9XG5cbiAgaWYgKGZyb21FcnJvcikge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnhoci5hYm9ydCgpO1xuICAgIH0gY2F0Y2goZSkge31cbiAgfVxuXG4gIGlmIChnbG9iYWwuZG9jdW1lbnQpIHtcbiAgICBkZWxldGUgUmVxdWVzdC5yZXF1ZXN0c1t0aGlzLmluZGV4XTtcbiAgfVxuXG4gIHRoaXMueGhyID0gbnVsbDtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gbG9hZC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5vbkxvYWQgPSBmdW5jdGlvbigpe1xuICB2YXIgZGF0YTtcbiAgdHJ5IHtcbiAgICB2YXIgY29udGVudFR5cGU7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnRlbnRUeXBlID0gdGhpcy54aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ0NvbnRlbnQtVHlwZScpLnNwbGl0KCc7JylbMF07XG4gICAgfSBjYXRjaCAoZSkge31cbiAgICBpZiAoY29udGVudFR5cGUgPT09ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nKSB7XG4gICAgICBkYXRhID0gdGhpcy54aHIucmVzcG9uc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghdGhpcy5zdXBwb3J0c0JpbmFyeSkge1xuICAgICAgICBkYXRhID0gdGhpcy54aHIucmVzcG9uc2VUZXh0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGF0YSA9ICdvayc7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgdGhpcy5vbkVycm9yKGUpO1xuICB9XG4gIGlmIChudWxsICE9IGRhdGEpIHtcbiAgICB0aGlzLm9uRGF0YShkYXRhKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDaGVjayBpZiBpdCBoYXMgWERvbWFpblJlcXVlc3QuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuaGFzWERSID0gZnVuY3Rpb24oKXtcbiAgcmV0dXJuICd1bmRlZmluZWQnICE9PSB0eXBlb2YgZ2xvYmFsLlhEb21haW5SZXF1ZXN0ICYmICF0aGlzLnhzICYmIHRoaXMuZW5hYmxlc1hEUjtcbn07XG5cbi8qKlxuICogQWJvcnRzIHRoZSByZXF1ZXN0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbigpe1xuICB0aGlzLmNsZWFudXAoKTtcbn07XG5cbi8qKlxuICogQWJvcnRzIHBlbmRpbmcgcmVxdWVzdHMgd2hlbiB1bmxvYWRpbmcgdGhlIHdpbmRvdy4gVGhpcyBpcyBuZWVkZWQgdG8gcHJldmVudFxuICogbWVtb3J5IGxlYWtzIChlLmcuIHdoZW4gdXNpbmcgSUUpIGFuZCB0byBlbnN1cmUgdGhhdCBubyBzcHVyaW91cyBlcnJvciBpc1xuICogZW1pdHRlZC5cbiAqL1xuXG5pZiAoZ2xvYmFsLmRvY3VtZW50KSB7XG4gIFJlcXVlc3QucmVxdWVzdHNDb3VudCA9IDA7XG4gIFJlcXVlc3QucmVxdWVzdHMgPSB7fTtcbiAgaWYgKGdsb2JhbC5hdHRhY2hFdmVudCkge1xuICAgIGdsb2JhbC5hdHRhY2hFdmVudCgnb251bmxvYWQnLCB1bmxvYWRIYW5kbGVyKTtcbiAgfSBlbHNlIGlmIChnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCB1bmxvYWRIYW5kbGVyLCBmYWxzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdW5sb2FkSGFuZGxlcigpIHtcbiAgZm9yICh2YXIgaSBpbiBSZXF1ZXN0LnJlcXVlc3RzKSB7XG4gICAgaWYgKFJlcXVlc3QucmVxdWVzdHMuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgIFJlcXVlc3QucmVxdWVzdHNbaV0uYWJvcnQoKTtcbiAgICB9XG4gIH1cbn1cbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi4vdHJhbnNwb3J0Jyk7XG52YXIgcGFyc2VxcyA9IHJlcXVpcmUoJ3BhcnNlcXMnKTtcbnZhciBwYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG52YXIgaW5oZXJpdCA9IHJlcXVpcmUoJ2NvbXBvbmVudC1pbmhlcml0Jyk7XG52YXIgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCdlbmdpbmUuaW8tY2xpZW50OnBvbGxpbmcnKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBvbGxpbmc7XG5cbi8qKlxuICogSXMgWEhSMiBzdXBwb3J0ZWQ/XG4gKi9cblxudmFyIGhhc1hIUjIgPSAoZnVuY3Rpb24oKSB7XG4gIHZhciBYTUxIdHRwUmVxdWVzdCA9IHJlcXVpcmUoJ3htbGh0dHByZXF1ZXN0Jyk7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoeyB4ZG9tYWluOiBmYWxzZSB9KTtcbiAgcmV0dXJuIG51bGwgIT0geGhyLnJlc3BvbnNlVHlwZTtcbn0pKCk7XG5cbi8qKlxuICogUG9sbGluZyBpbnRlcmZhY2UuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFBvbGxpbmcob3B0cyl7XG4gIHZhciBmb3JjZUJhc2U2NCA9IChvcHRzICYmIG9wdHMuZm9yY2VCYXNlNjQpO1xuICBpZiAoIWhhc1hIUjIgfHwgZm9yY2VCYXNlNjQpIHtcbiAgICB0aGlzLnN1cHBvcnRzQmluYXJ5ID0gZmFsc2U7XG4gIH1cbiAgVHJhbnNwb3J0LmNhbGwodGhpcywgb3B0cyk7XG59XG5cbi8qKlxuICogSW5oZXJpdHMgZnJvbSBUcmFuc3BvcnQuXG4gKi9cblxuaW5oZXJpdChQb2xsaW5nLCBUcmFuc3BvcnQpO1xuXG4vKipcbiAqIFRyYW5zcG9ydCBuYW1lLlxuICovXG5cblBvbGxpbmcucHJvdG90eXBlLm5hbWUgPSAncG9sbGluZyc7XG5cbi8qKlxuICogT3BlbnMgdGhlIHNvY2tldCAodHJpZ2dlcnMgcG9sbGluZykuIFdlIHdyaXRlIGEgUElORyBtZXNzYWdlIHRvIGRldGVybWluZVxuICogd2hlbiB0aGUgdHJhbnNwb3J0IGlzIG9wZW4uXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUG9sbGluZy5wcm90b3R5cGUuZG9PcGVuID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5wb2xsKCk7XG59O1xuXG4vKipcbiAqIFBhdXNlcyBwb2xsaW5nLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHVwb24gYnVmZmVycyBhcmUgZmx1c2hlZCBhbmQgdHJhbnNwb3J0IGlzIHBhdXNlZFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUG9sbGluZy5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbihvblBhdXNlKXtcbiAgdmFyIHBlbmRpbmcgPSAwO1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdGhpcy5yZWFkeVN0YXRlID0gJ3BhdXNpbmcnO1xuXG4gIGZ1bmN0aW9uIHBhdXNlKCl7XG4gICAgZGVidWcoJ3BhdXNlZCcpO1xuICAgIHNlbGYucmVhZHlTdGF0ZSA9ICdwYXVzZWQnO1xuICAgIG9uUGF1c2UoKTtcbiAgfVxuXG4gIGlmICh0aGlzLnBvbGxpbmcgfHwgIXRoaXMud3JpdGFibGUpIHtcbiAgICB2YXIgdG90YWwgPSAwO1xuXG4gICAgaWYgKHRoaXMucG9sbGluZykge1xuICAgICAgZGVidWcoJ3dlIGFyZSBjdXJyZW50bHkgcG9sbGluZyAtIHdhaXRpbmcgdG8gcGF1c2UnKTtcbiAgICAgIHRvdGFsKys7XG4gICAgICB0aGlzLm9uY2UoJ3BvbGxDb21wbGV0ZScsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGRlYnVnKCdwcmUtcGF1c2UgcG9sbGluZyBjb21wbGV0ZScpO1xuICAgICAgICAtLXRvdGFsIHx8IHBhdXNlKCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMud3JpdGFibGUpIHtcbiAgICAgIGRlYnVnKCd3ZSBhcmUgY3VycmVudGx5IHdyaXRpbmcgLSB3YWl0aW5nIHRvIHBhdXNlJyk7XG4gICAgICB0b3RhbCsrO1xuICAgICAgdGhpcy5vbmNlKCdkcmFpbicsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGRlYnVnKCdwcmUtcGF1c2Ugd3JpdGluZyBjb21wbGV0ZScpO1xuICAgICAgICAtLXRvdGFsIHx8IHBhdXNlKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGF1c2UoKTtcbiAgfVxufTtcblxuLyoqXG4gKiBTdGFydHMgcG9sbGluZyBjeWNsZS5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblBvbGxpbmcucHJvdG90eXBlLnBvbGwgPSBmdW5jdGlvbigpe1xuICBkZWJ1ZygncG9sbGluZycpO1xuICB0aGlzLnBvbGxpbmcgPSB0cnVlO1xuICB0aGlzLmRvUG9sbCgpO1xuICB0aGlzLmVtaXQoJ3BvbGwnKTtcbn07XG5cbi8qKlxuICogT3ZlcmxvYWRzIG9uRGF0YSB0byBkZXRlY3QgcGF5bG9hZHMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUG9sbGluZy5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24oZGF0YSl7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgZGVidWcoJ3BvbGxpbmcgZ290IGRhdGEgJXMnLCBkYXRhKTtcbiAgdmFyIGNhbGxiYWNrID0gZnVuY3Rpb24ocGFja2V0LCBpbmRleCwgdG90YWwpIHtcbiAgICAvLyBpZiBpdHMgdGhlIGZpcnN0IG1lc3NhZ2Ugd2UgY29uc2lkZXIgdGhlIHRyYW5zcG9ydCBvcGVuXG4gICAgaWYgKCdvcGVuaW5nJyA9PSBzZWxmLnJlYWR5U3RhdGUpIHtcbiAgICAgIHNlbGYub25PcGVuKCk7XG4gICAgfVxuXG4gICAgLy8gaWYgaXRzIGEgY2xvc2UgcGFja2V0LCB3ZSBjbG9zZSB0aGUgb25nb2luZyByZXF1ZXN0c1xuICAgIGlmICgnY2xvc2UnID09IHBhY2tldC50eXBlKSB7XG4gICAgICBzZWxmLm9uQ2xvc2UoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBvdGhlcndpc2UgYnlwYXNzIG9uRGF0YSBhbmQgaGFuZGxlIHRoZSBtZXNzYWdlXG4gICAgc2VsZi5vblBhY2tldChwYWNrZXQpO1xuICB9O1xuXG4gIC8vIGRlY29kZSBwYXlsb2FkXG4gIHBhcnNlci5kZWNvZGVQYXlsb2FkKGRhdGEsIHRoaXMuc29ja2V0LmJpbmFyeVR5cGUsIGNhbGxiYWNrKTtcblxuICAvLyBpZiBhbiBldmVudCBkaWQgbm90IHRyaWdnZXIgY2xvc2luZ1xuICBpZiAoJ2Nsb3NlZCcgIT0gdGhpcy5yZWFkeVN0YXRlKSB7XG4gICAgLy8gaWYgd2UgZ290IGRhdGEgd2UncmUgbm90IHBvbGxpbmdcbiAgICB0aGlzLnBvbGxpbmcgPSBmYWxzZTtcbiAgICB0aGlzLmVtaXQoJ3BvbGxDb21wbGV0ZScpO1xuXG4gICAgaWYgKCdvcGVuJyA9PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICAgIHRoaXMucG9sbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZygnaWdub3JpbmcgcG9sbCAtIHRyYW5zcG9ydCBzdGF0ZSBcIiVzXCInLCB0aGlzLnJlYWR5U3RhdGUpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBGb3IgcG9sbGluZywgc2VuZCBhIGNsb3NlIHBhY2tldC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Qb2xsaW5nLnByb3RvdHlwZS5kb0Nsb3NlID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGZ1bmN0aW9uIGNsb3NlKCl7XG4gICAgZGVidWcoJ3dyaXRpbmcgY2xvc2UgcGFja2V0Jyk7XG4gICAgc2VsZi53cml0ZShbeyB0eXBlOiAnY2xvc2UnIH1dKTtcbiAgfVxuXG4gIGlmICgnb3BlbicgPT0gdGhpcy5yZWFkeVN0YXRlKSB7XG4gICAgZGVidWcoJ3RyYW5zcG9ydCBvcGVuIC0gY2xvc2luZycpO1xuICAgIGNsb3NlKCk7XG4gIH0gZWxzZSB7XG4gICAgLy8gaW4gY2FzZSB3ZSdyZSB0cnlpbmcgdG8gY2xvc2Ugd2hpbGVcbiAgICAvLyBoYW5kc2hha2luZyBpcyBpbiBwcm9ncmVzcyAoR0gtMTY0KVxuICAgIGRlYnVnKCd0cmFuc3BvcnQgbm90IG9wZW4gLSBkZWZlcnJpbmcgY2xvc2UnKTtcbiAgICB0aGlzLm9uY2UoJ29wZW4nLCBjbG9zZSk7XG4gIH1cbn07XG5cbi8qKlxuICogV3JpdGVzIGEgcGFja2V0cyBwYXlsb2FkLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGRhdGEgcGFja2V0c1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZHJhaW4gY2FsbGJhY2tcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblBvbGxpbmcucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24ocGFja2V0cyl7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy53cml0YWJsZSA9IGZhbHNlO1xuICB2YXIgY2FsbGJhY2tmbiA9IGZ1bmN0aW9uKCkge1xuICAgIHNlbGYud3JpdGFibGUgPSB0cnVlO1xuICAgIHNlbGYuZW1pdCgnZHJhaW4nKTtcbiAgfTtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHBhcnNlci5lbmNvZGVQYXlsb2FkKHBhY2tldHMsIHRoaXMuc3VwcG9ydHNCaW5hcnksIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBzZWxmLmRvV3JpdGUoZGF0YSwgY2FsbGJhY2tmbik7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgdXJpIGZvciBjb25uZWN0aW9uLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblBvbGxpbmcucHJvdG90eXBlLnVyaSA9IGZ1bmN0aW9uKCl7XG4gIHZhciBxdWVyeSA9IHRoaXMucXVlcnkgfHwge307XG4gIHZhciBzY2hlbWEgPSB0aGlzLnNlY3VyZSA/ICdodHRwcycgOiAnaHR0cCc7XG4gIHZhciBwb3J0ID0gJyc7XG5cbiAgLy8gY2FjaGUgYnVzdGluZyBpcyBmb3JjZWRcbiAgaWYgKGZhbHNlICE9PSB0aGlzLnRpbWVzdGFtcFJlcXVlc3RzKSB7XG4gICAgcXVlcnlbdGhpcy50aW1lc3RhbXBQYXJhbV0gPSArbmV3IERhdGUgKyAnLScgKyBUcmFuc3BvcnQudGltZXN0YW1wcysrO1xuICB9XG5cbiAgaWYgKCF0aGlzLnN1cHBvcnRzQmluYXJ5ICYmICFxdWVyeS5zaWQpIHtcbiAgICBxdWVyeS5iNjQgPSAxO1xuICB9XG5cbiAgcXVlcnkgPSBwYXJzZXFzLmVuY29kZShxdWVyeSk7XG5cbiAgLy8gYXZvaWQgcG9ydCBpZiBkZWZhdWx0IGZvciBzY2hlbWFcbiAgaWYgKHRoaXMucG9ydCAmJiAoKCdodHRwcycgPT0gc2NoZW1hICYmIHRoaXMucG9ydCAhPSA0NDMpIHx8XG4gICAgICgnaHR0cCcgPT0gc2NoZW1hICYmIHRoaXMucG9ydCAhPSA4MCkpKSB7XG4gICAgcG9ydCA9ICc6JyArIHRoaXMucG9ydDtcbiAgfVxuXG4gIC8vIHByZXBlbmQgPyB0byBxdWVyeVxuICBpZiAocXVlcnkubGVuZ3RoKSB7XG4gICAgcXVlcnkgPSAnPycgKyBxdWVyeTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWEgKyAnOi8vJyArIHRoaXMuaG9zdG5hbWUgKyBwb3J0ICsgdGhpcy5wYXRoICsgcXVlcnk7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBUcmFuc3BvcnQgPSByZXF1aXJlKCcuLi90cmFuc3BvcnQnKTtcbnZhciBwYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG52YXIgcGFyc2VxcyA9IHJlcXVpcmUoJ3BhcnNlcXMnKTtcbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnY29tcG9uZW50LWluaGVyaXQnKTtcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ2VuZ2luZS5pby1jbGllbnQ6d2Vic29ja2V0Jyk7XG5cbi8qKlxuICogYHdzYCBleHBvc2VzIGEgV2ViU29ja2V0LWNvbXBhdGlibGUgaW50ZXJmYWNlIGluXG4gKiBOb2RlLCBvciB0aGUgYFdlYlNvY2tldGAgb3IgYE1veldlYlNvY2tldGAgZ2xvYmFsc1xuICogaW4gdGhlIGJyb3dzZXIuXG4gKi9cblxudmFyIFdlYlNvY2tldCA9IHJlcXVpcmUoJ3dzJyk7XG5cbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBXUztcblxuLyoqXG4gKiBXZWJTb2NrZXQgdHJhbnNwb3J0IGNvbnN0cnVjdG9yLlxuICpcbiAqIEBhcGkge09iamVjdH0gY29ubmVjdGlvbiBvcHRpb25zXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFdTKG9wdHMpe1xuICB2YXIgZm9yY2VCYXNlNjQgPSAob3B0cyAmJiBvcHRzLmZvcmNlQmFzZTY0KTtcbiAgaWYgKGZvcmNlQmFzZTY0KSB7XG4gICAgdGhpcy5zdXBwb3J0c0JpbmFyeSA9IGZhbHNlO1xuICB9XG4gIFRyYW5zcG9ydC5jYWxsKHRoaXMsIG9wdHMpO1xufVxuXG4vKipcbiAqIEluaGVyaXRzIGZyb20gVHJhbnNwb3J0LlxuICovXG5cbmluaGVyaXQoV1MsIFRyYW5zcG9ydCk7XG5cbi8qKlxuICogVHJhbnNwb3J0IG5hbWUuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5XUy5wcm90b3R5cGUubmFtZSA9ICd3ZWJzb2NrZXQnO1xuXG4vKlxuICogV2ViU29ja2V0cyBzdXBwb3J0IGJpbmFyeVxuICovXG5cbldTLnByb3RvdHlwZS5zdXBwb3J0c0JpbmFyeSA9IHRydWU7XG5cbi8qKlxuICogT3BlbnMgc29ja2V0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbldTLnByb3RvdHlwZS5kb09wZW4gPSBmdW5jdGlvbigpe1xuICBpZiAoIXRoaXMuY2hlY2soKSkge1xuICAgIC8vIGxldCBwcm9iZSB0aW1lb3V0XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgdXJpID0gdGhpcy51cmkoKTtcbiAgdmFyIHByb3RvY29scyA9IHZvaWQoMCk7XG4gIHZhciBvcHRzID0geyBhZ2VudDogdGhpcy5hZ2VudCB9O1xuXG4gIC8vIFNTTCBvcHRpb25zIGZvciBOb2RlLmpzIGNsaWVudFxuICBvcHRzLnBmeCA9IHRoaXMucGZ4O1xuICBvcHRzLmtleSA9IHRoaXMua2V5O1xuICBvcHRzLnBhc3NwaHJhc2UgPSB0aGlzLnBhc3NwaHJhc2U7XG4gIG9wdHMuY2VydCA9IHRoaXMuY2VydDtcbiAgb3B0cy5jYSA9IHRoaXMuY2E7XG4gIG9wdHMuY2lwaGVycyA9IHRoaXMuY2lwaGVycztcbiAgb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQgPSB0aGlzLnJlamVjdFVuYXV0aG9yaXplZDtcblxuICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh1cmksIHByb3RvY29scywgb3B0cyk7XG5cbiAgaWYgKHRoaXMud3MuYmluYXJ5VHlwZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhpcy5zdXBwb3J0c0JpbmFyeSA9IGZhbHNlO1xuICB9XG5cbiAgdGhpcy53cy5iaW5hcnlUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgdGhpcy5hZGRFdmVudExpc3RlbmVycygpO1xufTtcblxuLyoqXG4gKiBBZGRzIGV2ZW50IGxpc3RlbmVycyB0byB0aGUgc29ja2V0XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuV1MucHJvdG90eXBlLmFkZEV2ZW50TGlzdGVuZXJzID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHRoaXMud3Mub25vcGVuID0gZnVuY3Rpb24oKXtcbiAgICBzZWxmLm9uT3BlbigpO1xuICB9O1xuICB0aGlzLndzLm9uY2xvc2UgPSBmdW5jdGlvbigpe1xuICAgIHNlbGYub25DbG9zZSgpO1xuICB9O1xuICB0aGlzLndzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGV2KXtcbiAgICBzZWxmLm9uRGF0YShldi5kYXRhKTtcbiAgfTtcbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24oZSl7XG4gICAgc2VsZi5vbkVycm9yKCd3ZWJzb2NrZXQgZXJyb3InLCBlKTtcbiAgfTtcbn07XG5cbi8qKlxuICogT3ZlcnJpZGUgYG9uRGF0YWAgdG8gdXNlIGEgdGltZXIgb24gaU9TLlxuICogU2VlOiBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9tbG91Z2hyYW4vMjA1MjAwNlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmlmICgndW5kZWZpbmVkJyAhPSB0eXBlb2YgbmF2aWdhdG9yXG4gICYmIC9pUGFkfGlQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSkge1xuICBXUy5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24oZGF0YSl7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIFRyYW5zcG9ydC5wcm90b3R5cGUub25EYXRhLmNhbGwoc2VsZiwgZGF0YSk7XG4gICAgfSwgMCk7XG4gIH07XG59XG5cbi8qKlxuICogV3JpdGVzIGRhdGEgdG8gc29ja2V0LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IG9mIHBhY2tldHMuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5XUy5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihwYWNrZXRzKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB0aGlzLndyaXRhYmxlID0gZmFsc2U7XG4gIC8vIGVuY29kZVBhY2tldCBlZmZpY2llbnQgYXMgaXQgdXNlcyBXUyBmcmFtaW5nXG4gIC8vIG5vIG5lZWQgZm9yIGVuY29kZVBheWxvYWRcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBwYWNrZXRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHBhcnNlci5lbmNvZGVQYWNrZXQocGFja2V0c1tpXSwgdGhpcy5zdXBwb3J0c0JpbmFyeSwgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgLy9Tb21ldGltZXMgdGhlIHdlYnNvY2tldCBoYXMgYWxyZWFkeSBiZWVuIGNsb3NlZCBidXQgdGhlIGJyb3dzZXIgZGlkbid0XG4gICAgICAvL2hhdmUgYSBjaGFuY2Ugb2YgaW5mb3JtaW5nIHVzIGFib3V0IGl0IHlldCwgaW4gdGhhdCBjYXNlIHNlbmQgd2lsbFxuICAgICAgLy90aHJvdyBhbiBlcnJvclxuICAgICAgdHJ5IHtcbiAgICAgICAgc2VsZi53cy5zZW5kKGRhdGEpO1xuICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIGRlYnVnKCd3ZWJzb2NrZXQgY2xvc2VkIGJlZm9yZSBvbmNsb3NlIGV2ZW50Jyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBvbmRyYWluKCkge1xuICAgIHNlbGYud3JpdGFibGUgPSB0cnVlO1xuICAgIHNlbGYuZW1pdCgnZHJhaW4nKTtcbiAgfVxuICAvLyBmYWtlIGRyYWluXG4gIC8vIGRlZmVyIHRvIG5leHQgdGljayB0byBhbGxvdyBTb2NrZXQgdG8gY2xlYXIgd3JpdGVCdWZmZXJcbiAgc2V0VGltZW91dChvbmRyYWluLCAwKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gY2xvc2VcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5XUy5wcm90b3R5cGUub25DbG9zZSA9IGZ1bmN0aW9uKCl7XG4gIFRyYW5zcG9ydC5wcm90b3R5cGUub25DbG9zZS5jYWxsKHRoaXMpO1xufTtcblxuLyoqXG4gKiBDbG9zZXMgc29ja2V0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbldTLnByb3RvdHlwZS5kb0Nsb3NlID0gZnVuY3Rpb24oKXtcbiAgaWYgKHR5cGVvZiB0aGlzLndzICE9PSAndW5kZWZpbmVkJykge1xuICAgIHRoaXMud3MuY2xvc2UoKTtcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgdXJpIGZvciBjb25uZWN0aW9uLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbldTLnByb3RvdHlwZS51cmkgPSBmdW5jdGlvbigpe1xuICB2YXIgcXVlcnkgPSB0aGlzLnF1ZXJ5IHx8IHt9O1xuICB2YXIgc2NoZW1hID0gdGhpcy5zZWN1cmUgPyAnd3NzJyA6ICd3cyc7XG4gIHZhciBwb3J0ID0gJyc7XG5cbiAgLy8gYXZvaWQgcG9ydCBpZiBkZWZhdWx0IGZvciBzY2hlbWFcbiAgaWYgKHRoaXMucG9ydCAmJiAoKCd3c3MnID09IHNjaGVtYSAmJiB0aGlzLnBvcnQgIT0gNDQzKVxuICAgIHx8ICgnd3MnID09IHNjaGVtYSAmJiB0aGlzLnBvcnQgIT0gODApKSkge1xuICAgIHBvcnQgPSAnOicgKyB0aGlzLnBvcnQ7XG4gIH1cblxuICAvLyBhcHBlbmQgdGltZXN0YW1wIHRvIFVSSVxuICBpZiAodGhpcy50aW1lc3RhbXBSZXF1ZXN0cykge1xuICAgIHF1ZXJ5W3RoaXMudGltZXN0YW1wUGFyYW1dID0gK25ldyBEYXRlO1xuICB9XG5cbiAgLy8gY29tbXVuaWNhdGUgYmluYXJ5IHN1cHBvcnQgY2FwYWJpbGl0aWVzXG4gIGlmICghdGhpcy5zdXBwb3J0c0JpbmFyeSkge1xuICAgIHF1ZXJ5LmI2NCA9IDE7XG4gIH1cblxuICBxdWVyeSA9IHBhcnNlcXMuZW5jb2RlKHF1ZXJ5KTtcblxuICAvLyBwcmVwZW5kID8gdG8gcXVlcnlcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCkge1xuICAgIHF1ZXJ5ID0gJz8nICsgcXVlcnk7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hICsgJzovLycgKyB0aGlzLmhvc3RuYW1lICsgcG9ydCArIHRoaXMucGF0aCArIHF1ZXJ5O1xufTtcblxuLyoqXG4gKiBGZWF0dXJlIGRldGVjdGlvbiBmb3IgV2ViU29ja2V0LlxuICpcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhpcyB0cmFuc3BvcnQgaXMgYXZhaWxhYmxlLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5XUy5wcm90b3R5cGUuY2hlY2sgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gISFXZWJTb2NrZXQgJiYgISgnX19pbml0aWFsaXplJyBpbiBXZWJTb2NrZXQgJiYgdGhpcy5uYW1lID09PSBXUy5wcm90b3R5cGUubmFtZSk7XG59O1xuIiwiLy8gYnJvd3NlciBzaGltIGZvciB4bWxodHRwcmVxdWVzdCBtb2R1bGVcbnZhciBoYXNDT1JTID0gcmVxdWlyZSgnaGFzLWNvcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRzKSB7XG4gIHZhciB4ZG9tYWluID0gb3B0cy54ZG9tYWluO1xuXG4gIC8vIHNjaGVtZSBtdXN0IGJlIHNhbWUgd2hlbiB1c2lnbiBYRG9tYWluUmVxdWVzdFxuICAvLyBodHRwOi8vYmxvZ3MubXNkbi5jb20vYi9pZWludGVybmFscy9hcmNoaXZlLzIwMTAvMDUvMTMveGRvbWFpbnJlcXVlc3QtcmVzdHJpY3Rpb25zLWxpbWl0YXRpb25zLWFuZC13b3JrYXJvdW5kcy5hc3B4XG4gIHZhciB4c2NoZW1lID0gb3B0cy54c2NoZW1lO1xuXG4gIC8vIFhEb21haW5SZXF1ZXN0IGhhcyBhIGZsb3cgb2Ygbm90IHNlbmRpbmcgY29va2llLCB0aGVyZWZvcmUgaXQgc2hvdWxkIGJlIGRpc2FibGVkIGFzIGEgZGVmYXVsdC5cbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL0F1dG9tYXR0aWMvZW5naW5lLmlvLWNsaWVudC9wdWxsLzIxN1xuICB2YXIgZW5hYmxlc1hEUiA9IG9wdHMuZW5hYmxlc1hEUjtcblxuICAvLyBYTUxIdHRwUmVxdWVzdCBjYW4gYmUgZGlzYWJsZWQgb24gSUVcbiAgdHJ5IHtcbiAgICBpZiAoJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIFhNTEh0dHBSZXF1ZXN0ICYmICgheGRvbWFpbiB8fCBoYXNDT1JTKSkge1xuICAgICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkgeyB9XG5cbiAgLy8gVXNlIFhEb21haW5SZXF1ZXN0IGZvciBJRTggaWYgZW5hYmxlc1hEUiBpcyB0cnVlXG4gIC8vIGJlY2F1c2UgbG9hZGluZyBiYXIga2VlcHMgZmxhc2hpbmcgd2hlbiB1c2luZyBqc29ucC1wb2xsaW5nXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS95dWppb3Nha2Evc29ja2UuaW8taWU4LWxvYWRpbmctZXhhbXBsZVxuICB0cnkge1xuICAgIGlmICgndW5kZWZpbmVkJyAhPSB0eXBlb2YgWERvbWFpblJlcXVlc3QgJiYgIXhzY2hlbWUgJiYgZW5hYmxlc1hEUikge1xuICAgICAgcmV0dXJuIG5ldyBYRG9tYWluUmVxdWVzdCgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkgeyB9XG5cbiAgaWYgKCF4ZG9tYWluKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTEhUVFAnKTtcbiAgICB9IGNhdGNoKGUpIHsgfVxuICB9XG59XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYSwgYil7XG4gIHZhciBmbiA9IGZ1bmN0aW9uKCl7fTtcbiAgZm4ucHJvdG90eXBlID0gYi5wcm90b3R5cGU7XG4gIGEucHJvdG90eXBlID0gbmV3IGZuO1xuICBhLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGE7XG59OyIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSB3ZWIgYnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGVidWcnKTtcbmV4cG9ydHMubG9nID0gbG9nO1xuZXhwb3J0cy5mb3JtYXRBcmdzID0gZm9ybWF0QXJncztcbmV4cG9ydHMuc2F2ZSA9IHNhdmU7XG5leHBvcnRzLmxvYWQgPSBsb2FkO1xuZXhwb3J0cy51c2VDb2xvcnMgPSB1c2VDb2xvcnM7XG5cbi8qKlxuICogQ29sb3JzLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0gW1xuICAnbGlnaHRzZWFncmVlbicsXG4gICdmb3Jlc3RncmVlbicsXG4gICdnb2xkZW5yb2QnLFxuICAnZG9kZ2VyYmx1ZScsXG4gICdkYXJrb3JjaGlkJyxcbiAgJ2NyaW1zb24nXG5dO1xuXG4vKipcbiAqIEN1cnJlbnRseSBvbmx5IFdlYktpdC1iYXNlZCBXZWIgSW5zcGVjdG9ycywgRmlyZWZveCA+PSB2MzEsXG4gKiBhbmQgdGhlIEZpcmVidWcgZXh0ZW5zaW9uIChhbnkgRmlyZWZveCB2ZXJzaW9uKSBhcmUga25vd25cbiAqIHRvIHN1cHBvcnQgXCIlY1wiIENTUyBjdXN0b21pemF0aW9ucy5cbiAqXG4gKiBUT0RPOiBhZGQgYSBgbG9jYWxTdG9yYWdlYCB2YXJpYWJsZSB0byBleHBsaWNpdGx5IGVuYWJsZS9kaXNhYmxlIGNvbG9yc1xuICovXG5cbmZ1bmN0aW9uIHVzZUNvbG9ycygpIHtcbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgcmV0dXJuICgnV2Via2l0QXBwZWFyYW5jZScgaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlKSB8fFxuICAgIC8vIGlzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcbiAgICAod2luZG93LmNvbnNvbGUgJiYgKGNvbnNvbGUuZmlyZWJ1ZyB8fCAoY29uc29sZS5leGNlcHRpb24gJiYgY29uc29sZS50YWJsZSkpKSB8fFxuICAgIC8vIGlzIGZpcmVmb3ggPj0gdjMxP1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuICAgIChuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncygpIHtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybiBhcmdzO1xuXG4gIHZhciBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcbiAgYXJncyA9IFthcmdzWzBdLCBjLCAnY29sb3I6IGluaGVyaXQnXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJncywgMSkpO1xuXG4gIC8vIHRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG4gIC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cbiAgLy8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG4gIHZhciBpbmRleCA9IDA7XG4gIHZhciBsYXN0QyA9IDA7XG4gIGFyZ3NbMF0ucmVwbGFjZSgvJVthLXolXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIGlmICgnJSUnID09PSBtYXRjaCkgcmV0dXJuO1xuICAgIGluZGV4Kys7XG4gICAgaWYgKCclYycgPT09IG1hdGNoKSB7XG4gICAgICAvLyB3ZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcbiAgICAgIC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG4gICAgICBsYXN0QyA9IGluZGV4O1xuICAgIH1cbiAgfSk7XG5cbiAgYXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xuICByZXR1cm4gYXJncztcbn1cblxuLyoqXG4gKiBJbnZva2VzIGBjb25zb2xlLmxvZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUubG9nYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBsb2coKSB7XG4gIC8vIFRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4LFxuICAvLyB3aGVyZSB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT0gdHlwZW9mIGNvbnNvbGVcbiAgICAmJiAnZnVuY3Rpb24nID09IHR5cGVvZiBjb25zb2xlLmxvZ1xuICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzYXZlKG5hbWVzcGFjZXMpIHtcbiAgdHJ5IHtcbiAgICBpZiAobnVsbCA9PSBuYW1lc3BhY2VzKSB7XG4gICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9jYWxTdG9yYWdlLmRlYnVnID0gbmFtZXNwYWNlcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge31cbn1cblxuLyoqXG4gKiBMb2FkIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHJldHVybnMgdGhlIHByZXZpb3VzbHkgcGVyc2lzdGVkIGRlYnVnIG1vZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICB2YXIgcjtcbiAgdHJ5IHtcbiAgICByID0gbG9jYWxTdG9yYWdlLmRlYnVnO1xuICB9IGNhdGNoKGUpIHt9XG4gIHJldHVybiByO1xufVxuXG4vKipcbiAqIEVuYWJsZSBuYW1lc3BhY2VzIGxpc3RlZCBpbiBgbG9jYWxTdG9yYWdlLmRlYnVnYCBpbml0aWFsbHkuXG4gKi9cblxuZXhwb3J0cy5lbmFibGUobG9hZCgpKTtcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBkZWJ1ZztcbmV4cG9ydHMuY29lcmNlID0gY29lcmNlO1xuZXhwb3J0cy5kaXNhYmxlID0gZGlzYWJsZTtcbmV4cG9ydHMuZW5hYmxlID0gZW5hYmxlO1xuZXhwb3J0cy5lbmFibGVkID0gZW5hYmxlZDtcbmV4cG9ydHMuaHVtYW5pemUgPSByZXF1aXJlKCdtcycpO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXJjYXNlZCBsZXR0ZXIsIGkuZS4gXCJuXCIuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzID0ge307XG5cbi8qKlxuICogUHJldmlvdXNseSBhc3NpZ25lZCBjb2xvci5cbiAqL1xuXG52YXIgcHJldkNvbG9yID0gMDtcblxuLyoqXG4gKiBQcmV2aW91cyBsb2cgdGltZXN0YW1wLlxuICovXG5cbnZhciBwcmV2VGltZTtcblxuLyoqXG4gKiBTZWxlY3QgYSBjb2xvci5cbiAqXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzZWxlY3RDb2xvcigpIHtcbiAgcmV0dXJuIGV4cG9ydHMuY29sb3JzW3ByZXZDb2xvcisrICUgZXhwb3J0cy5jb2xvcnMubGVuZ3RoXTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBkZWJ1Z2dlciB3aXRoIHRoZSBnaXZlbiBgbmFtZXNwYWNlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVidWcobmFtZXNwYWNlKSB7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZGlzYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZGlzYWJsZWQoKSB7XG4gIH1cbiAgZGlzYWJsZWQuZW5hYmxlZCA9IGZhbHNlO1xuXG4gIC8vIGRlZmluZSB0aGUgYGVuYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZW5hYmxlZCgpIHtcblxuICAgIHZhciBzZWxmID0gZW5hYmxlZDtcblxuICAgIC8vIHNldCBgZGlmZmAgdGltZXN0YW1wXG4gICAgdmFyIGN1cnIgPSArbmV3IERhdGUoKTtcbiAgICB2YXIgbXMgPSBjdXJyIC0gKHByZXZUaW1lIHx8IGN1cnIpO1xuICAgIHNlbGYuZGlmZiA9IG1zO1xuICAgIHNlbGYucHJldiA9IHByZXZUaW1lO1xuICAgIHNlbGYuY3VyciA9IGN1cnI7XG4gICAgcHJldlRpbWUgPSBjdXJyO1xuXG4gICAgLy8gYWRkIHRoZSBgY29sb3JgIGlmIG5vdCBzZXRcbiAgICBpZiAobnVsbCA9PSBzZWxmLnVzZUNvbG9ycykgc2VsZi51c2VDb2xvcnMgPSBleHBvcnRzLnVzZUNvbG9ycygpO1xuICAgIGlmIChudWxsID09IHNlbGYuY29sb3IgJiYgc2VsZi51c2VDb2xvcnMpIHNlbGYuY29sb3IgPSBzZWxlY3RDb2xvcigpO1xuXG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gICAgYXJnc1swXSA9IGV4cG9ydHMuY29lcmNlKGFyZ3NbMF0pO1xuXG4gICAgaWYgKCdzdHJpbmcnICE9PSB0eXBlb2YgYXJnc1swXSkge1xuICAgICAgLy8gYW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJW9cbiAgICAgIGFyZ3MgPSBbJyVvJ10uY29uY2F0KGFyZ3MpO1xuICAgIH1cblxuICAgIC8vIGFwcGx5IGFueSBgZm9ybWF0dGVyc2AgdHJhbnNmb3JtYXRpb25zXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICBhcmdzWzBdID0gYXJnc1swXS5yZXBsYWNlKC8lKFthLXolXSkvZywgZnVuY3Rpb24obWF0Y2gsIGZvcm1hdCkge1xuICAgICAgLy8gaWYgd2UgZW5jb3VudGVyIGFuIGVzY2FwZWQgJSB0aGVuIGRvbid0IGluY3JlYXNlIHRoZSBhcnJheSBpbmRleFxuICAgICAgaWYgKG1hdGNoID09PSAnJSUnKSByZXR1cm4gbWF0Y2g7XG4gICAgICBpbmRleCsrO1xuICAgICAgdmFyIGZvcm1hdHRlciA9IGV4cG9ydHMuZm9ybWF0dGVyc1tmb3JtYXRdO1xuICAgICAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiBmb3JtYXR0ZXIpIHtcbiAgICAgICAgdmFyIHZhbCA9IGFyZ3NbaW5kZXhdO1xuICAgICAgICBtYXRjaCA9IGZvcm1hdHRlci5jYWxsKHNlbGYsIHZhbCk7XG5cbiAgICAgICAgLy8gbm93IHdlIG5lZWQgdG8gcmVtb3ZlIGBhcmdzW2luZGV4XWAgc2luY2UgaXQncyBpbmxpbmVkIGluIHRoZSBgZm9ybWF0YFxuICAgICAgICBhcmdzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIGluZGV4LS07XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG5cbiAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGV4cG9ydHMuZm9ybWF0QXJncykge1xuICAgICAgYXJncyA9IGV4cG9ydHMuZm9ybWF0QXJncy5hcHBseShzZWxmLCBhcmdzKTtcbiAgICB9XG4gICAgdmFyIGxvZ0ZuID0gZW5hYmxlZC5sb2cgfHwgZXhwb3J0cy5sb2cgfHwgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcbiAgICBsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcbiAgfVxuICBlbmFibGVkLmVuYWJsZWQgPSB0cnVlO1xuXG4gIHZhciBmbiA9IGV4cG9ydHMuZW5hYmxlZChuYW1lc3BhY2UpID8gZW5hYmxlZCA6IGRpc2FibGVkO1xuXG4gIGZuLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblxuICByZXR1cm4gZm47XG59XG5cbi8qKlxuICogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuICogc2VwYXJhdGVkIGJ5IGEgY29sb24gYW5kIHdpbGRjYXJkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuICBleHBvcnRzLnNhdmUobmFtZXNwYWNlcyk7XG5cbiAgdmFyIHNwbGl0ID0gKG5hbWVzcGFjZXMgfHwgJycpLnNwbGl0KC9bXFxzLF0rLyk7XG4gIHZhciBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICghc3BsaXRbaV0pIGNvbnRpbnVlOyAvLyBpZ25vcmUgZW1wdHkgc3RyaW5nc1xuICAgIG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuICAgIGlmIChuYW1lc3BhY2VzWzBdID09PSAnLScpIHtcbiAgICAgIGV4cG9ydHMuc2tpcHMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMuc3Vic3RyKDEpICsgJyQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRpc2FibGUoKSB7XG4gIGV4cG9ydHMuZW5hYmxlKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuICB2YXIgaSwgbGVuO1xuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBDb2VyY2UgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmdcbiAgICA/IGxvbmcodmFsKVxuICAgIDogc2hvcnQodmFsKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICB2YXIgbWF0Y2ggPSAvXigoPzpcXGQrKT9cXC4/XFxkKykgKihtc3xzZWNvbmRzP3xzfG1pbnV0ZXM/fG18aG91cnM/fGh8ZGF5cz98ZHx5ZWFycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuO1xuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3MnOlxuICAgICAgcmV0dXJuIG4gKiBzO1xuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gZCkgKyAnZCc7XG4gIGlmIChtcyA+PSBoKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICBpZiAobXMgPj0gbSkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBtKSArICdtJztcbiAgaWYgKG1zID49IHMpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gcykgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKVxuICAgIHx8IHBsdXJhbChtcywgaCwgJ2hvdXInKVxuICAgIHx8IHBsdXJhbChtcywgbSwgJ21pbnV0ZScpXG4gICAgfHwgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJylcbiAgICB8fCBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSByZXR1cm47XG4gIGlmIChtcyA8IG4gKiAxLjUpIHJldHVybiBNYXRoLmZsb29yKG1zIC8gbikgKyAnICcgKyBuYW1lO1xuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBrZXlzID0gcmVxdWlyZSgnLi9rZXlzJyk7XG52YXIgaGFzQmluYXJ5ID0gcmVxdWlyZSgnaGFzLWJpbmFyeScpO1xudmFyIHNsaWNlQnVmZmVyID0gcmVxdWlyZSgnYXJyYXlidWZmZXIuc2xpY2UnKTtcbnZhciBiYXNlNjRlbmNvZGVyID0gcmVxdWlyZSgnYmFzZTY0LWFycmF5YnVmZmVyJyk7XG52YXIgYWZ0ZXIgPSByZXF1aXJlKCdhZnRlcicpO1xudmFyIHV0ZjggPSByZXF1aXJlKCd1dGY4Jyk7XG5cbi8qKlxuICogQ2hlY2sgaWYgd2UgYXJlIHJ1bm5pbmcgYW4gYW5kcm9pZCBicm93c2VyLiBUaGF0IHJlcXVpcmVzIHVzIHRvIHVzZVxuICogQXJyYXlCdWZmZXIgd2l0aCBwb2xsaW5nIHRyYW5zcG9ydHMuLi5cbiAqXG4gKiBodHRwOi8vZ2hpbmRhLm5ldC9qcGVnLWJsb2ItYWpheC1hbmRyb2lkL1xuICovXG5cbnZhciBpc0FuZHJvaWQgPSBuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKC9BbmRyb2lkL2kpO1xuXG4vKipcbiAqIENoZWNrIGlmIHdlIGFyZSBydW5uaW5nIGluIFBoYW50b21KUy5cbiAqIFVwbG9hZGluZyBhIEJsb2Igd2l0aCBQaGFudG9tSlMgZG9lcyBub3Qgd29yayBjb3JyZWN0bHksIGFzIHJlcG9ydGVkIGhlcmU6XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpeWEvcGhhbnRvbWpzL2lzc3Vlcy8xMTM5NVxuICogQHR5cGUgYm9vbGVhblxuICovXG52YXIgaXNQaGFudG9tSlMgPSAvUGhhbnRvbUpTL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcblxuLyoqXG4gKiBXaGVuIHRydWUsIGF2b2lkcyB1c2luZyBCbG9icyB0byBlbmNvZGUgcGF5bG9hZHMuXG4gKiBAdHlwZSBib29sZWFuXG4gKi9cbnZhciBkb250U2VuZEJsb2JzID0gaXNBbmRyb2lkIHx8IGlzUGhhbnRvbUpTO1xuXG4vKipcbiAqIEN1cnJlbnQgcHJvdG9jb2wgdmVyc2lvbi5cbiAqL1xuXG5leHBvcnRzLnByb3RvY29sID0gMztcblxuLyoqXG4gKiBQYWNrZXQgdHlwZXMuXG4gKi9cblxudmFyIHBhY2tldHMgPSBleHBvcnRzLnBhY2tldHMgPSB7XG4gICAgb3BlbjogICAgIDAgICAgLy8gbm9uLXdzXG4gICwgY2xvc2U6ICAgIDEgICAgLy8gbm9uLXdzXG4gICwgcGluZzogICAgIDJcbiAgLCBwb25nOiAgICAgM1xuICAsIG1lc3NhZ2U6ICA0XG4gICwgdXBncmFkZTogIDVcbiAgLCBub29wOiAgICAgNlxufTtcblxudmFyIHBhY2tldHNsaXN0ID0ga2V5cyhwYWNrZXRzKTtcblxuLyoqXG4gKiBQcmVtYWRlIGVycm9yIHBhY2tldC5cbiAqL1xuXG52YXIgZXJyID0geyB0eXBlOiAnZXJyb3InLCBkYXRhOiAncGFyc2VyIGVycm9yJyB9O1xuXG4vKipcbiAqIENyZWF0ZSBhIGJsb2IgYXBpIGV2ZW4gZm9yIGJsb2IgYnVpbGRlciB3aGVuIHZlbmRvciBwcmVmaXhlcyBleGlzdFxuICovXG5cbnZhciBCbG9iID0gcmVxdWlyZSgnYmxvYicpO1xuXG4vKipcbiAqIEVuY29kZXMgYSBwYWNrZXQuXG4gKlxuICogICAgIDxwYWNrZXQgdHlwZSBpZD4gWyA8ZGF0YT4gXVxuICpcbiAqIEV4YW1wbGU6XG4gKlxuICogICAgIDVoZWxsbyB3b3JsZFxuICogICAgIDNcbiAqICAgICA0XG4gKlxuICogQmluYXJ5IGlzIGVuY29kZWQgaW4gYW4gaWRlbnRpY2FsIHByaW5jaXBsZVxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZW5jb2RlUGFja2V0ID0gZnVuY3Rpb24gKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIHV0ZjhlbmNvZGUsIGNhbGxiYWNrKSB7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBzdXBwb3J0c0JpbmFyeSkge1xuICAgIGNhbGxiYWNrID0gc3VwcG9ydHNCaW5hcnk7XG4gICAgc3VwcG9ydHNCaW5hcnkgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiB1dGY4ZW5jb2RlKSB7XG4gICAgY2FsbGJhY2sgPSB1dGY4ZW5jb2RlO1xuICAgIHV0ZjhlbmNvZGUgPSBudWxsO1xuICB9XG5cbiAgdmFyIGRhdGEgPSAocGFja2V0LmRhdGEgPT09IHVuZGVmaW5lZClcbiAgICA/IHVuZGVmaW5lZFxuICAgIDogcGFja2V0LmRhdGEuYnVmZmVyIHx8IHBhY2tldC5kYXRhO1xuXG4gIGlmIChnbG9iYWwuQXJyYXlCdWZmZXIgJiYgZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIGVuY29kZUFycmF5QnVmZmVyKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKTtcbiAgfSBlbHNlIGlmIChCbG9iICYmIGRhdGEgaW5zdGFuY2VvZiBnbG9iYWwuQmxvYikge1xuICAgIHJldHVybiBlbmNvZGVCbG9iKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8vIG1pZ2h0IGJlIGFuIG9iamVjdCB3aXRoIHsgYmFzZTY0OiB0cnVlLCBkYXRhOiBkYXRhQXNCYXNlNjRTdHJpbmcgfVxuICBpZiAoZGF0YSAmJiBkYXRhLmJhc2U2NCkge1xuICAgIHJldHVybiBlbmNvZGVCYXNlNjRPYmplY3QocGFja2V0LCBjYWxsYmFjayk7XG4gIH1cblxuICAvLyBTZW5kaW5nIGRhdGEgYXMgYSB1dGYtOCBzdHJpbmdcbiAgdmFyIGVuY29kZWQgPSBwYWNrZXRzW3BhY2tldC50eXBlXTtcblxuICAvLyBkYXRhIGZyYWdtZW50IGlzIG9wdGlvbmFsXG4gIGlmICh1bmRlZmluZWQgIT09IHBhY2tldC5kYXRhKSB7XG4gICAgZW5jb2RlZCArPSB1dGY4ZW5jb2RlID8gdXRmOC5lbmNvZGUoU3RyaW5nKHBhY2tldC5kYXRhKSkgOiBTdHJpbmcocGFja2V0LmRhdGEpO1xuICB9XG5cbiAgcmV0dXJuIGNhbGxiYWNrKCcnICsgZW5jb2RlZCk7XG5cbn07XG5cbmZ1bmN0aW9uIGVuY29kZUJhc2U2NE9iamVjdChwYWNrZXQsIGNhbGxiYWNrKSB7XG4gIC8vIHBhY2tldCBkYXRhIGlzIGFuIG9iamVjdCB7IGJhc2U2NDogdHJ1ZSwgZGF0YTogZGF0YUFzQmFzZTY0U3RyaW5nIH1cbiAgdmFyIG1lc3NhZ2UgPSAnYicgKyBleHBvcnRzLnBhY2tldHNbcGFja2V0LnR5cGVdICsgcGFja2V0LmRhdGEuZGF0YTtcbiAgcmV0dXJuIGNhbGxiYWNrKG1lc3NhZ2UpO1xufVxuXG4vKipcbiAqIEVuY29kZSBwYWNrZXQgaGVscGVycyBmb3IgYmluYXJ5IHR5cGVzXG4gKi9cblxuZnVuY3Rpb24gZW5jb2RlQXJyYXlCdWZmZXIocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgY2FsbGJhY2spIHtcbiAgaWYgKCFzdXBwb3J0c0JpbmFyeSkge1xuICAgIHJldHVybiBleHBvcnRzLmVuY29kZUJhc2U2NFBhY2tldChwYWNrZXQsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIHZhciBkYXRhID0gcGFja2V0LmRhdGE7XG4gIHZhciBjb250ZW50QXJyYXkgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgdmFyIHJlc3VsdEJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KDEgKyBkYXRhLmJ5dGVMZW5ndGgpO1xuXG4gIHJlc3VsdEJ1ZmZlclswXSA9IHBhY2tldHNbcGFja2V0LnR5cGVdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbnRlbnRBcnJheS5sZW5ndGg7IGkrKykge1xuICAgIHJlc3VsdEJ1ZmZlcltpKzFdID0gY29udGVudEFycmF5W2ldO1xuICB9XG5cbiAgcmV0dXJuIGNhbGxiYWNrKHJlc3VsdEJ1ZmZlci5idWZmZXIpO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCbG9iQXNBcnJheUJ1ZmZlcihwYWNrZXQsIHN1cHBvcnRzQmluYXJ5LCBjYWxsYmFjaykge1xuICBpZiAoIXN1cHBvcnRzQmluYXJ5KSB7XG4gICAgcmV0dXJuIGV4cG9ydHMuZW5jb2RlQmFzZTY0UGFja2V0KHBhY2tldCwgY2FsbGJhY2spO1xuICB9XG5cbiAgdmFyIGZyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgZnIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgcGFja2V0LmRhdGEgPSBmci5yZXN1bHQ7XG4gICAgZXhwb3J0cy5lbmNvZGVQYWNrZXQocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgdHJ1ZSwgY2FsbGJhY2spO1xuICB9O1xuICByZXR1cm4gZnIucmVhZEFzQXJyYXlCdWZmZXIocGFja2V0LmRhdGEpO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCbG9iKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKSB7XG4gIGlmICghc3VwcG9ydHNCaW5hcnkpIHtcbiAgICByZXR1cm4gZXhwb3J0cy5lbmNvZGVCYXNlNjRQYWNrZXQocGFja2V0LCBjYWxsYmFjayk7XG4gIH1cblxuICBpZiAoZG9udFNlbmRCbG9icykge1xuICAgIHJldHVybiBlbmNvZGVCbG9iQXNBcnJheUJ1ZmZlcihwYWNrZXQsIHN1cHBvcnRzQmluYXJ5LCBjYWxsYmFjayk7XG4gIH1cblxuICB2YXIgbGVuZ3RoID0gbmV3IFVpbnQ4QXJyYXkoMSk7XG4gIGxlbmd0aFswXSA9IHBhY2tldHNbcGFja2V0LnR5cGVdO1xuICB2YXIgYmxvYiA9IG5ldyBCbG9iKFtsZW5ndGguYnVmZmVyLCBwYWNrZXQuZGF0YV0pO1xuXG4gIHJldHVybiBjYWxsYmFjayhibG9iKTtcbn1cblxuLyoqXG4gKiBFbmNvZGVzIGEgcGFja2V0IHdpdGggYmluYXJ5IGRhdGEgaW4gYSBiYXNlNjQgc3RyaW5nXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHBhY2tldCwgaGFzIGB0eXBlYCBhbmQgYGRhdGFgXG4gKiBAcmV0dXJuIHtTdHJpbmd9IGJhc2U2NCBlbmNvZGVkIG1lc3NhZ2VcbiAqL1xuXG5leHBvcnRzLmVuY29kZUJhc2U2NFBhY2tldCA9IGZ1bmN0aW9uKHBhY2tldCwgY2FsbGJhY2spIHtcbiAgdmFyIG1lc3NhZ2UgPSAnYicgKyBleHBvcnRzLnBhY2tldHNbcGFja2V0LnR5cGVdO1xuICBpZiAoQmxvYiAmJiBwYWNrZXQuZGF0YSBpbnN0YW5jZW9mIEJsb2IpIHtcbiAgICB2YXIgZnIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgIGZyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGI2NCA9IGZyLnJlc3VsdC5zcGxpdCgnLCcpWzFdO1xuICAgICAgY2FsbGJhY2sobWVzc2FnZSArIGI2NCk7XG4gICAgfTtcbiAgICByZXR1cm4gZnIucmVhZEFzRGF0YVVSTChwYWNrZXQuZGF0YSk7XG4gIH1cblxuICB2YXIgYjY0ZGF0YTtcbiAgdHJ5IHtcbiAgICBiNjRkYXRhID0gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheShwYWNrZXQuZGF0YSkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgLy8gaVBob25lIFNhZmFyaSBkb2Vzbid0IGxldCB5b3UgYXBwbHkgd2l0aCB0eXBlZCBhcnJheXNcbiAgICB2YXIgdHlwZWQgPSBuZXcgVWludDhBcnJheShwYWNrZXQuZGF0YSk7XG4gICAgdmFyIGJhc2ljID0gbmV3IEFycmF5KHR5cGVkLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0eXBlZC5sZW5ndGg7IGkrKykge1xuICAgICAgYmFzaWNbaV0gPSB0eXBlZFtpXTtcbiAgICB9XG4gICAgYjY0ZGF0YSA9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgYmFzaWMpO1xuICB9XG4gIG1lc3NhZ2UgKz0gZ2xvYmFsLmJ0b2EoYjY0ZGF0YSk7XG4gIHJldHVybiBjYWxsYmFjayhtZXNzYWdlKTtcbn07XG5cbi8qKlxuICogRGVjb2RlcyBhIHBhY2tldC4gQ2hhbmdlcyBmb3JtYXQgdG8gQmxvYiBpZiByZXF1ZXN0ZWQuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSB3aXRoIGB0eXBlYCBhbmQgYGRhdGFgIChpZiBhbnkpXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmRlY29kZVBhY2tldCA9IGZ1bmN0aW9uIChkYXRhLCBiaW5hcnlUeXBlLCB1dGY4ZGVjb2RlKSB7XG4gIC8vIFN0cmluZyBkYXRhXG4gIGlmICh0eXBlb2YgZGF0YSA9PSAnc3RyaW5nJyB8fCBkYXRhID09PSB1bmRlZmluZWQpIHtcbiAgICBpZiAoZGF0YS5jaGFyQXQoMCkgPT0gJ2InKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZWNvZGVCYXNlNjRQYWNrZXQoZGF0YS5zdWJzdHIoMSksIGJpbmFyeVR5cGUpO1xuICAgIH1cblxuICAgIGlmICh1dGY4ZGVjb2RlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBkYXRhID0gdXRmOC5kZWNvZGUoZGF0YSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBlcnI7XG4gICAgICB9XG4gICAgfVxuICAgIHZhciB0eXBlID0gZGF0YS5jaGFyQXQoMCk7XG5cbiAgICBpZiAoTnVtYmVyKHR5cGUpICE9IHR5cGUgfHwgIXBhY2tldHNsaXN0W3R5cGVdKSB7XG4gICAgICByZXR1cm4gZXJyO1xuICAgIH1cblxuICAgIGlmIChkYXRhLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IHBhY2tldHNsaXN0W3R5cGVdLCBkYXRhOiBkYXRhLnN1YnN0cmluZygxKSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBwYWNrZXRzbGlzdFt0eXBlXSB9O1xuICAgIH1cbiAgfVxuXG4gIHZhciBhc0FycmF5ID0gbmV3IFVpbnQ4QXJyYXkoZGF0YSk7XG4gIHZhciB0eXBlID0gYXNBcnJheVswXTtcbiAgdmFyIHJlc3QgPSBzbGljZUJ1ZmZlcihkYXRhLCAxKTtcbiAgaWYgKEJsb2IgJiYgYmluYXJ5VHlwZSA9PT0gJ2Jsb2InKSB7XG4gICAgcmVzdCA9IG5ldyBCbG9iKFtyZXN0XSk7XG4gIH1cbiAgcmV0dXJuIHsgdHlwZTogcGFja2V0c2xpc3RbdHlwZV0sIGRhdGE6IHJlc3QgfTtcbn07XG5cbi8qKlxuICogRGVjb2RlcyBhIHBhY2tldCBlbmNvZGVkIGluIGEgYmFzZTY0IHN0cmluZ1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBiYXNlNjQgZW5jb2RlZCBtZXNzYWdlXG4gKiBAcmV0dXJuIHtPYmplY3R9IHdpdGggYHR5cGVgIGFuZCBgZGF0YWAgKGlmIGFueSlcbiAqL1xuXG5leHBvcnRzLmRlY29kZUJhc2U2NFBhY2tldCA9IGZ1bmN0aW9uKG1zZywgYmluYXJ5VHlwZSkge1xuICB2YXIgdHlwZSA9IHBhY2tldHNsaXN0W21zZy5jaGFyQXQoMCldO1xuICBpZiAoIWdsb2JhbC5BcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiB7IHR5cGU6IHR5cGUsIGRhdGE6IHsgYmFzZTY0OiB0cnVlLCBkYXRhOiBtc2cuc3Vic3RyKDEpIH0gfTtcbiAgfVxuXG4gIHZhciBkYXRhID0gYmFzZTY0ZW5jb2Rlci5kZWNvZGUobXNnLnN1YnN0cigxKSk7XG5cbiAgaWYgKGJpbmFyeVR5cGUgPT09ICdibG9iJyAmJiBCbG9iKSB7XG4gICAgZGF0YSA9IG5ldyBCbG9iKFtkYXRhXSk7XG4gIH1cblxuICByZXR1cm4geyB0eXBlOiB0eXBlLCBkYXRhOiBkYXRhIH07XG59O1xuXG4vKipcbiAqIEVuY29kZXMgbXVsdGlwbGUgbWVzc2FnZXMgKHBheWxvYWQpLlxuICpcbiAqICAgICA8bGVuZ3RoPjpkYXRhXG4gKlxuICogRXhhbXBsZTpcbiAqXG4gKiAgICAgMTE6aGVsbG8gd29ybGQyOmhpXG4gKlxuICogSWYgYW55IGNvbnRlbnRzIGFyZSBiaW5hcnksIHRoZXkgd2lsbCBiZSBlbmNvZGVkIGFzIGJhc2U2NCBzdHJpbmdzLiBCYXNlNjRcbiAqIGVuY29kZWQgc3RyaW5ncyBhcmUgbWFya2VkIHdpdGggYSBiIGJlZm9yZSB0aGUgbGVuZ3RoIHNwZWNpZmllclxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhY2tldHNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZW5jb2RlUGF5bG9hZCA9IGZ1bmN0aW9uIChwYWNrZXRzLCBzdXBwb3J0c0JpbmFyeSwgY2FsbGJhY2spIHtcbiAgaWYgKHR5cGVvZiBzdXBwb3J0c0JpbmFyeSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgY2FsbGJhY2sgPSBzdXBwb3J0c0JpbmFyeTtcbiAgICBzdXBwb3J0c0JpbmFyeSA9IG51bGw7XG4gIH1cblxuICB2YXIgaXNCaW5hcnkgPSBoYXNCaW5hcnkocGFja2V0cyk7XG5cbiAgaWYgKHN1cHBvcnRzQmluYXJ5ICYmIGlzQmluYXJ5KSB7XG4gICAgaWYgKEJsb2IgJiYgIWRvbnRTZW5kQmxvYnMpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmVuY29kZVBheWxvYWRBc0Jsb2IocGFja2V0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHJldHVybiBleHBvcnRzLmVuY29kZVBheWxvYWRBc0FycmF5QnVmZmVyKHBhY2tldHMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIGlmICghcGFja2V0cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gY2FsbGJhY2soJzA6Jyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRMZW5ndGhIZWFkZXIobWVzc2FnZSkge1xuICAgIHJldHVybiBtZXNzYWdlLmxlbmd0aCArICc6JyArIG1lc3NhZ2U7XG4gIH1cblxuICBmdW5jdGlvbiBlbmNvZGVPbmUocGFja2V0LCBkb25lQ2FsbGJhY2spIHtcbiAgICBleHBvcnRzLmVuY29kZVBhY2tldChwYWNrZXQsICFpc0JpbmFyeSA/IGZhbHNlIDogc3VwcG9ydHNCaW5hcnksIHRydWUsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIGRvbmVDYWxsYmFjayhudWxsLCBzZXRMZW5ndGhIZWFkZXIobWVzc2FnZSkpO1xuICAgIH0pO1xuICB9XG5cbiAgbWFwKHBhY2tldHMsIGVuY29kZU9uZSwgZnVuY3Rpb24oZXJyLCByZXN1bHRzKSB7XG4gICAgcmV0dXJuIGNhbGxiYWNrKHJlc3VsdHMuam9pbignJykpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQXN5bmMgYXJyYXkgbWFwIHVzaW5nIGFmdGVyXG4gKi9cblxuZnVuY3Rpb24gbWFwKGFyeSwgZWFjaCwgZG9uZSkge1xuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGFyeS5sZW5ndGgpO1xuICB2YXIgbmV4dCA9IGFmdGVyKGFyeS5sZW5ndGgsIGRvbmUpO1xuXG4gIHZhciBlYWNoV2l0aEluZGV4ID0gZnVuY3Rpb24oaSwgZWwsIGNiKSB7XG4gICAgZWFjaChlbCwgZnVuY3Rpb24oZXJyb3IsIG1zZykge1xuICAgICAgcmVzdWx0W2ldID0gbXNnO1xuICAgICAgY2IoZXJyb3IsIHJlc3VsdCk7XG4gICAgfSk7XG4gIH07XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnkubGVuZ3RoOyBpKyspIHtcbiAgICBlYWNoV2l0aEluZGV4KGksIGFyeVtpXSwgbmV4dCk7XG4gIH1cbn1cblxuLypcbiAqIERlY29kZXMgZGF0YSB3aGVuIGEgcGF5bG9hZCBpcyBtYXliZSBleHBlY3RlZC4gUG9zc2libGUgYmluYXJ5IGNvbnRlbnRzIGFyZVxuICogZGVjb2RlZCBmcm9tIHRoZWlyIGJhc2U2NCByZXByZXNlbnRhdGlvblxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhLCBjYWxsYmFjayBtZXRob2RcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5kZWNvZGVQYXlsb2FkID0gZnVuY3Rpb24gKGRhdGEsIGJpbmFyeVR5cGUsIGNhbGxiYWNrKSB7XG4gIGlmICh0eXBlb2YgZGF0YSAhPSAnc3RyaW5nJykge1xuICAgIHJldHVybiBleHBvcnRzLmRlY29kZVBheWxvYWRBc0JpbmFyeShkYXRhLCBiaW5hcnlUeXBlLCBjYWxsYmFjayk7XG4gIH1cblxuICBpZiAodHlwZW9mIGJpbmFyeVR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IGJpbmFyeVR5cGU7XG4gICAgYmluYXJ5VHlwZSA9IG51bGw7XG4gIH1cblxuICB2YXIgcGFja2V0O1xuICBpZiAoZGF0YSA9PSAnJykge1xuICAgIC8vIHBhcnNlciBlcnJvciAtIGlnbm9yaW5nIHBheWxvYWRcbiAgICByZXR1cm4gY2FsbGJhY2soZXJyLCAwLCAxKTtcbiAgfVxuXG4gIHZhciBsZW5ndGggPSAnJ1xuICAgICwgbiwgbXNnO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gZGF0YS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICB2YXIgY2hyID0gZGF0YS5jaGFyQXQoaSk7XG5cbiAgICBpZiAoJzonICE9IGNocikge1xuICAgICAgbGVuZ3RoICs9IGNocjtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCcnID09IGxlbmd0aCB8fCAobGVuZ3RoICE9IChuID0gTnVtYmVyKGxlbmd0aCkpKSkge1xuICAgICAgICAvLyBwYXJzZXIgZXJyb3IgLSBpZ25vcmluZyBwYXlsb2FkXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIsIDAsIDEpO1xuICAgICAgfVxuXG4gICAgICBtc2cgPSBkYXRhLnN1YnN0cihpICsgMSwgbik7XG5cbiAgICAgIGlmIChsZW5ndGggIT0gbXNnLmxlbmd0aCkge1xuICAgICAgICAvLyBwYXJzZXIgZXJyb3IgLSBpZ25vcmluZyBwYXlsb2FkXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIsIDAsIDEpO1xuICAgICAgfVxuXG4gICAgICBpZiAobXNnLmxlbmd0aCkge1xuICAgICAgICBwYWNrZXQgPSBleHBvcnRzLmRlY29kZVBhY2tldChtc2csIGJpbmFyeVR5cGUsIHRydWUpO1xuXG4gICAgICAgIGlmIChlcnIudHlwZSA9PSBwYWNrZXQudHlwZSAmJiBlcnIuZGF0YSA9PSBwYWNrZXQuZGF0YSkge1xuICAgICAgICAgIC8vIHBhcnNlciBlcnJvciBpbiBpbmRpdmlkdWFsIHBhY2tldCAtIGlnbm9yaW5nIHBheWxvYWRcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyLCAwLCAxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXQgPSBjYWxsYmFjayhwYWNrZXQsIGkgKyBuLCBsKTtcbiAgICAgICAgaWYgKGZhbHNlID09PSByZXQpIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gYWR2YW5jZSBjdXJzb3JcbiAgICAgIGkgKz0gbjtcbiAgICAgIGxlbmd0aCA9ICcnO1xuICAgIH1cbiAgfVxuXG4gIGlmIChsZW5ndGggIT0gJycpIHtcbiAgICAvLyBwYXJzZXIgZXJyb3IgLSBpZ25vcmluZyBwYXlsb2FkXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyciwgMCwgMSk7XG4gIH1cblxufTtcblxuLyoqXG4gKiBFbmNvZGVzIG11bHRpcGxlIG1lc3NhZ2VzIChwYXlsb2FkKSBhcyBiaW5hcnkuXG4gKlxuICogPDEgPSBiaW5hcnksIDAgPSBzdHJpbmc+PG51bWJlciBmcm9tIDAtOT48bnVtYmVyIGZyb20gMC05PlsuLi5dPG51bWJlclxuICogMjU1PjxkYXRhPlxuICpcbiAqIEV4YW1wbGU6XG4gKiAxIDMgMjU1IDEgMiAzLCBpZiB0aGUgYmluYXJ5IGNvbnRlbnRzIGFyZSBpbnRlcnByZXRlZCBhcyA4IGJpdCBpbnRlZ2Vyc1xuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhY2tldHNcbiAqIEByZXR1cm4ge0FycmF5QnVmZmVyfSBlbmNvZGVkIHBheWxvYWRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZW5jb2RlUGF5bG9hZEFzQXJyYXlCdWZmZXIgPSBmdW5jdGlvbihwYWNrZXRzLCBjYWxsYmFjaykge1xuICBpZiAoIXBhY2tldHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNhbGxiYWNrKG5ldyBBcnJheUJ1ZmZlcigwKSk7XG4gIH1cblxuICBmdW5jdGlvbiBlbmNvZGVPbmUocGFja2V0LCBkb25lQ2FsbGJhY2spIHtcbiAgICBleHBvcnRzLmVuY29kZVBhY2tldChwYWNrZXQsIHRydWUsIHRydWUsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiBkb25lQ2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgfSk7XG4gIH1cblxuICBtYXAocGFja2V0cywgZW5jb2RlT25lLCBmdW5jdGlvbihlcnIsIGVuY29kZWRQYWNrZXRzKSB7XG4gICAgdmFyIHRvdGFsTGVuZ3RoID0gZW5jb2RlZFBhY2tldHMucmVkdWNlKGZ1bmN0aW9uKGFjYywgcCkge1xuICAgICAgdmFyIGxlbjtcbiAgICAgIGlmICh0eXBlb2YgcCA9PT0gJ3N0cmluZycpe1xuICAgICAgICBsZW4gPSBwLmxlbmd0aDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxlbiA9IHAuYnl0ZUxlbmd0aDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2MgKyBsZW4udG9TdHJpbmcoKS5sZW5ndGggKyBsZW4gKyAyOyAvLyBzdHJpbmcvYmluYXJ5IGlkZW50aWZpZXIgKyBzZXBhcmF0b3IgPSAyXG4gICAgfSwgMCk7XG5cbiAgICB2YXIgcmVzdWx0QXJyYXkgPSBuZXcgVWludDhBcnJheSh0b3RhbExlbmd0aCk7XG5cbiAgICB2YXIgYnVmZmVySW5kZXggPSAwO1xuICAgIGVuY29kZWRQYWNrZXRzLmZvckVhY2goZnVuY3Rpb24ocCkge1xuICAgICAgdmFyIGlzU3RyaW5nID0gdHlwZW9mIHAgPT09ICdzdHJpbmcnO1xuICAgICAgdmFyIGFiID0gcDtcbiAgICAgIGlmIChpc1N0cmluZykge1xuICAgICAgICB2YXIgdmlldyA9IG5ldyBVaW50OEFycmF5KHAubGVuZ3RoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdmlld1tpXSA9IHAuY2hhckNvZGVBdChpKTtcbiAgICAgICAgfVxuICAgICAgICBhYiA9IHZpZXcuYnVmZmVyO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNTdHJpbmcpIHsgLy8gbm90IHRydWUgYmluYXJ5XG4gICAgICAgIHJlc3VsdEFycmF5W2J1ZmZlckluZGV4KytdID0gMDtcbiAgICAgIH0gZWxzZSB7IC8vIHRydWUgYmluYXJ5XG4gICAgICAgIHJlc3VsdEFycmF5W2J1ZmZlckluZGV4KytdID0gMTtcbiAgICAgIH1cblxuICAgICAgdmFyIGxlblN0ciA9IGFiLmJ5dGVMZW5ndGgudG9TdHJpbmcoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuU3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc3VsdEFycmF5W2J1ZmZlckluZGV4KytdID0gcGFyc2VJbnQobGVuU3RyW2ldKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdEFycmF5W2J1ZmZlckluZGV4KytdID0gMjU1O1xuXG4gICAgICB2YXIgdmlldyA9IG5ldyBVaW50OEFycmF5KGFiKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgICAgICByZXN1bHRBcnJheVtidWZmZXJJbmRleCsrXSA9IHZpZXdbaV07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY2FsbGJhY2socmVzdWx0QXJyYXkuYnVmZmVyKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEVuY29kZSBhcyBCbG9iXG4gKi9cblxuZXhwb3J0cy5lbmNvZGVQYXlsb2FkQXNCbG9iID0gZnVuY3Rpb24ocGFja2V0cywgY2FsbGJhY2spIHtcbiAgZnVuY3Rpb24gZW5jb2RlT25lKHBhY2tldCwgZG9uZUNhbGxiYWNrKSB7XG4gICAgZXhwb3J0cy5lbmNvZGVQYWNrZXQocGFja2V0LCB0cnVlLCB0cnVlLCBmdW5jdGlvbihlbmNvZGVkKSB7XG4gICAgICB2YXIgYmluYXJ5SWRlbnRpZmllciA9IG5ldyBVaW50OEFycmF5KDEpO1xuICAgICAgYmluYXJ5SWRlbnRpZmllclswXSA9IDE7XG4gICAgICBpZiAodHlwZW9mIGVuY29kZWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHZhciB2aWV3ID0gbmV3IFVpbnQ4QXJyYXkoZW5jb2RlZC5sZW5ndGgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVuY29kZWQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB2aWV3W2ldID0gZW5jb2RlZC5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB9XG4gICAgICAgIGVuY29kZWQgPSB2aWV3LmJ1ZmZlcjtcbiAgICAgICAgYmluYXJ5SWRlbnRpZmllclswXSA9IDA7XG4gICAgICB9XG5cbiAgICAgIHZhciBsZW4gPSAoZW5jb2RlZCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKVxuICAgICAgICA/IGVuY29kZWQuYnl0ZUxlbmd0aFxuICAgICAgICA6IGVuY29kZWQuc2l6ZTtcblxuICAgICAgdmFyIGxlblN0ciA9IGxlbi50b1N0cmluZygpO1xuICAgICAgdmFyIGxlbmd0aEFyeSA9IG5ldyBVaW50OEFycmF5KGxlblN0ci5sZW5ndGggKyAxKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuU3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGxlbmd0aEFyeVtpXSA9IHBhcnNlSW50KGxlblN0cltpXSk7XG4gICAgICB9XG4gICAgICBsZW5ndGhBcnlbbGVuU3RyLmxlbmd0aF0gPSAyNTU7XG5cbiAgICAgIGlmIChCbG9iKSB7XG4gICAgICAgIHZhciBibG9iID0gbmV3IEJsb2IoW2JpbmFyeUlkZW50aWZpZXIuYnVmZmVyLCBsZW5ndGhBcnkuYnVmZmVyLCBlbmNvZGVkXSk7XG4gICAgICAgIGRvbmVDYWxsYmFjayhudWxsLCBibG9iKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIG1hcChwYWNrZXRzLCBlbmNvZGVPbmUsIGZ1bmN0aW9uKGVyciwgcmVzdWx0cykge1xuICAgIHJldHVybiBjYWxsYmFjayhuZXcgQmxvYihyZXN1bHRzKSk7XG4gIH0pO1xufTtcblxuLypcbiAqIERlY29kZXMgZGF0YSB3aGVuIGEgcGF5bG9hZCBpcyBtYXliZSBleHBlY3RlZC4gU3RyaW5ncyBhcmUgZGVjb2RlZCBieVxuICogaW50ZXJwcmV0aW5nIGVhY2ggYnl0ZSBhcyBhIGtleSBjb2RlIGZvciBlbnRyaWVzIG1hcmtlZCB0byBzdGFydCB3aXRoIDAuIFNlZVxuICogZGVzY3JpcHRpb24gb2YgZW5jb2RlUGF5bG9hZEFzQmluYXJ5XG4gKlxuICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gZGF0YSwgY2FsbGJhY2sgbWV0aG9kXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuZGVjb2RlUGF5bG9hZEFzQmluYXJ5ID0gZnVuY3Rpb24gKGRhdGEsIGJpbmFyeVR5cGUsIGNhbGxiYWNrKSB7XG4gIGlmICh0eXBlb2YgYmluYXJ5VHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGNhbGxiYWNrID0gYmluYXJ5VHlwZTtcbiAgICBiaW5hcnlUeXBlID0gbnVsbDtcbiAgfVxuXG4gIHZhciBidWZmZXJUYWlsID0gZGF0YTtcbiAgdmFyIGJ1ZmZlcnMgPSBbXTtcblxuICB2YXIgbnVtYmVyVG9vTG9uZyA9IGZhbHNlO1xuICB3aGlsZSAoYnVmZmVyVGFpbC5ieXRlTGVuZ3RoID4gMCkge1xuICAgIHZhciB0YWlsQXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXJUYWlsKTtcbiAgICB2YXIgaXNTdHJpbmcgPSB0YWlsQXJyYXlbMF0gPT09IDA7XG4gICAgdmFyIG1zZ0xlbmd0aCA9ICcnO1xuXG4gICAgZm9yICh2YXIgaSA9IDE7IDsgaSsrKSB7XG4gICAgICBpZiAodGFpbEFycmF5W2ldID09IDI1NSkgYnJlYWs7XG5cbiAgICAgIGlmIChtc2dMZW5ndGgubGVuZ3RoID4gMzEwKSB7XG4gICAgICAgIG51bWJlclRvb0xvbmcgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgbXNnTGVuZ3RoICs9IHRhaWxBcnJheVtpXTtcbiAgICB9XG5cbiAgICBpZihudW1iZXJUb29Mb25nKSByZXR1cm4gY2FsbGJhY2soZXJyLCAwLCAxKTtcblxuICAgIGJ1ZmZlclRhaWwgPSBzbGljZUJ1ZmZlcihidWZmZXJUYWlsLCAyICsgbXNnTGVuZ3RoLmxlbmd0aCk7XG4gICAgbXNnTGVuZ3RoID0gcGFyc2VJbnQobXNnTGVuZ3RoKTtcblxuICAgIHZhciBtc2cgPSBzbGljZUJ1ZmZlcihidWZmZXJUYWlsLCAwLCBtc2dMZW5ndGgpO1xuICAgIGlmIChpc1N0cmluZykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgbXNnID0gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheShtc2cpKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gaVBob25lIFNhZmFyaSBkb2Vzbid0IGxldCB5b3UgYXBwbHkgdG8gdHlwZWQgYXJyYXlzXG4gICAgICAgIHZhciB0eXBlZCA9IG5ldyBVaW50OEFycmF5KG1zZyk7XG4gICAgICAgIG1zZyA9ICcnO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHR5cGVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgbXNnICs9IFN0cmluZy5mcm9tQ2hhckNvZGUodHlwZWRbaV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnVmZmVycy5wdXNoKG1zZyk7XG4gICAgYnVmZmVyVGFpbCA9IHNsaWNlQnVmZmVyKGJ1ZmZlclRhaWwsIG1zZ0xlbmd0aCk7XG4gIH1cblxuICB2YXIgdG90YWwgPSBidWZmZXJzLmxlbmd0aDtcbiAgYnVmZmVycy5mb3JFYWNoKGZ1bmN0aW9uKGJ1ZmZlciwgaSkge1xuICAgIGNhbGxiYWNrKGV4cG9ydHMuZGVjb2RlUGFja2V0KGJ1ZmZlciwgYmluYXJ5VHlwZSwgdHJ1ZSksIGksIHRvdGFsKTtcbiAgfSk7XG59O1xuIiwiXG4vKipcbiAqIEdldHMgdGhlIGtleXMgZm9yIGFuIG9iamVjdC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX0ga2V5c1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiBrZXlzIChvYmope1xuICB2YXIgYXJyID0gW107XG4gIHZhciBoYXMgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4gIGZvciAodmFyIGkgaW4gb2JqKSB7XG4gICAgaWYgKGhhcy5jYWxsKG9iaiwgaSkpIHtcbiAgICAgIGFyci5wdXNoKGkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYXJyO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gYWZ0ZXJcblxuZnVuY3Rpb24gYWZ0ZXIoY291bnQsIGNhbGxiYWNrLCBlcnJfY2IpIHtcbiAgICB2YXIgYmFpbCA9IGZhbHNlXG4gICAgZXJyX2NiID0gZXJyX2NiIHx8IG5vb3BcbiAgICBwcm94eS5jb3VudCA9IGNvdW50XG5cbiAgICByZXR1cm4gKGNvdW50ID09PSAwKSA/IGNhbGxiYWNrKCkgOiBwcm94eVxuXG4gICAgZnVuY3Rpb24gcHJveHkoZXJyLCByZXN1bHQpIHtcbiAgICAgICAgaWYgKHByb3h5LmNvdW50IDw9IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignYWZ0ZXIgY2FsbGVkIHRvbyBtYW55IHRpbWVzJylcbiAgICAgICAgfVxuICAgICAgICAtLXByb3h5LmNvdW50XG5cbiAgICAgICAgLy8gYWZ0ZXIgZmlyc3QgZXJyb3IsIHJlc3QgYXJlIHBhc3NlZCB0byBlcnJfY2JcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgYmFpbCA9IHRydWVcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycilcbiAgICAgICAgICAgIC8vIGZ1dHVyZSBlcnJvciBjYWxsYmFja3Mgd2lsbCBnbyB0byBlcnJvciBoYW5kbGVyXG4gICAgICAgICAgICBjYWxsYmFjayA9IGVycl9jYlxuICAgICAgICB9IGVsc2UgaWYgKHByb3h5LmNvdW50ID09PSAwICYmICFiYWlsKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHQpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuIiwiLyoqXG4gKiBBbiBhYnN0cmFjdGlvbiBmb3Igc2xpY2luZyBhbiBhcnJheWJ1ZmZlciBldmVuIHdoZW5cbiAqIEFycmF5QnVmZmVyLnByb3RvdHlwZS5zbGljZSBpcyBub3Qgc3VwcG9ydGVkXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGFycmF5YnVmZmVyLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGFycmF5YnVmZmVyLmJ5dGVMZW5ndGg7XG4gIHN0YXJ0ID0gc3RhcnQgfHwgMDtcbiAgZW5kID0gZW5kIHx8IGJ5dGVzO1xuXG4gIGlmIChhcnJheWJ1ZmZlci5zbGljZSkgeyByZXR1cm4gYXJyYXlidWZmZXIuc2xpY2Uoc3RhcnQsIGVuZCk7IH1cblxuICBpZiAoc3RhcnQgPCAwKSB7IHN0YXJ0ICs9IGJ5dGVzOyB9XG4gIGlmIChlbmQgPCAwKSB7IGVuZCArPSBieXRlczsgfVxuICBpZiAoZW5kID4gYnl0ZXMpIHsgZW5kID0gYnl0ZXM7IH1cblxuICBpZiAoc3RhcnQgPj0gYnl0ZXMgfHwgc3RhcnQgPj0gZW5kIHx8IGJ5dGVzID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcigwKTtcbiAgfVxuXG4gIHZhciBhYnYgPSBuZXcgVWludDhBcnJheShhcnJheWJ1ZmZlcik7XG4gIHZhciByZXN1bHQgPSBuZXcgVWludDhBcnJheShlbmQgLSBzdGFydCk7XG4gIGZvciAodmFyIGkgPSBzdGFydCwgaWkgPSAwOyBpIDwgZW5kOyBpKyssIGlpKyspIHtcbiAgICByZXN1bHRbaWldID0gYWJ2W2ldO1xuICB9XG4gIHJldHVybiByZXN1bHQuYnVmZmVyO1xufTtcbiIsIi8qXG4gKiBiYXNlNjQtYXJyYXlidWZmZXJcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9uaWtsYXN2aC9iYXNlNjQtYXJyYXlidWZmZXJcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTmlrbGFzIHZvbiBIZXJ0emVuXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cbihmdW5jdGlvbihjaGFycyl7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24oYXJyYXlidWZmZXIpIHtcbiAgICB2YXIgYnl0ZXMgPSBuZXcgVWludDhBcnJheShhcnJheWJ1ZmZlciksXG4gICAgaSwgbGVuID0gYnl0ZXMubGVuZ3RoLCBiYXNlNjQgPSBcIlwiO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSs9Mykge1xuICAgICAgYmFzZTY0ICs9IGNoYXJzW2J5dGVzW2ldID4+IDJdO1xuICAgICAgYmFzZTY0ICs9IGNoYXJzWygoYnl0ZXNbaV0gJiAzKSA8PCA0KSB8IChieXRlc1tpICsgMV0gPj4gNCldO1xuICAgICAgYmFzZTY0ICs9IGNoYXJzWygoYnl0ZXNbaSArIDFdICYgMTUpIDw8IDIpIHwgKGJ5dGVzW2kgKyAyXSA+PiA2KV07XG4gICAgICBiYXNlNjQgKz0gY2hhcnNbYnl0ZXNbaSArIDJdICYgNjNdO1xuICAgIH1cblxuICAgIGlmICgobGVuICUgMykgPT09IDIpIHtcbiAgICAgIGJhc2U2NCA9IGJhc2U2NC5zdWJzdHJpbmcoMCwgYmFzZTY0Lmxlbmd0aCAtIDEpICsgXCI9XCI7XG4gICAgfSBlbHNlIGlmIChsZW4gJSAzID09PSAxKSB7XG4gICAgICBiYXNlNjQgPSBiYXNlNjQuc3Vic3RyaW5nKDAsIGJhc2U2NC5sZW5ndGggLSAyKSArIFwiPT1cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gYmFzZTY0O1xuICB9O1xuXG4gIGV4cG9ydHMuZGVjb2RlID0gIGZ1bmN0aW9uKGJhc2U2NCkge1xuICAgIHZhciBidWZmZXJMZW5ndGggPSBiYXNlNjQubGVuZ3RoICogMC43NSxcbiAgICBsZW4gPSBiYXNlNjQubGVuZ3RoLCBpLCBwID0gMCxcbiAgICBlbmNvZGVkMSwgZW5jb2RlZDIsIGVuY29kZWQzLCBlbmNvZGVkNDtcblxuICAgIGlmIChiYXNlNjRbYmFzZTY0Lmxlbmd0aCAtIDFdID09PSBcIj1cIikge1xuICAgICAgYnVmZmVyTGVuZ3RoLS07XG4gICAgICBpZiAoYmFzZTY0W2Jhc2U2NC5sZW5ndGggLSAyXSA9PT0gXCI9XCIpIHtcbiAgICAgICAgYnVmZmVyTGVuZ3RoLS07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGFycmF5YnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKGJ1ZmZlckxlbmd0aCksXG4gICAgYnl0ZXMgPSBuZXcgVWludDhBcnJheShhcnJheWJ1ZmZlcik7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKz00KSB7XG4gICAgICBlbmNvZGVkMSA9IGNoYXJzLmluZGV4T2YoYmFzZTY0W2ldKTtcbiAgICAgIGVuY29kZWQyID0gY2hhcnMuaW5kZXhPZihiYXNlNjRbaSsxXSk7XG4gICAgICBlbmNvZGVkMyA9IGNoYXJzLmluZGV4T2YoYmFzZTY0W2krMl0pO1xuICAgICAgZW5jb2RlZDQgPSBjaGFycy5pbmRleE9mKGJhc2U2NFtpKzNdKTtcblxuICAgICAgYnl0ZXNbcCsrXSA9IChlbmNvZGVkMSA8PCAyKSB8IChlbmNvZGVkMiA+PiA0KTtcbiAgICAgIGJ5dGVzW3ArK10gPSAoKGVuY29kZWQyICYgMTUpIDw8IDQpIHwgKGVuY29kZWQzID4+IDIpO1xuICAgICAgYnl0ZXNbcCsrXSA9ICgoZW5jb2RlZDMgJiAzKSA8PCA2KSB8IChlbmNvZGVkNCAmIDYzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXlidWZmZXI7XG4gIH07XG59KShcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky9cIik7XG4iLCIvKipcbiAqIENyZWF0ZSBhIGJsb2IgYnVpbGRlciBldmVuIHdoZW4gdmVuZG9yIHByZWZpeGVzIGV4aXN0XG4gKi9cblxudmFyIEJsb2JCdWlsZGVyID0gZ2xvYmFsLkJsb2JCdWlsZGVyXG4gIHx8IGdsb2JhbC5XZWJLaXRCbG9iQnVpbGRlclxuICB8fCBnbG9iYWwuTVNCbG9iQnVpbGRlclxuICB8fCBnbG9iYWwuTW96QmxvYkJ1aWxkZXI7XG5cbi8qKlxuICogQ2hlY2sgaWYgQmxvYiBjb25zdHJ1Y3RvciBpcyBzdXBwb3J0ZWRcbiAqL1xuXG52YXIgYmxvYlN1cHBvcnRlZCA9IChmdW5jdGlvbigpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYSA9IG5ldyBCbG9iKFsnaGknXSk7XG4gICAgcmV0dXJuIGEuc2l6ZSA9PT0gMjtcbiAgfSBjYXRjaChlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59KSgpO1xuXG4vKipcbiAqIENoZWNrIGlmIEJsb2IgY29uc3RydWN0b3Igc3VwcG9ydHMgQXJyYXlCdWZmZXJWaWV3c1xuICogRmFpbHMgaW4gU2FmYXJpIDYsIHNvIHdlIG5lZWQgdG8gbWFwIHRvIEFycmF5QnVmZmVycyB0aGVyZS5cbiAqL1xuXG52YXIgYmxvYlN1cHBvcnRzQXJyYXlCdWZmZXJWaWV3ID0gYmxvYlN1cHBvcnRlZCAmJiAoZnVuY3Rpb24oKSB7XG4gIHRyeSB7XG4gICAgdmFyIGIgPSBuZXcgQmxvYihbbmV3IFVpbnQ4QXJyYXkoWzEsMl0pXSk7XG4gICAgcmV0dXJuIGIuc2l6ZSA9PT0gMjtcbiAgfSBjYXRjaChlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59KSgpO1xuXG4vKipcbiAqIENoZWNrIGlmIEJsb2JCdWlsZGVyIGlzIHN1cHBvcnRlZFxuICovXG5cbnZhciBibG9iQnVpbGRlclN1cHBvcnRlZCA9IEJsb2JCdWlsZGVyXG4gICYmIEJsb2JCdWlsZGVyLnByb3RvdHlwZS5hcHBlbmRcbiAgJiYgQmxvYkJ1aWxkZXIucHJvdG90eXBlLmdldEJsb2I7XG5cbi8qKlxuICogSGVscGVyIGZ1bmN0aW9uIHRoYXQgbWFwcyBBcnJheUJ1ZmZlclZpZXdzIHRvIEFycmF5QnVmZmVyc1xuICogVXNlZCBieSBCbG9iQnVpbGRlciBjb25zdHJ1Y3RvciBhbmQgb2xkIGJyb3dzZXJzIHRoYXQgZGlkbid0XG4gKiBzdXBwb3J0IGl0IGluIHRoZSBCbG9iIGNvbnN0cnVjdG9yLlxuICovXG5cbmZ1bmN0aW9uIG1hcEFycmF5QnVmZmVyVmlld3MoYXJ5KSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJ5Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNodW5rID0gYXJ5W2ldO1xuICAgIGlmIChjaHVuay5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgdmFyIGJ1ZiA9IGNodW5rLmJ1ZmZlcjtcblxuICAgICAgLy8gaWYgdGhpcyBpcyBhIHN1YmFycmF5LCBtYWtlIGEgY29weSBzbyB3ZSBvbmx5XG4gICAgICAvLyBpbmNsdWRlIHRoZSBzdWJhcnJheSByZWdpb24gZnJvbSB0aGUgdW5kZXJseWluZyBidWZmZXJcbiAgICAgIGlmIChjaHVuay5ieXRlTGVuZ3RoICE9PSBidWYuYnl0ZUxlbmd0aCkge1xuICAgICAgICB2YXIgY29weSA9IG5ldyBVaW50OEFycmF5KGNodW5rLmJ5dGVMZW5ndGgpO1xuICAgICAgICBjb3B5LnNldChuZXcgVWludDhBcnJheShidWYsIGNodW5rLmJ5dGVPZmZzZXQsIGNodW5rLmJ5dGVMZW5ndGgpKTtcbiAgICAgICAgYnVmID0gY29weS5idWZmZXI7XG4gICAgICB9XG5cbiAgICAgIGFyeVtpXSA9IGJ1ZjtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gQmxvYkJ1aWxkZXJDb25zdHJ1Y3RvcihhcnksIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgdmFyIGJiID0gbmV3IEJsb2JCdWlsZGVyKCk7XG4gIG1hcEFycmF5QnVmZmVyVmlld3MoYXJ5KTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyeS5sZW5ndGg7IGkrKykge1xuICAgIGJiLmFwcGVuZChhcnlbaV0pO1xuICB9XG5cbiAgcmV0dXJuIChvcHRpb25zLnR5cGUpID8gYmIuZ2V0QmxvYihvcHRpb25zLnR5cGUpIDogYmIuZ2V0QmxvYigpO1xufTtcblxuZnVuY3Rpb24gQmxvYkNvbnN0cnVjdG9yKGFyeSwgb3B0aW9ucykge1xuICBtYXBBcnJheUJ1ZmZlclZpZXdzKGFyeSk7XG4gIHJldHVybiBuZXcgQmxvYihhcnksIG9wdGlvbnMgfHwge30pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKSB7XG4gIGlmIChibG9iU3VwcG9ydGVkKSB7XG4gICAgcmV0dXJuIGJsb2JTdXBwb3J0c0FycmF5QnVmZmVyVmlldyA/IGdsb2JhbC5CbG9iIDogQmxvYkNvbnN0cnVjdG9yO1xuICB9IGVsc2UgaWYgKGJsb2JCdWlsZGVyU3VwcG9ydGVkKSB7XG4gICAgcmV0dXJuIEJsb2JCdWlsZGVyQ29uc3RydWN0b3I7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufSkoKTtcbiIsIi8qISBodHRwczovL210aHMuYmUvdXRmOGpzIHYyLjAuMCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0Ly8gRGV0ZWN0IGZyZWUgdmFyaWFibGVzIGBleHBvcnRzYFxuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXG5cdC8vIERldGVjdCBmcmVlIHZhcmlhYmxlIGBtb2R1bGVgXG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHRtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cyAmJiBtb2R1bGU7XG5cblx0Ly8gRGV0ZWN0IGZyZWUgdmFyaWFibGUgYGdsb2JhbGAsIGZyb20gTm9kZS5qcyBvciBCcm93c2VyaWZpZWQgY29kZSxcblx0Ly8gYW5kIHVzZSBpdCBhcyBgcm9vdGBcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHR2YXIgc3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZTtcblxuXHQvLyBUYWtlbiBmcm9tIGh0dHBzOi8vbXRocy5iZS9wdW55Y29kZVxuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXTtcblx0XHR2YXIgY291bnRlciA9IDA7XG5cdFx0dmFyIGxlbmd0aCA9IHN0cmluZy5sZW5ndGg7XG5cdFx0dmFyIHZhbHVlO1xuXHRcdHZhciBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvLyBUYWtlbiBmcm9tIGh0dHBzOi8vbXRocy5iZS9wdW55Y29kZVxuXHRmdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5KSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR2YXIgaW5kZXggPSAtMTtcblx0XHR2YXIgdmFsdWU7XG5cdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IGFycmF5W2luZGV4XTtcblx0XHRcdGlmICh2YWx1ZSA+IDB4RkZGRikge1xuXHRcdFx0XHR2YWx1ZSAtPSAweDEwMDAwO1xuXHRcdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcblx0XHRcdFx0dmFsdWUgPSAweERDMDAgfCB2YWx1ZSAmIDB4M0ZGO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRmdW5jdGlvbiBjaGVja1NjYWxhclZhbHVlKGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgPj0gMHhEODAwICYmIGNvZGVQb2ludCA8PSAweERGRkYpIHtcblx0XHRcdHRocm93IEVycm9yKFxuXHRcdFx0XHQnTG9uZSBzdXJyb2dhdGUgVSsnICsgY29kZVBvaW50LnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpICtcblx0XHRcdFx0JyBpcyBub3QgYSBzY2FsYXIgdmFsdWUnXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHRmdW5jdGlvbiBjcmVhdGVCeXRlKGNvZGVQb2ludCwgc2hpZnQpIHtcblx0XHRyZXR1cm4gc3RyaW5nRnJvbUNoYXJDb2RlKCgoY29kZVBvaW50ID4+IHNoaWZ0KSAmIDB4M0YpIHwgMHg4MCk7XG5cdH1cblxuXHRmdW5jdGlvbiBlbmNvZGVDb2RlUG9pbnQoY29kZVBvaW50KSB7XG5cdFx0aWYgKChjb2RlUG9pbnQgJiAweEZGRkZGRjgwKSA9PSAwKSB7IC8vIDEtYnl0ZSBzZXF1ZW5jZVxuXHRcdFx0cmV0dXJuIHN0cmluZ0Zyb21DaGFyQ29kZShjb2RlUG9pbnQpO1xuXHRcdH1cblx0XHR2YXIgc3ltYm9sID0gJyc7XG5cdFx0aWYgKChjb2RlUG9pbnQgJiAweEZGRkZGODAwKSA9PSAwKSB7IC8vIDItYnl0ZSBzZXF1ZW5jZVxuXHRcdFx0c3ltYm9sID0gc3RyaW5nRnJvbUNoYXJDb2RlKCgoY29kZVBvaW50ID4+IDYpICYgMHgxRikgfCAweEMwKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoKGNvZGVQb2ludCAmIDB4RkZGRjAwMDApID09IDApIHsgLy8gMy1ieXRlIHNlcXVlbmNlXG5cdFx0XHRjaGVja1NjYWxhclZhbHVlKGNvZGVQb2ludCk7XG5cdFx0XHRzeW1ib2wgPSBzdHJpbmdGcm9tQ2hhckNvZGUoKChjb2RlUG9pbnQgPj4gMTIpICYgMHgwRikgfCAweEUwKTtcblx0XHRcdHN5bWJvbCArPSBjcmVhdGVCeXRlKGNvZGVQb2ludCwgNik7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKChjb2RlUG9pbnQgJiAweEZGRTAwMDAwKSA9PSAwKSB7IC8vIDQtYnl0ZSBzZXF1ZW5jZVxuXHRcdFx0c3ltYm9sID0gc3RyaW5nRnJvbUNoYXJDb2RlKCgoY29kZVBvaW50ID4+IDE4KSAmIDB4MDcpIHwgMHhGMCk7XG5cdFx0XHRzeW1ib2wgKz0gY3JlYXRlQnl0ZShjb2RlUG9pbnQsIDEyKTtcblx0XHRcdHN5bWJvbCArPSBjcmVhdGVCeXRlKGNvZGVQb2ludCwgNik7XG5cdFx0fVxuXHRcdHN5bWJvbCArPSBzdHJpbmdGcm9tQ2hhckNvZGUoKGNvZGVQb2ludCAmIDB4M0YpIHwgMHg4MCk7XG5cdFx0cmV0dXJuIHN5bWJvbDtcblx0fVxuXG5cdGZ1bmN0aW9uIHV0ZjhlbmNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIGNvZGVQb2ludHMgPSB1Y3MyZGVjb2RlKHN0cmluZyk7XG5cdFx0dmFyIGxlbmd0aCA9IGNvZGVQb2ludHMubGVuZ3RoO1xuXHRcdHZhciBpbmRleCA9IC0xO1xuXHRcdHZhciBjb2RlUG9pbnQ7XG5cdFx0dmFyIGJ5dGVTdHJpbmcgPSAnJztcblx0XHR3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuXHRcdFx0Y29kZVBvaW50ID0gY29kZVBvaW50c1tpbmRleF07XG5cdFx0XHRieXRlU3RyaW5nICs9IGVuY29kZUNvZGVQb2ludChjb2RlUG9pbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYnl0ZVN0cmluZztcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdGZ1bmN0aW9uIHJlYWRDb250aW51YXRpb25CeXRlKCkge1xuXHRcdGlmIChieXRlSW5kZXggPj0gYnl0ZUNvdW50KSB7XG5cdFx0XHR0aHJvdyBFcnJvcignSW52YWxpZCBieXRlIGluZGV4Jyk7XG5cdFx0fVxuXG5cdFx0dmFyIGNvbnRpbnVhdGlvbkJ5dGUgPSBieXRlQXJyYXlbYnl0ZUluZGV4XSAmIDB4RkY7XG5cdFx0Ynl0ZUluZGV4Kys7XG5cblx0XHRpZiAoKGNvbnRpbnVhdGlvbkJ5dGUgJiAweEMwKSA9PSAweDgwKSB7XG5cdFx0XHRyZXR1cm4gY29udGludWF0aW9uQnl0ZSAmIDB4M0Y7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgZW5kIHVwIGhlcmUsIGl04oCZcyBub3QgYSBjb250aW51YXRpb24gYnl0ZVxuXHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGNvbnRpbnVhdGlvbiBieXRlJyk7XG5cdH1cblxuXHRmdW5jdGlvbiBkZWNvZGVTeW1ib2woKSB7XG5cdFx0dmFyIGJ5dGUxO1xuXHRcdHZhciBieXRlMjtcblx0XHR2YXIgYnl0ZTM7XG5cdFx0dmFyIGJ5dGU0O1xuXHRcdHZhciBjb2RlUG9pbnQ7XG5cblx0XHRpZiAoYnl0ZUluZGV4ID4gYnl0ZUNvdW50KSB7XG5cdFx0XHR0aHJvdyBFcnJvcignSW52YWxpZCBieXRlIGluZGV4Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKGJ5dGVJbmRleCA9PSBieXRlQ291bnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBSZWFkIGZpcnN0IGJ5dGVcblx0XHRieXRlMSA9IGJ5dGVBcnJheVtieXRlSW5kZXhdICYgMHhGRjtcblx0XHRieXRlSW5kZXgrKztcblxuXHRcdC8vIDEtYnl0ZSBzZXF1ZW5jZSAobm8gY29udGludWF0aW9uIGJ5dGVzKVxuXHRcdGlmICgoYnl0ZTEgJiAweDgwKSA9PSAwKSB7XG5cdFx0XHRyZXR1cm4gYnl0ZTE7XG5cdFx0fVxuXG5cdFx0Ly8gMi1ieXRlIHNlcXVlbmNlXG5cdFx0aWYgKChieXRlMSAmIDB4RTApID09IDB4QzApIHtcblx0XHRcdHZhciBieXRlMiA9IHJlYWRDb250aW51YXRpb25CeXRlKCk7XG5cdFx0XHRjb2RlUG9pbnQgPSAoKGJ5dGUxICYgMHgxRikgPDwgNikgfCBieXRlMjtcblx0XHRcdGlmIChjb2RlUG9pbnQgPj0gMHg4MCkge1xuXHRcdFx0XHRyZXR1cm4gY29kZVBvaW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ0ludmFsaWQgY29udGludWF0aW9uIGJ5dGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAzLWJ5dGUgc2VxdWVuY2UgKG1heSBpbmNsdWRlIHVucGFpcmVkIHN1cnJvZ2F0ZXMpXG5cdFx0aWYgKChieXRlMSAmIDB4RjApID09IDB4RTApIHtcblx0XHRcdGJ5dGUyID0gcmVhZENvbnRpbnVhdGlvbkJ5dGUoKTtcblx0XHRcdGJ5dGUzID0gcmVhZENvbnRpbnVhdGlvbkJ5dGUoKTtcblx0XHRcdGNvZGVQb2ludCA9ICgoYnl0ZTEgJiAweDBGKSA8PCAxMikgfCAoYnl0ZTIgPDwgNikgfCBieXRlMztcblx0XHRcdGlmIChjb2RlUG9pbnQgPj0gMHgwODAwKSB7XG5cdFx0XHRcdGNoZWNrU2NhbGFyVmFsdWUoY29kZVBvaW50KTtcblx0XHRcdFx0cmV0dXJuIGNvZGVQb2ludDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGNvbnRpbnVhdGlvbiBieXRlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gNC1ieXRlIHNlcXVlbmNlXG5cdFx0aWYgKChieXRlMSAmIDB4RjgpID09IDB4RjApIHtcblx0XHRcdGJ5dGUyID0gcmVhZENvbnRpbnVhdGlvbkJ5dGUoKTtcblx0XHRcdGJ5dGUzID0gcmVhZENvbnRpbnVhdGlvbkJ5dGUoKTtcblx0XHRcdGJ5dGU0ID0gcmVhZENvbnRpbnVhdGlvbkJ5dGUoKTtcblx0XHRcdGNvZGVQb2ludCA9ICgoYnl0ZTEgJiAweDBGKSA8PCAweDEyKSB8IChieXRlMiA8PCAweDBDKSB8XG5cdFx0XHRcdChieXRlMyA8PCAweDA2KSB8IGJ5dGU0O1xuXHRcdFx0aWYgKGNvZGVQb2ludCA+PSAweDAxMDAwMCAmJiBjb2RlUG9pbnQgPD0gMHgxMEZGRkYpIHtcblx0XHRcdFx0cmV0dXJuIGNvZGVQb2ludDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBFcnJvcignSW52YWxpZCBVVEYtOCBkZXRlY3RlZCcpO1xuXHR9XG5cblx0dmFyIGJ5dGVBcnJheTtcblx0dmFyIGJ5dGVDb3VudDtcblx0dmFyIGJ5dGVJbmRleDtcblx0ZnVuY3Rpb24gdXRmOGRlY29kZShieXRlU3RyaW5nKSB7XG5cdFx0Ynl0ZUFycmF5ID0gdWNzMmRlY29kZShieXRlU3RyaW5nKTtcblx0XHRieXRlQ291bnQgPSBieXRlQXJyYXkubGVuZ3RoO1xuXHRcdGJ5dGVJbmRleCA9IDA7XG5cdFx0dmFyIGNvZGVQb2ludHMgPSBbXTtcblx0XHR2YXIgdG1wO1xuXHRcdHdoaWxlICgodG1wID0gZGVjb2RlU3ltYm9sKCkpICE9PSBmYWxzZSkge1xuXHRcdFx0Y29kZVBvaW50cy5wdXNoKHRtcCk7XG5cdFx0fVxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKGNvZGVQb2ludHMpO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0dmFyIHV0ZjggPSB7XG5cdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdCdlbmNvZGUnOiB1dGY4ZW5jb2RlLFxuXHRcdCdkZWNvZGUnOiB1dGY4ZGVjb2RlXG5cdH07XG5cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdXRmODtcblx0XHR9KTtcblx0fVx0ZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHV0Zjg7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdHZhciBvYmplY3QgPSB7fTtcblx0XHRcdHZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdC5oYXNPd25Qcm9wZXJ0eTtcblx0XHRcdGZvciAodmFyIGtleSBpbiB1dGY4KSB7XG5cdFx0XHRcdGhhc093blByb3BlcnR5LmNhbGwodXRmOCwga2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHV0Zjhba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC51dGY4ID0gdXRmODtcblx0fVxuXG59KHRoaXMpKTtcbiIsIlxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBnbG9iYWwgPSByZXF1aXJlKCdnbG9iYWwnKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqXG4gKiBMb2dpYyBib3Jyb3dlZCBmcm9tIE1vZGVybml6cjpcbiAqXG4gKiAgIC0gaHR0cHM6Ly9naXRodWIuY29tL01vZGVybml6ci9Nb2Rlcm5penIvYmxvYi9tYXN0ZXIvZmVhdHVyZS1kZXRlY3RzL2NvcnMuanNcbiAqL1xuXG50cnkge1xuICBtb2R1bGUuZXhwb3J0cyA9ICdYTUxIdHRwUmVxdWVzdCcgaW4gZ2xvYmFsICYmXG4gICAgJ3dpdGhDcmVkZW50aWFscycgaW4gbmV3IGdsb2JhbC5YTUxIdHRwUmVxdWVzdCgpO1xufSBjYXRjaCAoZXJyKSB7XG4gIC8vIGlmIFhNTEh0dHAgc3VwcG9ydCBpcyBkaXNhYmxlZCBpbiBJRSB0aGVuIGl0IHdpbGwgdGhyb3dcbiAgLy8gd2hlbiB0cnlpbmcgdG8gY3JlYXRlXG4gIG1vZHVsZS5leHBvcnRzID0gZmFsc2U7XG59XG4iLCJcbi8qKlxuICogUmV0dXJucyBgdGhpc2AuIEV4ZWN1dGUgdGhpcyB3aXRob3V0IGEgXCJjb250ZXh0XCIgKGkuZS4gd2l0aG91dCBpdCBiZWluZ1xuICogYXR0YWNoZWQgdG8gYW4gb2JqZWN0IG9mIHRoZSBsZWZ0LWhhbmQgc2lkZSksIGFuZCBgdGhpc2AgcG9pbnRzIHRvIHRoZVxuICogXCJnbG9iYWxcIiBzY29wZSBvZiB0aGUgY3VycmVudCBKUyBleGVjdXRpb24uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSkoKTtcbiIsIi8qKlxuICogSlNPTiBwYXJzZS5cbiAqXG4gKiBAc2VlIEJhc2VkIG9uIGpRdWVyeSNwYXJzZUpTT04gKE1JVCkgYW5kIEpTT04yXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgcnZhbGlkY2hhcnMgPSAvXltcXF0sOnt9XFxzXSokLztcbnZhciBydmFsaWRlc2NhcGUgPSAvXFxcXCg/OltcIlxcXFxcXC9iZm5ydF18dVswLTlhLWZBLUZdezR9KS9nO1xudmFyIHJ2YWxpZHRva2VucyA9IC9cIlteXCJcXFxcXFxuXFxyXSpcInx0cnVlfGZhbHNlfG51bGx8LT9cXGQrKD86XFwuXFxkKik/KD86W2VFXVsrXFwtXT9cXGQrKT8vZztcbnZhciBydmFsaWRicmFjZXMgPSAvKD86Xnw6fCwpKD86XFxzKlxcWykrL2c7XG52YXIgcnRyaW1MZWZ0ID0gL15cXHMrLztcbnZhciBydHJpbVJpZ2h0ID0gL1xccyskLztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZWpzb24oZGF0YSkge1xuICBpZiAoJ3N0cmluZycgIT0gdHlwZW9mIGRhdGEgfHwgIWRhdGEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGRhdGEgPSBkYXRhLnJlcGxhY2UocnRyaW1MZWZ0LCAnJykucmVwbGFjZShydHJpbVJpZ2h0LCAnJyk7XG5cbiAgLy8gQXR0ZW1wdCB0byBwYXJzZSB1c2luZyB0aGUgbmF0aXZlIEpTT04gcGFyc2VyIGZpcnN0XG4gIGlmIChnbG9iYWwuSlNPTiAmJiBKU09OLnBhcnNlKSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XG4gIH1cblxuICBpZiAocnZhbGlkY2hhcnMudGVzdChkYXRhLnJlcGxhY2UocnZhbGlkZXNjYXBlLCAnQCcpXG4gICAgICAucmVwbGFjZShydmFsaWR0b2tlbnMsICddJylcbiAgICAgIC5yZXBsYWNlKHJ2YWxpZGJyYWNlcywgJycpKSkge1xuICAgIHJldHVybiAobmV3IEZ1bmN0aW9uKCdyZXR1cm4gJyArIGRhdGEpKSgpO1xuICB9XG59OyIsIi8qKlxuICogQ29tcGlsZXMgYSBxdWVyeXN0cmluZ1xuICogUmV0dXJucyBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lbmNvZGUgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBzdHIgPSAnJztcblxuICBmb3IgKHZhciBpIGluIG9iaikge1xuICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgIGlmIChzdHIubGVuZ3RoKSBzdHIgKz0gJyYnO1xuICAgICAgc3RyICs9IGVuY29kZVVSSUNvbXBvbmVudChpKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbaV0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzdHI7XG59O1xuXG4vKipcbiAqIFBhcnNlcyBhIHNpbXBsZSBxdWVyeXN0cmluZyBpbnRvIGFuIG9iamVjdFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBxc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbihxcyl7XG4gIHZhciBxcnkgPSB7fTtcbiAgdmFyIHBhaXJzID0gcXMuc3BsaXQoJyYnKTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBwYWlycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICB2YXIgcGFpciA9IHBhaXJzW2ldLnNwbGl0KCc9Jyk7XG4gICAgcXJ5W2RlY29kZVVSSUNvbXBvbmVudChwYWlyWzBdKV0gPSBkZWNvZGVVUklDb21wb25lbnQocGFpclsxXSk7XG4gIH1cbiAgcmV0dXJuIHFyeTtcbn07XG4iLCIvKipcbiAqIFBhcnNlcyBhbiBVUklcbiAqXG4gKiBAYXV0aG9yIFN0ZXZlbiBMZXZpdGhhbiA8c3RldmVubGV2aXRoYW4uY29tPiAoTUlUIGxpY2Vuc2UpXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgcmUgPSAvXig/Oig/IVteOkBdKzpbXjpAXFwvXSpAKShodHRwfGh0dHBzfHdzfHdzcyk6XFwvXFwvKT8oKD86KChbXjpAXSopKD86OihbXjpAXSopKT8pP0ApPygoPzpbYS1mMC05XXswLDR9Oil7Miw3fVthLWYwLTldezAsNH18W146XFwvPyNdKikoPzo6KFxcZCopKT8pKCgoXFwvKD86W14/I10oPyFbXj8jXFwvXSpcXC5bXj8jXFwvLl0rKD86Wz8jXXwkKSkpKlxcLz8pPyhbXj8jXFwvXSopKSg/OlxcPyhbXiNdKikpPyg/OiMoLiopKT8pLztcblxudmFyIHBhcnRzID0gW1xuICAgICdzb3VyY2UnLCAncHJvdG9jb2wnLCAnYXV0aG9yaXR5JywgJ3VzZXJJbmZvJywgJ3VzZXInLCAncGFzc3dvcmQnLCAnaG9zdCcsICdwb3J0JywgJ3JlbGF0aXZlJywgJ3BhdGgnLCAnZGlyZWN0b3J5JywgJ2ZpbGUnLCAncXVlcnknLCAnYW5jaG9yJ1xuXTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZXVyaShzdHIpIHtcbiAgICB2YXIgc3JjID0gc3RyLFxuICAgICAgICBiID0gc3RyLmluZGV4T2YoJ1snKSxcbiAgICAgICAgZSA9IHN0ci5pbmRleE9mKCddJyk7XG5cbiAgICBpZiAoYiAhPSAtMSAmJiBlICE9IC0xKSB7XG4gICAgICAgIHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgYikgKyBzdHIuc3Vic3RyaW5nKGIsIGUpLnJlcGxhY2UoLzovZywgJzsnKSArIHN0ci5zdWJzdHJpbmcoZSwgc3RyLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgdmFyIG0gPSByZS5leGVjKHN0ciB8fCAnJyksXG4gICAgICAgIHVyaSA9IHt9LFxuICAgICAgICBpID0gMTQ7XG5cbiAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgIHVyaVtwYXJ0c1tpXV0gPSBtW2ldIHx8ICcnO1xuICAgIH1cblxuICAgIGlmIChiICE9IC0xICYmIGUgIT0gLTEpIHtcbiAgICAgICAgdXJpLnNvdXJjZSA9IHNyYztcbiAgICAgICAgdXJpLmhvc3QgPSB1cmkuaG9zdC5zdWJzdHJpbmcoMSwgdXJpLmhvc3QubGVuZ3RoIC0gMSkucmVwbGFjZSgvOy9nLCAnOicpO1xuICAgICAgICB1cmkuYXV0aG9yaXR5ID0gdXJpLmF1dGhvcml0eS5yZXBsYWNlKCdbJywgJycpLnJlcGxhY2UoJ10nLCAnJykucmVwbGFjZSgvOy9nLCAnOicpO1xuICAgICAgICB1cmkuaXB2NnVyaSA9IHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVyaTtcbn07XG4iLCJcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgZ2xvYmFsID0gKGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSkoKTtcblxuLyoqXG4gKiBXZWJTb2NrZXQgY29uc3RydWN0b3IuXG4gKi9cblxudmFyIFdlYlNvY2tldCA9IGdsb2JhbC5XZWJTb2NrZXQgfHwgZ2xvYmFsLk1veldlYlNvY2tldDtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYlNvY2tldCA/IHdzIDogbnVsbDtcblxuLyoqXG4gKiBXZWJTb2NrZXQgY29uc3RydWN0b3IuXG4gKlxuICogVGhlIHRoaXJkIGBvcHRzYCBvcHRpb25zIG9iamVjdCBnZXRzIGlnbm9yZWQgaW4gd2ViIGJyb3dzZXJzLCBzaW5jZSBpdCdzXG4gKiBub24tc3RhbmRhcmQsIGFuZCB0aHJvd3MgYSBUeXBlRXJyb3IgaWYgcGFzc2VkIHRvIHRoZSBjb25zdHJ1Y3Rvci5cbiAqIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2VpbmFyb3Mvd3MvaXNzdWVzLzIyN1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmlcbiAqIEBwYXJhbSB7QXJyYXl9IHByb3RvY29scyAob3B0aW9uYWwpXG4gKiBAcGFyYW0ge09iamVjdCkgb3B0cyAob3B0aW9uYWwpXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHdzKHVyaSwgcHJvdG9jb2xzLCBvcHRzKSB7XG4gIHZhciBpbnN0YW5jZTtcbiAgaWYgKHByb3RvY29scykge1xuICAgIGluc3RhbmNlID0gbmV3IFdlYlNvY2tldCh1cmksIHByb3RvY29scyk7XG4gIH0gZWxzZSB7XG4gICAgaW5zdGFuY2UgPSBuZXcgV2ViU29ja2V0KHVyaSk7XG4gIH1cbiAgcmV0dXJuIGluc3RhbmNlO1xufVxuXG5pZiAoV2ViU29ja2V0KSB3cy5wcm90b3R5cGUgPSBXZWJTb2NrZXQucHJvdG90eXBlO1xuIiwiXG4vKlxuICogTW9kdWxlIHJlcXVpcmVtZW50cy5cbiAqL1xuXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGhhc0JpbmFyeTtcblxuLyoqXG4gKiBDaGVja3MgZm9yIGJpbmFyeSBkYXRhLlxuICpcbiAqIFJpZ2h0IG5vdyBvbmx5IEJ1ZmZlciBhbmQgQXJyYXlCdWZmZXIgYXJlIHN1cHBvcnRlZC4uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFueXRoaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGhhc0JpbmFyeShkYXRhKSB7XG5cbiAgZnVuY3Rpb24gX2hhc0JpbmFyeShvYmopIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIGZhbHNlO1xuXG4gICAgaWYgKCAoZ2xvYmFsLkJ1ZmZlciAmJiBnbG9iYWwuQnVmZmVyLmlzQnVmZmVyKG9iaikpIHx8XG4gICAgICAgICAoZ2xvYmFsLkFycmF5QnVmZmVyICYmIG9iaiBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB8fFxuICAgICAgICAgKGdsb2JhbC5CbG9iICYmIG9iaiBpbnN0YW5jZW9mIEJsb2IpIHx8XG4gICAgICAgICAoZ2xvYmFsLkZpbGUgJiYgb2JqIGluc3RhbmNlb2YgRmlsZSlcbiAgICAgICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChfaGFzQmluYXJ5KG9ialtpXSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAob2JqICYmICdvYmplY3QnID09IHR5cGVvZiBvYmopIHtcbiAgICAgIGlmIChvYmoudG9KU09OKSB7XG4gICAgICAgIG9iaiA9IG9iai50b0pTT04oKTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSAmJiBfaGFzQmluYXJ5KG9ialtrZXldKSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIF9oYXNCaW5hcnkoZGF0YSk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKGFycikge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFycikgPT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCJcbnZhciBpbmRleE9mID0gW10uaW5kZXhPZjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihhcnIsIG9iail7XG4gIGlmIChpbmRleE9mKSByZXR1cm4gYXJyLmluZGV4T2Yob2JqKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoYXJyW2ldID09PSBvYmopIHJldHVybiBpO1xuICB9XG4gIHJldHVybiAtMTtcbn07IiwiXG4vKipcbiAqIEhPUCByZWYuXG4gKi9cblxudmFyIGhhcyA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogUmV0dXJuIG93biBrZXlzIGluIGBvYmpgLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbihvYmope1xuICB2YXIga2V5cyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhcy5jYWxsKG9iaiwga2V5KSkge1xuICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBrZXlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gb3duIHZhbHVlcyBpbiBgb2JqYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy52YWx1ZXMgPSBmdW5jdGlvbihvYmope1xuICB2YXIgdmFscyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhcy5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgdmFscy5wdXNoKG9ialtrZXldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhbHM7XG59O1xuXG4vKipcbiAqIE1lcmdlIGBiYCBpbnRvIGBhYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYVxuICogQHBhcmFtIHtPYmplY3R9IGJcbiAqIEByZXR1cm4ge09iamVjdH0gYVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLm1lcmdlID0gZnVuY3Rpb24oYSwgYil7XG4gIGZvciAodmFyIGtleSBpbiBiKSB7XG4gICAgaWYgKGhhcy5jYWxsKGIsIGtleSkpIHtcbiAgICAgIGFba2V5XSA9IGJba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGE7XG59O1xuXG4vKipcbiAqIFJldHVybiBsZW5ndGggb2YgYG9iamAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmxlbmd0aCA9IGZ1bmN0aW9uKG9iail7XG4gIHJldHVybiBleHBvcnRzLmtleXMob2JqKS5sZW5ndGg7XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGVtcHR5LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuaXNFbXB0eSA9IGZ1bmN0aW9uKG9iail7XG4gIHJldHVybiAwID09IGV4cG9ydHMubGVuZ3RoKG9iaik7XG59OyIsIi8qKlxuICogUGFyc2VzIGFuIFVSSVxuICpcbiAqIEBhdXRob3IgU3RldmVuIExldml0aGFuIDxzdGV2ZW5sZXZpdGhhbi5jb20+IChNSVQgbGljZW5zZSlcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnZhciByZSA9IC9eKD86KD8hW146QF0rOlteOkBcXC9dKkApKGh0dHB8aHR0cHN8d3N8d3NzKTpcXC9cXC8pPygoPzooKFteOkBdKikoPzo6KFteOkBdKikpPyk/QCk/KCg/OlthLWYwLTldezAsNH06KXsyLDd9W2EtZjAtOV17MCw0fXxbXjpcXC8/I10qKSg/OjooXFxkKikpPykoKChcXC8oPzpbXj8jXSg/IVtePyNcXC9dKlxcLltePyNcXC8uXSsoPzpbPyNdfCQpKSkqXFwvPyk/KFtePyNcXC9dKikpKD86XFw/KFteI10qKSk/KD86IyguKikpPykvO1xuXG52YXIgcGFydHMgPSBbXG4gICAgJ3NvdXJjZScsICdwcm90b2NvbCcsICdhdXRob3JpdHknLCAndXNlckluZm8nLCAndXNlcicsICdwYXNzd29yZCcsICdob3N0J1xuICAsICdwb3J0JywgJ3JlbGF0aXZlJywgJ3BhdGgnLCAnZGlyZWN0b3J5JywgJ2ZpbGUnLCAncXVlcnknLCAnYW5jaG9yJ1xuXTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZXVyaShzdHIpIHtcbiAgdmFyIG0gPSByZS5leGVjKHN0ciB8fCAnJylcbiAgICAsIHVyaSA9IHt9XG4gICAgLCBpID0gMTQ7XG5cbiAgd2hpbGUgKGktLSkge1xuICAgIHVyaVtwYXJ0c1tpXV0gPSBtW2ldIHx8ICcnO1xuICB9XG5cbiAgcmV0dXJuIHVyaTtcbn07XG4iLCIvKmdsb2JhbCBCbG9iLEZpbGUqL1xuXG4vKipcbiAqIE1vZHVsZSByZXF1aXJlbWVudHNcbiAqL1xuXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKTtcbnZhciBpc0J1ZiA9IHJlcXVpcmUoJy4vaXMtYnVmZmVyJyk7XG5cbi8qKlxuICogUmVwbGFjZXMgZXZlcnkgQnVmZmVyIHwgQXJyYXlCdWZmZXIgaW4gcGFja2V0IHdpdGggYSBudW1iZXJlZCBwbGFjZWhvbGRlci5cbiAqIEFueXRoaW5nIHdpdGggYmxvYnMgb3IgZmlsZXMgc2hvdWxkIGJlIGZlZCB0aHJvdWdoIHJlbW92ZUJsb2JzIGJlZm9yZSBjb21pbmdcbiAqIGhlcmUuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHBhY2tldCAtIHNvY2tldC5pbyBldmVudCBwYWNrZXRcbiAqIEByZXR1cm4ge09iamVjdH0gd2l0aCBkZWNvbnN0cnVjdGVkIHBhY2tldCBhbmQgbGlzdCBvZiBidWZmZXJzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuZGVjb25zdHJ1Y3RQYWNrZXQgPSBmdW5jdGlvbihwYWNrZXQpe1xuICB2YXIgYnVmZmVycyA9IFtdO1xuICB2YXIgcGFja2V0RGF0YSA9IHBhY2tldC5kYXRhO1xuXG4gIGZ1bmN0aW9uIF9kZWNvbnN0cnVjdFBhY2tldChkYXRhKSB7XG4gICAgaWYgKCFkYXRhKSByZXR1cm4gZGF0YTtcblxuICAgIGlmIChpc0J1ZihkYXRhKSkge1xuICAgICAgdmFyIHBsYWNlaG9sZGVyID0geyBfcGxhY2Vob2xkZXI6IHRydWUsIG51bTogYnVmZmVycy5sZW5ndGggfTtcbiAgICAgIGJ1ZmZlcnMucHVzaChkYXRhKTtcbiAgICAgIHJldHVybiBwbGFjZWhvbGRlcjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIHZhciBuZXdEYXRhID0gbmV3IEFycmF5KGRhdGEubGVuZ3RoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICBuZXdEYXRhW2ldID0gX2RlY29uc3RydWN0UGFja2V0KGRhdGFbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ld0RhdGE7XG4gICAgfSBlbHNlIGlmICgnb2JqZWN0JyA9PSB0eXBlb2YgZGF0YSAmJiAhKGRhdGEgaW5zdGFuY2VvZiBEYXRlKSkge1xuICAgICAgdmFyIG5ld0RhdGEgPSB7fTtcbiAgICAgIGZvciAodmFyIGtleSBpbiBkYXRhKSB7XG4gICAgICAgIG5ld0RhdGFba2V5XSA9IF9kZWNvbnN0cnVjdFBhY2tldChkYXRhW2tleV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ld0RhdGE7XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9XG5cbiAgdmFyIHBhY2sgPSBwYWNrZXQ7XG4gIHBhY2suZGF0YSA9IF9kZWNvbnN0cnVjdFBhY2tldChwYWNrZXREYXRhKTtcbiAgcGFjay5hdHRhY2htZW50cyA9IGJ1ZmZlcnMubGVuZ3RoOyAvLyBudW1iZXIgb2YgYmluYXJ5ICdhdHRhY2htZW50cydcbiAgcmV0dXJuIHtwYWNrZXQ6IHBhY2ssIGJ1ZmZlcnM6IGJ1ZmZlcnN9O1xufTtcblxuLyoqXG4gKiBSZWNvbnN0cnVjdHMgYSBiaW5hcnkgcGFja2V0IGZyb20gaXRzIHBsYWNlaG9sZGVyIHBhY2tldCBhbmQgYnVmZmVyc1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXQgLSBldmVudCBwYWNrZXQgd2l0aCBwbGFjZWhvbGRlcnNcbiAqIEBwYXJhbSB7QXJyYXl9IGJ1ZmZlcnMgLSBiaW5hcnkgYnVmZmVycyB0byBwdXQgaW4gcGxhY2Vob2xkZXIgcG9zaXRpb25zXG4gKiBAcmV0dXJuIHtPYmplY3R9IHJlY29uc3RydWN0ZWQgcGFja2V0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMucmVjb25zdHJ1Y3RQYWNrZXQgPSBmdW5jdGlvbihwYWNrZXQsIGJ1ZmZlcnMpIHtcbiAgdmFyIGN1clBsYWNlSG9sZGVyID0gMDtcblxuICBmdW5jdGlvbiBfcmVjb25zdHJ1Y3RQYWNrZXQoZGF0YSkge1xuICAgIGlmIChkYXRhICYmIGRhdGEuX3BsYWNlaG9sZGVyKSB7XG4gICAgICB2YXIgYnVmID0gYnVmZmVyc1tkYXRhLm51bV07IC8vIGFwcHJvcHJpYXRlIGJ1ZmZlciAoc2hvdWxkIGJlIG5hdHVyYWwgb3JkZXIgYW55d2F5KVxuICAgICAgcmV0dXJuIGJ1ZjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICBkYXRhW2ldID0gX3JlY29uc3RydWN0UGFja2V0KGRhdGFbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSBlbHNlIGlmIChkYXRhICYmICdvYmplY3QnID09IHR5cGVvZiBkYXRhKSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gZGF0YSkge1xuICAgICAgICBkYXRhW2tleV0gPSBfcmVjb25zdHJ1Y3RQYWNrZXQoZGF0YVtrZXldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfVxuXG4gIHBhY2tldC5kYXRhID0gX3JlY29uc3RydWN0UGFja2V0KHBhY2tldC5kYXRhKTtcbiAgcGFja2V0LmF0dGFjaG1lbnRzID0gdW5kZWZpbmVkOyAvLyBubyBsb25nZXIgdXNlZnVsXG4gIHJldHVybiBwYWNrZXQ7XG59O1xuXG4vKipcbiAqIEFzeW5jaHJvbm91c2x5IHJlbW92ZXMgQmxvYnMgb3IgRmlsZXMgZnJvbSBkYXRhIHZpYVxuICogRmlsZVJlYWRlcidzIHJlYWRBc0FycmF5QnVmZmVyIG1ldGhvZC4gVXNlZCBiZWZvcmUgZW5jb2RpbmdcbiAqIGRhdGEgYXMgbXNncGFjay4gQ2FsbHMgY2FsbGJhY2sgd2l0aCB0aGUgYmxvYmxlc3MgZGF0YS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMucmVtb3ZlQmxvYnMgPSBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICBmdW5jdGlvbiBfcmVtb3ZlQmxvYnMob2JqLCBjdXJLZXksIGNvbnRhaW5pbmdPYmplY3QpIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIG9iajtcblxuICAgIC8vIGNvbnZlcnQgYW55IGJsb2JcbiAgICBpZiAoKGdsb2JhbC5CbG9iICYmIG9iaiBpbnN0YW5jZW9mIEJsb2IpIHx8XG4gICAgICAgIChnbG9iYWwuRmlsZSAmJiBvYmogaW5zdGFuY2VvZiBGaWxlKSkge1xuICAgICAgcGVuZGluZ0Jsb2JzKys7XG5cbiAgICAgIC8vIGFzeW5jIGZpbGVyZWFkZXJcbiAgICAgIHZhciBmaWxlUmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgIGZpbGVSZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7IC8vIHRoaXMucmVzdWx0ID09IGFycmF5YnVmZmVyXG4gICAgICAgIGlmIChjb250YWluaW5nT2JqZWN0KSB7XG4gICAgICAgICAgY29udGFpbmluZ09iamVjdFtjdXJLZXldID0gdGhpcy5yZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgYmxvYmxlc3NEYXRhID0gdGhpcy5yZXN1bHQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBub3RoaW5nIHBlbmRpbmcgaXRzIGNhbGxiYWNrIHRpbWVcbiAgICAgICAgaWYoISAtLXBlbmRpbmdCbG9icykge1xuICAgICAgICAgIGNhbGxiYWNrKGJsb2JsZXNzRGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGZpbGVSZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIob2JqKTsgLy8gYmxvYiAtPiBhcnJheWJ1ZmZlclxuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmopKSB7IC8vIGhhbmRsZSBhcnJheVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgX3JlbW92ZUJsb2JzKG9ialtpXSwgaSwgb2JqKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9iaiAmJiAnb2JqZWN0JyA9PSB0eXBlb2Ygb2JqICYmICFpc0J1ZihvYmopKSB7IC8vIGFuZCBvYmplY3RcbiAgICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgX3JlbW92ZUJsb2JzKG9ialtrZXldLCBrZXksIG9iaik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIHBlbmRpbmdCbG9icyA9IDA7XG4gIHZhciBibG9ibGVzc0RhdGEgPSBkYXRhO1xuICBfcmVtb3ZlQmxvYnMoYmxvYmxlc3NEYXRhKTtcbiAgaWYgKCFwZW5kaW5nQmxvYnMpIHtcbiAgICBjYWxsYmFjayhibG9ibGVzc0RhdGEpO1xuICB9XG59O1xuIiwiXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnc29ja2V0LmlvLXBhcnNlcicpO1xudmFyIGpzb24gPSByZXF1aXJlKCdqc29uMycpO1xudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpc2FycmF5Jyk7XG52YXIgRW1pdHRlciA9IHJlcXVpcmUoJ2NvbXBvbmVudC1lbWl0dGVyJyk7XG52YXIgYmluYXJ5ID0gcmVxdWlyZSgnLi9iaW5hcnknKTtcbnZhciBpc0J1ZiA9IHJlcXVpcmUoJy4vaXMtYnVmZmVyJyk7XG5cbi8qKlxuICogUHJvdG9jb2wgdmVyc2lvbi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMucHJvdG9jb2wgPSA0O1xuXG4vKipcbiAqIFBhY2tldCB0eXBlcy5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMudHlwZXMgPSBbXG4gICdDT05ORUNUJyxcbiAgJ0RJU0NPTk5FQ1QnLFxuICAnRVZFTlQnLFxuICAnQklOQVJZX0VWRU5UJyxcbiAgJ0FDSycsXG4gICdCSU5BUllfQUNLJyxcbiAgJ0VSUk9SJ1xuXTtcblxuLyoqXG4gKiBQYWNrZXQgdHlwZSBgY29ubmVjdGAuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLkNPTk5FQ1QgPSAwO1xuXG4vKipcbiAqIFBhY2tldCB0eXBlIGBkaXNjb25uZWN0YC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuRElTQ09OTkVDVCA9IDE7XG5cbi8qKlxuICogUGFja2V0IHR5cGUgYGV2ZW50YC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuRVZFTlQgPSAyO1xuXG4vKipcbiAqIFBhY2tldCB0eXBlIGBhY2tgLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5BQ0sgPSAzO1xuXG4vKipcbiAqIFBhY2tldCB0eXBlIGBlcnJvcmAuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLkVSUk9SID0gNDtcblxuLyoqXG4gKiBQYWNrZXQgdHlwZSAnYmluYXJ5IGV2ZW50J1xuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5CSU5BUllfRVZFTlQgPSA1O1xuXG4vKipcbiAqIFBhY2tldCB0eXBlIGBiaW5hcnkgYWNrYC4gRm9yIGFja3Mgd2l0aCBiaW5hcnkgYXJndW1lbnRzLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5CSU5BUllfQUNLID0gNjtcblxuLyoqXG4gKiBFbmNvZGVyIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5FbmNvZGVyID0gRW5jb2RlcjtcblxuLyoqXG4gKiBEZWNvZGVyIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5EZWNvZGVyID0gRGVjb2RlcjtcblxuLyoqXG4gKiBBIHNvY2tldC5pbyBFbmNvZGVyIGluc3RhbmNlXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFbmNvZGVyKCkge31cblxuLyoqXG4gKiBFbmNvZGUgYSBwYWNrZXQgYXMgYSBzaW5nbGUgc3RyaW5nIGlmIG5vbi1iaW5hcnksIG9yIGFzIGFcbiAqIGJ1ZmZlciBzZXF1ZW5jZSwgZGVwZW5kaW5nIG9uIHBhY2tldCB0eXBlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogLSBwYWNrZXQgb2JqZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayAtIGZ1bmN0aW9uIHRvIGhhbmRsZSBlbmNvZGluZ3MgKGxpa2VseSBlbmdpbmUud3JpdGUpXG4gKiBAcmV0dXJuIENhbGxzIGNhbGxiYWNrIHdpdGggQXJyYXkgb2YgZW5jb2RpbmdzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVuY29kZXIucHJvdG90eXBlLmVuY29kZSA9IGZ1bmN0aW9uKG9iaiwgY2FsbGJhY2spe1xuICBkZWJ1ZygnZW5jb2RpbmcgcGFja2V0ICVqJywgb2JqKTtcblxuICBpZiAoZXhwb3J0cy5CSU5BUllfRVZFTlQgPT0gb2JqLnR5cGUgfHwgZXhwb3J0cy5CSU5BUllfQUNLID09IG9iai50eXBlKSB7XG4gICAgZW5jb2RlQXNCaW5hcnkob2JqLCBjYWxsYmFjayk7XG4gIH1cbiAgZWxzZSB7XG4gICAgdmFyIGVuY29kaW5nID0gZW5jb2RlQXNTdHJpbmcob2JqKTtcbiAgICBjYWxsYmFjayhbZW5jb2RpbmddKTtcbiAgfVxufTtcblxuLyoqXG4gKiBFbmNvZGUgcGFja2V0IGFzIHN0cmluZy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcGFja2V0XG4gKiBAcmV0dXJuIHtTdHJpbmd9IGVuY29kZWRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGVuY29kZUFzU3RyaW5nKG9iaikge1xuICB2YXIgc3RyID0gJyc7XG4gIHZhciBuc3AgPSBmYWxzZTtcblxuICAvLyBmaXJzdCBpcyB0eXBlXG4gIHN0ciArPSBvYmoudHlwZTtcblxuICAvLyBhdHRhY2htZW50cyBpZiB3ZSBoYXZlIHRoZW1cbiAgaWYgKGV4cG9ydHMuQklOQVJZX0VWRU5UID09IG9iai50eXBlIHx8IGV4cG9ydHMuQklOQVJZX0FDSyA9PSBvYmoudHlwZSkge1xuICAgIHN0ciArPSBvYmouYXR0YWNobWVudHM7XG4gICAgc3RyICs9ICctJztcbiAgfVxuXG4gIC8vIGlmIHdlIGhhdmUgYSBuYW1lc3BhY2Ugb3RoZXIgdGhhbiBgL2BcbiAgLy8gd2UgYXBwZW5kIGl0IGZvbGxvd2VkIGJ5IGEgY29tbWEgYCxgXG4gIGlmIChvYmoubnNwICYmICcvJyAhPSBvYmoubnNwKSB7XG4gICAgbnNwID0gdHJ1ZTtcbiAgICBzdHIgKz0gb2JqLm5zcDtcbiAgfVxuXG4gIC8vIGltbWVkaWF0ZWx5IGZvbGxvd2VkIGJ5IHRoZSBpZFxuICBpZiAobnVsbCAhPSBvYmouaWQpIHtcbiAgICBpZiAobnNwKSB7XG4gICAgICBzdHIgKz0gJywnO1xuICAgICAgbnNwID0gZmFsc2U7XG4gICAgfVxuICAgIHN0ciArPSBvYmouaWQ7XG4gIH1cblxuICAvLyBqc29uIGRhdGFcbiAgaWYgKG51bGwgIT0gb2JqLmRhdGEpIHtcbiAgICBpZiAobnNwKSBzdHIgKz0gJywnO1xuICAgIHN0ciArPSBqc29uLnN0cmluZ2lmeShvYmouZGF0YSk7XG4gIH1cblxuICBkZWJ1ZygnZW5jb2RlZCAlaiBhcyAlcycsIG9iaiwgc3RyKTtcbiAgcmV0dXJuIHN0cjtcbn1cblxuLyoqXG4gKiBFbmNvZGUgcGFja2V0IGFzICdidWZmZXIgc2VxdWVuY2UnIGJ5IHJlbW92aW5nIGJsb2JzLCBhbmRcbiAqIGRlY29uc3RydWN0aW5nIHBhY2tldCBpbnRvIG9iamVjdCB3aXRoIHBsYWNlaG9sZGVycyBhbmRcbiAqIGEgbGlzdCBvZiBidWZmZXJzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXRcbiAqIEByZXR1cm4ge0J1ZmZlcn0gZW5jb2RlZFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZW5jb2RlQXNCaW5hcnkob2JqLCBjYWxsYmFjaykge1xuXG4gIGZ1bmN0aW9uIHdyaXRlRW5jb2RpbmcoYmxvYmxlc3NEYXRhKSB7XG4gICAgdmFyIGRlY29uc3RydWN0aW9uID0gYmluYXJ5LmRlY29uc3RydWN0UGFja2V0KGJsb2JsZXNzRGF0YSk7XG4gICAgdmFyIHBhY2sgPSBlbmNvZGVBc1N0cmluZyhkZWNvbnN0cnVjdGlvbi5wYWNrZXQpO1xuICAgIHZhciBidWZmZXJzID0gZGVjb25zdHJ1Y3Rpb24uYnVmZmVycztcblxuICAgIGJ1ZmZlcnMudW5zaGlmdChwYWNrKTsgLy8gYWRkIHBhY2tldCBpbmZvIHRvIGJlZ2lubmluZyBvZiBkYXRhIGxpc3RcbiAgICBjYWxsYmFjayhidWZmZXJzKTsgLy8gd3JpdGUgYWxsIHRoZSBidWZmZXJzXG4gIH1cblxuICBiaW5hcnkucmVtb3ZlQmxvYnMob2JqLCB3cml0ZUVuY29kaW5nKTtcbn1cblxuLyoqXG4gKiBBIHNvY2tldC5pbyBEZWNvZGVyIGluc3RhbmNlXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBkZWNvZGVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIERlY29kZXIoKSB7XG4gIHRoaXMucmVjb25zdHJ1Y3RvciA9IG51bGw7XG59XG5cbi8qKlxuICogTWl4IGluIGBFbWl0dGVyYCB3aXRoIERlY29kZXIuXG4gKi9cblxuRW1pdHRlcihEZWNvZGVyLnByb3RvdHlwZSk7XG5cbi8qKlxuICogRGVjb2RlcyBhbiBlY29kZWQgcGFja2V0IHN0cmluZyBpbnRvIHBhY2tldCBKU09OLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBvYmogLSBlbmNvZGVkIHBhY2tldFxuICogQHJldHVybiB7T2JqZWN0fSBwYWNrZXRcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRGVjb2Rlci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24ob2JqKSB7XG4gIHZhciBwYWNrZXQ7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2Ygb2JqKSB7XG4gICAgcGFja2V0ID0gZGVjb2RlU3RyaW5nKG9iaik7XG4gICAgaWYgKGV4cG9ydHMuQklOQVJZX0VWRU5UID09IHBhY2tldC50eXBlIHx8IGV4cG9ydHMuQklOQVJZX0FDSyA9PSBwYWNrZXQudHlwZSkgeyAvLyBiaW5hcnkgcGFja2V0J3MganNvblxuICAgICAgdGhpcy5yZWNvbnN0cnVjdG9yID0gbmV3IEJpbmFyeVJlY29uc3RydWN0b3IocGFja2V0KTtcblxuICAgICAgLy8gbm8gYXR0YWNobWVudHMsIGxhYmVsZWQgYmluYXJ5IGJ1dCBubyBiaW5hcnkgZGF0YSB0byBmb2xsb3dcbiAgICAgIGlmICh0aGlzLnJlY29uc3RydWN0b3IucmVjb25QYWNrLmF0dGFjaG1lbnRzID09PSAwKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZGVjb2RlZCcsIHBhY2tldCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHsgLy8gbm9uLWJpbmFyeSBmdWxsIHBhY2tldFxuICAgICAgdGhpcy5lbWl0KCdkZWNvZGVkJywgcGFja2V0KTtcbiAgICB9XG4gIH1cbiAgZWxzZSBpZiAoaXNCdWYob2JqKSB8fCBvYmouYmFzZTY0KSB7IC8vIHJhdyBiaW5hcnkgZGF0YVxuICAgIGlmICghdGhpcy5yZWNvbnN0cnVjdG9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dvdCBiaW5hcnkgZGF0YSB3aGVuIG5vdCByZWNvbnN0cnVjdGluZyBhIHBhY2tldCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYWNrZXQgPSB0aGlzLnJlY29uc3RydWN0b3IudGFrZUJpbmFyeURhdGEob2JqKTtcbiAgICAgIGlmIChwYWNrZXQpIHsgLy8gcmVjZWl2ZWQgZmluYWwgYnVmZmVyXG4gICAgICAgIHRoaXMucmVjb25zdHJ1Y3RvciA9IG51bGw7XG4gICAgICAgIHRoaXMuZW1pdCgnZGVjb2RlZCcsIHBhY2tldCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biB0eXBlOiAnICsgb2JqKTtcbiAgfVxufTtcblxuLyoqXG4gKiBEZWNvZGUgYSBwYWNrZXQgU3RyaW5nIChKU09OIGRhdGEpXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7T2JqZWN0fSBwYWNrZXRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGRlY29kZVN0cmluZyhzdHIpIHtcbiAgdmFyIHAgPSB7fTtcbiAgdmFyIGkgPSAwO1xuXG4gIC8vIGxvb2sgdXAgdHlwZVxuICBwLnR5cGUgPSBOdW1iZXIoc3RyLmNoYXJBdCgwKSk7XG4gIGlmIChudWxsID09IGV4cG9ydHMudHlwZXNbcC50eXBlXSkgcmV0dXJuIGVycm9yKCk7XG5cbiAgLy8gbG9vayB1cCBhdHRhY2htZW50cyBpZiB0eXBlIGJpbmFyeVxuICBpZiAoZXhwb3J0cy5CSU5BUllfRVZFTlQgPT0gcC50eXBlIHx8IGV4cG9ydHMuQklOQVJZX0FDSyA9PSBwLnR5cGUpIHtcbiAgICB2YXIgYnVmID0gJyc7XG4gICAgd2hpbGUgKHN0ci5jaGFyQXQoKytpKSAhPSAnLScpIHtcbiAgICAgIGJ1ZiArPSBzdHIuY2hhckF0KGkpO1xuICAgICAgaWYgKGkgPT0gc3RyLmxlbmd0aCkgYnJlYWs7XG4gICAgfVxuICAgIGlmIChidWYgIT0gTnVtYmVyKGJ1ZikgfHwgc3RyLmNoYXJBdChpKSAhPSAnLScpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSWxsZWdhbCBhdHRhY2htZW50cycpO1xuICAgIH1cbiAgICBwLmF0dGFjaG1lbnRzID0gTnVtYmVyKGJ1Zik7XG4gIH1cblxuICAvLyBsb29rIHVwIG5hbWVzcGFjZSAoaWYgYW55KVxuICBpZiAoJy8nID09IHN0ci5jaGFyQXQoaSArIDEpKSB7XG4gICAgcC5uc3AgPSAnJztcbiAgICB3aGlsZSAoKytpKSB7XG4gICAgICB2YXIgYyA9IHN0ci5jaGFyQXQoaSk7XG4gICAgICBpZiAoJywnID09IGMpIGJyZWFrO1xuICAgICAgcC5uc3AgKz0gYztcbiAgICAgIGlmIChpID09IHN0ci5sZW5ndGgpIGJyZWFrO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwLm5zcCA9ICcvJztcbiAgfVxuXG4gIC8vIGxvb2sgdXAgaWRcbiAgdmFyIG5leHQgPSBzdHIuY2hhckF0KGkgKyAxKTtcbiAgaWYgKCcnICE9PSBuZXh0ICYmIE51bWJlcihuZXh0KSA9PSBuZXh0KSB7XG4gICAgcC5pZCA9ICcnO1xuICAgIHdoaWxlICgrK2kpIHtcbiAgICAgIHZhciBjID0gc3RyLmNoYXJBdChpKTtcbiAgICAgIGlmIChudWxsID09IGMgfHwgTnVtYmVyKGMpICE9IGMpIHtcbiAgICAgICAgLS1pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIHAuaWQgKz0gc3RyLmNoYXJBdChpKTtcbiAgICAgIGlmIChpID09IHN0ci5sZW5ndGgpIGJyZWFrO1xuICAgIH1cbiAgICBwLmlkID0gTnVtYmVyKHAuaWQpO1xuICB9XG5cbiAgLy8gbG9vayB1cCBqc29uIGRhdGFcbiAgaWYgKHN0ci5jaGFyQXQoKytpKSkge1xuICAgIHRyeSB7XG4gICAgICBwLmRhdGEgPSBqc29uLnBhcnNlKHN0ci5zdWJzdHIoaSkpO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICByZXR1cm4gZXJyb3IoKTtcbiAgICB9XG4gIH1cblxuICBkZWJ1ZygnZGVjb2RlZCAlcyBhcyAlaicsIHN0ciwgcCk7XG4gIHJldHVybiBwO1xufVxuXG4vKipcbiAqIERlYWxsb2NhdGVzIGEgcGFyc2VyJ3MgcmVzb3VyY2VzXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5EZWNvZGVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlY29uc3RydWN0b3IpIHtcbiAgICB0aGlzLnJlY29uc3RydWN0b3IuZmluaXNoZWRSZWNvbnN0cnVjdGlvbigpO1xuICB9XG59O1xuXG4vKipcbiAqIEEgbWFuYWdlciBvZiBhIGJpbmFyeSBldmVudCdzICdidWZmZXIgc2VxdWVuY2UnLiBTaG91bGRcbiAqIGJlIGNvbnN0cnVjdGVkIHdoZW5ldmVyIGEgcGFja2V0IG9mIHR5cGUgQklOQVJZX0VWRU5UIGlzXG4gKiBkZWNvZGVkLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYWNrZXRcbiAqIEByZXR1cm4ge0JpbmFyeVJlY29uc3RydWN0b3J9IGluaXRpYWxpemVkIHJlY29uc3RydWN0b3JcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIEJpbmFyeVJlY29uc3RydWN0b3IocGFja2V0KSB7XG4gIHRoaXMucmVjb25QYWNrID0gcGFja2V0O1xuICB0aGlzLmJ1ZmZlcnMgPSBbXTtcbn1cblxuLyoqXG4gKiBNZXRob2QgdG8gYmUgY2FsbGVkIHdoZW4gYmluYXJ5IGRhdGEgcmVjZWl2ZWQgZnJvbSBjb25uZWN0aW9uXG4gKiBhZnRlciBhIEJJTkFSWV9FVkVOVCBwYWNrZXQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXIgfCBBcnJheUJ1ZmZlcn0gYmluRGF0YSAtIHRoZSByYXcgYmluYXJ5IGRhdGEgcmVjZWl2ZWRcbiAqIEByZXR1cm4ge251bGwgfCBPYmplY3R9IHJldHVybnMgbnVsbCBpZiBtb3JlIGJpbmFyeSBkYXRhIGlzIGV4cGVjdGVkIG9yXG4gKiAgIGEgcmVjb25zdHJ1Y3RlZCBwYWNrZXQgb2JqZWN0IGlmIGFsbCBidWZmZXJzIGhhdmUgYmVlbiByZWNlaXZlZC5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkJpbmFyeVJlY29uc3RydWN0b3IucHJvdG90eXBlLnRha2VCaW5hcnlEYXRhID0gZnVuY3Rpb24oYmluRGF0YSkge1xuICB0aGlzLmJ1ZmZlcnMucHVzaChiaW5EYXRhKTtcbiAgaWYgKHRoaXMuYnVmZmVycy5sZW5ndGggPT0gdGhpcy5yZWNvblBhY2suYXR0YWNobWVudHMpIHsgLy8gZG9uZSB3aXRoIGJ1ZmZlciBsaXN0XG4gICAgdmFyIHBhY2tldCA9IGJpbmFyeS5yZWNvbnN0cnVjdFBhY2tldCh0aGlzLnJlY29uUGFjaywgdGhpcy5idWZmZXJzKTtcbiAgICB0aGlzLmZpbmlzaGVkUmVjb25zdHJ1Y3Rpb24oKTtcbiAgICByZXR1cm4gcGFja2V0O1xuICB9XG4gIHJldHVybiBudWxsO1xufTtcblxuLyoqXG4gKiBDbGVhbnMgdXAgYmluYXJ5IHBhY2tldCByZWNvbnN0cnVjdGlvbiB2YXJpYWJsZXMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQmluYXJ5UmVjb25zdHJ1Y3Rvci5wcm90b3R5cGUuZmluaXNoZWRSZWNvbnN0cnVjdGlvbiA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnJlY29uUGFjayA9IG51bGw7XG4gIHRoaXMuYnVmZmVycyA9IFtdO1xufTtcblxuZnVuY3Rpb24gZXJyb3IoZGF0YSl7XG4gIHJldHVybiB7XG4gICAgdHlwZTogZXhwb3J0cy5FUlJPUixcbiAgICBkYXRhOiAncGFyc2VyIGVycm9yJ1xuICB9O1xufVxuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGlzQnVmO1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBvYmogaXMgYSBidWZmZXIgb3IgYW4gYXJyYXlidWZmZXIuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNCdWYob2JqKSB7XG4gIHJldHVybiAoZ2xvYmFsLkJ1ZmZlciAmJiBnbG9iYWwuQnVmZmVyLmlzQnVmZmVyKG9iaikpIHx8XG4gICAgICAgICAoZ2xvYmFsLkFycmF5QnVmZmVyICYmIG9iaiBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8qISBKU09OIHYzLjIuNiB8IGh0dHA6Ly9iZXN0aWVqcy5naXRodWIuaW8vanNvbjMgfCBDb3B5cmlnaHQgMjAxMi0yMDEzLCBLaXQgQ2FtYnJpZGdlIHwgaHR0cDovL2tpdC5taXQtbGljZW5zZS5vcmcgKi9cbjsoZnVuY3Rpb24gKHdpbmRvdykge1xuICAvLyBDb252ZW5pZW5jZSBhbGlhc2VzLlxuICB2YXIgZ2V0Q2xhc3MgPSB7fS50b1N0cmluZywgaXNQcm9wZXJ0eSwgZm9yRWFjaCwgdW5kZWY7XG5cbiAgLy8gRGV0ZWN0IHRoZSBgZGVmaW5lYCBmdW5jdGlvbiBleHBvc2VkIGJ5IGFzeW5jaHJvbm91cyBtb2R1bGUgbG9hZGVycy4gVGhlXG4gIC8vIHN0cmljdCBgZGVmaW5lYCBjaGVjayBpcyBuZWNlc3NhcnkgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBgci5qc2AuXG4gIHZhciBpc0xvYWRlciA9IHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kO1xuXG4gIC8vIERldGVjdCBuYXRpdmUgaW1wbGVtZW50YXRpb25zLlxuICB2YXIgbmF0aXZlSlNPTiA9IHR5cGVvZiBKU09OID09IFwib2JqZWN0XCIgJiYgSlNPTjtcblxuICAvLyBTZXQgdXAgdGhlIEpTT04gMyBuYW1lc3BhY2UsIHByZWZlcnJpbmcgdGhlIENvbW1vbkpTIGBleHBvcnRzYCBvYmplY3QgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICB2YXIgSlNPTjMgPSB0eXBlb2YgZXhwb3J0cyA9PSBcIm9iamVjdFwiICYmIGV4cG9ydHMgJiYgIWV4cG9ydHMubm9kZVR5cGUgJiYgZXhwb3J0cztcblxuICBpZiAoSlNPTjMgJiYgbmF0aXZlSlNPTikge1xuICAgIC8vIEV4cGxpY2l0bHkgZGVsZWdhdGUgdG8gdGhlIG5hdGl2ZSBgc3RyaW5naWZ5YCBhbmQgYHBhcnNlYFxuICAgIC8vIGltcGxlbWVudGF0aW9ucyBpbiBDb21tb25KUyBlbnZpcm9ubWVudHMuXG4gICAgSlNPTjMuc3RyaW5naWZ5ID0gbmF0aXZlSlNPTi5zdHJpbmdpZnk7XG4gICAgSlNPTjMucGFyc2UgPSBuYXRpdmVKU09OLnBhcnNlO1xuICB9IGVsc2Uge1xuICAgIC8vIEV4cG9ydCBmb3Igd2ViIGJyb3dzZXJzLCBKYXZhU2NyaXB0IGVuZ2luZXMsIGFuZCBhc3luY2hyb25vdXMgbW9kdWxlXG4gICAgLy8gbG9hZGVycywgdXNpbmcgdGhlIGdsb2JhbCBgSlNPTmAgb2JqZWN0IGlmIGF2YWlsYWJsZS5cbiAgICBKU09OMyA9IHdpbmRvdy5KU09OID0gbmF0aXZlSlNPTiB8fCB7fTtcbiAgfVxuXG4gIC8vIFRlc3QgdGhlIGBEYXRlI2dldFVUQypgIG1ldGhvZHMuIEJhc2VkIG9uIHdvcmsgYnkgQFlhZmZsZS5cbiAgdmFyIGlzRXh0ZW5kZWQgPSBuZXcgRGF0ZSgtMzUwOTgyNzMzNDU3MzI5Mik7XG4gIHRyeSB7XG4gICAgLy8gVGhlIGBnZXRVVENGdWxsWWVhcmAsIGBNb250aGAsIGFuZCBgRGF0ZWAgbWV0aG9kcyByZXR1cm4gbm9uc2Vuc2ljYWxcbiAgICAvLyByZXN1bHRzIGZvciBjZXJ0YWluIGRhdGVzIGluIE9wZXJhID49IDEwLjUzLlxuICAgIGlzRXh0ZW5kZWQgPSBpc0V4dGVuZGVkLmdldFVUQ0Z1bGxZZWFyKCkgPT0gLTEwOTI1MiAmJiBpc0V4dGVuZGVkLmdldFVUQ01vbnRoKCkgPT09IDAgJiYgaXNFeHRlbmRlZC5nZXRVVENEYXRlKCkgPT09IDEgJiZcbiAgICAgIC8vIFNhZmFyaSA8IDIuMC4yIHN0b3JlcyB0aGUgaW50ZXJuYWwgbWlsbGlzZWNvbmQgdGltZSB2YWx1ZSBjb3JyZWN0bHksXG4gICAgICAvLyBidXQgY2xpcHMgdGhlIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgZGF0ZSBtZXRob2RzIHRvIHRoZSByYW5nZSBvZlxuICAgICAgLy8gc2lnbmVkIDMyLWJpdCBpbnRlZ2VycyAoWy0yICoqIDMxLCAyICoqIDMxIC0gMV0pLlxuICAgICAgaXNFeHRlbmRlZC5nZXRVVENIb3VycygpID09IDEwICYmIGlzRXh0ZW5kZWQuZ2V0VVRDTWludXRlcygpID09IDM3ICYmIGlzRXh0ZW5kZWQuZ2V0VVRDU2Vjb25kcygpID09IDYgJiYgaXNFeHRlbmRlZC5nZXRVVENNaWxsaXNlY29uZHMoKSA9PSA3MDg7XG4gIH0gY2F0Y2ggKGV4Y2VwdGlvbikge31cblxuICAvLyBJbnRlcm5hbDogRGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSBuYXRpdmUgYEpTT04uc3RyaW5naWZ5YCBhbmQgYHBhcnNlYFxuICAvLyBpbXBsZW1lbnRhdGlvbnMgYXJlIHNwZWMtY29tcGxpYW50LiBCYXNlZCBvbiB3b3JrIGJ5IEtlbiBTbnlkZXIuXG4gIGZ1bmN0aW9uIGhhcyhuYW1lKSB7XG4gICAgaWYgKGhhc1tuYW1lXSAhPT0gdW5kZWYpIHtcbiAgICAgIC8vIFJldHVybiBjYWNoZWQgZmVhdHVyZSB0ZXN0IHJlc3VsdC5cbiAgICAgIHJldHVybiBoYXNbbmFtZV07XG4gICAgfVxuXG4gICAgdmFyIGlzU3VwcG9ydGVkO1xuICAgIGlmIChuYW1lID09IFwiYnVnLXN0cmluZy1jaGFyLWluZGV4XCIpIHtcbiAgICAgIC8vIElFIDw9IDcgZG9lc24ndCBzdXBwb3J0IGFjY2Vzc2luZyBzdHJpbmcgY2hhcmFjdGVycyB1c2luZyBzcXVhcmVcbiAgICAgIC8vIGJyYWNrZXQgbm90YXRpb24uIElFIDggb25seSBzdXBwb3J0cyB0aGlzIGZvciBwcmltaXRpdmVzLlxuICAgICAgaXNTdXBwb3J0ZWQgPSBcImFcIlswXSAhPSBcImFcIjtcbiAgICB9IGVsc2UgaWYgKG5hbWUgPT0gXCJqc29uXCIpIHtcbiAgICAgIC8vIEluZGljYXRlcyB3aGV0aGVyIGJvdGggYEpTT04uc3RyaW5naWZ5YCBhbmQgYEpTT04ucGFyc2VgIGFyZVxuICAgICAgLy8gc3VwcG9ydGVkLlxuICAgICAgaXNTdXBwb3J0ZWQgPSBoYXMoXCJqc29uLXN0cmluZ2lmeVwiKSAmJiBoYXMoXCJqc29uLXBhcnNlXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgdmFsdWUsIHNlcmlhbGl6ZWQgPSAne1wiYVwiOlsxLHRydWUsZmFsc2UsbnVsbCxcIlxcXFx1MDAwMFxcXFxiXFxcXG5cXFxcZlxcXFxyXFxcXHRcIl19JztcbiAgICAgIC8vIFRlc3QgYEpTT04uc3RyaW5naWZ5YC5cbiAgICAgIGlmIChuYW1lID09IFwianNvbi1zdHJpbmdpZnlcIikge1xuICAgICAgICB2YXIgc3RyaW5naWZ5ID0gSlNPTjMuc3RyaW5naWZ5LCBzdHJpbmdpZnlTdXBwb3J0ZWQgPSB0eXBlb2Ygc3RyaW5naWZ5ID09IFwiZnVuY3Rpb25cIiAmJiBpc0V4dGVuZGVkO1xuICAgICAgICBpZiAoc3RyaW5naWZ5U3VwcG9ydGVkKSB7XG4gICAgICAgICAgLy8gQSB0ZXN0IGZ1bmN0aW9uIG9iamVjdCB3aXRoIGEgY3VzdG9tIGB0b0pTT05gIG1ldGhvZC5cbiAgICAgICAgICAodmFsdWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICB9KS50b0pTT04gPSB2YWx1ZTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgc3RyaW5naWZ5U3VwcG9ydGVkID1cbiAgICAgICAgICAgICAgLy8gRmlyZWZveCAzLjFiMSBhbmQgYjIgc2VyaWFsaXplIHN0cmluZywgbnVtYmVyLCBhbmQgYm9vbGVhblxuICAgICAgICAgICAgICAvLyBwcmltaXRpdmVzIGFzIG9iamVjdCBsaXRlcmFscy5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KDApID09PSBcIjBcIiAmJlxuICAgICAgICAgICAgICAvLyBGRiAzLjFiMSwgYjIsIGFuZCBKU09OIDIgc2VyaWFsaXplIHdyYXBwZWQgcHJpbWl0aXZlcyBhcyBvYmplY3RcbiAgICAgICAgICAgICAgLy8gbGl0ZXJhbHMuXG4gICAgICAgICAgICAgIHN0cmluZ2lmeShuZXcgTnVtYmVyKCkpID09PSBcIjBcIiAmJlxuICAgICAgICAgICAgICBzdHJpbmdpZnkobmV3IFN0cmluZygpKSA9PSAnXCJcIicgJiZcbiAgICAgICAgICAgICAgLy8gRkYgMy4xYjEsIDIgdGhyb3cgYW4gZXJyb3IgaWYgdGhlIHZhbHVlIGlzIGBudWxsYCwgYHVuZGVmaW5lZGAsIG9yXG4gICAgICAgICAgICAgIC8vIGRvZXMgbm90IGRlZmluZSBhIGNhbm9uaWNhbCBKU09OIHJlcHJlc2VudGF0aW9uICh0aGlzIGFwcGxpZXMgdG9cbiAgICAgICAgICAgICAgLy8gb2JqZWN0cyB3aXRoIGB0b0pTT05gIHByb3BlcnRpZXMgYXMgd2VsbCwgKnVubGVzcyogdGhleSBhcmUgbmVzdGVkXG4gICAgICAgICAgICAgIC8vIHdpdGhpbiBhbiBvYmplY3Qgb3IgYXJyYXkpLlxuICAgICAgICAgICAgICBzdHJpbmdpZnkoZ2V0Q2xhc3MpID09PSB1bmRlZiAmJlxuICAgICAgICAgICAgICAvLyBJRSA4IHNlcmlhbGl6ZXMgYHVuZGVmaW5lZGAgYXMgYFwidW5kZWZpbmVkXCJgLiBTYWZhcmkgPD0gNS4xLjcgYW5kXG4gICAgICAgICAgICAgIC8vIEZGIDMuMWIzIHBhc3MgdGhpcyB0ZXN0LlxuICAgICAgICAgICAgICBzdHJpbmdpZnkodW5kZWYpID09PSB1bmRlZiAmJlxuICAgICAgICAgICAgICAvLyBTYWZhcmkgPD0gNS4xLjcgYW5kIEZGIDMuMWIzIHRocm93IGBFcnJvcmBzIGFuZCBgVHlwZUVycm9yYHMsXG4gICAgICAgICAgICAgIC8vIHJlc3BlY3RpdmVseSwgaWYgdGhlIHZhbHVlIGlzIG9taXR0ZWQgZW50aXJlbHkuXG4gICAgICAgICAgICAgIHN0cmluZ2lmeSgpID09PSB1bmRlZiAmJlxuICAgICAgICAgICAgICAvLyBGRiAzLjFiMSwgMiB0aHJvdyBhbiBlcnJvciBpZiB0aGUgZ2l2ZW4gdmFsdWUgaXMgbm90IGEgbnVtYmVyLFxuICAgICAgICAgICAgICAvLyBzdHJpbmcsIGFycmF5LCBvYmplY3QsIEJvb2xlYW4sIG9yIGBudWxsYCBsaXRlcmFsLiBUaGlzIGFwcGxpZXMgdG9cbiAgICAgICAgICAgICAgLy8gb2JqZWN0cyB3aXRoIGN1c3RvbSBgdG9KU09OYCBtZXRob2RzIGFzIHdlbGwsIHVubGVzcyB0aGV5IGFyZSBuZXN0ZWRcbiAgICAgICAgICAgICAgLy8gaW5zaWRlIG9iamVjdCBvciBhcnJheSBsaXRlcmFscy4gWVVJIDMuMC4wYjEgaWdub3JlcyBjdXN0b20gYHRvSlNPTmBcbiAgICAgICAgICAgICAgLy8gbWV0aG9kcyBlbnRpcmVseS5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KHZhbHVlKSA9PT0gXCIxXCIgJiZcbiAgICAgICAgICAgICAgc3RyaW5naWZ5KFt2YWx1ZV0pID09IFwiWzFdXCIgJiZcbiAgICAgICAgICAgICAgLy8gUHJvdG90eXBlIDw9IDEuNi4xIHNlcmlhbGl6ZXMgYFt1bmRlZmluZWRdYCBhcyBgXCJbXVwiYCBpbnN0ZWFkIG9mXG4gICAgICAgICAgICAgIC8vIGBcIltudWxsXVwiYC5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KFt1bmRlZl0pID09IFwiW251bGxdXCIgJiZcbiAgICAgICAgICAgICAgLy8gWVVJIDMuMC4wYjEgZmFpbHMgdG8gc2VyaWFsaXplIGBudWxsYCBsaXRlcmFscy5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KG51bGwpID09IFwibnVsbFwiICYmXG4gICAgICAgICAgICAgIC8vIEZGIDMuMWIxLCAyIGhhbHRzIHNlcmlhbGl6YXRpb24gaWYgYW4gYXJyYXkgY29udGFpbnMgYSBmdW5jdGlvbjpcbiAgICAgICAgICAgICAgLy8gYFsxLCB0cnVlLCBnZXRDbGFzcywgMV1gIHNlcmlhbGl6ZXMgYXMgXCJbMSx0cnVlLF0sXCIuIEZGIDMuMWIzXG4gICAgICAgICAgICAgIC8vIGVsaWRlcyBub24tSlNPTiB2YWx1ZXMgZnJvbSBvYmplY3RzIGFuZCBhcnJheXMsIHVubGVzcyB0aGV5XG4gICAgICAgICAgICAgIC8vIGRlZmluZSBjdXN0b20gYHRvSlNPTmAgbWV0aG9kcy5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KFt1bmRlZiwgZ2V0Q2xhc3MsIG51bGxdKSA9PSBcIltudWxsLG51bGwsbnVsbF1cIiAmJlxuICAgICAgICAgICAgICAvLyBTaW1wbGUgc2VyaWFsaXphdGlvbiB0ZXN0LiBGRiAzLjFiMSB1c2VzIFVuaWNvZGUgZXNjYXBlIHNlcXVlbmNlc1xuICAgICAgICAgICAgICAvLyB3aGVyZSBjaGFyYWN0ZXIgZXNjYXBlIGNvZGVzIGFyZSBleHBlY3RlZCAoZS5nLiwgYFxcYmAgPT4gYFxcdTAwMDhgKS5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KHsgXCJhXCI6IFt2YWx1ZSwgdHJ1ZSwgZmFsc2UsIG51bGwsIFwiXFx4MDBcXGJcXG5cXGZcXHJcXHRcIl0gfSkgPT0gc2VyaWFsaXplZCAmJlxuICAgICAgICAgICAgICAvLyBGRiAzLjFiMSBhbmQgYjIgaWdub3JlIHRoZSBgZmlsdGVyYCBhbmQgYHdpZHRoYCBhcmd1bWVudHMuXG4gICAgICAgICAgICAgIHN0cmluZ2lmeShudWxsLCB2YWx1ZSkgPT09IFwiMVwiICYmXG4gICAgICAgICAgICAgIHN0cmluZ2lmeShbMSwgMl0sIG51bGwsIDEpID09IFwiW1xcbiAxLFxcbiAyXFxuXVwiICYmXG4gICAgICAgICAgICAgIC8vIEpTT04gMiwgUHJvdG90eXBlIDw9IDEuNywgYW5kIG9sZGVyIFdlYktpdCBidWlsZHMgaW5jb3JyZWN0bHlcbiAgICAgICAgICAgICAgLy8gc2VyaWFsaXplIGV4dGVuZGVkIHllYXJzLlxuICAgICAgICAgICAgICBzdHJpbmdpZnkobmV3IERhdGUoLTguNjRlMTUpKSA9PSAnXCItMjcxODIxLTA0LTIwVDAwOjAwOjAwLjAwMFpcIicgJiZcbiAgICAgICAgICAgICAgLy8gVGhlIG1pbGxpc2Vjb25kcyBhcmUgb3B0aW9uYWwgaW4gRVMgNSwgYnV0IHJlcXVpcmVkIGluIDUuMS5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KG5ldyBEYXRlKDguNjRlMTUpKSA9PSAnXCIrMjc1NzYwLTA5LTEzVDAwOjAwOjAwLjAwMFpcIicgJiZcbiAgICAgICAgICAgICAgLy8gRmlyZWZveCA8PSAxMS4wIGluY29ycmVjdGx5IHNlcmlhbGl6ZXMgeWVhcnMgcHJpb3IgdG8gMCBhcyBuZWdhdGl2ZVxuICAgICAgICAgICAgICAvLyBmb3VyLWRpZ2l0IHllYXJzIGluc3RlYWQgb2Ygc2l4LWRpZ2l0IHllYXJzLiBDcmVkaXRzOiBAWWFmZmxlLlxuICAgICAgICAgICAgICBzdHJpbmdpZnkobmV3IERhdGUoLTYyMTk4NzU1MmU1KSkgPT0gJ1wiLTAwMDAwMS0wMS0wMVQwMDowMDowMC4wMDBaXCInICYmXG4gICAgICAgICAgICAgIC8vIFNhZmFyaSA8PSA1LjEuNSBhbmQgT3BlcmEgPj0gMTAuNTMgaW5jb3JyZWN0bHkgc2VyaWFsaXplIG1pbGxpc2Vjb25kXG4gICAgICAgICAgICAgIC8vIHZhbHVlcyBsZXNzIHRoYW4gMTAwMC4gQ3JlZGl0czogQFlhZmZsZS5cbiAgICAgICAgICAgICAgc3RyaW5naWZ5KG5ldyBEYXRlKC0xKSkgPT0gJ1wiMTk2OS0xMi0zMVQyMzo1OTo1OS45OTlaXCInO1xuICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgc3RyaW5naWZ5U3VwcG9ydGVkID0gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlzU3VwcG9ydGVkID0gc3RyaW5naWZ5U3VwcG9ydGVkO1xuICAgICAgfVxuICAgICAgLy8gVGVzdCBgSlNPTi5wYXJzZWAuXG4gICAgICBpZiAobmFtZSA9PSBcImpzb24tcGFyc2VcIikge1xuICAgICAgICB2YXIgcGFyc2UgPSBKU09OMy5wYXJzZTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJzZSA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gRkYgMy4xYjEsIGIyIHdpbGwgdGhyb3cgYW4gZXhjZXB0aW9uIGlmIGEgYmFyZSBsaXRlcmFsIGlzIHByb3ZpZGVkLlxuICAgICAgICAgICAgLy8gQ29uZm9ybWluZyBpbXBsZW1lbnRhdGlvbnMgc2hvdWxkIGFsc28gY29lcmNlIHRoZSBpbml0aWFsIGFyZ3VtZW50IHRvXG4gICAgICAgICAgICAvLyBhIHN0cmluZyBwcmlvciB0byBwYXJzaW5nLlxuICAgICAgICAgICAgaWYgKHBhcnNlKFwiMFwiKSA9PT0gMCAmJiAhcGFyc2UoZmFsc2UpKSB7XG4gICAgICAgICAgICAgIC8vIFNpbXBsZSBwYXJzaW5nIHRlc3QuXG4gICAgICAgICAgICAgIHZhbHVlID0gcGFyc2Uoc2VyaWFsaXplZCk7XG4gICAgICAgICAgICAgIHZhciBwYXJzZVN1cHBvcnRlZCA9IHZhbHVlW1wiYVwiXS5sZW5ndGggPT0gNSAmJiB2YWx1ZVtcImFcIl1bMF0gPT09IDE7XG4gICAgICAgICAgICAgIGlmIChwYXJzZVN1cHBvcnRlZCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAvLyBTYWZhcmkgPD0gNS4xLjIgYW5kIEZGIDMuMWIxIGFsbG93IHVuZXNjYXBlZCB0YWJzIGluIHN0cmluZ3MuXG4gICAgICAgICAgICAgICAgICBwYXJzZVN1cHBvcnRlZCA9ICFwYXJzZSgnXCJcXHRcIicpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge31cbiAgICAgICAgICAgICAgICBpZiAocGFyc2VTdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZGIDQuMCBhbmQgNC4wLjEgYWxsb3cgbGVhZGluZyBgK2Agc2lnbnMgYW5kIGxlYWRpbmdcbiAgICAgICAgICAgICAgICAgICAgLy8gZGVjaW1hbCBwb2ludHMuIEZGIDQuMCwgNC4wLjEsIGFuZCBJRSA5LTEwIGFsc28gYWxsb3dcbiAgICAgICAgICAgICAgICAgICAgLy8gY2VydGFpbiBvY3RhbCBsaXRlcmFscy5cbiAgICAgICAgICAgICAgICAgICAgcGFyc2VTdXBwb3J0ZWQgPSBwYXJzZShcIjAxXCIpICE9PSAxO1xuICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocGFyc2VTdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZGIDQuMCwgNC4wLjEsIGFuZCBSaGlubyAxLjdSMy1SNCBhbGxvdyB0cmFpbGluZyBkZWNpbWFsXG4gICAgICAgICAgICAgICAgICAgIC8vIHBvaW50cy4gVGhlc2UgZW52aXJvbm1lbnRzLCBhbG9uZyB3aXRoIEZGIDMuMWIxIGFuZCAyLFxuICAgICAgICAgICAgICAgICAgICAvLyBhbHNvIGFsbG93IHRyYWlsaW5nIGNvbW1hcyBpbiBKU09OIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICAgICAgICAgICAgICAgICAgcGFyc2VTdXBwb3J0ZWQgPSBwYXJzZShcIjEuXCIpICE9PSAxO1xuICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgcGFyc2VTdXBwb3J0ZWQgPSBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaXNTdXBwb3J0ZWQgPSBwYXJzZVN1cHBvcnRlZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhhc1tuYW1lXSA9ICEhaXNTdXBwb3J0ZWQ7XG4gIH1cblxuICBpZiAoIWhhcyhcImpzb25cIikpIHtcbiAgICAvLyBDb21tb24gYFtbQ2xhc3NdXWAgbmFtZSBhbGlhc2VzLlxuICAgIHZhciBmdW5jdGlvbkNsYXNzID0gXCJbb2JqZWN0IEZ1bmN0aW9uXVwiO1xuICAgIHZhciBkYXRlQ2xhc3MgPSBcIltvYmplY3QgRGF0ZV1cIjtcbiAgICB2YXIgbnVtYmVyQ2xhc3MgPSBcIltvYmplY3QgTnVtYmVyXVwiO1xuICAgIHZhciBzdHJpbmdDbGFzcyA9IFwiW29iamVjdCBTdHJpbmddXCI7XG4gICAgdmFyIGFycmF5Q2xhc3MgPSBcIltvYmplY3QgQXJyYXldXCI7XG4gICAgdmFyIGJvb2xlYW5DbGFzcyA9IFwiW29iamVjdCBCb29sZWFuXVwiO1xuXG4gICAgLy8gRGV0ZWN0IGluY29tcGxldGUgc3VwcG9ydCBmb3IgYWNjZXNzaW5nIHN0cmluZyBjaGFyYWN0ZXJzIGJ5IGluZGV4LlxuICAgIHZhciBjaGFySW5kZXhCdWdneSA9IGhhcyhcImJ1Zy1zdHJpbmctY2hhci1pbmRleFwiKTtcblxuICAgIC8vIERlZmluZSBhZGRpdGlvbmFsIHV0aWxpdHkgbWV0aG9kcyBpZiB0aGUgYERhdGVgIG1ldGhvZHMgYXJlIGJ1Z2d5LlxuICAgIGlmICghaXNFeHRlbmRlZCkge1xuICAgICAgdmFyIGZsb29yID0gTWF0aC5mbG9vcjtcbiAgICAgIC8vIEEgbWFwcGluZyBiZXR3ZWVuIHRoZSBtb250aHMgb2YgdGhlIHllYXIgYW5kIHRoZSBudW1iZXIgb2YgZGF5cyBiZXR3ZWVuXG4gICAgICAvLyBKYW51YXJ5IDFzdCBhbmQgdGhlIGZpcnN0IG9mIHRoZSByZXNwZWN0aXZlIG1vbnRoLlxuICAgICAgdmFyIE1vbnRocyA9IFswLCAzMSwgNTksIDkwLCAxMjAsIDE1MSwgMTgxLCAyMTIsIDI0MywgMjczLCAzMDQsIDMzNF07XG4gICAgICAvLyBJbnRlcm5hbDogQ2FsY3VsYXRlcyB0aGUgbnVtYmVyIG9mIGRheXMgYmV0d2VlbiB0aGUgVW5peCBlcG9jaCBhbmQgdGhlXG4gICAgICAvLyBmaXJzdCBkYXkgb2YgdGhlIGdpdmVuIG1vbnRoLlxuICAgICAgdmFyIGdldERheSA9IGZ1bmN0aW9uICh5ZWFyLCBtb250aCkge1xuICAgICAgICByZXR1cm4gTW9udGhzW21vbnRoXSArIDM2NSAqICh5ZWFyIC0gMTk3MCkgKyBmbG9vcigoeWVhciAtIDE5NjkgKyAobW9udGggPSArKG1vbnRoID4gMSkpKSAvIDQpIC0gZmxvb3IoKHllYXIgLSAxOTAxICsgbW9udGgpIC8gMTAwKSArIGZsb29yKCh5ZWFyIC0gMTYwMSArIG1vbnRoKSAvIDQwMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEludGVybmFsOiBEZXRlcm1pbmVzIGlmIGEgcHJvcGVydHkgaXMgYSBkaXJlY3QgcHJvcGVydHkgb2YgdGhlIGdpdmVuXG4gICAgLy8gb2JqZWN0LiBEZWxlZ2F0ZXMgdG8gdGhlIG5hdGl2ZSBgT2JqZWN0I2hhc093blByb3BlcnR5YCBtZXRob2QuXG4gICAgaWYgKCEoaXNQcm9wZXJ0eSA9IHt9Lmhhc093blByb3BlcnR5KSkge1xuICAgICAgaXNQcm9wZXJ0eSA9IGZ1bmN0aW9uIChwcm9wZXJ0eSkge1xuICAgICAgICB2YXIgbWVtYmVycyA9IHt9LCBjb25zdHJ1Y3RvcjtcbiAgICAgICAgaWYgKChtZW1iZXJzLl9fcHJvdG9fXyA9IG51bGwsIG1lbWJlcnMuX19wcm90b19fID0ge1xuICAgICAgICAgIC8vIFRoZSAqcHJvdG8qIHByb3BlcnR5IGNhbm5vdCBiZSBzZXQgbXVsdGlwbGUgdGltZXMgaW4gcmVjZW50XG4gICAgICAgICAgLy8gdmVyc2lvbnMgb2YgRmlyZWZveCBhbmQgU2VhTW9ua2V5LlxuICAgICAgICAgIFwidG9TdHJpbmdcIjogMVxuICAgICAgICB9LCBtZW1iZXJzKS50b1N0cmluZyAhPSBnZXRDbGFzcykge1xuICAgICAgICAgIC8vIFNhZmFyaSA8PSAyLjAuMyBkb2Vzbid0IGltcGxlbWVudCBgT2JqZWN0I2hhc093blByb3BlcnR5YCwgYnV0XG4gICAgICAgICAgLy8gc3VwcG9ydHMgdGhlIG11dGFibGUgKnByb3RvKiBwcm9wZXJ0eS5cbiAgICAgICAgICBpc1Byb3BlcnR5ID0gZnVuY3Rpb24gKHByb3BlcnR5KSB7XG4gICAgICAgICAgICAvLyBDYXB0dXJlIGFuZCBicmVhayB0aGUgb2JqZWN0J3MgcHJvdG90eXBlIGNoYWluIChzZWUgc2VjdGlvbiA4LjYuMlxuICAgICAgICAgICAgLy8gb2YgdGhlIEVTIDUuMSBzcGVjKS4gVGhlIHBhcmVudGhlc2l6ZWQgZXhwcmVzc2lvbiBwcmV2ZW50cyBhblxuICAgICAgICAgICAgLy8gdW5zYWZlIHRyYW5zZm9ybWF0aW9uIGJ5IHRoZSBDbG9zdXJlIENvbXBpbGVyLlxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsID0gdGhpcy5fX3Byb3RvX18sIHJlc3VsdCA9IHByb3BlcnR5IGluICh0aGlzLl9fcHJvdG9fXyA9IG51bGwsIHRoaXMpO1xuICAgICAgICAgICAgLy8gUmVzdG9yZSB0aGUgb3JpZ2luYWwgcHJvdG90eXBlIGNoYWluLlxuICAgICAgICAgICAgdGhpcy5fX3Byb3RvX18gPSBvcmlnaW5hbDtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBDYXB0dXJlIGEgcmVmZXJlbmNlIHRvIHRoZSB0b3AtbGV2ZWwgYE9iamVjdGAgY29uc3RydWN0b3IuXG4gICAgICAgICAgY29uc3RydWN0b3IgPSBtZW1iZXJzLmNvbnN0cnVjdG9yO1xuICAgICAgICAgIC8vIFVzZSB0aGUgYGNvbnN0cnVjdG9yYCBwcm9wZXJ0eSB0byBzaW11bGF0ZSBgT2JqZWN0I2hhc093blByb3BlcnR5YCBpblxuICAgICAgICAgIC8vIG90aGVyIGVudmlyb25tZW50cy5cbiAgICAgICAgICBpc1Byb3BlcnR5ID0gZnVuY3Rpb24gKHByb3BlcnR5KSB7XG4gICAgICAgICAgICB2YXIgcGFyZW50ID0gKHRoaXMuY29uc3RydWN0b3IgfHwgY29uc3RydWN0b3IpLnByb3RvdHlwZTtcbiAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eSBpbiB0aGlzICYmICEocHJvcGVydHkgaW4gcGFyZW50ICYmIHRoaXNbcHJvcGVydHldID09PSBwYXJlbnRbcHJvcGVydHldKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIG1lbWJlcnMgPSBudWxsO1xuICAgICAgICByZXR1cm4gaXNQcm9wZXJ0eS5jYWxsKHRoaXMsIHByb3BlcnR5KTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gSW50ZXJuYWw6IEEgc2V0IG9mIHByaW1pdGl2ZSB0eXBlcyB1c2VkIGJ5IGBpc0hvc3RUeXBlYC5cbiAgICB2YXIgUHJpbWl0aXZlVHlwZXMgPSB7XG4gICAgICAnYm9vbGVhbic6IDEsXG4gICAgICAnbnVtYmVyJzogMSxcbiAgICAgICdzdHJpbmcnOiAxLFxuICAgICAgJ3VuZGVmaW5lZCc6IDFcbiAgICB9O1xuXG4gICAgLy8gSW50ZXJuYWw6IERldGVybWluZXMgaWYgdGhlIGdpdmVuIG9iamVjdCBgcHJvcGVydHlgIHZhbHVlIGlzIGFcbiAgICAvLyBub24tcHJpbWl0aXZlLlxuICAgIHZhciBpc0hvc3RUeXBlID0gZnVuY3Rpb24gKG9iamVjdCwgcHJvcGVydHkpIHtcbiAgICAgIHZhciB0eXBlID0gdHlwZW9mIG9iamVjdFtwcm9wZXJ0eV07XG4gICAgICByZXR1cm4gdHlwZSA9PSAnb2JqZWN0JyA/ICEhb2JqZWN0W3Byb3BlcnR5XSA6ICFQcmltaXRpdmVUeXBlc1t0eXBlXTtcbiAgICB9O1xuXG4gICAgLy8gSW50ZXJuYWw6IE5vcm1hbGl6ZXMgdGhlIGBmb3IuLi5pbmAgaXRlcmF0aW9uIGFsZ29yaXRobSBhY3Jvc3NcbiAgICAvLyBlbnZpcm9ubWVudHMuIEVhY2ggZW51bWVyYXRlZCBrZXkgaXMgeWllbGRlZCB0byBhIGBjYWxsYmFja2AgZnVuY3Rpb24uXG4gICAgZm9yRWFjaCA9IGZ1bmN0aW9uIChvYmplY3QsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgc2l6ZSA9IDAsIFByb3BlcnRpZXMsIG1lbWJlcnMsIHByb3BlcnR5O1xuXG4gICAgICAvLyBUZXN0cyBmb3IgYnVncyBpbiB0aGUgY3VycmVudCBlbnZpcm9ubWVudCdzIGBmb3IuLi5pbmAgYWxnb3JpdGhtLiBUaGVcbiAgICAgIC8vIGB2YWx1ZU9mYCBwcm9wZXJ0eSBpbmhlcml0cyB0aGUgbm9uLWVudW1lcmFibGUgZmxhZyBmcm9tXG4gICAgICAvLyBgT2JqZWN0LnByb3RvdHlwZWAgaW4gb2xkZXIgdmVyc2lvbnMgb2YgSUUsIE5ldHNjYXBlLCBhbmQgTW96aWxsYS5cbiAgICAgIChQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnZhbHVlT2YgPSAwO1xuICAgICAgfSkucHJvdG90eXBlLnZhbHVlT2YgPSAwO1xuXG4gICAgICAvLyBJdGVyYXRlIG92ZXIgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlIGBQcm9wZXJ0aWVzYCBjbGFzcy5cbiAgICAgIG1lbWJlcnMgPSBuZXcgUHJvcGVydGllcygpO1xuICAgICAgZm9yIChwcm9wZXJ0eSBpbiBtZW1iZXJzKSB7XG4gICAgICAgIC8vIElnbm9yZSBhbGwgcHJvcGVydGllcyBpbmhlcml0ZWQgZnJvbSBgT2JqZWN0LnByb3RvdHlwZWAuXG4gICAgICAgIGlmIChpc1Byb3BlcnR5LmNhbGwobWVtYmVycywgcHJvcGVydHkpKSB7XG4gICAgICAgICAgc2l6ZSsrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBQcm9wZXJ0aWVzID0gbWVtYmVycyA9IG51bGw7XG5cbiAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgaXRlcmF0aW9uIGFsZ29yaXRobS5cbiAgICAgIGlmICghc2l6ZSkge1xuICAgICAgICAvLyBBIGxpc3Qgb2Ygbm9uLWVudW1lcmFibGUgcHJvcGVydGllcyBpbmhlcml0ZWQgZnJvbSBgT2JqZWN0LnByb3RvdHlwZWAuXG4gICAgICAgIG1lbWJlcnMgPSBbXCJ2YWx1ZU9mXCIsIFwidG9TdHJpbmdcIiwgXCJ0b0xvY2FsZVN0cmluZ1wiLCBcInByb3BlcnR5SXNFbnVtZXJhYmxlXCIsIFwiaXNQcm90b3R5cGVPZlwiLCBcImhhc093blByb3BlcnR5XCIsIFwiY29uc3RydWN0b3JcIl07XG4gICAgICAgIC8vIElFIDw9IDgsIE1vemlsbGEgMS4wLCBhbmQgTmV0c2NhcGUgNi4yIGlnbm9yZSBzaGFkb3dlZCBub24tZW51bWVyYWJsZVxuICAgICAgICAvLyBwcm9wZXJ0aWVzLlxuICAgICAgICBmb3JFYWNoID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2spIHtcbiAgICAgICAgICB2YXIgaXNGdW5jdGlvbiA9IGdldENsYXNzLmNhbGwob2JqZWN0KSA9PSBmdW5jdGlvbkNsYXNzLCBwcm9wZXJ0eSwgbGVuZ3RoO1xuICAgICAgICAgIHZhciBoYXNQcm9wZXJ0eSA9ICFpc0Z1bmN0aW9uICYmIHR5cGVvZiBvYmplY3QuY29uc3RydWN0b3IgIT0gJ2Z1bmN0aW9uJyAmJiBpc0hvc3RUeXBlKG9iamVjdCwgJ2hhc093blByb3BlcnR5JykgPyBvYmplY3QuaGFzT3duUHJvcGVydHkgOiBpc1Byb3BlcnR5O1xuICAgICAgICAgIGZvciAocHJvcGVydHkgaW4gb2JqZWN0KSB7XG4gICAgICAgICAgICAvLyBHZWNrbyA8PSAxLjAgZW51bWVyYXRlcyB0aGUgYHByb3RvdHlwZWAgcHJvcGVydHkgb2YgZnVuY3Rpb25zIHVuZGVyXG4gICAgICAgICAgICAvLyBjZXJ0YWluIGNvbmRpdGlvbnM7IElFIGRvZXMgbm90LlxuICAgICAgICAgICAgaWYgKCEoaXNGdW5jdGlvbiAmJiBwcm9wZXJ0eSA9PSBcInByb3RvdHlwZVwiKSAmJiBoYXNQcm9wZXJ0eS5jYWxsKG9iamVjdCwgcHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKHByb3BlcnR5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTWFudWFsbHkgaW52b2tlIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBub24tZW51bWVyYWJsZSBwcm9wZXJ0eS5cbiAgICAgICAgICBmb3IgKGxlbmd0aCA9IG1lbWJlcnMubGVuZ3RoOyBwcm9wZXJ0eSA9IG1lbWJlcnNbLS1sZW5ndGhdOyBoYXNQcm9wZXJ0eS5jYWxsKG9iamVjdCwgcHJvcGVydHkpICYmIGNhbGxiYWNrKHByb3BlcnR5KSk7XG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHNpemUgPT0gMikge1xuICAgICAgICAvLyBTYWZhcmkgPD0gMi4wLjQgZW51bWVyYXRlcyBzaGFkb3dlZCBwcm9wZXJ0aWVzIHR3aWNlLlxuICAgICAgICBmb3JFYWNoID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAvLyBDcmVhdGUgYSBzZXQgb2YgaXRlcmF0ZWQgcHJvcGVydGllcy5cbiAgICAgICAgICB2YXIgbWVtYmVycyA9IHt9LCBpc0Z1bmN0aW9uID0gZ2V0Q2xhc3MuY2FsbChvYmplY3QpID09IGZ1bmN0aW9uQ2xhc3MsIHByb3BlcnR5O1xuICAgICAgICAgIGZvciAocHJvcGVydHkgaW4gb2JqZWN0KSB7XG4gICAgICAgICAgICAvLyBTdG9yZSBlYWNoIHByb3BlcnR5IG5hbWUgdG8gcHJldmVudCBkb3VibGUgZW51bWVyYXRpb24uIFRoZVxuICAgICAgICAgICAgLy8gYHByb3RvdHlwZWAgcHJvcGVydHkgb2YgZnVuY3Rpb25zIGlzIG5vdCBlbnVtZXJhdGVkIGR1ZSB0byBjcm9zcy1cbiAgICAgICAgICAgIC8vIGVudmlyb25tZW50IGluY29uc2lzdGVuY2llcy5cbiAgICAgICAgICAgIGlmICghKGlzRnVuY3Rpb24gJiYgcHJvcGVydHkgPT0gXCJwcm90b3R5cGVcIikgJiYgIWlzUHJvcGVydHkuY2FsbChtZW1iZXJzLCBwcm9wZXJ0eSkgJiYgKG1lbWJlcnNbcHJvcGVydHldID0gMSkgJiYgaXNQcm9wZXJ0eS5jYWxsKG9iamVjdCwgcHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKHByb3BlcnR5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBObyBidWdzIGRldGVjdGVkOyB1c2UgdGhlIHN0YW5kYXJkIGBmb3IuLi5pbmAgYWxnb3JpdGhtLlxuICAgICAgICBmb3JFYWNoID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2spIHtcbiAgICAgICAgICB2YXIgaXNGdW5jdGlvbiA9IGdldENsYXNzLmNhbGwob2JqZWN0KSA9PSBmdW5jdGlvbkNsYXNzLCBwcm9wZXJ0eSwgaXNDb25zdHJ1Y3RvcjtcbiAgICAgICAgICBmb3IgKHByb3BlcnR5IGluIG9iamVjdCkge1xuICAgICAgICAgICAgaWYgKCEoaXNGdW5jdGlvbiAmJiBwcm9wZXJ0eSA9PSBcInByb3RvdHlwZVwiKSAmJiBpc1Byb3BlcnR5LmNhbGwob2JqZWN0LCBwcm9wZXJ0eSkgJiYgIShpc0NvbnN0cnVjdG9yID0gcHJvcGVydHkgPT09IFwiY29uc3RydWN0b3JcIikpIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2socHJvcGVydHkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBNYW51YWxseSBpbnZva2UgdGhlIGNhbGxiYWNrIGZvciB0aGUgYGNvbnN0cnVjdG9yYCBwcm9wZXJ0eSBkdWUgdG9cbiAgICAgICAgICAvLyBjcm9zcy1lbnZpcm9ubWVudCBpbmNvbnNpc3RlbmNpZXMuXG4gICAgICAgICAgaWYgKGlzQ29uc3RydWN0b3IgfHwgaXNQcm9wZXJ0eS5jYWxsKG9iamVjdCwgKHByb3BlcnR5ID0gXCJjb25zdHJ1Y3RvclwiKSkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHByb3BlcnR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZm9yRWFjaChvYmplY3QsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgLy8gUHVibGljOiBTZXJpYWxpemVzIGEgSmF2YVNjcmlwdCBgdmFsdWVgIGFzIGEgSlNPTiBzdHJpbmcuIFRoZSBvcHRpb25hbFxuICAgIC8vIGBmaWx0ZXJgIGFyZ3VtZW50IG1heSBzcGVjaWZ5IGVpdGhlciBhIGZ1bmN0aW9uIHRoYXQgYWx0ZXJzIGhvdyBvYmplY3QgYW5kXG4gICAgLy8gYXJyYXkgbWVtYmVycyBhcmUgc2VyaWFsaXplZCwgb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyBhbmQgbnVtYmVycyB0aGF0XG4gICAgLy8gaW5kaWNhdGVzIHdoaWNoIHByb3BlcnRpZXMgc2hvdWxkIGJlIHNlcmlhbGl6ZWQuIFRoZSBvcHRpb25hbCBgd2lkdGhgXG4gICAgLy8gYXJndW1lbnQgbWF5IGJlIGVpdGhlciBhIHN0cmluZyBvciBudW1iZXIgdGhhdCBzcGVjaWZpZXMgdGhlIGluZGVudGF0aW9uXG4gICAgLy8gbGV2ZWwgb2YgdGhlIG91dHB1dC5cbiAgICBpZiAoIWhhcyhcImpzb24tc3RyaW5naWZ5XCIpKSB7XG4gICAgICAvLyBJbnRlcm5hbDogQSBtYXAgb2YgY29udHJvbCBjaGFyYWN0ZXJzIGFuZCB0aGVpciBlc2NhcGVkIGVxdWl2YWxlbnRzLlxuICAgICAgdmFyIEVzY2FwZXMgPSB7XG4gICAgICAgIDkyOiBcIlxcXFxcXFxcXCIsXG4gICAgICAgIDM0OiAnXFxcXFwiJyxcbiAgICAgICAgODogXCJcXFxcYlwiLFxuICAgICAgICAxMjogXCJcXFxcZlwiLFxuICAgICAgICAxMDogXCJcXFxcblwiLFxuICAgICAgICAxMzogXCJcXFxcclwiLFxuICAgICAgICA5OiBcIlxcXFx0XCJcbiAgICAgIH07XG5cbiAgICAgIC8vIEludGVybmFsOiBDb252ZXJ0cyBgdmFsdWVgIGludG8gYSB6ZXJvLXBhZGRlZCBzdHJpbmcgc3VjaCB0aGF0IGl0c1xuICAgICAgLy8gbGVuZ3RoIGlzIGF0IGxlYXN0IGVxdWFsIHRvIGB3aWR0aGAuIFRoZSBgd2lkdGhgIG11c3QgYmUgPD0gNi5cbiAgICAgIHZhciBsZWFkaW5nWmVyb2VzID0gXCIwMDAwMDBcIjtcbiAgICAgIHZhciB0b1BhZGRlZFN0cmluZyA9IGZ1bmN0aW9uICh3aWR0aCwgdmFsdWUpIHtcbiAgICAgICAgLy8gVGhlIGB8fCAwYCBleHByZXNzaW9uIGlzIG5lY2Vzc2FyeSB0byB3b3JrIGFyb3VuZCBhIGJ1ZyBpblxuICAgICAgICAvLyBPcGVyYSA8PSA3LjU0dTIgd2hlcmUgYDAgPT0gLTBgLCBidXQgYFN0cmluZygtMCkgIT09IFwiMFwiYC5cbiAgICAgICAgcmV0dXJuIChsZWFkaW5nWmVyb2VzICsgKHZhbHVlIHx8IDApKS5zbGljZSgtd2lkdGgpO1xuICAgICAgfTtcblxuICAgICAgLy8gSW50ZXJuYWw6IERvdWJsZS1xdW90ZXMgYSBzdHJpbmcgYHZhbHVlYCwgcmVwbGFjaW5nIGFsbCBBU0NJSSBjb250cm9sXG4gICAgICAvLyBjaGFyYWN0ZXJzIChjaGFyYWN0ZXJzIHdpdGggY29kZSB1bml0IHZhbHVlcyBiZXR3ZWVuIDAgYW5kIDMxKSB3aXRoXG4gICAgICAvLyB0aGVpciBlc2NhcGVkIGVxdWl2YWxlbnRzLiBUaGlzIGlzIGFuIGltcGxlbWVudGF0aW9uIG9mIHRoZVxuICAgICAgLy8gYFF1b3RlKHZhbHVlKWAgb3BlcmF0aW9uIGRlZmluZWQgaW4gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMy5cbiAgICAgIHZhciB1bmljb2RlUHJlZml4ID0gXCJcXFxcdTAwXCI7XG4gICAgICB2YXIgcXVvdGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9ICdcIicsIGluZGV4ID0gMCwgbGVuZ3RoID0gdmFsdWUubGVuZ3RoLCBpc0xhcmdlID0gbGVuZ3RoID4gMTAgJiYgY2hhckluZGV4QnVnZ3ksIHN5bWJvbHM7XG4gICAgICAgIGlmIChpc0xhcmdlKSB7XG4gICAgICAgICAgc3ltYm9scyA9IHZhbHVlLnNwbGl0KFwiXCIpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgIHZhciBjaGFyQ29kZSA9IHZhbHVlLmNoYXJDb2RlQXQoaW5kZXgpO1xuICAgICAgICAgIC8vIElmIHRoZSBjaGFyYWN0ZXIgaXMgYSBjb250cm9sIGNoYXJhY3RlciwgYXBwZW5kIGl0cyBVbmljb2RlIG9yXG4gICAgICAgICAgLy8gc2hvcnRoYW5kIGVzY2FwZSBzZXF1ZW5jZTsgb3RoZXJ3aXNlLCBhcHBlbmQgdGhlIGNoYXJhY3RlciBhcy1pcy5cbiAgICAgICAgICBzd2l0Y2ggKGNoYXJDb2RlKSB7XG4gICAgICAgICAgICBjYXNlIDg6IGNhc2UgOTogY2FzZSAxMDogY2FzZSAxMjogY2FzZSAxMzogY2FzZSAzNDogY2FzZSA5MjpcbiAgICAgICAgICAgICAgcmVzdWx0ICs9IEVzY2FwZXNbY2hhckNvZGVdO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIGlmIChjaGFyQ29kZSA8IDMyKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IHVuaWNvZGVQcmVmaXggKyB0b1BhZGRlZFN0cmluZygyLCBjaGFyQ29kZS50b1N0cmluZygxNikpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3VsdCArPSBpc0xhcmdlID8gc3ltYm9sc1tpbmRleF0gOiBjaGFySW5kZXhCdWdneSA/IHZhbHVlLmNoYXJBdChpbmRleCkgOiB2YWx1ZVtpbmRleF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQgKyAnXCInO1xuICAgICAgfTtcblxuICAgICAgLy8gSW50ZXJuYWw6IFJlY3Vyc2l2ZWx5IHNlcmlhbGl6ZXMgYW4gb2JqZWN0LiBJbXBsZW1lbnRzIHRoZVxuICAgICAgLy8gYFN0cihrZXksIGhvbGRlcilgLCBgSk8odmFsdWUpYCwgYW5kIGBKQSh2YWx1ZSlgIG9wZXJhdGlvbnMuXG4gICAgICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24gKHByb3BlcnR5LCBvYmplY3QsIGNhbGxiYWNrLCBwcm9wZXJ0aWVzLCB3aGl0ZXNwYWNlLCBpbmRlbnRhdGlvbiwgc3RhY2spIHtcbiAgICAgICAgdmFyIHZhbHVlLCBjbGFzc05hbWUsIHllYXIsIG1vbnRoLCBkYXRlLCB0aW1lLCBob3VycywgbWludXRlcywgc2Vjb25kcywgbWlsbGlzZWNvbmRzLCByZXN1bHRzLCBlbGVtZW50LCBpbmRleCwgbGVuZ3RoLCBwcmVmaXgsIHJlc3VsdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBOZWNlc3NhcnkgZm9yIGhvc3Qgb2JqZWN0IHN1cHBvcnQuXG4gICAgICAgICAgdmFsdWUgPSBvYmplY3RbcHJvcGVydHldO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHt9XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJvYmplY3RcIiAmJiB2YWx1ZSkge1xuICAgICAgICAgIGNsYXNzTmFtZSA9IGdldENsYXNzLmNhbGwodmFsdWUpO1xuICAgICAgICAgIGlmIChjbGFzc05hbWUgPT0gZGF0ZUNsYXNzICYmICFpc1Byb3BlcnR5LmNhbGwodmFsdWUsIFwidG9KU09OXCIpKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUgPiAtMSAvIDAgJiYgdmFsdWUgPCAxIC8gMCkge1xuICAgICAgICAgICAgICAvLyBEYXRlcyBhcmUgc2VyaWFsaXplZCBhY2NvcmRpbmcgdG8gdGhlIGBEYXRlI3RvSlNPTmAgbWV0aG9kXG4gICAgICAgICAgICAgIC8vIHNwZWNpZmllZCBpbiBFUyA1LjEgc2VjdGlvbiAxNS45LjUuNDQuIFNlZSBzZWN0aW9uIDE1LjkuMS4xNVxuICAgICAgICAgICAgICAvLyBmb3IgdGhlIElTTyA4NjAxIGRhdGUgdGltZSBzdHJpbmcgZm9ybWF0LlxuICAgICAgICAgICAgICBpZiAoZ2V0RGF5KSB7XG4gICAgICAgICAgICAgICAgLy8gTWFudWFsbHkgY29tcHV0ZSB0aGUgeWVhciwgbW9udGgsIGRhdGUsIGhvdXJzLCBtaW51dGVzLFxuICAgICAgICAgICAgICAgIC8vIHNlY29uZHMsIGFuZCBtaWxsaXNlY29uZHMgaWYgdGhlIGBnZXRVVEMqYCBtZXRob2RzIGFyZVxuICAgICAgICAgICAgICAgIC8vIGJ1Z2d5LiBBZGFwdGVkIGZyb20gQFlhZmZsZSdzIGBkYXRlLXNoaW1gIHByb2plY3QuXG4gICAgICAgICAgICAgICAgZGF0ZSA9IGZsb29yKHZhbHVlIC8gODY0ZTUpO1xuICAgICAgICAgICAgICAgIGZvciAoeWVhciA9IGZsb29yKGRhdGUgLyAzNjUuMjQyNSkgKyAxOTcwIC0gMTsgZ2V0RGF5KHllYXIgKyAxLCAwKSA8PSBkYXRlOyB5ZWFyKyspO1xuICAgICAgICAgICAgICAgIGZvciAobW9udGggPSBmbG9vcigoZGF0ZSAtIGdldERheSh5ZWFyLCAwKSkgLyAzMC40Mik7IGdldERheSh5ZWFyLCBtb250aCArIDEpIDw9IGRhdGU7IG1vbnRoKyspO1xuICAgICAgICAgICAgICAgIGRhdGUgPSAxICsgZGF0ZSAtIGdldERheSh5ZWFyLCBtb250aCk7XG4gICAgICAgICAgICAgICAgLy8gVGhlIGB0aW1lYCB2YWx1ZSBzcGVjaWZpZXMgdGhlIHRpbWUgd2l0aGluIHRoZSBkYXkgKHNlZSBFU1xuICAgICAgICAgICAgICAgIC8vIDUuMSBzZWN0aW9uIDE1LjkuMS4yKS4gVGhlIGZvcm11bGEgYChBICUgQiArIEIpICUgQmAgaXMgdXNlZFxuICAgICAgICAgICAgICAgIC8vIHRvIGNvbXB1dGUgYEEgbW9kdWxvIEJgLCBhcyB0aGUgYCVgIG9wZXJhdG9yIGRvZXMgbm90XG4gICAgICAgICAgICAgICAgLy8gY29ycmVzcG9uZCB0byB0aGUgYG1vZHVsb2Agb3BlcmF0aW9uIGZvciBuZWdhdGl2ZSBudW1iZXJzLlxuICAgICAgICAgICAgICAgIHRpbWUgPSAodmFsdWUgJSA4NjRlNSArIDg2NGU1KSAlIDg2NGU1O1xuICAgICAgICAgICAgICAgIC8vIFRoZSBob3VycywgbWludXRlcywgc2Vjb25kcywgYW5kIG1pbGxpc2Vjb25kcyBhcmUgb2J0YWluZWQgYnlcbiAgICAgICAgICAgICAgICAvLyBkZWNvbXBvc2luZyB0aGUgdGltZSB3aXRoaW4gdGhlIGRheS4gU2VlIHNlY3Rpb24gMTUuOS4xLjEwLlxuICAgICAgICAgICAgICAgIGhvdXJzID0gZmxvb3IodGltZSAvIDM2ZTUpICUgMjQ7XG4gICAgICAgICAgICAgICAgbWludXRlcyA9IGZsb29yKHRpbWUgLyA2ZTQpICUgNjA7XG4gICAgICAgICAgICAgICAgc2Vjb25kcyA9IGZsb29yKHRpbWUgLyAxZTMpICUgNjA7XG4gICAgICAgICAgICAgICAgbWlsbGlzZWNvbmRzID0gdGltZSAlIDFlMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB5ZWFyID0gdmFsdWUuZ2V0VVRDRnVsbFllYXIoKTtcbiAgICAgICAgICAgICAgICBtb250aCA9IHZhbHVlLmdldFVUQ01vbnRoKCk7XG4gICAgICAgICAgICAgICAgZGF0ZSA9IHZhbHVlLmdldFVUQ0RhdGUoKTtcbiAgICAgICAgICAgICAgICBob3VycyA9IHZhbHVlLmdldFVUQ0hvdXJzKCk7XG4gICAgICAgICAgICAgICAgbWludXRlcyA9IHZhbHVlLmdldFVUQ01pbnV0ZXMoKTtcbiAgICAgICAgICAgICAgICBzZWNvbmRzID0gdmFsdWUuZ2V0VVRDU2Vjb25kcygpO1xuICAgICAgICAgICAgICAgIG1pbGxpc2Vjb25kcyA9IHZhbHVlLmdldFVUQ01pbGxpc2Vjb25kcygpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIFNlcmlhbGl6ZSBleHRlbmRlZCB5ZWFycyBjb3JyZWN0bHkuXG4gICAgICAgICAgICAgIHZhbHVlID0gKHllYXIgPD0gMCB8fCB5ZWFyID49IDFlNCA/ICh5ZWFyIDwgMCA/IFwiLVwiIDogXCIrXCIpICsgdG9QYWRkZWRTdHJpbmcoNiwgeWVhciA8IDAgPyAteWVhciA6IHllYXIpIDogdG9QYWRkZWRTdHJpbmcoNCwgeWVhcikpICtcbiAgICAgICAgICAgICAgICBcIi1cIiArIHRvUGFkZGVkU3RyaW5nKDIsIG1vbnRoICsgMSkgKyBcIi1cIiArIHRvUGFkZGVkU3RyaW5nKDIsIGRhdGUpICtcbiAgICAgICAgICAgICAgICAvLyBNb250aHMsIGRhdGVzLCBob3VycywgbWludXRlcywgYW5kIHNlY29uZHMgc2hvdWxkIGhhdmUgdHdvXG4gICAgICAgICAgICAgICAgLy8gZGlnaXRzOyBtaWxsaXNlY29uZHMgc2hvdWxkIGhhdmUgdGhyZWUuXG4gICAgICAgICAgICAgICAgXCJUXCIgKyB0b1BhZGRlZFN0cmluZygyLCBob3VycykgKyBcIjpcIiArIHRvUGFkZGVkU3RyaW5nKDIsIG1pbnV0ZXMpICsgXCI6XCIgKyB0b1BhZGRlZFN0cmluZygyLCBzZWNvbmRzKSArXG4gICAgICAgICAgICAgICAgLy8gTWlsbGlzZWNvbmRzIGFyZSBvcHRpb25hbCBpbiBFUyA1LjAsIGJ1dCByZXF1aXJlZCBpbiA1LjEuXG4gICAgICAgICAgICAgICAgXCIuXCIgKyB0b1BhZGRlZFN0cmluZygzLCBtaWxsaXNlY29uZHMpICsgXCJaXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUudG9KU09OID09IFwiZnVuY3Rpb25cIiAmJiAoKGNsYXNzTmFtZSAhPSBudW1iZXJDbGFzcyAmJiBjbGFzc05hbWUgIT0gc3RyaW5nQ2xhc3MgJiYgY2xhc3NOYW1lICE9IGFycmF5Q2xhc3MpIHx8IGlzUHJvcGVydHkuY2FsbCh2YWx1ZSwgXCJ0b0pTT05cIikpKSB7XG4gICAgICAgICAgICAvLyBQcm90b3R5cGUgPD0gMS42LjEgYWRkcyBub24tc3RhbmRhcmQgYHRvSlNPTmAgbWV0aG9kcyB0byB0aGVcbiAgICAgICAgICAgIC8vIGBOdW1iZXJgLCBgU3RyaW5nYCwgYERhdGVgLCBhbmQgYEFycmF5YCBwcm90b3R5cGVzLiBKU09OIDNcbiAgICAgICAgICAgIC8vIGlnbm9yZXMgYWxsIGB0b0pTT05gIG1ldGhvZHMgb24gdGhlc2Ugb2JqZWN0cyB1bmxlc3MgdGhleSBhcmVcbiAgICAgICAgICAgIC8vIGRlZmluZWQgZGlyZWN0bHkgb24gYW4gaW5zdGFuY2UuXG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnRvSlNPTihwcm9wZXJ0eSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgIC8vIElmIGEgcmVwbGFjZW1lbnQgZnVuY3Rpb24gd2FzIHByb3ZpZGVkLCBjYWxsIGl0IHRvIG9idGFpbiB0aGUgdmFsdWVcbiAgICAgICAgICAvLyBmb3Igc2VyaWFsaXphdGlvbi5cbiAgICAgICAgICB2YWx1ZSA9IGNhbGxiYWNrLmNhbGwob2JqZWN0LCBwcm9wZXJ0eSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBcIm51bGxcIjtcbiAgICAgICAgfVxuICAgICAgICBjbGFzc05hbWUgPSBnZXRDbGFzcy5jYWxsKHZhbHVlKTtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PSBib29sZWFuQ2xhc3MpIHtcbiAgICAgICAgICAvLyBCb29sZWFucyBhcmUgcmVwcmVzZW50ZWQgbGl0ZXJhbGx5LlxuICAgICAgICAgIHJldHVybiBcIlwiICsgdmFsdWU7XG4gICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09IG51bWJlckNsYXNzKSB7XG4gICAgICAgICAgLy8gSlNPTiBudW1iZXJzIG11c3QgYmUgZmluaXRlLiBgSW5maW5pdHlgIGFuZCBgTmFOYCBhcmUgc2VyaWFsaXplZCBhc1xuICAgICAgICAgIC8vIGBcIm51bGxcImAuXG4gICAgICAgICAgcmV0dXJuIHZhbHVlID4gLTEgLyAwICYmIHZhbHVlIDwgMSAvIDAgPyBcIlwiICsgdmFsdWUgOiBcIm51bGxcIjtcbiAgICAgICAgfSBlbHNlIGlmIChjbGFzc05hbWUgPT0gc3RyaW5nQ2xhc3MpIHtcbiAgICAgICAgICAvLyBTdHJpbmdzIGFyZSBkb3VibGUtcXVvdGVkIGFuZCBlc2NhcGVkLlxuICAgICAgICAgIHJldHVybiBxdW90ZShcIlwiICsgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFJlY3Vyc2l2ZWx5IHNlcmlhbGl6ZSBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgIC8vIENoZWNrIGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhpcyBpcyBhIGxpbmVhciBzZWFyY2g7IHBlcmZvcm1hbmNlXG4gICAgICAgICAgLy8gaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mIHVuaXF1ZSBuZXN0ZWQgb2JqZWN0cy5cbiAgICAgICAgICBmb3IgKGxlbmd0aCA9IHN0YWNrLmxlbmd0aDsgbGVuZ3RoLS07KSB7XG4gICAgICAgICAgICBpZiAoc3RhY2tbbGVuZ3RoXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgLy8gQ3ljbGljIHN0cnVjdHVyZXMgY2Fubm90IGJlIHNlcmlhbGl6ZWQgYnkgYEpTT04uc3RyaW5naWZ5YC5cbiAgICAgICAgICAgICAgdGhyb3cgVHlwZUVycm9yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEFkZCB0aGUgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICAgICAgICBzdGFjay5wdXNoKHZhbHVlKTtcbiAgICAgICAgICByZXN1bHRzID0gW107XG4gICAgICAgICAgLy8gU2F2ZSB0aGUgY3VycmVudCBpbmRlbnRhdGlvbiBsZXZlbCBhbmQgaW5kZW50IG9uZSBhZGRpdGlvbmFsIGxldmVsLlxuICAgICAgICAgIHByZWZpeCA9IGluZGVudGF0aW9uO1xuICAgICAgICAgIGluZGVudGF0aW9uICs9IHdoaXRlc3BhY2U7XG4gICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PSBhcnJheUNsYXNzKSB7XG4gICAgICAgICAgICAvLyBSZWN1cnNpdmVseSBzZXJpYWxpemUgYXJyYXkgZWxlbWVudHMuXG4gICAgICAgICAgICBmb3IgKGluZGV4ID0gMCwgbGVuZ3RoID0gdmFsdWUubGVuZ3RoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICBlbGVtZW50ID0gc2VyaWFsaXplKGluZGV4LCB2YWx1ZSwgY2FsbGJhY2ssIHByb3BlcnRpZXMsIHdoaXRlc3BhY2UsIGluZGVudGF0aW9uLCBzdGFjayk7XG4gICAgICAgICAgICAgIHJlc3VsdHMucHVzaChlbGVtZW50ID09PSB1bmRlZiA/IFwibnVsbFwiIDogZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHRzLmxlbmd0aCA/ICh3aGl0ZXNwYWNlID8gXCJbXFxuXCIgKyBpbmRlbnRhdGlvbiArIHJlc3VsdHMuam9pbihcIixcXG5cIiArIGluZGVudGF0aW9uKSArIFwiXFxuXCIgKyBwcmVmaXggKyBcIl1cIiA6IChcIltcIiArIHJlc3VsdHMuam9pbihcIixcIikgKyBcIl1cIikpIDogXCJbXVwiO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWN1cnNpdmVseSBzZXJpYWxpemUgb2JqZWN0IG1lbWJlcnMuIE1lbWJlcnMgYXJlIHNlbGVjdGVkIGZyb21cbiAgICAgICAgICAgIC8vIGVpdGhlciBhIHVzZXItc3BlY2lmaWVkIGxpc3Qgb2YgcHJvcGVydHkgbmFtZXMsIG9yIHRoZSBvYmplY3RcbiAgICAgICAgICAgIC8vIGl0c2VsZi5cbiAgICAgICAgICAgIGZvckVhY2gocHJvcGVydGllcyB8fCB2YWx1ZSwgZnVuY3Rpb24gKHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50ID0gc2VyaWFsaXplKHByb3BlcnR5LCB2YWx1ZSwgY2FsbGJhY2ssIHByb3BlcnRpZXMsIHdoaXRlc3BhY2UsIGluZGVudGF0aW9uLCBzdGFjayk7XG4gICAgICAgICAgICAgIGlmIChlbGVtZW50ICE9PSB1bmRlZikge1xuICAgICAgICAgICAgICAgIC8vIEFjY29yZGluZyB0byBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zOiBcIklmIGBnYXBgIHt3aGl0ZXNwYWNlfVxuICAgICAgICAgICAgICAgIC8vIGlzIG5vdCB0aGUgZW1wdHkgc3RyaW5nLCBsZXQgYG1lbWJlcmAge3F1b3RlKHByb3BlcnR5KSArIFwiOlwifVxuICAgICAgICAgICAgICAgIC8vIGJlIHRoZSBjb25jYXRlbmF0aW9uIG9mIGBtZW1iZXJgIGFuZCB0aGUgYHNwYWNlYCBjaGFyYWN0ZXIuXCJcbiAgICAgICAgICAgICAgICAvLyBUaGUgXCJgc3BhY2VgIGNoYXJhY3RlclwiIHJlZmVycyB0byB0aGUgbGl0ZXJhbCBzcGFjZVxuICAgICAgICAgICAgICAgIC8vIGNoYXJhY3Rlciwgbm90IHRoZSBgc3BhY2VgIHt3aWR0aH0gYXJndW1lbnQgcHJvdmlkZWQgdG9cbiAgICAgICAgICAgICAgICAvLyBgSlNPTi5zdHJpbmdpZnlgLlxuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChxdW90ZShwcm9wZXJ0eSkgKyBcIjpcIiArICh3aGl0ZXNwYWNlID8gXCIgXCIgOiBcIlwiKSArIGVsZW1lbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdHMubGVuZ3RoID8gKHdoaXRlc3BhY2UgPyBcIntcXG5cIiArIGluZGVudGF0aW9uICsgcmVzdWx0cy5qb2luKFwiLFxcblwiICsgaW5kZW50YXRpb24pICsgXCJcXG5cIiArIHByZWZpeCArIFwifVwiIDogKFwie1wiICsgcmVzdWx0cy5qb2luKFwiLFwiKSArIFwifVwiKSkgOiBcInt9XCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJlbW92ZSB0aGUgb2JqZWN0IGZyb20gdGhlIHRyYXZlcnNlZCBvYmplY3Qgc3RhY2suXG4gICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gUHVibGljOiBgSlNPTi5zdHJpbmdpZnlgLiBTZWUgRVMgNS4xIHNlY3Rpb24gMTUuMTIuMy5cbiAgICAgIEpTT04zLnN0cmluZ2lmeSA9IGZ1bmN0aW9uIChzb3VyY2UsIGZpbHRlciwgd2lkdGgpIHtcbiAgICAgICAgdmFyIHdoaXRlc3BhY2UsIGNhbGxiYWNrLCBwcm9wZXJ0aWVzLCBjbGFzc05hbWU7XG4gICAgICAgIGlmICh0eXBlb2YgZmlsdGVyID09IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgZmlsdGVyID09IFwib2JqZWN0XCIgJiYgZmlsdGVyKSB7XG4gICAgICAgICAgaWYgKChjbGFzc05hbWUgPSBnZXRDbGFzcy5jYWxsKGZpbHRlcikpID09IGZ1bmN0aW9uQ2xhc3MpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gZmlsdGVyO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09IGFycmF5Q2xhc3MpIHtcbiAgICAgICAgICAgIC8vIENvbnZlcnQgdGhlIHByb3BlcnR5IG5hbWVzIGFycmF5IGludG8gYSBtYWtlc2hpZnQgc2V0LlxuICAgICAgICAgICAgcHJvcGVydGllcyA9IHt9O1xuICAgICAgICAgICAgZm9yICh2YXIgaW5kZXggPSAwLCBsZW5ndGggPSBmaWx0ZXIubGVuZ3RoLCB2YWx1ZTsgaW5kZXggPCBsZW5ndGg7IHZhbHVlID0gZmlsdGVyW2luZGV4KytdLCAoKGNsYXNzTmFtZSA9IGdldENsYXNzLmNhbGwodmFsdWUpKSwgY2xhc3NOYW1lID09IHN0cmluZ0NsYXNzIHx8IGNsYXNzTmFtZSA9PSBudW1iZXJDbGFzcykgJiYgKHByb3BlcnRpZXNbdmFsdWVdID0gMSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAod2lkdGgpIHtcbiAgICAgICAgICBpZiAoKGNsYXNzTmFtZSA9IGdldENsYXNzLmNhbGwod2lkdGgpKSA9PSBudW1iZXJDbGFzcykge1xuICAgICAgICAgICAgLy8gQ29udmVydCB0aGUgYHdpZHRoYCB0byBhbiBpbnRlZ2VyIGFuZCBjcmVhdGUgYSBzdHJpbmcgY29udGFpbmluZ1xuICAgICAgICAgICAgLy8gYHdpZHRoYCBudW1iZXIgb2Ygc3BhY2UgY2hhcmFjdGVycy5cbiAgICAgICAgICAgIGlmICgod2lkdGggLT0gd2lkdGggJSAxKSA+IDApIHtcbiAgICAgICAgICAgICAgZm9yICh3aGl0ZXNwYWNlID0gXCJcIiwgd2lkdGggPiAxMCAmJiAod2lkdGggPSAxMCk7IHdoaXRlc3BhY2UubGVuZ3RoIDwgd2lkdGg7IHdoaXRlc3BhY2UgKz0gXCIgXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09IHN0cmluZ0NsYXNzKSB7XG4gICAgICAgICAgICB3aGl0ZXNwYWNlID0gd2lkdGgubGVuZ3RoIDw9IDEwID8gd2lkdGggOiB3aWR0aC5zbGljZSgwLCAxMCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIE9wZXJhIDw9IDcuNTR1MiBkaXNjYXJkcyB0aGUgdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCBlbXB0eSBzdHJpbmcga2V5c1xuICAgICAgICAvLyAoYFwiXCJgKSBvbmx5IGlmIHRoZXkgYXJlIHVzZWQgZGlyZWN0bHkgd2l0aGluIGFuIG9iamVjdCBtZW1iZXIgbGlzdFxuICAgICAgICAvLyAoZS5nLiwgYCEoXCJcIiBpbiB7IFwiXCI6IDF9KWApLlxuICAgICAgICByZXR1cm4gc2VyaWFsaXplKFwiXCIsICh2YWx1ZSA9IHt9LCB2YWx1ZVtcIlwiXSA9IHNvdXJjZSwgdmFsdWUpLCBjYWxsYmFjaywgcHJvcGVydGllcywgd2hpdGVzcGFjZSwgXCJcIiwgW10pO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQdWJsaWM6IFBhcnNlcyBhIEpTT04gc291cmNlIHN0cmluZy5cbiAgICBpZiAoIWhhcyhcImpzb24tcGFyc2VcIikpIHtcbiAgICAgIHZhciBmcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlO1xuXG4gICAgICAvLyBJbnRlcm5hbDogQSBtYXAgb2YgZXNjYXBlZCBjb250cm9sIGNoYXJhY3RlcnMgYW5kIHRoZWlyIHVuZXNjYXBlZFxuICAgICAgLy8gZXF1aXZhbGVudHMuXG4gICAgICB2YXIgVW5lc2NhcGVzID0ge1xuICAgICAgICA5MjogXCJcXFxcXCIsXG4gICAgICAgIDM0OiAnXCInLFxuICAgICAgICA0NzogXCIvXCIsXG4gICAgICAgIDk4OiBcIlxcYlwiLFxuICAgICAgICAxMTY6IFwiXFx0XCIsXG4gICAgICAgIDExMDogXCJcXG5cIixcbiAgICAgICAgMTAyOiBcIlxcZlwiLFxuICAgICAgICAxMTQ6IFwiXFxyXCJcbiAgICAgIH07XG5cbiAgICAgIC8vIEludGVybmFsOiBTdG9yZXMgdGhlIHBhcnNlciBzdGF0ZS5cbiAgICAgIHZhciBJbmRleCwgU291cmNlO1xuXG4gICAgICAvLyBJbnRlcm5hbDogUmVzZXRzIHRoZSBwYXJzZXIgc3RhdGUgYW5kIHRocm93cyBhIGBTeW50YXhFcnJvcmAuXG4gICAgICB2YXIgYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgSW5kZXggPSBTb3VyY2UgPSBudWxsO1xuICAgICAgICB0aHJvdyBTeW50YXhFcnJvcigpO1xuICAgICAgfTtcblxuICAgICAgLy8gSW50ZXJuYWw6IFJldHVybnMgdGhlIG5leHQgdG9rZW4sIG9yIGBcIiRcImAgaWYgdGhlIHBhcnNlciBoYXMgcmVhY2hlZFxuICAgICAgLy8gdGhlIGVuZCBvZiB0aGUgc291cmNlIHN0cmluZy4gQSB0b2tlbiBtYXkgYmUgYSBzdHJpbmcsIG51bWJlciwgYG51bGxgXG4gICAgICAvLyBsaXRlcmFsLCBvciBCb29sZWFuIGxpdGVyYWwuXG4gICAgICB2YXIgbGV4ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc291cmNlID0gU291cmNlLCBsZW5ndGggPSBzb3VyY2UubGVuZ3RoLCB2YWx1ZSwgYmVnaW4sIHBvc2l0aW9uLCBpc1NpZ25lZCwgY2hhckNvZGU7XG4gICAgICAgIHdoaWxlIChJbmRleCA8IGxlbmd0aCkge1xuICAgICAgICAgIGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQoSW5kZXgpO1xuICAgICAgICAgIHN3aXRjaCAoY2hhckNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgOTogY2FzZSAxMDogY2FzZSAxMzogY2FzZSAzMjpcbiAgICAgICAgICAgICAgLy8gU2tpcCB3aGl0ZXNwYWNlIHRva2VucywgaW5jbHVkaW5nIHRhYnMsIGNhcnJpYWdlIHJldHVybnMsIGxpbmVcbiAgICAgICAgICAgICAgLy8gZmVlZHMsIGFuZCBzcGFjZSBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgICBJbmRleCsrO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMTIzOiBjYXNlIDEyNTogY2FzZSA5MTogY2FzZSA5MzogY2FzZSA1ODogY2FzZSA0NDpcbiAgICAgICAgICAgICAgLy8gUGFyc2UgYSBwdW5jdHVhdG9yIHRva2VuIChge2AsIGB9YCwgYFtgLCBgXWAsIGA6YCwgb3IgYCxgKSBhdFxuICAgICAgICAgICAgICAvLyB0aGUgY3VycmVudCBwb3NpdGlvbi5cbiAgICAgICAgICAgICAgdmFsdWUgPSBjaGFySW5kZXhCdWdneSA/IHNvdXJjZS5jaGFyQXQoSW5kZXgpIDogc291cmNlW0luZGV4XTtcbiAgICAgICAgICAgICAgSW5kZXgrKztcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgY2FzZSAzNDpcbiAgICAgICAgICAgICAgLy8gYFwiYCBkZWxpbWl0cyBhIEpTT04gc3RyaW5nOyBhZHZhbmNlIHRvIHRoZSBuZXh0IGNoYXJhY3RlciBhbmRcbiAgICAgICAgICAgICAgLy8gYmVnaW4gcGFyc2luZyB0aGUgc3RyaW5nLiBTdHJpbmcgdG9rZW5zIGFyZSBwcmVmaXhlZCB3aXRoIHRoZVxuICAgICAgICAgICAgICAvLyBzZW50aW5lbCBgQGAgY2hhcmFjdGVyIHRvIGRpc3Rpbmd1aXNoIHRoZW0gZnJvbSBwdW5jdHVhdG9ycyBhbmRcbiAgICAgICAgICAgICAgLy8gZW5kLW9mLXN0cmluZyB0b2tlbnMuXG4gICAgICAgICAgICAgIGZvciAodmFsdWUgPSBcIkBcIiwgSW5kZXgrKzsgSW5kZXggPCBsZW5ndGg7KSB7XG4gICAgICAgICAgICAgICAgY2hhckNvZGUgPSBzb3VyY2UuY2hhckNvZGVBdChJbmRleCk7XG4gICAgICAgICAgICAgICAgaWYgKGNoYXJDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgICAgICAgIC8vIFVuZXNjYXBlZCBBU0NJSSBjb250cm9sIGNoYXJhY3RlcnMgKHRob3NlIHdpdGggYSBjb2RlIHVuaXRcbiAgICAgICAgICAgICAgICAgIC8vIGxlc3MgdGhhbiB0aGUgc3BhY2UgY2hhcmFjdGVyKSBhcmUgbm90IHBlcm1pdHRlZC5cbiAgICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaGFyQ29kZSA9PSA5Mikge1xuICAgICAgICAgICAgICAgICAgLy8gQSByZXZlcnNlIHNvbGlkdXMgKGBcXGApIG1hcmtzIHRoZSBiZWdpbm5pbmcgb2YgYW4gZXNjYXBlZFxuICAgICAgICAgICAgICAgICAgLy8gY29udHJvbCBjaGFyYWN0ZXIgKGluY2x1ZGluZyBgXCJgLCBgXFxgLCBhbmQgYC9gKSBvciBVbmljb2RlXG4gICAgICAgICAgICAgICAgICAvLyBlc2NhcGUgc2VxdWVuY2UuXG4gICAgICAgICAgICAgICAgICBjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KCsrSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgc3dpdGNoIChjaGFyQ29kZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDkyOiBjYXNlIDM0OiBjYXNlIDQ3OiBjYXNlIDk4OiBjYXNlIDExNjogY2FzZSAxMTA6IGNhc2UgMTAyOiBjYXNlIDExNDpcbiAgICAgICAgICAgICAgICAgICAgICAvLyBSZXZpdmUgZXNjYXBlZCBjb250cm9sIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gVW5lc2NhcGVzW2NoYXJDb2RlXTtcbiAgICAgICAgICAgICAgICAgICAgICBJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIDExNzpcbiAgICAgICAgICAgICAgICAgICAgICAvLyBgXFx1YCBtYXJrcyB0aGUgYmVnaW5uaW5nIG9mIGEgVW5pY29kZSBlc2NhcGUgc2VxdWVuY2UuXG4gICAgICAgICAgICAgICAgICAgICAgLy8gQWR2YW5jZSB0byB0aGUgZmlyc3QgY2hhcmFjdGVyIGFuZCB2YWxpZGF0ZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAvLyBmb3VyLWRpZ2l0IGNvZGUgcG9pbnQuXG4gICAgICAgICAgICAgICAgICAgICAgYmVnaW4gPSArK0luZGV4O1xuICAgICAgICAgICAgICAgICAgICAgIGZvciAocG9zaXRpb24gPSBJbmRleCArIDQ7IEluZGV4IDwgcG9zaXRpb247IEluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQoSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQSB2YWxpZCBzZXF1ZW5jZSBjb21wcmlzZXMgZm91ciBoZXhkaWdpdHMgKGNhc2UtXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbnNlbnNpdGl2ZSkgdGhhdCBmb3JtIGEgc2luZ2xlIGhleGFkZWNpbWFsIHZhbHVlLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEoY2hhckNvZGUgPj0gNDggJiYgY2hhckNvZGUgPD0gNTcgfHwgY2hhckNvZGUgPj0gOTcgJiYgY2hhckNvZGUgPD0gMTAyIHx8IGNoYXJDb2RlID49IDY1ICYmIGNoYXJDb2RlIDw9IDcwKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJbnZhbGlkIFVuaWNvZGUgZXNjYXBlIHNlcXVlbmNlLlxuICAgICAgICAgICAgICAgICAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAvLyBSZXZpdmUgdGhlIGVzY2FwZWQgY2hhcmFjdGVyLlxuICAgICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IGZyb21DaGFyQ29kZShcIjB4XCIgKyBzb3VyY2Uuc2xpY2UoYmVnaW4sIEluZGV4KSk7XG4gICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCBlc2NhcGUgc2VxdWVuY2UuXG4gICAgICAgICAgICAgICAgICAgICAgYWJvcnQoKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgaWYgKGNoYXJDb2RlID09IDM0KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFuIHVuZXNjYXBlZCBkb3VibGUtcXVvdGUgY2hhcmFjdGVyIG1hcmtzIHRoZSBlbmQgb2YgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIHN0cmluZy5cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KEluZGV4KTtcbiAgICAgICAgICAgICAgICAgIGJlZ2luID0gSW5kZXg7XG4gICAgICAgICAgICAgICAgICAvLyBPcHRpbWl6ZSBmb3IgdGhlIGNvbW1vbiBjYXNlIHdoZXJlIGEgc3RyaW5nIGlzIHZhbGlkLlxuICAgICAgICAgICAgICAgICAgd2hpbGUgKGNoYXJDb2RlID49IDMyICYmIGNoYXJDb2RlICE9IDkyICYmIGNoYXJDb2RlICE9IDM0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQoKytJbmRleCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAvLyBBcHBlbmQgdGhlIHN0cmluZyBhcy1pcy5cbiAgICAgICAgICAgICAgICAgIHZhbHVlICs9IHNvdXJjZS5zbGljZShiZWdpbiwgSW5kZXgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoc291cmNlLmNoYXJDb2RlQXQoSW5kZXgpID09IDM0KSB7XG4gICAgICAgICAgICAgICAgLy8gQWR2YW5jZSB0byB0aGUgbmV4dCBjaGFyYWN0ZXIgYW5kIHJldHVybiB0aGUgcmV2aXZlZCBzdHJpbmcuXG4gICAgICAgICAgICAgICAgSW5kZXgrKztcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gVW50ZXJtaW5hdGVkIHN0cmluZy5cbiAgICAgICAgICAgICAgYWJvcnQoKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIC8vIFBhcnNlIG51bWJlcnMgYW5kIGxpdGVyYWxzLlxuICAgICAgICAgICAgICBiZWdpbiA9IEluZGV4O1xuICAgICAgICAgICAgICAvLyBBZHZhbmNlIHBhc3QgdGhlIG5lZ2F0aXZlIHNpZ24sIGlmIG9uZSBpcyBzcGVjaWZpZWQuXG4gICAgICAgICAgICAgIGlmIChjaGFyQ29kZSA9PSA0NSkge1xuICAgICAgICAgICAgICAgIGlzU2lnbmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KCsrSW5kZXgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIFBhcnNlIGFuIGludGVnZXIgb3IgZmxvYXRpbmctcG9pbnQgdmFsdWUuXG4gICAgICAgICAgICAgIGlmIChjaGFyQ29kZSA+PSA0OCAmJiBjaGFyQ29kZSA8PSA1Nykge1xuICAgICAgICAgICAgICAgIC8vIExlYWRpbmcgemVyb2VzIGFyZSBpbnRlcnByZXRlZCBhcyBvY3RhbCBsaXRlcmFscy5cbiAgICAgICAgICAgICAgICBpZiAoY2hhckNvZGUgPT0gNDggJiYgKChjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KEluZGV4ICsgMSkpLCBjaGFyQ29kZSA+PSA0OCAmJiBjaGFyQ29kZSA8PSA1NykpIHtcbiAgICAgICAgICAgICAgICAgIC8vIElsbGVnYWwgb2N0YWwgbGl0ZXJhbC5cbiAgICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlzU2lnbmVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgLy8gUGFyc2UgdGhlIGludGVnZXIgY29tcG9uZW50LlxuICAgICAgICAgICAgICAgIGZvciAoOyBJbmRleCA8IGxlbmd0aCAmJiAoKGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQoSW5kZXgpKSwgY2hhckNvZGUgPj0gNDggJiYgY2hhckNvZGUgPD0gNTcpOyBJbmRleCsrKTtcbiAgICAgICAgICAgICAgICAvLyBGbG9hdHMgY2Fubm90IGNvbnRhaW4gYSBsZWFkaW5nIGRlY2ltYWwgcG9pbnQ7IGhvd2V2ZXIsIHRoaXNcbiAgICAgICAgICAgICAgICAvLyBjYXNlIGlzIGFscmVhZHkgYWNjb3VudGVkIGZvciBieSB0aGUgcGFyc2VyLlxuICAgICAgICAgICAgICAgIGlmIChzb3VyY2UuY2hhckNvZGVBdChJbmRleCkgPT0gNDYpIHtcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uID0gKytJbmRleDtcbiAgICAgICAgICAgICAgICAgIC8vIFBhcnNlIHRoZSBkZWNpbWFsIGNvbXBvbmVudC5cbiAgICAgICAgICAgICAgICAgIGZvciAoOyBwb3NpdGlvbiA8IGxlbmd0aCAmJiAoKGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQocG9zaXRpb24pKSwgY2hhckNvZGUgPj0gNDggJiYgY2hhckNvZGUgPD0gNTcpOyBwb3NpdGlvbisrKTtcbiAgICAgICAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PSBJbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbGxlZ2FsIHRyYWlsaW5nIGRlY2ltYWwuXG4gICAgICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBJbmRleCA9IHBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBQYXJzZSBleHBvbmVudHMuIFRoZSBgZWAgZGVub3RpbmcgdGhlIGV4cG9uZW50IGlzXG4gICAgICAgICAgICAgICAgLy8gY2FzZS1pbnNlbnNpdGl2ZS5cbiAgICAgICAgICAgICAgICBjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KEluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAoY2hhckNvZGUgPT0gMTAxIHx8IGNoYXJDb2RlID09IDY5KSB7XG4gICAgICAgICAgICAgICAgICBjaGFyQ29kZSA9IHNvdXJjZS5jaGFyQ29kZUF0KCsrSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgLy8gU2tpcCBwYXN0IHRoZSBzaWduIGZvbGxvd2luZyB0aGUgZXhwb25lbnQsIGlmIG9uZSBpc1xuICAgICAgICAgICAgICAgICAgLy8gc3BlY2lmaWVkLlxuICAgICAgICAgICAgICAgICAgaWYgKGNoYXJDb2RlID09IDQzIHx8IGNoYXJDb2RlID09IDQ1KSB7XG4gICAgICAgICAgICAgICAgICAgIEluZGV4Kys7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAvLyBQYXJzZSB0aGUgZXhwb25lbnRpYWwgY29tcG9uZW50LlxuICAgICAgICAgICAgICAgICAgZm9yIChwb3NpdGlvbiA9IEluZGV4OyBwb3NpdGlvbiA8IGxlbmd0aCAmJiAoKGNoYXJDb2RlID0gc291cmNlLmNoYXJDb2RlQXQocG9zaXRpb24pKSwgY2hhckNvZGUgPj0gNDggJiYgY2hhckNvZGUgPD0gNTcpOyBwb3NpdGlvbisrKTtcbiAgICAgICAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PSBJbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbGxlZ2FsIGVtcHR5IGV4cG9uZW50LlxuICAgICAgICAgICAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgSW5kZXggPSBwb3NpdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gQ29lcmNlIHRoZSBwYXJzZWQgdmFsdWUgdG8gYSBKYXZhU2NyaXB0IG51bWJlci5cbiAgICAgICAgICAgICAgICByZXR1cm4gK3NvdXJjZS5zbGljZShiZWdpbiwgSW5kZXgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIEEgbmVnYXRpdmUgc2lnbiBtYXkgb25seSBwcmVjZWRlIG51bWJlcnMuXG4gICAgICAgICAgICAgIGlmIChpc1NpZ25lZCkge1xuICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gYHRydWVgLCBgZmFsc2VgLCBhbmQgYG51bGxgIGxpdGVyYWxzLlxuICAgICAgICAgICAgICBpZiAoc291cmNlLnNsaWNlKEluZGV4LCBJbmRleCArIDQpID09IFwidHJ1ZVwiKSB7XG4gICAgICAgICAgICAgICAgSW5kZXggKz0gNDtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChzb3VyY2Uuc2xpY2UoSW5kZXgsIEluZGV4ICsgNSkgPT0gXCJmYWxzZVwiKSB7XG4gICAgICAgICAgICAgICAgSW5kZXggKz0gNTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoc291cmNlLnNsaWNlKEluZGV4LCBJbmRleCArIDQpID09IFwibnVsbFwiKSB7XG4gICAgICAgICAgICAgICAgSW5kZXggKz0gNDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyBVbnJlY29nbml6ZWQgdG9rZW4uXG4gICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFJldHVybiB0aGUgc2VudGluZWwgYCRgIGNoYXJhY3RlciBpZiB0aGUgcGFyc2VyIGhhcyByZWFjaGVkIHRoZSBlbmRcbiAgICAgICAgLy8gb2YgdGhlIHNvdXJjZSBzdHJpbmcuXG4gICAgICAgIHJldHVybiBcIiRcIjtcbiAgICAgIH07XG5cbiAgICAgIC8vIEludGVybmFsOiBQYXJzZXMgYSBKU09OIGB2YWx1ZWAgdG9rZW4uXG4gICAgICB2YXIgZ2V0ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciByZXN1bHRzLCBoYXNNZW1iZXJzO1xuICAgICAgICBpZiAodmFsdWUgPT0gXCIkXCIpIHtcbiAgICAgICAgICAvLyBVbmV4cGVjdGVkIGVuZCBvZiBpbnB1dC5cbiAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgIGlmICgoY2hhckluZGV4QnVnZ3kgPyB2YWx1ZS5jaGFyQXQoMCkgOiB2YWx1ZVswXSkgPT0gXCJAXCIpIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgc2VudGluZWwgYEBgIGNoYXJhY3Rlci5cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5zbGljZSgxKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gUGFyc2Ugb2JqZWN0IGFuZCBhcnJheSBsaXRlcmFscy5cbiAgICAgICAgICBpZiAodmFsdWUgPT0gXCJbXCIpIHtcbiAgICAgICAgICAgIC8vIFBhcnNlcyBhIEpTT04gYXJyYXksIHJldHVybmluZyBhIG5ldyBKYXZhU2NyaXB0IGFycmF5LlxuICAgICAgICAgICAgcmVzdWx0cyA9IFtdO1xuICAgICAgICAgICAgZm9yICg7OyBoYXNNZW1iZXJzIHx8IChoYXNNZW1iZXJzID0gdHJ1ZSkpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBsZXgoKTtcbiAgICAgICAgICAgICAgLy8gQSBjbG9zaW5nIHNxdWFyZSBicmFja2V0IG1hcmtzIHRoZSBlbmQgb2YgdGhlIGFycmF5IGxpdGVyYWwuXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PSBcIl1cIikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBhcnJheSBsaXRlcmFsIGNvbnRhaW5zIGVsZW1lbnRzLCB0aGUgY3VycmVudCB0b2tlblxuICAgICAgICAgICAgICAvLyBzaG91bGQgYmUgYSBjb21tYSBzZXBhcmF0aW5nIHRoZSBwcmV2aW91cyBlbGVtZW50IGZyb20gdGhlXG4gICAgICAgICAgICAgIC8vIG5leHQuXG4gICAgICAgICAgICAgIGlmIChoYXNNZW1iZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZSA9IGxleCgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlID09IFwiXVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVuZXhwZWN0ZWQgdHJhaWxpbmcgYCxgIGluIGFycmF5IGxpdGVyYWwuXG4gICAgICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIC8vIEEgYCxgIG11c3Qgc2VwYXJhdGUgZWFjaCBhcnJheSBlbGVtZW50LlxuICAgICAgICAgICAgICAgICAgYWJvcnQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gRWxpc2lvbnMgYW5kIGxlYWRpbmcgY29tbWFzIGFyZSBub3QgcGVybWl0dGVkLlxuICAgICAgICAgICAgICBpZiAodmFsdWUgPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3VsdHMucHVzaChnZXQodmFsdWUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT0gXCJ7XCIpIHtcbiAgICAgICAgICAgIC8vIFBhcnNlcyBhIEpTT04gb2JqZWN0LCByZXR1cm5pbmcgYSBuZXcgSmF2YVNjcmlwdCBvYmplY3QuXG4gICAgICAgICAgICByZXN1bHRzID0ge307XG4gICAgICAgICAgICBmb3IgKDs7IGhhc01lbWJlcnMgfHwgKGhhc01lbWJlcnMgPSB0cnVlKSkge1xuICAgICAgICAgICAgICB2YWx1ZSA9IGxleCgpO1xuICAgICAgICAgICAgICAvLyBBIGNsb3NpbmcgY3VybHkgYnJhY2UgbWFya3MgdGhlIGVuZCBvZiB0aGUgb2JqZWN0IGxpdGVyYWwuXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PSBcIn1cIikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBvYmplY3QgbGl0ZXJhbCBjb250YWlucyBtZW1iZXJzLCB0aGUgY3VycmVudCB0b2tlblxuICAgICAgICAgICAgICAvLyBzaG91bGQgYmUgYSBjb21tYSBzZXBhcmF0b3IuXG4gICAgICAgICAgICAgIGlmIChoYXNNZW1iZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZSA9IGxleCgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlID09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVuZXhwZWN0ZWQgdHJhaWxpbmcgYCxgIGluIG9iamVjdCBsaXRlcmFsLlxuICAgICAgICAgICAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAvLyBBIGAsYCBtdXN0IHNlcGFyYXRlIGVhY2ggb2JqZWN0IG1lbWJlci5cbiAgICAgICAgICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIExlYWRpbmcgY29tbWFzIGFyZSBub3QgcGVybWl0dGVkLCBvYmplY3QgcHJvcGVydHkgbmFtZXMgbXVzdCBiZVxuICAgICAgICAgICAgICAvLyBkb3VibGUtcXVvdGVkIHN0cmluZ3MsIGFuZCBhIGA6YCBtdXN0IHNlcGFyYXRlIGVhY2ggcHJvcGVydHlcbiAgICAgICAgICAgICAgLy8gbmFtZSBhbmQgdmFsdWUuXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PSBcIixcIiB8fCB0eXBlb2YgdmFsdWUgIT0gXCJzdHJpbmdcIiB8fCAoY2hhckluZGV4QnVnZ3kgPyB2YWx1ZS5jaGFyQXQoMCkgOiB2YWx1ZVswXSkgIT0gXCJAXCIgfHwgbGV4KCkgIT0gXCI6XCIpIHtcbiAgICAgICAgICAgICAgICBhYm9ydCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3VsdHNbdmFsdWUuc2xpY2UoMSldID0gZ2V0KGxleCgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBVbmV4cGVjdGVkIHRva2VuIGVuY291bnRlcmVkLlxuICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfTtcblxuICAgICAgLy8gSW50ZXJuYWw6IFVwZGF0ZXMgYSB0cmF2ZXJzZWQgb2JqZWN0IG1lbWJlci5cbiAgICAgIHZhciB1cGRhdGUgPSBmdW5jdGlvbihzb3VyY2UsIHByb3BlcnR5LCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZWxlbWVudCA9IHdhbGsoc291cmNlLCBwcm9wZXJ0eSwgY2FsbGJhY2spO1xuICAgICAgICBpZiAoZWxlbWVudCA9PT0gdW5kZWYpIHtcbiAgICAgICAgICBkZWxldGUgc291cmNlW3Byb3BlcnR5XTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzb3VyY2VbcHJvcGVydHldID0gZWxlbWVudDtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gSW50ZXJuYWw6IFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBhIHBhcnNlZCBKU09OIG9iamVjdCwgaW52b2tpbmcgdGhlXG4gICAgICAvLyBgY2FsbGJhY2tgIGZ1bmN0aW9uIGZvciBlYWNoIHZhbHVlLiBUaGlzIGlzIGFuIGltcGxlbWVudGF0aW9uIG9mIHRoZVxuICAgICAgLy8gYFdhbGsoaG9sZGVyLCBuYW1lKWAgb3BlcmF0aW9uIGRlZmluZWQgaW4gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMi5cbiAgICAgIHZhciB3YWxrID0gZnVuY3Rpb24gKHNvdXJjZSwgcHJvcGVydHksIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IHNvdXJjZVtwcm9wZXJ0eV0sIGxlbmd0aDtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PSBcIm9iamVjdFwiICYmIHZhbHVlKSB7XG4gICAgICAgICAgLy8gYGZvckVhY2hgIGNhbid0IGJlIHVzZWQgdG8gdHJhdmVyc2UgYW4gYXJyYXkgaW4gT3BlcmEgPD0gOC41NFxuICAgICAgICAgIC8vIGJlY2F1c2UgaXRzIGBPYmplY3QjaGFzT3duUHJvcGVydHlgIGltcGxlbWVudGF0aW9uIHJldHVybnMgYGZhbHNlYFxuICAgICAgICAgIC8vIGZvciBhcnJheSBpbmRpY2VzIChlLmcuLCBgIVsxLCAyLCAzXS5oYXNPd25Qcm9wZXJ0eShcIjBcIilgKS5cbiAgICAgICAgICBpZiAoZ2V0Q2xhc3MuY2FsbCh2YWx1ZSkgPT0gYXJyYXlDbGFzcykge1xuICAgICAgICAgICAgZm9yIChsZW5ndGggPSB2YWx1ZS5sZW5ndGg7IGxlbmd0aC0tOykge1xuICAgICAgICAgICAgICB1cGRhdGUodmFsdWUsIGxlbmd0aCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3JFYWNoKHZhbHVlLCBmdW5jdGlvbiAocHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgdXBkYXRlKHZhbHVlLCBwcm9wZXJ0eSwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHNvdXJjZSwgcHJvcGVydHksIHZhbHVlKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFB1YmxpYzogYEpTT04ucGFyc2VgLiBTZWUgRVMgNS4xIHNlY3Rpb24gMTUuMTIuMi5cbiAgICAgIEpTT04zLnBhcnNlID0gZnVuY3Rpb24gKHNvdXJjZSwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJlc3VsdCwgdmFsdWU7XG4gICAgICAgIEluZGV4ID0gMDtcbiAgICAgICAgU291cmNlID0gXCJcIiArIHNvdXJjZTtcbiAgICAgICAgcmVzdWx0ID0gZ2V0KGxleCgpKTtcbiAgICAgICAgLy8gSWYgYSBKU09OIHN0cmluZyBjb250YWlucyBtdWx0aXBsZSB0b2tlbnMsIGl0IGlzIGludmFsaWQuXG4gICAgICAgIGlmIChsZXgoKSAhPSBcIiRcIikge1xuICAgICAgICAgIGFib3J0KCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gUmVzZXQgdGhlIHBhcnNlciBzdGF0ZS5cbiAgICAgICAgSW5kZXggPSBTb3VyY2UgPSBudWxsO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sgJiYgZ2V0Q2xhc3MuY2FsbChjYWxsYmFjaykgPT0gZnVuY3Rpb25DbGFzcyA/IHdhbGsoKHZhbHVlID0ge30sIHZhbHVlW1wiXCJdID0gcmVzdWx0LCB2YWx1ZSksIFwiXCIsIGNhbGxiYWNrKSA6IHJlc3VsdDtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLy8gRXhwb3J0IGZvciBhc3luY2hyb25vdXMgbW9kdWxlIGxvYWRlcnMuXG4gIGlmIChpc0xvYWRlcikge1xuICAgIGRlZmluZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gSlNPTjM7XG4gICAgfSk7XG4gIH1cbn0odGhpcykpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB0b0FycmF5XG5cbmZ1bmN0aW9uIHRvQXJyYXkobGlzdCwgaW5kZXgpIHtcbiAgICB2YXIgYXJyYXkgPSBbXVxuXG4gICAgaW5kZXggPSBpbmRleCB8fCAwXG5cbiAgICBmb3IgKHZhciBpID0gaW5kZXggfHwgMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaSAtIGluZGV4XSA9IGxpc3RbaV1cbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXlcbn1cbiIsIihmdW5jdGlvbihnbG9iYWwsIF9tYWluLCBtb2R1bGVEZWZzLCBjYWNoZWRNb2R1bGVzLCBfZW50cmllcykge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIG1vZHVsZU1ldGEgPSB7XCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbGliXFxcXGhhcy5qc1wiOntcImluZGV4XCI6NCxcImhhc2hcIjpcIkhreTRRWVZyVTEra0ZISUV1eFB5XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGxpYlxcXFxzdHItc2V0LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcaW5jXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZGVidWdcXFxcZGVidWcuanNcIjp7XCJpbmRleFwiOjgzLFwiaGFzaFwiOlwiT3RqbVNtRWJJVS84b3JKd0ZoRFRcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXHVybC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxpbmRleC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxtYW5hZ2VyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxsaWJcXFxcc3RyLXNldC5qc1wiOntcImluZGV4XCI6NSxcImhhc2hcIjpcImxjckRtUUs0dWFxT3FOK0ZWNC85XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxhcnJheVNvbWUuanNcIjp7XCJpbmRleFwiOjE2LFwiaGFzaFwiOlwiR3hlSlB4SmoyalVnNVR6VjVnTHZcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxlcXVhbEFycmF5cy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxzb21lLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGFycmF5RmlsdGVyLmpzXCI6e1wiaW5kZXhcIjoxNCxcImhhc2hcIjpcIkJHdW56MHcxUXpKWHlxUVNPZFpiXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmaWx0ZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYXJyYXlFYWNoLmpzXCI6e1wiaW5kZXhcIjoxMyxcImhhc2hcIjpcImVMeFVCVnNiOHZwRmJ1MFZONEtMXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmb3JFYWNoLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGFycmF5TWFwLmpzXCI6e1wiaW5kZXhcIjoxNSxcImhhc2hcIjpcInhkcjhjMEpzVUZhcElIVHVNNVZFXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxtYXAuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxwYXJzZXVyaVxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTE1LFwiaGFzaFwiOlwiUHNQb3U5eTV5S21QTVBKbmpFa3pcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXHVybC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXHVybC5qc1wiOntcImluZGV4XCI6NzksXCJoYXNoXCI6XCJqSVNmZzA2Q2FlYnA0YVZaMUVreFwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcbWFuYWdlci5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXG9uLmpzXCI6e1wiaW5kZXhcIjo3NyxcImhhc2hcIjpcInk1TU9vRnBUS0tCSHdFOHE4amFlXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcbWFuYWdlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGNvbXBvbmVudC1lbWl0dGVyXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjo4MixcImhhc2hcIjpcIjB1TDFMU2EvbU9qK0xsdStIVFo3XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxpbmRleC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxwb2xsaW5nLXhoci5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcbWFuYWdlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGNvbXBvbmVudC1iaW5kXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjo4MSxcImhhc2hcIjpcIjR5SWNWdythZndVc25UUXlJMGEzXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcbWFuYWdlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXHRvLWFycmF5XFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjoxMjEsXCJoYXNoXCI6XCIyRW9nZ2FmeFgrR0xYa1hpYUdqbVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcc29ja2V0LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxpcy1idWZmZXIuanNcIjp7XCJpbmRleFwiOjExOCxcImhhc2hcIjpcIlRnbUFpUzFNNmRRZTA0emtzRHY0XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tcGFyc2VyXFxcXGJpbmFyeS5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tcGFyc2VyXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxub2RlX21vZHVsZXNcXFxcaXNhcnJheVxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTE5LFwiaGFzaFwiOlwiZEt0ZXdzMVM0c0h2YVpoWitjZXFcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1wYXJzZXJcXFxcYmluYXJ5LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1wYXJzZXJcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tcGFyc2VyXFxcXG5vZGVfbW9kdWxlc1xcXFxqc29uM1xcXFxsaWJcXFxcanNvbjMuanNcIjp7XCJpbmRleFwiOjEyMCxcImhhc2hcIjpcIloyMlRBcXo5SFNEU3VRSDUzNVpPXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tcGFyc2VyXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcb2JqZWN0LWNvbXBvbmVudFxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTE0LFwiaGFzaFwiOlwiek9ZeWJ4bC9EN0tzdGVIL3hKeWtcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXG1hbmFnZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxpbmRleG9mXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjoxMTMsXCJoYXNoXCI6XCI4ek1HVjBqMElENWJVSWVUN3IrTVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcc29ja2V0LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXG1hbmFnZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxiYWNrbzJcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjgwLFwiaGFzaFwiOlwiTDVyeTNtZlZFdzF3Z214OVNhK3FcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXG1hbmFnZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNMZW5ndGguanNcIjp7XCJpbmRleFwiOjU0LFwiaGFzaFwiOlwiREZJS0kxMjFWemVFK3BCYngxT2FcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVCYXNlRWFjaC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNBcnJheUxpa2UuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNBcnJheS5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcb2JqZWN0XFxcXGtleXNJbi5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcc2hpbUtleXMuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNUeXBlZEFycmF5LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGlzT2JqZWN0TGlrZS5qc1wiOntcImluZGV4XCI6NTUsXCJoYXNoXCI6XCJxRUduQVdKTm9BZXRPSUo3WUtpVlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNOYXRpdmUuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNBcnJheS5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc0FyZ3VtZW50cy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc1R5cGVkQXJyYXkuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc0VxdWFsLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGNyZWF0ZU9iamVjdE1hcHBlci5qc1wiOntcImluZGV4XCI6NDMsXCJoYXNoXCI6XCJjcDhzK1o2a2hpS2RLNVFDUStNc1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxtYXBWYWx1ZXMuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUNhbGxiYWNrLmpzXCI6e1wiaW5kZXhcIjoxOSxcImhhc2hcIjpcIkZERW14b2gxY1hZL2hkZGdQTkdXXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlT2JqZWN0TWFwcGVyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxjb2xsZWN0aW9uXFxcXGZpbHRlci5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxtYXAuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcc29tZS5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRm9yT3duLmpzXCI6e1wiaW5kZXhcIjoyNCxcImhhc2hcIjpcInNPTG1ISDJPb3NtZVc5MllhTEsvXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlT2JqZWN0TWFwcGVyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRWFjaC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcb2JqZWN0XFxcXGZvck93bi5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxcbWFwVmFsdWVzLmpzXCI6e1wiaW5kZXhcIjo3MCxcImhhc2hcIjpcIjJIZkFtVnVhVkdmYzhwZDV6SWFDXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFx1dGlsaXR5XFxcXGlkZW50aXR5LmpzXCI6e1wiaW5kZXhcIjo3MixcImhhc2hcIjpcIkEvY3o1TzRubmhvMngyZTVLSVdTXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmluZENhbGxiYWNrLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlQ2FsbGJhY2suanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZVNvbWUuanNcIjp7XCJpbmRleFwiOjM1LFwiaGFzaFwiOlwibENXNUF0SG45WDJ2U3VQZ1M4cGtcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxjb2xsZWN0aW9uXFxcXHNvbWUuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUVhY2guanNcIjp7XCJpbmRleFwiOjIxLFwiaGFzaFwiOlwiSmk3TkxDSmhkelNCbHBESStxQzNcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlU29tZS5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUZpbHRlci5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hcC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmb3JFYWNoLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNPYmplY3QuanNcIjp7XCJpbmRleFwiOjY0LFwiaGFzaFwiOlwiR28rZFRMRnFPMUtKTit1UUxiOHNcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFx0b09iamVjdC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNTdHJpY3RDb21wYXJhYmxlLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxpc0l0ZXJhdGVlQ2FsbC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc0Z1bmN0aW9uLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxca2V5c0luLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxca2V5cy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUlzRXF1YWwuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNJbmRleC5qc1wiOntcImluZGV4XCI6NTEsXCJoYXNoXCI6XCJJOHk1QXNqTC9sd0RsT1JET3FxTVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGlzSXRlcmF0ZWVDYWxsLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxca2V5c0luLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxzaGltS2V5cy5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRmlsdGVyLmpzXCI6e1wiaW5kZXhcIjoyMixcImhhc2hcIjpcInl5dlFhZzRodzhzSXRCRmYzLzlUXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmaWx0ZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmaWx0ZXIuanNcIjp7XCJpbmRleFwiOjgsXCJoYXNoXCI6XCJYdFU1empDcVNEbFljd09MVUMxM1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxpbmNcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc0FycmF5LmpzXCI6e1wiaW5kZXhcIjo2MSxcImhhc2hcIjpcInJwTWlFMVoxOTkvWFpDam5vNEtOXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmaWx0ZXIuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGNyZWF0ZUZvckVhY2guanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcbWFwLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxpc0tleS5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcdG9QYXRoLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxhcnJheVxcXFx6aXBPYmplY3QuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzSW4uanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXHNoaW1LZXlzLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlSXNFcXVhbERlZXAuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcc29tZS5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVGb3JFYWNoLmpzXCI6e1wiaW5kZXhcIjo0MSxcImhhc2hcIjpcImlKdFdCQ3p4K2J6elNMd2xhYVJ2XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcY29sbGVjdGlvblxcXFxmb3JFYWNoLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJpbmRDYWxsYmFjay5qc1wiOntcImluZGV4XCI6MzcsXCJoYXNoXCI6XCJTNml5MUkrNTNJRXpETFNHdVcwalwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGNyZWF0ZUZvckVhY2guanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGNyZWF0ZUZvck93bi5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlQXNzaWduZXIuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VDYWxsYmFjay5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVGb3JPd24uanNcIjp7XCJpbmRleFwiOjQyLFwiaGFzaFwiOlwiS0pxaWpqdkpPN2QxblUxN1N6M2NcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxcZm9yT3duLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGFzc2lnbldpdGguanNcIjp7XCJpbmRleFwiOjE3LFwiaGFzaFwiOlwiYUtCS3lmSUtxWnNOT0hBYkpUQUlcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxcYXNzaWduLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzLmpzXCI6e1wiaW5kZXhcIjo2OCxcImhhc2hcIjpcIkJiWEdOSWNmYXRTcDMydVdPQkFWXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYXNzaWduV2l0aC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUFzc2lnbi5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcb2JqZWN0XFxcXHBhaXJzLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRm9yT3duLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxlcXVhbE9iamVjdHMuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcZnVuY3Rpb25cXFxccmVzdFBhcmFtLmpzXCI6e1wiaW5kZXhcIjoxMixcImhhc2hcIjpcIi9SUkg5TUN0akFycjFwM1FlaDYzXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlQXNzaWduZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlQXNzaWduZXIuanNcIjp7XCJpbmRleFwiOjM4LFwiaGFzaFwiOlwiWDhSODFqdlJDb2ZZMUJuRytBL0xcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxcYXNzaWduLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGlzSXRlcmF0ZWVDYWxsLmpzXCI6e1wiaW5kZXhcIjo1MixcImhhc2hcIjpcImRYTW5OUmV2QWl6T0Jpc0tDRWVzXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlQXNzaWduZXIuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcc29tZS5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlQ29weS5qc1wiOntcImluZGV4XCI6MjAsXCJoYXNoXCI6XCJXdkdpOEl5d002dTdaTlh2enR3Z1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VBc3NpZ24uanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUFzc2lnbi5qc1wiOntcImluZGV4XCI6MTgsXCJoYXNoXCI6XCI2Vlg4N1lvZU5nRHZNVXlpQWMvN1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxhc3NpZ24uanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcb2JqZWN0XFxcXGFzc2lnbi5qc1wiOntcImluZGV4XCI6NjYsXCJoYXNoXCI6XCI5V09oSkJSRWw4QU85SHM2Q3IrUVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxpbmNcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hcC5qc1wiOntcImluZGV4XCI6MjksXCJoYXNoXCI6XCJvZnYyakNFNVFsYWhweW5HNHJrTlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcbWFwLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGlzQXJyYXlMaWtlLmpzXCI6e1wiaW5kZXhcIjo1MCxcImhhc2hcIjpcIjc2QXd0aHo4Q2hUZ2pHazBKWjZZXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hcC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNJdGVyYXRlZUNhbGwuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNBcmd1bWVudHMuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcbWFwLmpzXCI6e1wiaW5kZXhcIjoxMCxcImhhc2hcIjpcIjYzbjV4OEdUaVdQdXhpWnptOVRNXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGhhcy1iaW5hcnlcXFxcbm9kZV9tb2R1bGVzXFxcXGlzYXJyYXlcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjExMixcImhhc2hcIjpcImRLdGV3czFTNHNIdmFaaForY2VxXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxoYXMtYmluYXJ5XFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcaGFzLWJpbmFyeVxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTExLFwiaGFzaFwiOlwiZzRIemVqdlhnbGxHakozcmRXT1NcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXHNvY2tldC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tcGFyc2VyXFxcXGxpYlxcXFxicm93c2VyLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcc29ja2V0LmpzXCI6e1wiaW5kZXhcIjo3OCxcImhhc2hcIjpcIm1WZW54N2s4VkZ0dkllanNEWU9sXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxtYW5hZ2VyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTE3LFwiaGFzaFwiOlwiQkFnU0FpMnlKMUxBb0UzVncxRDRcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXHNvY2tldC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxtYW5hZ2VyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbGliXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLXBhcnNlclxcXFxiaW5hcnkuanNcIjp7XCJpbmRleFwiOjExNixcImhhc2hcIjpcIkowVnJxSnJwaEVjbHVHZjB6OVBhXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tcGFyc2VyXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VQcm9wZXJ0eS5qc1wiOntcImluZGV4XCI6MzIsXCJoYXNoXCI6XCJZdWsydHBvZjIxcTBYbDJzUWc4OVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXHV0aWxpdHlcXFxccHJvcGVydHkuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGdldExlbmd0aC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlU2xpY2UuanNcIjp7XCJpbmRleFwiOjM0LFwiaGFzaFwiOlwiT0xndzlYVmljMVcwQUtqZWh6SEJcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlTWF0Y2hlc1Byb3BlcnR5LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGFycmF5XFxcXGxhc3QuanNcIjp7XCJpbmRleFwiOjYsXCJoYXNoXCI6XCIzb1hYYTJpZFdiS3lTVkxjcTNvc1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcY3JlYXRlQmFzZUVhY2guanNcIjp7XCJpbmRleFwiOjM5LFwiaGFzaFwiOlwiKzVYM1p0bTc4Tk5Qcjl2UVo3ZkJcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRWFjaC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxnZXRMZW5ndGguanNcIjp7XCJpbmRleFwiOjQ3LFwiaGFzaFwiOlwiVWlaNkYwK25YWjBmaUtja1Rxbk1cIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVCYXNlRWFjaC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNBcnJheUxpa2UuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcdG9PYmplY3QuanNcIjp7XCJpbmRleFwiOjU4LFwiaGFzaFwiOlwiOGYzZXVsQjk3RGRkQlJkY1UrN3ZcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVCYXNlRWFjaC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcaXNLZXkuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc01hdGNoLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlR2V0LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxjcmVhdGVCYXNlRm9yLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxccGFpcnMuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlTWF0Y2hlc1Byb3BlcnR5LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcZm9yRWFjaC5qc1wiOntcImluZGV4XCI6OSxcImhhc2hcIjpcIjBMbzFSTnQxOFBNby9IQUtiSEV1XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxpc0tleS5qc1wiOntcImluZGV4XCI6NTMsXCJoYXNoXCI6XCJsRHB3NWNyY1JtVFJFeFRMVlRLY1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXHV0aWxpdHlcXFxccHJvcGVydHkuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZVByb3BlcnR5RGVlcC5qc1wiOntcImluZGV4XCI6MzMsXCJoYXNoXCI6XCJtcVgxT3lZZG5kSjE4M2x5bC9zblwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXHV0aWxpdHlcXFxccHJvcGVydHkuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUdldC5qc1wiOntcImluZGV4XCI6MjUsXCJoYXNoXCI6XCJIOUVpTWQzdWxsUXBSa3Zvb0xnelwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VQcm9wZXJ0eURlZXAuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcdG9QYXRoLmpzXCI6e1wiaW5kZXhcIjo1OSxcImhhc2hcIjpcImZhVlF2c2IrTFNMSTR1YU1ndHJRXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZVByb3BlcnR5RGVlcC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hdGNoZXNQcm9wZXJ0eS5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFx1dGlsaXR5XFxcXHByb3BlcnR5LmpzXCI6e1wiaW5kZXhcIjo3MyxcImhhc2hcIjpcIjdJb09JL3VHWkN4YmNZMjN1UURLXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUNhbGxiYWNrLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc01hdGNoLmpzXCI6e1wiaW5kZXhcIjoyOCxcImhhc2hcIjpcIkVwdUp6bGcyMDRhUjM1VDRRS2NTXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hdGNoZXMuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUlzRXF1YWwuanNcIjp7XCJpbmRleFwiOjI2LFwiaGFzaFwiOlwiZEJnb0ZYbmhqOUtINm9YM2RRd2FcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlSXNNYXRjaC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZU1hdGNoZXNQcm9wZXJ0eS5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxpc1N0cmljdENvbXBhcmFibGUuanNcIjp7XCJpbmRleFwiOjU2LFwiaGFzaFwiOlwib2ZOUDQvbkZyejVSa2Iza0dPaG5cIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxnZXRNYXRjaERhdGEuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzUHJvcGVydHkuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZVRvU3RyaW5nLmpzXCI6e1wiaW5kZXhcIjozNixcImhhc2hcIjpcIkFCRlFGZjE0cFJFQ2kzc3c4b0tWXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcdG9QYXRoLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGNyZWF0ZUJhc2VGb3IuanNcIjp7XCJpbmRleFwiOjQwLFwiaGFzaFwiOlwiOVJXbEZhQk91ZWx2d2draFlnUEdcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRm9yLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VGb3IuanNcIjp7XCJpbmRleFwiOjIzLFwiaGFzaFwiOlwiTkd4Y1owbjAxK3cyRzFQenlCbFlcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlRm9yT3duLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLXBhcnNlclxcXFxsaWJcXFxca2V5cy5qc1wiOntcImluZGV4XCI6OTksXCJoYXNoXCI6XCJvRnlLTlRBMHR3bHlRVmhWenA5blwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLXBhcnNlclxcXFxsaWJcXFxcYnJvd3Nlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbm9kZV9tb2R1bGVzXFxcXHV0ZjhcXFxcdXRmOC5qc1wiOntcImluZGV4XCI6MTA0LFwiaGFzaFwiOlwiNm5zcWFuZkJ3Y2J4bjcwb3MvODlcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbGliXFxcXGJyb3dzZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tcGFyc2VyXFxcXG5vZGVfbW9kdWxlc1xcXFxhZnRlclxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTAwLFwiaGFzaFwiOlwiTnpQZlhXRUNtTThyVy82ZmRrY2pcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbGliXFxcXGJyb3dzZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tcGFyc2VyXFxcXG5vZGVfbW9kdWxlc1xcXFxhcnJheWJ1ZmZlci5zbGljZVxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTAxLFwiaGFzaFwiOlwiUlNiNVp4OUNnWDNhZGp6YnZmL2tcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbGliXFxcXGJyb3dzZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tcGFyc2VyXFxcXG5vZGVfbW9kdWxlc1xcXFxibG9iXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjoxMDMsXCJoYXNoXCI6XCJrZS9VNFdzQmNWYkhVSHlpc0FqdVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLXBhcnNlclxcXFxsaWJcXFxcYnJvd3Nlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbm9kZV9tb2R1bGVzXFxcXGJhc2U2NC1hcnJheWJ1ZmZlclxcXFxsaWJcXFxcYmFzZTY0LWFycmF5YnVmZmVyLmpzXCI6e1wiaW5kZXhcIjoxMDIsXCJoYXNoXCI6XCJkVzZjbmt0akJJeVo2YnY5dlJwMlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLXBhcnNlclxcXFxsaWJcXFxcYnJvd3Nlci5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1wYXJzZXJcXFxcbGliXFxcXGJyb3dzZXIuanNcIjp7XCJpbmRleFwiOjk4LFwiaGFzaFwiOlwidWVVcWZmM1A4Y0xCdE82SndVd21cIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHdlYnNvY2tldC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcc29ja2V0LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxccGFyc2Vxc1xcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTA4LFwiaGFzaFwiOlwiRkk0dFJFTHdJNUl0eitja3dSK21cIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxcd2Vic29ja2V0LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxccG9sbGluZy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxwYXJzZXVyaVxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTA5LFwiaGFzaFwiOlwiYy9jN1hmdFNJNkNsRmM5aDJqT2hcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHNvY2tldC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXHBhcnNlanNvblxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MTA3LFwiaGFzaFwiOlwiVTRIaWo2WDBQTGdoNk5XQW93QWpcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHNvY2tldC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxsYW5nXFxcXGlzRnVuY3Rpb24uanNcIjp7XCJpbmRleFwiOjYyLFwiaGFzaFwiOlwieGtmenJaTlpQR0dPSWYwa0U4WTlcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxsYW5nXFxcXGlzTmF0aXZlLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGxhbmdcXFxcaXNOYXRpdmUuanNcIjp7XCJpbmRleFwiOjYzLFwiaGFzaFwiOlwiMnJzdGFBTHkxRFcwSlNEZGlqcHNcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxnZXROYXRpdmUuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcZ2V0TmF0aXZlLmpzXCI6e1wiaW5kZXhcIjo0OSxcImhhc2hcIjpcIjdHUlo3MTE1QlN1b2MvMWJkYUJLXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc0FycmF5LmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxvYmplY3RcXFxca2V5cy5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxhcnJheVxcXFx6aXBPYmplY3QuanNcIjp7XCJpbmRleFwiOjcsXCJoYXNoXCI6XCJmS2ZTd0l6UG81U1V4OWQwRGtnTlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxpbmNcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcb2JqZWN0XFxcXHBhaXJzLmpzXCI6e1wiaW5kZXhcIjo3MSxcImhhc2hcIjpcIng2SWx3eDhlbmN2Zy9CVzVBUEkyXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcZ2V0TWF0Y2hEYXRhLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGdldE1hdGNoRGF0YS5qc1wiOntcImluZGV4XCI6NDgsXCJoYXNoXCI6XCJuMFBIV2hOczZZWitEemdZTUhQeFwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VNYXRjaGVzLmpzXCI6e1wiaW5kZXhcIjozMCxcImhhc2hcIjpcIkN3ajVHU2lRdjkvRThuU0ZCb1gyXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUNhbGxiYWNrLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGVxdWFsQnlUYWcuanNcIjp7XCJpbmRleFwiOjQ1LFwiaGFzaFwiOlwiK3krK2dlc0pwUHZ5TSsyRThhTkJcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlSXNFcXVhbERlZXAuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcbGFuZ1xcXFxpc0FyZ3VtZW50cy5qc1wiOntcImluZGV4XCI6NjAsXCJoYXNoXCI6XCJ4UTRtcWJzS1FNQ210c1BiZlFjNlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzSW4uanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXHNoaW1LZXlzLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzSW4uanNcIjp7XCJpbmRleFwiOjY5LFwiaGFzaFwiOlwiOFBPWmlHUjFmUkhzbzU3OUc0NlpcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxzaGltS2V5cy5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxzaGltS2V5cy5qc1wiOntcImluZGV4XCI6NTcsXCJoYXNoXCI6XCJvTzRhS29wbXhSZlB4eUtnUlg5RlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxrZXlzLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXG9iamVjdFxcXFxmb3JPd24uanNcIjp7XCJpbmRleFwiOjY3LFwiaGFzaFwiOlwiTFo3N1B6dUpXL3dsZ1ZQZHZsR2NcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcaW5jXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0LmpzXCI6e1wiaW5kZXhcIjo4NyxcImhhc2hcIjpcIjhXZzd6dU16UXBhK0F3T3hhZXN3XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHdlYnNvY2tldC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcc29ja2V0LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGVxdWFsT2JqZWN0cy5qc1wiOntcImluZGV4XCI6NDYsXCJoYXNoXCI6XCI0NEl5NDlrRGNhQVpzeWtFZGFIM1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc0VxdWFsRGVlcC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxlcXVhbEFycmF5cy5qc1wiOntcImluZGV4XCI6NDQsXCJoYXNoXCI6XCJPQkpMNnZ1YU9vdHU1ZmxVZUNudlwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc0VxdWFsRGVlcC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxsYW5nXFxcXGlzVHlwZWRBcnJheS5qc1wiOntcImluZGV4XCI6NjUsXCJoYXNoXCI6XCJhVmVaeUlGR2FkckVoN0VzYURSdVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGludGVybmFsXFxcXGJhc2VJc0VxdWFsRGVlcC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlSXNFcXVhbERlZXAuanNcIjp7XCJpbmRleFwiOjI3LFwiaGFzaFwiOlwibHRaWmFNSG16cDZkOWpCbHRWM1lcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlSXNFcXVhbC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXGxvZGFzaFxcXFxpbnRlcm5hbFxcXFxiYXNlTWF0Y2hlc1Byb3BlcnR5LmpzXCI6e1wiaW5kZXhcIjozMSxcImhhc2hcIjpcIk91ZG5Tb2VxMkE0cWw1bGc1MWtjXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxsb2Rhc2hcXFxcaW50ZXJuYWxcXFxcYmFzZUNhbGxiYWNrLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcbG9kYXNoXFxcXGNvbGxlY3Rpb25cXFxcc29tZS5qc1wiOntcImluZGV4XCI6MTEsXCJoYXNoXCI6XCI5SnlKRmZkQ3g1NnBtUjZmd005cVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxpbmNcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiOntcImluZGV4XCI6MyxcImhhc2hcIjpcImF6eUduRXhYMnVWbFBJN29NOTJiXCIsXCJwYXJlbnRzXCI6W119LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxkZWJ1Z1xcXFxub2RlX21vZHVsZXNcXFxcbXNcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjk3LFwiaGFzaFwiOlwicnpTdTQxYys2Wlc4TTRTYXk4WDlcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGRlYnVnXFxcXGRlYnVnLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZGVidWdcXFxcZGVidWcuanNcIjp7XCJpbmRleFwiOjk2LFwiaGFzaFwiOlwieXFkUjduSmM3d3hJSHpGRE56RytcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGRlYnVnXFxcXGJyb3dzZXIuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxkZWJ1Z1xcXFxicm93c2VyLmpzXCI6e1wiaW5kZXhcIjo5NSxcImhhc2hcIjpcIlBFTlZDSHAzSHBwZVJtL0RpSk1JXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHdlYnNvY2tldC5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcteGhyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxccG9sbGluZy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxjb21wb25lbnQtaW5oZXJpdFxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6OTQsXCJoYXNoXCI6XCJUMEZxY2g0ZDRha3ZscjhiaDdsY1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFx3ZWJzb2NrZXQuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxwb2xsaW5nLXhoci5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcuanNcIixcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxwb2xsaW5nLWpzb25wLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcd3NcXFxcbGliXFxcXGJyb3dzZXIuanNcIjp7XCJpbmRleFwiOjExMCxcImhhc2hcIjpcInZaUkk5NUZWdzQ2UFBSb0hEYXVKXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHdlYnNvY2tldC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxcd2Vic29ja2V0LmpzXCI6e1wiaW5kZXhcIjo5MixcImhhc2hcIjpcImlaUVFheDdUS3NTKzhaeFV5cmMzXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxwb2xsaW5nLXhoci5qc1wiOntcImluZGV4XCI6OTAsXCJoYXNoXCI6XCJoMlNRMmY3cXVwdFYvWUpidFhjL1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHhtbGh0dHByZXF1ZXN0LmpzXCI6e1wiaW5kZXhcIjo5MyxcImhhc2hcIjpcInVzMEZzTjVzN2hpVDNocVZWNWx4XCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcteGhyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxccG9sbGluZy5qc1wiLFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxwb2xsaW5nLmpzXCI6e1wiaW5kZXhcIjo5MSxcImhhc2hcIjpcIm02ZVJlWGptMXBuQlFIQjA3ZDJWXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXHBvbGxpbmcteGhyLmpzXCIsXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxccG9sbGluZy1qc29ucC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXHRyYW5zcG9ydHNcXFxccG9sbGluZy1qc29ucC5qc1wiOntcImluZGV4XCI6ODksXCJoYXNoXCI6XCI3NXQ1b0dUYkduYVY1dmQxSVdtZVwiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcdHJhbnNwb3J0c1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGhhcy1jb3JzXFxcXG5vZGVfbW9kdWxlc1xcXFxnbG9iYWxcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjEwNixcImhhc2hcIjpcInRESWY1R3FxZE9jS25OSFJoMlJjXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxoYXMtY29yc1xcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGhhcy1jb3JzXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjoxMDUsXCJoYXNoXCI6XCJ1U1Vkenp3QkRRZDdxUU5LRVo0b1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxceG1saHR0cHJlcXVlc3QuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFx0cmFuc3BvcnRzXFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjo4OCxcImhhc2hcIjpcIjB2Tmlwc3grcXpKM2JyZktSVElKXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGxpYlxcXFxzb2NrZXQuanNcIjp7XCJpbmRleFwiOjg2LFwiaGFzaFwiOlwiRzRTL2F3OThrRmNhaWtuWjRPUnVcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcbGliXFxcXGluZGV4LmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxub2RlX21vZHVsZXNcXFxcZW5naW5lLmlvLWNsaWVudFxcXFxsaWJcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjg1LFwiaGFzaFwiOlwiRzZRWXVTTnUwRWNTK0c1dFI5TkVcIixcInBhcmVudHNcIjpbXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcbm9kZV9tb2R1bGVzXFxcXGVuZ2luZS5pby1jbGllbnRcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXG5vZGVfbW9kdWxlc1xcXFxlbmdpbmUuaW8tY2xpZW50XFxcXGluZGV4LmpzXCI6e1wiaW5kZXhcIjo4NCxcImhhc2hcIjpcIkhRYXU0TWtENGxBeW5COXR0MFdsXCIsXCJwYXJlbnRzXCI6W1wibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxtYW5hZ2VyLmpzXCJdfSxcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcbWFuYWdlci5qc1wiOntcImluZGV4XCI6NzYsXCJoYXNoXCI6XCIrVHJPQXFrNFVsSTN0S3pJVDZEY1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxsaWJcXFxcaW5kZXguanNcIl19LFwibm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXG5vZGVfbW9kdWxlc1xcXFxzb2NrZXQuaW8tY2xpZW50XFxcXGxpYlxcXFxpbmRleC5qc1wiOntcImluZGV4XCI6NzUsXCJoYXNoXCI6XCJsV3dSaHptODMrRXEwOHM3Tmh0L1wiLFwicGFyZW50c1wiOltcIm5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5LWhtclxcXFxub2RlX21vZHVsZXNcXFxcc29ja2V0LmlvLWNsaWVudFxcXFxpbmRleC5qc1wiXX0sXCJub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcaW5kZXguanNcIjp7XCJpbmRleFwiOjc0LFwiaGFzaFwiOlwiY2NZQlBzYUlxTUN0RzVDSENkRGRcIixcInBhcmVudHNcIjpbXX0sXCJtYWluLmpzXCI6e1wiaW5kZXhcIjoyLFwiaGFzaFwiOlwicytMQXd2STZvdFE4andmRkNCU2tcIixcInBhcmVudHNcIjpbXX19O1xuICB2YXIgb3JpZ2luYWxFbnRyaWVzID0gW1wiRDpcXFxcdGVzdHNcXFxcRDMtVGlwcy1hbmQtVHJpY2tzLVRyYWluaW5nXFxcXG1haW4uanNcIl07XG4gIHZhciB1cGRhdGVVcmwgPSBudWxsO1xuICB2YXIgdXBkYXRlTW9kZSA9IFwid2Vic29ja2V0XCI7XG4gIHZhciBzdXBwb3J0TW9kZXMgPSBbXCJub25lXCIsXCJ3ZWJzb2NrZXRcIl07XG4gIHZhciBpZ25vcmVVbmFjY2VwdGVkID0gdHJ1ZTtcbiAgdmFyIHVwZGF0ZUNhY2hlQnVzdCA9IGZhbHNlO1xuICB2YXIgYnVuZGxlS2V5ID0gXCJ3ZWJzb2NrZXQ6bnVsbFwiO1xuICB2YXIgc2lvUGF0aCA9IFwiLi9ub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeS1obXJcXFxcbm9kZV9tb2R1bGVzXFxcXHNvY2tldC5pby1jbGllbnRcXFxcaW5kZXguanNcIjtcbiAgdmFyIGluY1BhdGggPSBcIi4vbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnktaG1yXFxcXGluY1xcXFxpbmRleC5qc1wiO1xuXG4gIGlmICghZ2xvYmFsLl9obXIpIHtcbiAgICB0cnkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbCwgJ19obXInLCB7dmFsdWU6IHt9fSk7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBnbG9iYWwuX2htciA9IHt9O1xuICAgIH1cbiAgfVxuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGdsb2JhbC5faG1yLCBidW5kbGVLZXkpKSB7XG4gICAgLy8gVGVtcG9yYXJ5IGhhY2sgc28gcmVxdWlyaW5nIG1vZHVsZXMgd29ya3MgYmVmb3JlIHRoZSBfaG1yIHZhbHVlcyBhcmVcbiAgICAvLyBjb3JyZWN0bHkgaW5pdGlhbGl6ZWQuXG4gICAgZ2xvYmFsLl9obXJbYnVuZGxlS2V5XSA9IHtpbml0TW9kdWxlOiBmdW5jdGlvbigpe319O1xuICB9XG5cbiAgdmFyIG1haW4gPSByZXF1aXJlKGluY1BhdGgpO1xuICB2YXIgaXNGaXJzdFJ1biA9IG1haW4oXG4gICAgbW9kdWxlRGVmcywgY2FjaGVkTW9kdWxlcywgbW9kdWxlTWV0YSwgdXBkYXRlVXJsLFxuICAgIHVwZGF0ZU1vZGUsIHN1cHBvcnRNb2RlcywgaWdub3JlVW5hY2NlcHRlZCwgdXBkYXRlQ2FjaGVCdXN0LCBidW5kbGVLZXksXG4gICAgc2lvUGF0aCA/IHJlcXVpcmUoc2lvUGF0aCkgOiBudWxsLFxuICAgIHR5cGVvZiBfX2ZpbGVuYW1lICE9PSAndW5kZWZpbmVkJyAmJiBfX2ZpbGVuYW1lLFxuICAgIHR5cGVvZiBfX2Rpcm5hbWUgIT09ICd1bmRlZmluZWQnICYmIF9fZGlybmFtZVxuICApO1xuICBpZiAoaXNGaXJzdFJ1bikge1xuICAgIGZvciAodmFyIGk9MCwgbGVuPW9yaWdpbmFsRW50cmllcy5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgIHJlcXVpcmUob3JpZ2luYWxFbnRyaWVzW2ldKTtcbiAgICB9XG4gIH1cbn0pLmNhbGwoXG4gIHRoaXMsXG4gIHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30sXG4gIGFyZ3VtZW50c1szXSwgYXJndW1lbnRzWzRdLCBhcmd1bWVudHNbNV0sIGFyZ3VtZW50c1s2XVxuKTtcbiJdfQ==
