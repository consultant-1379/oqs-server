var fs = require('fs'),
  chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  semver = require('semver'),
  request = require('supertest'),
  sinon = require('sinon'),
  server = require('../../../server'),
  HistoryPods = require('../../history/models/history.model').getSchema('pods'),
  HistoryDeployments = require('../../history/models/history.model').getSchema('deployments'),
  User = require('../../users/models/users.model').Schema,
  Configuration = require('../../configurations/models/configurations.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  configuration,
  response,
  validPod,
  validDeployment,
  podObject,
  userObject,
  deploymentObject;

// Users
var validAdminUser = {
  username: 'testuser',
  password: 'validPassword',
  firstName: 'firstName',
  roles: ['admin'],
  lastName: 'lastName',
  displayName: 'firstName lastName',
  email: 'testuser@ericsson.com'
};

// Configuration
var testConfigurationFull = {
  name: 'testConfigFull',
  defaultPodLoadTolerance: 77,
  products: [{
    name: 'vENM',
    defaultProductLoadValue: 15,
    defaultProductTimeoutValue: 60
  },
  {
    name: 'cENM',
    defaultProductLoadValue: 15,
    defaultProductTimeoutValue: 60
  },
  {
    name: 'CCD',
    defaultProductLoadValue: 15,
    defaultProductTimeoutValue: 60
  }]
};

describe('CORE API tests', function () {
  before(function () {
    sinon.restore();
    agent = request.agent(server);
  });
  beforeEach(async function () {
    userObject = new User(validAdminUser);
    await userObject.save();
    response = await agent.post('/configurations').auth(validAdminUser.username, validAdminUser.password).send(testConfigurationFull).expect(201);
    configuration = response.body;
    response = null;
  });

  describe('GET core/versions', function () {
    it('should stub the return of OQS container versions', async function () {
      sinon.stub(fs, 'readFileSync').returns('1.2.3');
      response = await agent.get('/core/versions').expect(200);

      expect(response).to.have.property('body');
      expect(semver.gt(response.body.server, '0.0.0')).to.deep.equal(true);
      expect(semver.gt(response.body.client, '0.0.0')).to.deep.equal(true);
      expect(semver.gt(response.body.apidocs, '0.0.0')).to.deep.equal(true);
      expect(semver.gt(response.body.helpdocs, '0.0.0')).to.deep.equal(true);
      expect(semver.gt(response.body.baseline, '0.0.0')).to.deep.equal(true);
    });

    it('should stub the return of an error message and status 500 when failure occurs whilst retrieving volumes', async function () {
      sinon.stub(fs, 'readFileSync').throws(new Error('Simulated Error'));
      response = await agent.get('/core/versions').expect(500);

      expect(response).to.have.property('body');
      expect(response.body).to.deep.equal('Error Retrieving Versions: Simulated Error.');
    });
  });

  describe('Testing GET /core/upgradeEmail', function () {
    it('should return 200', async function () {
      var response = await agent.get('/core/upgradeEmail').expect(200);
    });
  });

  describe('GET /core/toolnotifications', function () {
    it('should return 200', async function () {
      response = await agent.get('/core/toolnotifications').expect(200);
    });
  });

  describe('GET core/artifactCleanup', function () {
    it('should return success message when triggering cleanup for old artifact logs', async function () {
      response = await agent.get('/core/artifactCleanup').expect(200);
      expect(response.body.message).to.equal('Logs cleared successfully');
    });

    it('should remove deleted artifacts logs older than six months when triggering a cleanup', async function () {
      validPod = { name: 'testCloud1', queueEnabled: false };
      response = await agent.post('/pods').send(validPod).expect(201);
      podObject = response.body;
      await agent.delete('/pods/' + podObject._id).auth(validAdminUser.username, validAdminUser.password).expect(204);

      validDeployment = { name: 'testDepl1', associatedPod: podObject.name, jobType: 'Install' };
      response = await agent.post('/deployments').send(validDeployment).expect(201);
      deploymentObject = response.body.newDeployment;
      await agent.delete('/deployments/' + deploymentObject._id).expect(200);
      var deploymentPod = response.body.podObject;
      await agent.delete('/pods/' + deploymentPod._id).auth(validAdminUser.username, validAdminUser.password).expect(204);

      response = await agent.get('/logs/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
      response = await agent.get('/logs/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);

      var sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
      var podLog = await HistoryPods.findOne({ associated_id: podObject._id }).exec();
      podLog.deletedAt = sevenMonthsAgo;
      await podLog.save();
      var deploymentPodLog = await HistoryPods.findOne({ associated_id: deploymentPod._id }).exec();
      deploymentPodLog.deletedAt = sevenMonthsAgo;
      await deploymentPodLog.save();
      var deploymentLog = await HistoryDeployments.findOne({ associated_id: deploymentObject._id }).exec();
      deploymentLog.deletedAt = sevenMonthsAgo;
      await deploymentLog.save();

      await agent.get('/core/artifactCleanup').expect(200);
      response = await agent.get('/logs/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(0);
      response = await agent.get('/logs/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(0);
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Configuration.remove().exec();
  });
});
