'use strict';

/**
 * Module dependencies
 */
var express = require('express');
var router = express.Router(); //eslint-disable-line
var usersController = require('../controllers/users.controller');

router.post('/signin', usersController.signin);

router.get('/signout', usersController.signout);

router.get('/checkForSession', usersController.checkForSession);

module.exports = router;
