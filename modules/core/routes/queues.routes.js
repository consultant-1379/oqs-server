var express = require('express');
var router = express.Router(); //eslint-disable-line
var queueController = require('../controllers/queues.controller');

router.post('/verifyRelationships', queueController.handleRelationshipVerification);

router.post('/handleDeploymentTimeouts', queueController.handleDeploymentTimeouts);

module.exports = router;
