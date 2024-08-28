var express = require('express');
var router = express.Router(); //eslint-disable-line
var deploymentController = require('../controllers/deployments.controller');

router.get('/', deploymentController.list);

router.post('/', deploymentController.create);

router.get('/search', deploymentController.search);

router.get('/:id', deploymentController.findById);

router.put('/:id', deploymentController.update);

router.delete('/:id', deploymentController.delete);

module.exports = router;
