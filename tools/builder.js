/**
 * @license
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var fsMod = require('fs');
var gulp = /** @type {{src: !Function, dest: !Function}} */ (require('gulp'));
var glob = /** @type {{sync: !Function}} */ (require('glob'));
var pathMod = require('path');
var closureCompiler = /** @type {!Function} */ (
    require('gulp-closure-compiler'));
var temporary = /** @type {{Dir: !Function, File: !Function}} */ (
    require('temporary'));
var childProcess = require('child_process');


/**
 * @type {{
 *   CLOSURE_COMPILER_PATH: string,
 *   CLOSURE_LIBRARY_PATH: string,
 *   COMPILER_FLAGS_COMMON: !Object,
 *   COMPILER_FLAGS_DEBUG: !Object,
 *   COMPILER_FLAGS_OPT: !Object,
 *   TEST_SCHEMAS: !Array<{file: string, namespace: string}>
 * }}
 */
var config = /** @type {!Function} */ (
    require(pathMod.resolve(__dirname + '/config.js')))();
var depsHelper = /** @type {{
    scanDeps: !Function, getTransitiveDeps: !Function}} */ (
        require(pathMod.resolve(__dirname + '/scan_deps.js')));
var StripLicense = require(pathMod.resolve(
    pathMod.join(__dirname, '/strip_license.js'))).StripLicense;

// Make linter happy
var log = console['log'];


function buildLib(options) {
  var closureDependencies = depsHelper.scanDeps();
  return gulp.src(closureDependencies.concat('lib/**/*.js')).
      pipe(closureCompiler({
        compilerPath: config.CLOSURE_COMPILER_PATH,
        fileName: 'lf.js',
        compilerFlags: getCompilerFlags(options.mode)
      })).
      pipe(new StripLicense({objectMode: true})).
      pipe(gulp.dest('dist'));
}


function buildTest(options) {
  var flags = {
    export_local_property_definitions: null
  };
  var compilerFlags = mergeObjects(flags, getCompilerFlags('compiled'));

  return new Promise(function(resolve, reject) {
    var spacTemporaryDir = new temporary.Dir().path;
    generateTestSchemas(spacTemporaryDir).then(
        function() {
          var transitiveDeps = depsHelper.getTransitiveDeps(
              options.target, spacTemporaryDir);

          gulp.src(transitiveDeps).pipe(closureCompiler({
            compilerPath: config.CLOSURE_COMPILER_PATH,
            fileName: new temporary.File().path,
            compilerFlags: compilerFlags
          })).on('end', function() {
            resolve();
          });
        }, reject);
  });
}


/**
 * Generates SPAC code for all test schemas.
 * @param {string} outputDir The directory where generated code should be
 *     placed.
 * @return {!IThenable}
 */
function generateTestSchemas(outputDir) {
  var testSchema = config.TEST_SCHEMAS[0];
  var promises = config.TEST_SCHEMAS.map(
      function(testSchema) {
        return runSpac(testSchema.file, testSchema.namespace, outputDir);
      });
  return Promise.all(promises);
}


/**
 * @param {string} mode One of "debug" or "compiled".
 * @return {!Object} An object holding all compiler flags and their values.
 */
function getCompilerFlags(mode) {
  return mode == 'debug' ?
      mergeObjects(config.COMPILER_FLAGS_COMMON, config.COMPILER_FLAGS_DEBUG) :
      mergeObjects(config.COMPILER_FLAGS_COMMON, config.COMPILER_FLAGS_OPT);
}


/**
 * Merges objects into a single object.
 * TODO(dpapad): Replace this with Object.assign once it becomes available in
 * node.
 * @param {...!Object} var_args The objects to be merged.
 * @return {!Object} The merged object.
 */
function mergeObjects(var_args) {
  var merged = {};
  var objects = Array.prototype.slice.call(arguments);
  objects.forEach(function(obj) {
    Object.keys(obj).forEach(function(key) {
      merged[key] = obj[key];
    });
  });
  return merged;
}


/**
 * Runs SPAC to generate code.
 * @param {string} schemaFilePath
 * @param {string} namespace
 * @param {string} outputDir
 * @return {!IThenable}
 */
function runSpac(schemaFilePath, namespace, outputDir) {
  var spacPath = pathMod.resolve(pathMod.join(__dirname, '../spac/spac.js'));
  var spac = childProcess.fork(
      spacPath,
      [
        '--schema=' + schemaFilePath,
        '--namespace=' + namespace,
        '--outputdir=' + outputDir,
        '--nocombine=true'
      ]);

  return new Promise(function(resolve, reject) {
    spac.on('close', function(code) {
      if (code == 0) {
        resolve();
      } else {
        var error = new Error(
            'ERROR: unable to generate code from ' + schemaFilePath + '\r\n');
        log(error);
        reject(error);
      }
    });
  });
}


/** @type {!Function} */
exports.buildLib = buildLib;


/** @type {!Function} */
exports.buildTest = buildTest;


/** @type {!Function} */
exports.runSpac = runSpac;
