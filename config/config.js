/**
 * Module dependencies.
 */
var _ = require('lodash'),
  chalk = require('chalk'),
  glob = require('glob'),
  packageJson = require('../package.json'),
  config = require('./env/config.js');

/**
 * Get files by glob patterns
 */
var getGlobbedPaths = function (globPatterns, excludes) {
  var urlRegex = new RegExp('^(?:[a-z]+:)?//', 'i');
  var output = [];

  // If glob pattern is array then we use each pattern in a recursive way, otherwise we use glob
  if (_.isArray(globPatterns)) {
    globPatterns.forEach(function (globPattern) {
      output = _.union(output, getGlobbedPaths(globPattern, excludes));
    });
  } else if (_.isString(globPatterns)) {
    if (urlRegex.test(globPatterns)) {
      output.push(globPatterns);
    } else {
      var files = glob.sync(globPatterns);
      if (excludes) {
        files = files.map(function (file) {
          if (_.isArray(excludes)) {
            excludes.forEach(function (item) {
              if (Object.prototype.hasOwnProperty.call(excludes, item)) {
                file = file.replace(item, '');
              }
            });
          } else {
            file = file.replace(excludes, '');
          }
          return file;
        });
      }
      output = _.union(output, files);
    }
  }

  return output;
};

/** Validate config.domain is set
 */
var validateDomainIsSet = function (config) {
  if (!config.domain) {
    console.log(chalk.red('+ Important warning: config.domain is empty. ' + // eslint-disable-line no-console
    'It should be set to the fully qualified domain of the app.'));
  }
};

/**
 * Validate Session Secret parameter is not set to default in production
 */
var validateSessionSecret = function (config, testing) {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (config.sessionSecret === 'OQS') {
    if (!testing) {
      console.log(chalk.red('+ WARNING: It is strongly recommended that you change' + // eslint-disable-line no-console
      ' sessionSecret config while running in production!'));
      console.log(chalk.red('  Please add `sessionSecret: process.env.SESSION_SECRET' +// eslint-disable-line no-console
      ' || \'secret\'` to '));
      console.log(chalk.red('  `config/env/config.js`')); // eslint-disable-line no-console
    }
    return false;
  }
  return true;
};

/**
 * Initialize global configuration
 */
var initGlobalConfig = function () {
  config.packageJson = packageJson;

  validateSessionSecret(config);

  // Print a warning if config.domain is not set
  validateDomainIsSet(config);

  // Expose configuration utilities
  config.utils = {
    validateSessionSecret: validateSessionSecret
  };

  return config;
};

/**
 * Set configuration object
 */
module.exports = initGlobalConfig();
