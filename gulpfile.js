'use strict';

/**
 * Module dependencies.
 */
var path = require('path'),
  gulp = require('gulp'),
  runSequence = require('run-sequence'),
  config = require('./config/config'),
  logger = require(path.resolve('./config/lib/logger')),
  mongoose = require('./config/lib/mongoose'),
  plugins = gulpLoadPlugins(); //eslint-disable-line

// Set NODE_ENV to 'test'
gulp.task('env:test', function () {
  process.env.NODE_ENV = 'test';
});

// Set NODE_ENV to 'development'
gulp.task('env:dev', function () {
  process.env.NODE_ENV = 'development';
});

// Set NODE_ENV to 'production'
gulp.task('env:prod', function () {
  process.env.NODE_ENV = 'production';
});

gulp.task('test:server', function (done) {
  runSequence('env:test', 'dropMeanDb', 'dropLoggingDb', 'mocha', done);
});

// Drops the MongoDB Mean database, used in e2e testing
gulp.task('dropMeanDb', function (done) {
  // Use mongoose configuration
  mongoose.connect(config.dbMean, config.dbMean.options, function (dbMean) {
    dbMean.db.dropDatabase(function (err) {
      if (err) logger.error(err);
      else logger.info('Successfully dropped dbMean: ', dbMean.db.databaseName);
      dbMean.db.close(done);
    });
  });
});

// Drops the MongoDB Mean database, used in e2e testing
gulp.task('dropLoggingDb', function (done) {
  // Use mongoose configuration
  mongoose.connect(config.dbLogging, config.dbLogging.options, function (dbLogging) {
    dbLogging.db.dropDatabase(function (err) {
      if (err) logger.error(err);
      else logger.info('Successfully dropped dbLogging: ', dbLogging.db.databaseName);
      dbLogging.db.close(done);
    });
  });
});

// Mocha tests task
gulp.task('mocha', function (done) {
  // Open mongoose connections
  var testSuites = 'modules/*/tests/server/**/*.js';
  var error;

  // Connect mongoose
  mongoose.connect(config.dbMean, config.dbMean.options, function () {
    // Run the tests
    gulp.src(testSuites)
      .pipe(plugins.mocha({
        reporter: 'mocha-multi-reporters',
        reporterOptions: { configFile: 'config/mocha-config.json' },
        timeout: 10000
      }))
      .on('error', function (err) {
        // If an error occurs, save it
        error = err;
        logger.error(err);
      })
      .on('end', function () {
        // When the tests are done, disconnect mongoose and pass the error state back to gulp
        mongoose.connect(config.dbLogging, config.dbLogging.options, function (dbLogging) {
          dbLogging.db.dropDatabase(function () {
            mongoose.disconnect(function () {
              done(error);
              if (error) process.exit(1);
              process.exit(0);
            });
          });
        });
      });
  });
});
