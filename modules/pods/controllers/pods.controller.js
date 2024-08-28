'use strict';

var queueController = require('../../core/controllers/queues.controller'),
  errorHandler = require('../../core/controllers/errors.controller'),
  Pod = require('../models/pods.model').Schema,
  HistoryModel = require('../../history/models/history.model');
/**
 * pod.controller.js
 *
 * @description :: Server-side logic for managing Pods.
 */

exports.list = async function (req, res) {
  Pod.find(function (errFind, pods) {
    if (errFind) {
      return res.status(422).json({
        message: 'Error whilst attempting to retrieve the Pods.',
        error: errFind
      });
    }
    return res.json(pods);
  });
};

exports.create = async function (req, res) {
  var pod;
  HistoryModel.setLoggedInUser(req.user);
  try {
    pod = new Pod(req.body);
  } catch (err) {
    return res.status(400).json({
      message: 'There was a syntax error found in your request, please make sure that it is valid and try again.',
      error: err
    });
  }
  pod.save(function (err, savedPod) {
    if (err) {
      return res.status(400).json({
        message: errorHandler.getErrorMessage(err),
        error: err
      });
    }
    return res.status(201).json(savedPod);
  });
};

// Provides search functionality for pods by any of their values.
exports.search = async function (req, res) {
  Pod.find(req.query).exec(function (errFind, pods) {
    if (errFind) {
      return res.status(422).json({
        message: errorHandler.getErrorMessage(errFind),
        error: errFind
      });
    }
    return res.json(pods);
  });
};

exports.findById = async function (req, res) {
  var { id } = req.params;
  Pod.findOne({ _id: id }, function (err, pod) {
    if (pod == null || err) {
      return res.status(404).json({
        message: 'A pod with that ID does not exist',
        error: err
      });
    }
    return res.json(pod);
  });
};

exports.update = async function (req, res) {
  var { id } = req.params;
  HistoryModel.setLoggedInUser(req.user);
  Pod.findOne({ _id: id }, function (err, podToUpdate) {
    if (err) {
      return res.status(500).json({
        message: 'Error whilst getting Pod: Internal Server Error',
        error: err
      });
    } else if (!podToUpdate) {
      return res.status(404).json({
        message: 'Error whilst getting Pod: A Pod with that ID does not exist',
        error: err
      });
    }
    try {
      errorHandler.checkForImmutableFieldChange(req, podToUpdate, ['name']);
    } catch (immutableErr) {
      return res.status(406).json({ message: immutableErr.message });
    }

    // Update the pods key-values with the key-values of the request body if the key exists.
    for (var key in podToUpdate) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        podToUpdate[key] = req.body[key];
      }
    }
    podToUpdate.save(async function (errSave) {
      if (errSave) {
        var statusCode;
        if (errSave.name === 'ValidationError' || errSave.name === 'StrictModeError') {
          statusCode = 400;
        } else {
          statusCode = 422;
        }
        return res.status(statusCode).json({
          message: errorHandler.getErrorMessage(errSave),
          error: errSave
        });
      }
      var queueResponse = await queueController.handlePodQueue(podToUpdate);
      var responseObj = Object.assign({ updatedPod: podToUpdate }, queueResponse);
      return res.status(200).json(responseObj);
    });
  });
};

exports.delete = async function (req, res) {
  var { id } = req.params;
  HistoryModel.setLoggedInUser(req.user);
  Pod.findOne({ _id: id }, function (errFind, podToDelete) {
    if (errFind) {
      return res.status(500).json({
        message: 'Error whilst finding the Pod to delete: Internal Server Error',
        error: errFind
      });
    } else if (!podToDelete) {
      return res.status(404).json({
        message: 'Error whilst finding the Pod to delete: A Pod with that ID does not exist',
        error: errFind
      });
    } else if (podToDelete.deployments.length > 0) {
      return res.status(422).json({
        message: 'Error whilst deleting Pod: This Pod has dependant Deployments so cannot be deleted',
        error: errFind
      });
    }
    podToDelete.remove(function (errDelete) {
      if (errDelete) {
        return res.status(500).json({
          message: 'Error whilst deleting Pod: Internal Server Error',
          error: errDelete
        });
      }
      return res.status(204).json();
    });
  });
};
