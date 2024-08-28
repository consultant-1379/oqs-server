var chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  request = require('supertest'),
  sinon = require('sinon'),
  server = require('../../../server'),
  PodHistory = require('../../history/models/history.model').getSchema('pods'),
  DeplHistory = require('../../history/models/history.model').getSchema('deployments'),
  Pod = require('../../pods/models/pods.model').Schema,
  Deployment = require('../../deployments/models/deployments.model').Schema,
  User = require('../../users/models/users.model').Schema,
  Configuration = require('../../configurations/models/configurations.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  configuration,
  response,
  userObject,
  testObjId;

var invalidObjID = '000000000000000000000000';

// Fake sinon errors
var fakeCallbackErr = function (callback) {
  process.nextTick(function () {
    callback(new Error('Simulated Error'));
  });
};

// Pods
var testPod1 = { name: 'testCloud1', queueEnabled: false };
var testPod2 = { name: 'testCloud2', queueEnabled: false };

// Deployments
var testDepl1 = { name: 'testDepl1', associatedPod: testPod1.name, jobType: 'Install' };
var testDepl2 = { name: 'testdepl2', associatedPod: testPod1.name, jobType: 'Install' };

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
var testConfig = {
  name: 'testConfig',
  defaultPodLoadTolerance: 70,
  products: [{
    name: 'vENM',
    defaultProductLoadValue: 60,
    defaultProductTimeoutValue: 50
  },
  {
    name: 'cENM',
    defaultProductLoadValue: 60,
    defaultProductTimeoutValue: 50
  },
  {
    name: 'CCD',
    defaultProductLoadValue: 60,
    defaultProductTimeoutValue: 50
  }]
};

describe('History Log API tests', function () {
  before(function () {
    sinon.restore();
    agent = request.agent(server);
  });

  beforeEach(async function () {
    userObject = new User(validAdminUser);
    await userObject.save();
    response = await agent.post('/configurations').auth(validAdminUser.username, validAdminUser.password).send(testConfig).expect(201);
    configuration = response.body;
    response = null;
  });

  describe('GET logs/pods', function () {
    it('should get a pod log list with 0 elements', async function () {
      response = await agent.get('/logs/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(0);
    });

    it('should get a pod log list with 1 element', async function () {
      await agent.post('/pods').send(testPod1).expect(201);
      response = await agent.get('/logs/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);
    });

    it('should get a pod log list with more than 1 element', async function () {
      await agent.post('/pods').send(testPod1).expect(201);
      await agent.post('/pods').send(testPod2).expect(201);

      response = await agent.get('/logs/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
    });

    it('should return an error message and status 422 when the Pod.find function fails', async function () {
      sinon.replace(PodHistory, 'find', fakeCallbackErr);
      response = await agent.get('/logs/pods').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Pods\' logs.');
    });
  });

  describe('GET logs/deployments', function () {
    it('should get a deployment log list with 0 elements', async function () {
      response = await agent.get('/logs/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(0);
    });

    it('should get a deployment log list with 1 element', async function () {
      await agent.post('/deployments').send(testDepl1).expect(201);
      response = await agent.get('/logs/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);
    });

    it('should get a deployment log list with more than 1 element', async function () {
      await agent.post('/deployments').send(testDepl1).expect(201);
      await agent.post('/deployments').send(testDepl2).expect(201);

      response = await agent.get('/logs/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
    });

    it('should return an error message and status 422 when the Pod.find function fails', async function () {
      sinon.replace(DeplHistory, 'find', fakeCallbackErr);
      response = await agent.get('/logs/deployments').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployments\' logs.');
    });
  });

  describe('GET logs/pods/{:id}', function () {
    it('should get a single pods log with its ID value', async function () {
      response = await agent.post('/pods').send(testPod1).expect(201);
      testObjId = response.body._id;

      response = await agent.get('/logs/pods/' + testObjId).expect(200);
      expect(response.body.associated_id).to.deep.equal(testObjId);
      expect(response.body.originalData).to.not.equal(undefined);
      expect(response.body.originalData.name).to.deep.equal(testPod1.name);
    });

    it('should throw 404 when a correctly formatted Pod ID is not in database', async function () {
      response = await agent.get('/logs/pods/' + invalidObjID).expect(404);
      expect(response.body.message).to.deep.equal('A log does not exist for a Pod with the ID specified. Ensure you enter the Pods ID, not the logs ID.');
    });

    it('should throw 404 when an incorrectly formatted Pod ID is used for searching the database', async function () {
      response = await agent.get('/logs/pods/0').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve log for specified Pod ID.');
    });
  });

  describe('GET logs/deployments/{:id}', function () {
    it('should get a single deployments log with its ID value', async function () {
      response = await agent.post('/deployments').send(testDepl1).expect(201);
      expect(response.body.newDeployment).to.not.equal(undefined);
      testObjId = response.body.newDeployment._id;
      response = await agent.get('/logs/deployments/' + testObjId).expect(200);
      expect(response.body.associated_id).to.deep.equal(testObjId);
      expect(response.body.originalData).to.not.equal(undefined);
      expect(response.body.originalData.name).to.deep.equal(testDepl1.name);
      expect(response.body.originalData.associatedPod).to.deep.equal(testDepl1.associatedPod);
      expect(response.body.originalData.jobType).to.deep.equal(testDepl1.jobType);
    });

    it('should throw 404 when a correctly formatted Deployment ID is not in database', async function () {
      response = await agent.get('/logs/deployments/' + invalidObjID).expect(404);
      expect(response.body.message).to.deep.equal('A log does not exist for a Deployment with the ID specified. Ensure you enter the Deployments ID, not the logs ID.');
    });

    it('should throw 404 when an incorrectly formatted Deployment ID is used for searching the database', async function () {
      response = await agent.get('/logs/deployments/0').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve log for specified Deployment ID.');
    });
  });

  describe('GET logs/configurations/{:id}', function () {
    it('should get a single configurations log with its ID value', async function () {
      testObjId = configuration._id;
      response = await agent.get('/logs/configurations/' + testObjId).expect(200);
      expect(response.body.associated_id).to.deep.equal(testObjId);
      expect(response.body.originalData).to.not.equal(undefined);
      expect(response.body.originalData.name).to.deep.equal(testConfig.name);
      expect(response.body.originalData.defaultPodLoadTolerance).to.deep.equal(testConfig.defaultPodLoadTolerance);
      expect(response.body.originalData.products[0].defaultProductLoadValue).to.deep.equal(testConfig.products[0].defaultProductLoadValue);
      expect(response.body.originalData.products[0].defaultProductTimeoutValue).to.deep.equal(testConfig.products[0].defaultProductTimeoutValue);
      expect(response.body.originalData.products[1].defaultProductLoadValue).to.deep.equal(testConfig.products[1].defaultProductLoadValue);
      expect(response.body.originalData.products[1].defaultProductTimeoutValue).to.deep.equal(testConfig.products[1].defaultProductTimeoutValue);
      expect(response.body.originalData.products[2].defaultProductLoadValue).to.deep.equal(testConfig.products[2].defaultProductLoadValue);
      expect(response.body.originalData.products[2].defaultProductTimeoutValue).to.deep.equal(testConfig.products[2].defaultProductTimeoutValue);
    });

    it('should throw 404 when a correctly formatted Configuration ID is not in database', async function () {
      response = await agent.get('/logs/configurations/' + invalidObjID).expect(404);
      expect(response.body.message).to.deep.equal('A log does not exist for a Configuration with the ID specified. Ensure you enter the Configurations ID, not the logs ID.');
    });

    it('should throw 404 when an incorrectly formatted Deployment ID is used for searching the database', async function () {
      response = await agent.get('/logs/configurations/0').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve log for specified Configuration ID.');
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Pod.remove().exec();
    await Deployment.remove().exec();
    await PodHistory.remove().exec();
    await DeplHistory.remove().exec();
    await Configuration.remove().exec();
  });

  after(async function () {
    sinon.restore();
    await User.remove().exec();
    await Pod.remove().exec();
    await Deployment.remove().exec();
    await PodHistory.remove().exec();
    await DeplHistory.remove().exec();
    await Configuration.remove().exec();
  });
});
