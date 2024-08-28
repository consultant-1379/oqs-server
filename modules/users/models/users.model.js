'use strict';

/**
 * Module dependencies
 */
var crypto = require('crypto'),
  path = require('path'),
  mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  validator = require('validator'),
  generatePassword = require('generate-password'),
  owasp = require('owasp-password-strength-test'),
  config = require('../../../config/config'),
  meanDbConn = mongoose.createConnection(config.dbMean.uri);

owasp.config(config.shared.owasp);

/**
 * A Validation function for local strategy email
 */
var validateEmail = function (email) {
  return (validator.isEmail(email, { require_tld: false }));
};

var validateUsername = function (username) {
  var usernameRegex = /^(?=[\w.-]+$)(?!.*[._-]{2})(?!\.)(?!.*\.$).{3,34}$/;
  return ((username && usernameRegex.test(username)
    && config.illegalUsernames.indexOf(username) < 0)
  );
};

var userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    trim: true,
    default: '',
    required: 'Please fill in a first name'
  },
  lastName: {
    type: String,
    trim: true,
    default: '',
    required: 'Please fill in a last name'
  },
  displayName: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    index: {
      unique: true,
      sparse: true // For this to work on a previously indexed field, the index must be dropped & the application restarted.
    },
    lowercase: true,
    trim: true,
    default: '',
    validate: [validateEmail, 'Please fill in a valid email address']
  },
  username: {
    type: String,
    unique: 'Username already exists',
    required: 'Please fill in a username',
    validate: [validateUsername, 'Please enter a valid username: 3+ characters long, non restricted word, characters "_-.", no ' +
    'consecutive dots, does not begin or end with dots, letters a-z and numbers 0-9.'],
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    default: ''
  },
  salt: {
    type: String
  },
  roles: {
    type: [{
      type: String,
      enum: ['user', 'admin', 'superAdmin']
    }],
    default: ['user'],
    required: 'Please provide at least one role'
  },
  updated: {
    type: Date
  },
  created: {
    type: Date,
    default: Date.now
  }
});

/**
 * Hook a pre save method to hash the password
 */
userSchema.pre('save', function (next) {
  if (this.password && this.isModified('password')) {
    this.salt = crypto.randomBytes(16).toString('base64');
    this.password = this.hashPassword(this.password);
  }
  next();
});

/**
 * Create instance method for hashing a password
 */
userSchema.methods.hashPassword = function (password) {
  if (this.salt && password) {
    return crypto.pbkdf2Sync(password, Buffer.from(this.salt, 'base64'), 10000, 64, 'SHA1').toString('base64');
  }
  return password;
};

/**
 * Create instance method for authenticating user
 */
userSchema.methods.authenticate = function (password) {
  return this.password === this.hashPassword(password);
};

module.exports.Schema = meanDbConn.model('User', userSchema);
