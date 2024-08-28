'use strict';

var PodHistory = require('../models/history.model').getSchema('pods'),
  DeplHistory = require('../models/history.model').getSchema('deployments'),
  ConfHistory = require('../models/history.model').getSchema('configurations');
/**
 * history.controller.js
 *
 * @description :: Server-side logic for managing History REST calls.
 */

exports.listPods = async function (req, res) {
  PodHistory.find((errFind, pods) => listObjects(errFind, pods, 'Pod', res));
};

exports.listDeployments = async function (req, res) {
  DeplHistory.find((errFind, depls) => listObjects(errFind, depls, 'Deployment', res));
};

exports.listConfigurations = async function (req, res) {
  ConfHistory.find((errFind, configs) => listObjects(errFind, configs, 'Configuration', res));
};

exports.findPodById = async function (req, res) {
  var { id } = req.params;
  PodHistory.findOne({ associated_id: id }, (err, pod) => findObject(err, pod, 'Pod', res));
};

exports.findDeploymentById = async function (req, res) {
  var { id } = req.params;
  DeplHistory.findOne({ associated_id: id }, (err, depl) => findObject(err, depl, 'Deployment', res));
};

exports.findConfigurationById = async function (req, res) {
  var { id } = req.params;
  ConfHistory.findOne({ associated_id: id }, (err, config) => findObject(err, config, 'Configuration', res));
};

function listObjects(err, objects, objectName, res) {
  if (err) {
    return res.status(422).json({
      message: `Error whilst attempting to retrieve the ${objectName}s' logs.`,
      error: err
    });
  }
  return res.json(objects);
}

function findObject(err, obj, objectName, res) {
  if (err) {
    return res.status(422).json({
      message: `Error whilst attempting to retrieve log for specified ${objectName} ID.`,
      error: err
    });
  } else if (!obj) {
    return res.status(404).json({
      message: `A log does not exist for a ${objectName} with the ID specified. Ensure you enter the ${objectName}s ID, not the logs ID.`
    });
  }
  return res.json(obj);
}
