'use strict';

/**
 * Module dependencies
 */
var express = require('express');
var router = express.Router(); //eslint-disable-line
var usersController = require('../controllers/users.controller');
var adminPolicy = require('../../../config/lib/policy');

router.get('/', usersController.list);

router.get('/:userId', usersController.read);

router.put('/:userId', adminPolicy.isAllowed, usersController.update);

router.param('userId', usersController.findById);

module.exports = router;
