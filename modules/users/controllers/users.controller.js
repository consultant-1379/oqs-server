'use strict';

var mongoose = require('mongoose'),
  _ = require('lodash'),
  mongoMask = require('mongo-mask'),
  errorHandler = require('../../core/controllers/errors.controller'),
  ldap = require('../../../config/lib/ldap'),
  Session = require('../models/sessions.model').Schema,
  User = require('../models/users.model').Schema;
/**
 * users.controller.js
 *
 * @description :: Server-side logic for managing Users.
 */

exports.update = async function (req, res) {
  delete req.body.created;
  var user = _.extend(req.user, req.body);
  try {
    await user.save();
    res.json(user);
  } catch (err) {
    return res.status(422).send({
      message: errorHandler.getErrorMessage(err)
    });
  }
};

exports.read = function (req, res) {
  var modelInstance = req.user ? req.user.toJSON() : {};
  var strippedModelInstance = {
    displayName: modelInstance.displayName,
    username: modelInstance.username,
    email: modelInstance.email
  };
  res.json(strippedModelInstance);
};

exports.signin = async function (req, res, next) {
  try {
    var user = await ldap.signinFromLoginPage(req, res, next);
    user.password = undefined;
    user.salt = undefined;
    res.json(user);
  } catch (err) {
    return res.status(422).send({
      message: errorHandler.getErrorMessage(err)
    });
  }
};

exports.signout = function (req, res) {
  Session.findOneAndDelete({ _id: req.sessionID }, function (err) {
    if (err) {
      return res.status(500).send({ message: 'Failed to Signout of Session: Internal Server Error.' });
    }
    return res.status(200).send({ message: 'Successfully Signed out of Session.' });
  });
};

exports.list = async function (req, res) {
  try {
    var users = await User.find({}, '-salt -password -providerData').sort('-created').populate('user', 'displayName').exec();
    res.json(users);
  } catch (err) {
    return res.status(422).send({
      message: errorHandler.getErrorMessage(err)
    });
  }
};

exports.checkForSession = async function (req, res) {
  var safeUserObject = {};
  try {
    var session = await Session.findOne({ _id: req.sessionID });
    if (session) {
      var sessionUserId = JSON.parse(session.session).passport.user;
      var user = await User.findById(sessionUserId);
      if (user) {
        safeUserObject = {
          displayName: user.displayName,
          username: user.username,
          created: user.created.toString(),
          roles: user.roles,
          email: user.email,
          lastName: user.lastName,
          firstName: user.firstName,
          isValid: true
        };
      }
    }
  } catch (err) {
    return res.status(422).json({ message: 'Error: Failed to Retrieve Session.' });
  }
  return res.status(200).send(safeUserObject);
};

exports.findById = async function (req, res, next, userId) {
  User.findById(userId).exec(function (err, user) {
    if (user == null || err) {
      return res.status(404).send({
        message: 'A User with that ID does not exist'
      });
    }
    req.user = user;
    return next();
  });
};
