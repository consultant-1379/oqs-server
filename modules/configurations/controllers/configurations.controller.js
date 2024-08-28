'use strict';

var errorHandler = require('../../core/controllers/errors.controller'),
  Configuration = require('../models/configurations.model').Schema,
  HistoryModel = require('../../history/models/history.model');
/**
 * configuration.controller.js
 *
 * @description :: Server-side logic for managing Configurations.
 */

exports.list = async function (req, res) {
  Configuration.find(function (errFind, configurations) {
    if (errFind) {
      return res.status(422).json({
        message: 'Error whilst attempting to retrieve the Configurations.',
        error: errFind
      });
    }
    return res.json(configurations);
  });
};

exports.create = async function (req, res) {
  var configuration;
  HistoryModel.setLoggedInUser(req.user);
  try {
    configuration = new Configuration(req.body);
  } catch (err) {
    return res.status(400).json({
      message: 'There was a syntax error found in your request, please make sure that it is valid and try again.',
      error: err
    });
  }
  configuration.save(function (err, savedConfiguration) {
    if (err) {
      return res.status(400).json({
        message: errorHandler.getErrorMessage(err),
        error: err
      });
    }
    return res.status(201).json(savedConfiguration);
  });
};

// Provides search functionality for configurations by any of their values.
exports.search = async function (req, res) {
  Configuration.find(req.query).exec(function (errFind, configurations) {
    if (errFind) {
      return res.status(422).json({
        message: errorHandler.getErrorMessage(errFind),
        error: errFind
      });
    }
    return res.json(configurations);
  });
};

exports.findById = async function (req, res) {
  var { id } = req.params;
  Configuration.findOne({ _id: id }, function (err, configuration) {
    if (configuration == null || err) {
      return res.status(404).json({
        message: 'A configuration with that ID does not exist',
        error: err
      });
    }
    return res.json(configuration);
  });
};

exports.update = async function (req, res) {
  var { id } = req.params;
  HistoryModel.setLoggedInUser(req.user);
  Configuration.findOne({ _id: id }, function (err, configurationToUpdate) {
    if (err) {
      return res.status(500).json({
        message: 'Error whilst getting Configuration: Internal Server Error',
        error: err
      });
    } else if (!configurationToUpdate) {
      return res.status(404).json({
        message: 'Error whilst getting Configuration: A Configuration with that ID does not exist',
        error: err
      });
    }
    try {
      errorHandler.checkForImmutableFieldChange(req, configurationToUpdate, ['name']);
    } catch (immutableErr) {
      return res.status(406).json({ message: immutableErr.message });
    }

    // Update the configurations key-values with the key-values of the request body if the key exists.
    for (var key in configurationToUpdate) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        configurationToUpdate[key] = req.body[key];
      }
    }
    configurationToUpdate.save(async function (errSave) {
      if (errSave) {
        var statusCode = (errSave.name === 'ValidationError' || errSave.name === 'StrictModeError') ? 400 : 422;
        return res.status(statusCode).json({
          message: errorHandler.getErrorMessage(errSave),
          error: errSave
        });
      }
      var responseObj = Object.assign({ updatedConfiguration: configurationToUpdate });
      return res.status(200).json(responseObj);
    });
  });
};

exports.delete = async function (req, res) {
  var { id } = req.params;
  HistoryModel.setLoggedInUser(req.user);
  Configuration.findOne({ _id: id }, function (errFind, configurationToDelete) {
    if (errFind) {
      return res.status(500).json({
        message: 'Error whilst finding the Configuration to delete: Internal Server Error',
        error: errFind
      });
    } else if (!configurationToDelete) {
      return res.status(404).json({
        message: 'Error whilst finding the Configuration to delete: A Configuration with that ID does not exist',
        error: errFind
      });
    }
    configurationToDelete.remove(function (errDelete) {
      if (errDelete) {
        return res.status(500).json({
          message: 'Error whilst deleting Configuration: Internal Server Error',
          error: errDelete
        });
      }
      return res.status(200).json({ message: 'Configuration deleted successfully.' });
    });
  });
};
