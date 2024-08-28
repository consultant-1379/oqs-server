'use strict';

var acl = require('acl');
var mongoose = require('mongoose');
var User = mongoose.model('User');

acl = new acl(new acl.memoryBackend());

exports.invokeRolesPolicies = function () {
  acl.allow([
    {
      roles: ['user'],
      allows: [{
        resources: '/api/users',
        permissions: ['get']
      }, {
        resources: '/api/users/:userId',
        permissions: ['get']
      }, {
        resources: '/api/pods',
        permissions: ['get']
      }, {
        resources: '/api/pods/:id',
        permissions: ['get']
      }, {
        resources: '/api/configurations',
        permissions: ['get']
      }, {
        resources: '/api/configurations/:id',
        permissions: ['get']
      }]
    },
    {
      roles: ['admin'],
      allows: [{
        resources: '/api/users',
        permissions: ['get']
      }, {
        resources: '/api/users/:userId',
        permissions: ['get']
      }, {
        resources: '/api/pods',
        permissions: '*'
      }, {
        resources: '/api/pods/:id',
        permissions: '*'
      }, {
        resources: '/api/configurations',
        permissions: '*'
      }, {
        resources: '/api/configurations/:id',
        permissions: '*'
      }]
    },
    {
      roles: ['superAdmin'],
      allows: [{
        resources: '/api/users',
        permissions: '*'
      }, {
        resources: '/api/users/:userId',
        permissions: '*'
      }, {
        resources: '/api/pods',
        permissions: '*'
      }, {
        resources: '/api/pods/:id',
        permissions: '*'
      }, {
        resources: '/api/configurations',
        permissions: '*'
      }, {
        resources: '/api/configurations/:id',
        permissions: '*'
      }]
    }
  ]);
};

exports.isAllowed = async function (req, res, next) {
  if (req.session.passport === undefined) return res.status(401).json({ message: 'User must be logged in' });
  var user = await getUserFromID(req.session.passport.user);
  var reqUrl = `/api${req.baseUrl}`;
  acl.areAnyRolesAllowed(user.roles, reqUrl, req.method.toLowerCase(), function (err, isAllowed) {
    if (err) return res.status(500).send('Unexpected authorization error');
    if (isAllowed) return next();
    return res.status(403).json({ message: 'User is not authorized' });
  });
};

async function getUserFromID(userID) {
  return User.findById(userID, '-salt -password -providerData').exec();
}
