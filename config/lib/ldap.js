'use strict';

var path = require('path');
var passport = require('passport');
var LdapStrategy = require('passport-ldapauth');
var User = require('../../modules/users/models/users.model.js').Schema;
var Session = require('../../modules/users/models/sessions.model').Schema;
var errorHandler = require('../../modules/core/controllers/errors.controller');
var baseDNArray;
var baseDNIndex = 0;

function getNextBaseDNIndex() {
  return (baseDNIndex < baseDNArray.length - 1 ? baseDNIndex + 1 : 0);
}

// Serialize sessions
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findOne({
    _id: id
  }, '-salt -password', function (err, user) {
    done(err, user);
  });
});

function getLDAPConfiguration(req, callback) {
  baseDNIndex = getNextBaseDNIndex();
  var baseDN = baseDNArray[baseDNIndex];
  process.nextTick(function () {
    var opts = {
      server: {
        url: process.env.LDAP_URL,
        bindDn: process.env.BIND_DN || 'cn=' + req.loginUsername + ',' + baseDN,
        bindCredentials: process.env.BIND_CREDENTIALS || req.loginPassword,
        searchBase: baseDN,
        searchFilter: process.env.SEARCH_FILTER,
        searchAttributes: ['displayName', 'givenName', 'sn', 'cn', 'mail']
      },
      credentialsLookup: function (req) {
        return {
          name: req.loginUsername,
          pass: req.loginPassword
        };
      }
    };
    callback(null, opts);
  });
}

function loginSuccess(user, done) {
  return done(null, user);
}

module.exports.addPassportStrategies = function () {
  // Create Ldap strategies from baseDN list.
  var baseDNList = process.env.BASE_DN_LIST;
  if (baseDNList) {
    baseDNArray = baseDNList.split(':');
    for (var i = 0; i < baseDNArray.length; i += 1) {
      passport.use('ldap' + i, new LdapStrategy(getLDAPConfiguration, loginSuccess));
    }
  }
};

function loginUser(req, user) {
  return new Promise(function (resolve, reject) {
    req.login(user, function (err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

exports.determineStrategyNames = async function () {
  var strategyNames = [];
  var baseDNArray = process.env.BASE_DN_LIST.split(':');
  for (var i = 0; i < baseDNArray.length; i += 1) {
    strategyNames.push('ldap' + i);
  }
  return strategyNames;
};

async function signInWithUserPassword(req, res, next) {
  var ldapCalls = [];

  async function getUsersFromStrategies() {
    var strategyNames = await exports.determineStrategyNames();
    for (var i = 0; i < strategyNames.length; i += 1) {
      ldapCalls.push(getUserFromPassportStrategy(strategyNames[i]));
    }

    var unfilteredUsers = await Promise.all(ldapCalls);
    return unfilteredUsers.filter(user => user !== undefined);
  }

  function getUserFromPassportStrategy(strategyName) {
    return new Promise(function (resolve, reject) {
      passport.authenticate(strategyName, function (err, ldapUser) {
        if (ldapUser) {
          resolve(ldapUser);
        }
        resolve();
      })(req, res, next);
    });
  }

  var user = await User.findOne({ username: req.loginUsername });

  if (user && user.authenticate(req.loginPassword)) {
    await loginUser(req, user);
    return user;
  }

  var returnedUsers = await getUsersFromStrategies();
  if (returnedUsers.length === 0) {
    throw new Error('Invalid username or password');
  }
  var ldapUser = returnedUsers[0];

  if (!user) {
    user = new User();
    user.displayName = ldapUser.displayName;
    user.firstName = ldapUser.givenName || 'unknownFN';
    user.lastName = ldapUser.sn;
    user.username = ldapUser.cn;
    user.email = ldapUser.mail || 'unknown@ericsson.com';
  }
  user.password = req.loginPassword;
  await user.save();
  await loginUser(req, user);
  return user;
}

function parseBasicAuthenticationUserPass(req) {
  if (!req.headers.authorization) {
    return null;
  }
  var buf = Buffer.from(req.headers.authorization.split(' ')[1], 'base64');
  var plainAuth = buf.toString();
  var creds = plainAuth.split(':');
  return {
    username: creds[0],
    password: creds[1]
  };
}

exports.signInFromBasicAuthentication = function () {
  return async function (req, res, next) {
    var basicAuthenticationUserPass = parseBasicAuthenticationUserPass(req);
    if (basicAuthenticationUserPass) {
      req.loginUsername = basicAuthenticationUserPass.username.toLowerCase();
      req.loginPassword = basicAuthenticationUserPass.password;
      try {
        await signInWithUserPassword(req, res, next);
      } catch (err) {
        return res.status(401).send({
          message: errorHandler.getErrorMessage(err)
        });
      }
      return next();
    }
    return next();
  };
};

exports.signinFromLoginPage = function (req, res, next) {
  req.loginUsername = req.body.username.toLowerCase();
  req.loginPassword = req.body.password;
  return signInWithUserPassword(req, res, next);
};
