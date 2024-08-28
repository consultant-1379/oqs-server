var express = require('express');
var router = express.Router(); //eslint-disable-line
var historyController = require('../controllers/history.controller');

router.get('/pods', historyController.listPods);

router.get('/pods/:id', historyController.findPodById);

router.get('/deployments', historyController.listDeployments);

router.get('/deployments/:id', historyController.findDeploymentById);

router.get('/configurations', historyController.listConfigurations);

router.get('/configurations/:id', historyController.findConfigurationById);

module.exports = router;
