'use strict';

process.env.LDAP_URL = 'ldap://ldap';
process.env.SEARCH_FILTER = '(cn={{username}})';
process.env.BASE_DN_LIST = 'dc=example,dc=org:dc=example,dc=org';
process.env.BIND_DN = 'cn=admin,dc=example,dc=org';
process.env.BIND_CREDENTIALS = 'admin';

var path = require('path'),
  superagentDefaults = require('superagent-defaults'),
  supertest = require('supertest'),
  chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  ldap = require(path.resolve('./config/lib/ldap')),
  ldapjs = require('ldapjs'),
  request = require('supertest'),
  passport = require('passport'),
  sinon = require('sinon'),
  _ = require('lodash'),
  server = require('../../../server'),
  User = require('../models/users.model').Schema,
  Session = require('../models/sessions.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  nonAuthAgent,
  invalidCredentials,
  localCredentials,
  ldapCredentials,
  localUser,
  localLdapUser,
  ldapSpy,
  ldapClient,
  localUserObject,
  response,
  validUser,
  userObject;

const ldapUser = {
  displayName: 'theDisplayName',
  givenName: 'theGivenName',
  sn: 'thesn',
  cn: 'ldapuser',
  mail: 'email@ericsson.com',
  userPassword: 'validPassword1',
  objectClass: ['person', 'organizationalPerson', 'inetOrgPerson']
};

describe('User API tests', function () {
  before(async function () {
    agent = request.agent(server);
    nonAuthAgent = superagentDefaults(supertest(server));
    ldapClient = ldapjs.createClient({
      url: process.env.LDAP_URL
    });
    await ldapClientBind(ldapClient, process.env.BIND_DN, process.env.BIND_CREDENTIALS);
    await ldapClientAdd(ldapClient, 'cn=ldapuser,dc=example,dc=org', ldapUser);
    var otherValidPasswords = [
      'validPassword2',
      'validPassword3',
      'validPassword4',
      'validPassword5',
      'validPassword6'
    ];
    var modifyPromises = [];
    for (var x = 0; x < otherValidPasswords.length; x += 1) {
      var change = new ldapjs.Change({
        operation: 'add',
        modification: {
          userPassword: otherValidPasswords[x]
        }
      });
      modifyPromises.push(ldapClientModify(ldapClient, 'cn=ldapuser,dc=example,dc=org', change));
    }
    await Promise.all(modifyPromises);
    ldapSpy = sinon.spy(passport, 'authenticate');
  });

  beforeEach(function () {
    response = null;
    ldapSpy.resetHistory();
    invalidCredentials = {
      username: 'invalidName',
      password: 'invalidPass1'
    };

    localCredentials = {
      username: 'username',
      password: 'validPassword1'
    };

    ldapCredentials = {
      username: 'ldapuser',
      password: 'validPassword2'
    };

    localUser = {
      firstName: 'Full',
      lastName: 'Name',
      displayName: 'Full Name',
      email: 'test@test.com',
      cn: localCredentials.username,
      username: localCredentials.username,
      password: localCredentials.password,
      provider: 'local'
    };

    localLdapUser = {
      firstName: 'Full',
      lastName: 'Names',
      displayName: 'Full Name',
      email: 'ldapTest@test.com',
      cn: ldapCredentials.username,
      username: ldapCredentials.username,
      password: ldapCredentials.password,
      provider: 'mockLdap'
    };

    validUser = {
      username: 'testUser',
      password: 'validPassword',
      firstName: 'firstName',
      roles: ['admin'],
      lastName: 'lastName',
      email: 'testUser@ericsson.com'
    };

    userObject = new User(validUser);
    userObject.save();
  });

  describe('Message Body Sign In / Sign Out', function () {
    it('should be able to successfully login/logout with locally cached username/password without contacting mock ldap', async function () {
      this.retries(10);
      localUserObject = new User(localUser);
      await localUserObject.save();
      await agent.post('/auth/signin').send(localCredentials).expect(200);
      response = await agent.get('/auth/signout').send(localCredentials).expect(200);
      expect(response.body.message).to.deep.equal('Successfully Signed out of Session.');
    });

    it('should not be able to login with invalid username and password', async function () {
      this.retries(10);
      response = await agent.post('/auth/signin').send(invalidCredentials).expect(422);
      expect(response.body.message).to.deep.equal('Invalid username or password');
    });

    it('should be able to check for and return a Session using a sessionID', async function () {
      this.retries(10);
      localUserObject = new User(localUser);
      await localUserObject.save();
      await agent.post('/auth/signin').send(localCredentials).expect(200);
      response = await agent.get('/auth/checkForSession').expect(200);
      expect(response.body.firstName).to.deep.equal(localUser.firstName);
      expect(response.body.lastName).to.deep.equal(localUser.lastName);
      expect(response.body.email).to.deep.equal(localUser.email);
      expect(response.body.displayName).to.deep.equal(localUser.displayName);
      expect(response.body.username).to.deep.equal(localUser.username);
    });

    it('should not be able to find a Session with an invalid sessionID', async function () {
      this.retries(10);
      response = await agent.get('/auth/checkForSession').send({ sessionID: '000000000000' });
      expect(response).to.have.status(200);
      expect(response.body).to.be.empty; // eslint-disable-line no-unused-expressions
    });

    it('should not be able to find a Session without specifying a sessionID', async function () {
      this.retries(10);
      response = await agent.get('/auth/checkForSession').expect(200);
      expect(response.body).to.be.empty; // eslint-disable-line no-unused-expressions
    });

    it('should return an empty object and status 200 when User.findById returns undefined during checkForSession', function (done) {
      this.retries(10);
      localUserObject = new User(localUser);
      localUserObject.save(async function (err, testUser) {
        await agent.post('/auth/signin').send(localCredentials).expect(200);
        await User.findByIdAndDelete(testUser._id);
        response = await agent.get('/auth/checkForSession').expect(200);
        expect(response.body).to.be.empty; // eslint-disable-line no-unused-expressions
        done();
      });
    });

    it('should return an error message and status 500 when new User fails to signout', async function () {
      this.retries(10);
      sinon.mock(Session).expects('findOneAndDelete').yields(new Error('Simulated Error.'));
      response = await agent.get('/auth/signout').expect(500);
      expect(response.body.message).to.deep.equal('Failed to Signout of Session: Internal Server Error.');
    });

    it('should return an error message and status 422 when Session.findOne fails during checkForSession', async function () {
      this.retries(10);
      sinon.mock(Session).expects('findOne').chain('exec').yields(new Error('Simulated Error.'));
      response = await agent.get('/auth/checkForSession').expect(422);
      expect(response.body.message).to.deep.equal('Error: Failed to Retrieve Session.');
    });
  });

  describe('User Permission Policy', function () {
    describe('GET Users', function () {
      var localLdapUserObject;

      beforeEach(async function () {
        localLdapUserObject = new User(localLdapUser);
        await localLdapUserObject.save();
      });

      it('should be able to list users', async function () {
        var response = await agent.get('/users').expect(200);
        response.body.length.should.equal(2);
      });

      it('should be able to get a list of users when user is authenticated', async function () {
        await agent.get('/users').expect(200);
      });

      it('should be able to get a list of users when user not authenticated', async function () {
        await nonAuthAgent.get('/users').expect(200);
      });

      it('should get a single users details', async function () {
        var response = await agent.get('/users/' + localLdapUserObject._id).expect(200);
        response.body.username.should.equal(localLdapUser.username);
      });

      it('should not get a single users details when specified id is invalid', async function () {
        var response = await agent.get('/users/000000000000000000000000').expect(404);
        response.body.message.should.equal('A User with that ID does not exist');
      });

      it('should be able to get a single user info when user not authenticated', async function () {
        await nonAuthAgent.get(`/users/${userObject._id}`).expect(200);
      });

      it('should be able to get a single user info when user is authenticated', async function () {
        await agent.get('/users/' + localLdapUserObject._id).expect(200);
      });
    });
    describe('PUT Users', function () {
      var localLdapUserObject;

      beforeEach(async function () {
        process.env.NODE_ENV = 'policyCheckEnabled';
        localLdapUserObject = new User(localLdapUser);
        await localLdapUserObject.save();
      });

      it('should not update a users role when current user is not authenticated', async function () {
        localLdapUserObject.roles = ['admin'];
        response = await nonAuthAgent.put(`/users/${localLdapUserObject._id}`).send(localLdapUserObject).expect(401);
        response.body.message.should.equal('User must be logged in');
      });

      it('should not update a users role when current user is admin-user', async function () {
        userObject.roles = ['admin'];
        await userObject.save();

        localLdapUser.roles = ['admin'];
        var response = await agent.put('/users/' + localLdapUserObject._id).auth(validUser.username, validUser.password).send(localLdapUser).expect(403);
        response.body.message.should.equal('User is not authorized');
      });

      it('should not update a users role when current user is standard-user', async function () {
        userObject.roles = ['user'];
        await userObject.save();

        localLdapUser.roles = ['admin'];
        var response = await agent.put('/users/' + localLdapUserObject._id).auth(validUser.username, validUser.password).send(localLdapUser).expect(403);
        response.body.message.should.equal('User is not authorized');
      });

      it('should update a users role when current user is super-admin', async function () {
        userObject.roles = ['superAdmin'];
        await userObject.save();

        localLdapUser.roles = ['admin'];
        var response = await agent.put('/users/' + localLdapUserObject._id).auth(validUser.username, validUser.password).send(localLdapUser).expect(200);
        response.body.roles[0].should.equal(localLdapUser.roles[0]);
        process.env.NODE_ENV = 'test';
      });
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Session.remove().exec();
  });

  after(async function () {
    await ldapClientDel(ldapClient, 'cn=ldapuser,dc=example,dc=org');
  });
});

function ldapClientBind(ldapClient, user, pass) {
  return new Promise(function (resolve, reject) {
    ldapClient.bind(user, pass, function (err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function ldapClientAdd(ldapClient, base, entry) {
  return new Promise(function (resolve, reject) {
    ldapClient.add(base, entry, function (err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function ldapClientModify(ldapClient, base, change) {
  return new Promise(function (resolve, reject) {
    ldapClient.modify(base, change, function (err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function ldapClientDel(ldapClient, base) {
  return new Promise(function (resolve, reject) {
    ldapClient.del(base, function (err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}
