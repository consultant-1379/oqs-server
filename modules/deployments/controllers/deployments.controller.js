'use strict';

var queueController = require('../../core/controllers/queues.controller'),
  errorHandler = require('../../core/controllers/errors.controller'),
  helpers = require('../../core/controllers/helpers.controller'),
  Deployment = require('../models/deployments.model').Schema,
  Pod = require('../../pods/models/pods.model').Schema,
  HistoryModel = require('../../history/models/history.model');
/**
 * deployment.controller.js
 *
 * @description :: Server-side logic for managing Deployments.
 */

exports.list = async function (req, res) {
  Deployment.find(function (errFind, deployments) {
    if (errFind) {
      return res.status(422).json({
        message: 'Error whilst attempting to retrieve the Deployments.',
        error: errFind
      });
    }
    return res.json(deployments);
  });
};

exports.create = async function (req, res) {
  HistoryModel.setLoggedInUser(req.user);
  var deployment;
  try {
    deployment = new Deployment(req.body);
  } catch (errCreating) {
    return res.status(400).json({
      message: 'There was a syntax error found in the request, please make sure that it is valid and try again.',
      error: errCreating
    });
  }

  deployment.save(async function (errSave, savedDep) {
    if (errSave) {
      return res.status(400).json({
        message: errorHandler.getErrorMessage(errSave),
        error: errSave
      });
    }
    var resAdd = await queueController.handleAddDeploymentToParentPod(savedDep, savedDep.associatedPod);
    var resQueue = (resAdd && resAdd.podObject) ? await queueController.handlePodQueue(resAdd.podObject, savedDep) : {};
    var finalResponse = Object.assign({ newDeployment: savedDep }, resAdd, resQueue);
    return res.status(201).json(finalResponse);
  });
};

// Provides search functionality for deployments by any of their values.
exports.search = async function (req, res) {
  Deployment.find(req.query).exec(function (errFind, deployments) {
    if (errFind) {
      return res.status(422).json({
        message: errorHandler.getErrorMessage(errFind),
        error: errFind
      });
    }
    return res.json(deployments);
  });
};

exports.findById = async function (req, res) {
  var { id } = req.params;
  Deployment.findOne({ _id: id }, function (errFind, deployment) {
    if (errFind) {
      return res.status(500).json({
        message: 'Error whilst attempting to retrieve the Deployment: Internal Server Error.',
        error: errFind
      });
    } else if (!deployment) {
      return res.status(404).json({
        message: 'Error whilst attempting to retrieve the Deployment: A Deployment with that ID does not exist.',
        error: errFind
      });
    }
    return res.json(deployment);
  });
};

exports.update = async function (req, res) {
  var { id } = req.params;
  HistoryModel.setLoggedInUser(req.user);
  Deployment.findOne({ _id: id }, function (errFind, deplToUpdate) {
    if (errFind) {
      return res.status(500).json({
        message: 'Error whilst attempting to retrieve the Deployment: Internal Server Error.',
        error: errFind
      });
    } else if (!deplToUpdate) {
      return res.status(404).json({
        message: 'Error whilst attempting to retrieve the Deployment: A Deployment with that ID does not exist.',
        error: errFind
      });
    }

    try {
      errorHandler.checkForImmutableFieldChange(req, deplToUpdate, ['name', 'associatedPod']);
    } catch (immutableErr) {
      return res.status(406).json({ message: immutableErr.message });
    }

    // Update the deployments key-values with the key-values of the request body if the key exists.
    for (var key in deplToUpdate) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        deplToUpdate[key] = req.body[key];
      }
    }

    deplToUpdate.save(async function (errSave) {
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
      var parentPod = await Pod.findOne({ name: deplToUpdate.associatedPod });
      var resQueue = (parentPod) ?
        await queueController.handlePodQueue(parentPod) : { queueMessage: 'Associated Parent-Pod could not be found for queue-handling.' };
      var finalResponse = Object.assign({ updatedDeployment: deplToUpdate }, resQueue);
      return res.status(200).json(finalResponse);
    });
  });
};

exports.delete = async function (req, res) {
  var { id } = req.params;
  var foundDepl;

  HistoryModel.setLoggedInUser(req.user);
  try {
    foundDepl = await Deployment.findOne({ _id: id });
    if (!foundDepl) helpers.returnJSON(res, 404, 'Error whilst attempting to retrieve the Deployment to delete: A Deployment with that ID does not exist.');
    await foundDepl.remove({ _id: id });
  } catch (errDeleteDepl) {
    helpers.returnJSON(res, 500, 'Error whilst deleting Deployment: Internal Server Error.', errDeleteDepl);
  }

  try {
    var parentPod = await Pod.findOne({ name: foundDepl.associatedPod });
    if (!parentPod) {
      helpers.returnJSON(
        res, 200,
        `Deployment deleted successfully.\nError whilst updating Parent-Pod: ${foundDepl.associatedPod} does not correspond to a known Pod.`
      );
    }
    await parentPod.deployments.pull(foundDepl.name);
    await parentPod.save();
    var resQueue = await queueController.handlePodQueue(parentPod);
    var finalResponse = Object.assign({ message: 'Deployment deleted successfully.\nParent-Pod updated successfully.' }, resQueue);
    return res.status(200).json(finalResponse);
  } catch (errUpdatePod) {
    helpers.returnJSON(res, 200, 'Deployment deleted successfully.\nError whilst updating Pod: Internal Server Error.', errUpdatePod);
  }
};
