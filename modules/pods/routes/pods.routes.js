var express = require('express');
var router = express.Router(); //eslint-disable-line
var podController = require('../controllers/pods.controller');
var adminPolicy = require('../../../config/lib/policy');

router.get('/', podController.list);

router.post('/', podController.create);

router.get('/search', podController.search);

router.get('/:id', podController.findById);

router.put('/:id', adminPolicy.isAllowed, podController.update);

router.delete('/:id', adminPolicy.isAllowed, podController.delete);

module.exports = router;
