var express = require('express');
var router = express.Router(); //eslint-disable-line
var configurationController = require('../controllers/configurations.controller');
var adminPolicy = require('../../../config/lib/policy');

router.get('/', configurationController.list);

router.post('/', adminPolicy.isAllowed, configurationController.create);

router.get('/search', configurationController.search);

router.get('/:id', configurationController.findById);

router.put('/:id', adminPolicy.isAllowed, configurationController.update);

router.delete('/:id', adminPolicy.isAllowed, configurationController.delete);

module.exports = router;
