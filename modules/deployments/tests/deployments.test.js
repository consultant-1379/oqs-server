var _ = require('lodash'),
  superagentDefaults = require('superagent-defaults'),
  supertest = require('supertest'),
  chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  request = require('supertest'),
  sinon = require('sinon'),
  server = require('../../../server'),
  HistoryDeployments = require('../../history/models/history.model').getSchema('deployments'),
  HistoryPods = require('../../history/models/history.model').getSchema('pods'),
  Deployment = require('../models/deployments.model').Schema,
  Pod = require('../../pods/models/pods.model').Schema,
  User = require('../../users/models/users.model').Schema,
  Configuration = require('../../configurations/models/configurations.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  nonAuthAgent,
  configuration,
  response,
  deplReturned,
  logReturned,
  logUpdate,
  testDeplId,
  testPodId,
  userObject;

// Fake sinon errors
var fakeCallbackErr = function (callback) {
  process.nextTick(function () {
    callback(new Error('Simulated Error'));
  });
};

// Configuration
var testConfigurationFull = {
  name: 'testConfigFull',
  defaultPodLoadTolerance: 50,
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

// Pods
var defaultQueueEnabled = false;
var defaultPodLoadTolerance = 50;
var defaultProductType = ['All'];

var testPod = { name: 'testPod', queueEnabled: false };

// Deployments
var defaultQueueStatus = 'Queued';
var invalidDeploymentID = '000000000000000000000000';
var product = 'vENM';

var testDepl = {
  name: 'testDepl',
  associatedPod: testPod.name,
  queueStatus: 'Queued',
  jobType: 'Install'
};

var testDeplDefined = {
  name: 'testDepDefined',
  associatedPod: testPod.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'cENM'
};

var testDeplUpdateStatus = { queueStatus: 'Active' };

var testDeplcENM = {
  name: 'testDeplcENM',
  associatedPod: testPod.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'cENM'
};
var testDeplCCD = {
  name: 'testDeplCCD',
  associatedPod: testPod.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'CCD'
};
var testDeplvENM = {
  name: 'testDeplvENM',
  associatedPod: testPod.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'vENM'
};

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

describe('Deployment API tests', function () {
  before(function () {
    sinon.restore();
    agent = request.agent(server);
    nonAuthAgent = superagentDefaults(supertest(server));
  });

  beforeEach(async function () {
    userObject = new User(validAdminUser);
    await userObject.save();
    response = await agent.post('/configurations').auth(validAdminUser.username, validAdminUser.password).send(testConfigurationFull).expect(201);
    configuration = response.body;
    response = await agent.post('/pods').send(testPod).expect(201);
    testPodId = response.body._id;
    response = null;
  });

  describe('GET deployments/', function () {
    it('should get a deployment list with 0 elements', async function () {
      response = await agent.get('/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(0);
    });

    it('should get a deployment list with 1 element', async function () {
      await agent.post('/deployments').send(testDepl).expect(201);

      response = await agent.get('/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(1);
    });

    it('should get a deployment list with more than 1 element', async function () {
      await agent.post('/deployments').send(testDepl).expect(201);

      var testDepl2 = { name: 'testDep2', associatedPod: testPod.name, jobType: 'Install' };
      await agent.post('/deployments').send(testDepl2).expect(201);

      response = await agent.get('/deployments').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(2);
    });

    it('should return an error message and status 422 when the Deployment.find function fails', async function () {
      sinon.replace(Deployment, 'find', fakeCallbackErr);
      response = await agent.get('/deployments').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployments.');
    });
  });

  describe('GET deployments/search?{query}', function () {
    var queuedDeployment = {
      name: 'testDepA',
      associatedPod: testPod.name,
      queueStatus: 'Queued',
      jobType: 'Install'
    };
    var activeDeployment = {
      name: 'testDepB',
      associatedPod: testPod.name,
      queueStatus: 'Active',
      jobType: 'Install'
    };

    beforeEach(async function () {
      await agent.post('/deployments').send(queuedDeployment);
      await agent.post('/deployments').send(activeDeployment);
    });

    it('should return all Deployments when no search filter criteria is provided', async function () {
      response = await agent.get('/deployments/search').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(2);
    });

    it('should get a collection of deployments matching the search criteria with one query param', async function () {
      response = await agent.get('/deployments/search?associatedPod=testPod').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(2);
    });

    it('should get a smaller collections of deployments when matching the search criteria with two query params', async function () {
      // there should be less deployments returned when specifying more params
      response = await agent.get('/deployments/search?associatedPod=testPod&queueStatus=Queued').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(2);
    });

    it('should return an error message and status 422 when the Deployment.find function fails', async function () {
      sinon.mock(Deployment).expects('find').chain('exec').yields(new Error('Simulated Error.'));
      response = await agent.get('/deployments/search').expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error.');
    });
  });

  describe('GET deployments/{:id}', function () {
    it('should get a single deployment with its ID value', async function () {
      response = await agent.post('/deployments').send(testDepl).expect(201);
      expect(response.body).to.have.property('newDeployment');
      testDeplId = response.body.newDeployment._id;

      response = await agent.get('/deployments/' + testDeplId).expect(200);
      expect(response.body._id).to.deep.equal(testDeplId);
      expect(response.body.name).to.deep.equal(testDepl.name);
      expect(response.body.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(response.body.jobType).to.deep.equal(testDepl.jobType);
    });

    it('should throw 404 when a correctly formatted Deployment ID is not in database', async function () {
      response = await agent.get('/deployments/' + invalidDeploymentID).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployment: A Deployment with that ID does not exist.');
    });

    it('should throw 500 when an incorrectly formatted Deployment ID is used for searching the database', async function () {
      response = await agent.get('/deployments/0').expect(500);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployment: Internal Server Error.');
    });
  });

  describe('POST deployments/', function () {
    it('should create a new deployment with default values & create the associated-pod (when none exists) with default values and provide message to state pod has been created', async function () {
      response = await agent.post('/deployments').send(testDepl).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDepl.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(newDeployment.product).to.deep.equal(product);
      expect(newDeployment.queueStatus).to.deep.equal(defaultQueueStatus);
      expect(newDeployment.queuingStartTime).to.not.equal(undefined);
      expect(newDeployment).to.not.have.property('instanceRunningStartTime');

      // Status message about associating deployment to pod.
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDepl.associatedPod} with ${testDepl.name} details.`);

      // Information on the associated Pod
      expect(response.body).to.have.property('podObject');
      var podObject = response.body.podObject;
      expect(podObject.name).to.deep.equal(testDepl.associatedPod);
      expect(podObject.queueEnabled).to.deep.equal(defaultQueueEnabled);
      expect(podObject.products[0].loadValue).to.deep.equal(testConfigurationFull.products[0].defaultProductLoadValue);
      expect(podObject.products[1].loadValue).to.deep.equal(testConfigurationFull.products[1].defaultProductLoadValue);
      expect(podObject.products[2].loadValue).to.deep.equal(testConfigurationFull.products[2].defaultProductLoadValue);
      expect(podObject.products[0].timeoutValue).to.deep.equal(testConfigurationFull.products[0].defaultProductTimeoutValue);
      expect(podObject.products[1].timeoutValue).to.deep.equal(testConfigurationFull.products[1].defaultProductTimeoutValue);
      expect(podObject.products[2].timeoutValue).to.deep.equal(testConfigurationFull.products[2].defaultProductTimeoutValue);
      expect(podObject.podLoadTolerance).to.deep.equal(defaultPodLoadTolerance);
      expect(podObject.productType).to.deep.equal(defaultProductType);
    });

    it('should create a new deployment with defined values & create an associated-pod (when none exists) with default values and provide message to state pod has been created', async function () {
      response = await agent.post('/deployments').send(testDeplDefined).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDeplDefined.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDeplDefined.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal(testDeplDefined.queueStatus);
      expect(newDeployment.product).to.deep.equal(testDeplDefined.product);
      expect(newDeployment).to.have.property('queuingStartTime');

      // Status message about associating deployment to pod.
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplDefined.associatedPod} with ${testDeplDefined.name} details.`); // eslint-disable-line max-len

      // Information on the associated Pod
      expect(response.body).to.have.property('podObject');
      var podObject = response.body.podObject;

      expect(podObject.name).to.deep.equal(testDeplDefined.associatedPod);
      expect(podObject.queueEnabled).to.deep.equal(defaultQueueEnabled);
      expect(podObject.products[0].loadValue).to.deep.equal(testConfigurationFull.products[0].defaultProductLoadValue);
      expect(podObject.products[1].loadValue).to.deep.equal(testConfigurationFull.products[1].defaultProductLoadValue);
      expect(podObject.products[2].loadValue).to.deep.equal(testConfigurationFull.products[2].defaultProductLoadValue);
      expect(podObject.products[0].timeoutValue).to.deep.equal(testConfigurationFull.products[0].defaultProductTimeoutValue);
      expect(podObject.products[1].timeoutValue).to.deep.equal(testConfigurationFull.products[1].defaultProductTimeoutValue);
      expect(podObject.products[2].timeoutValue).to.deep.equal(testConfigurationFull.products[2].defaultProductTimeoutValue);
      expect(podObject.podLoadTolerance).to.deep.equal(defaultPodLoadTolerance);
      expect(podObject.productType).to.deep.equal(defaultProductType);
    });

    it('should create a new deployment with the same product as the associated-pod and queue it accordingly.', async function () {
      var testDepl1 = {
        name: 'testDepl1',
        associatedPod: testPod.name,
        jobType: 'Install',
        product: 'cENM'
      };
      response = await agent.post('/deployments').send(testDepl1).expect(201);
      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDepl1.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDepl1.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(newDeployment.product).to.deep.equal(testDepl1.product);
    });

    it('should create a new deployment with a custom Timeout and queue it accordingly.', async function () {
      var testDepl3 = {
        name: 'testDepl3',
        associatedPod: testPod.name,
        jobType: 'Install',
        customTimeout: 1
      };
      response = await agent.post('/deployments').send(testDepl3).expect(201);
      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;

      expect(newDeployment.name).to.deep.equal(testDepl3.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDepl3.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal('Queued');
      expect(newDeployment.customTimeout).to.deep.equal(testDepl3.customTimeout);
    });

    it('should not create more than one deployment with the same name', async function () {
      // POST the first deployment
      await agent.post('/deployments').send(testDepl).expect(201);

      // Try to post a 2nd deployment with the same name.
      response = await agent.post('/deployments').send(testDepl).expect(400);
      expect(response.body.message).to.deep.equal('Name is not valid, provided name must be unique.');
    });

    it('should not create a deployment with a name with an invalid length - too short', async function () {
      var testDeplShortName = { name: 'xxxx' };
      response = await agent.post('/deployments').send(testDeplShortName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testDeplShortName.name + '`) is shorter than the minimum allowed length (5).');
    });

    it('should not create a deployment with a name with an invalid length - too long', async function () {
      var testDeplLongName = { name: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
      response = await agent.post('/deployments').send(testDeplLongName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testDeplLongName.name + '`) is longer than the maximum allowed length (50).');
    });

    it('should not create a deployment with a name that does not match regex pattern', async function () {
      var testDeplBadRegexName = { name: '!£$%&' };
      response = await agent.post('/deployments').send(testDeplBadRegexName).expect(400);
      expect(response.body.message).to.deep.equal('name is not valid; \'!£$%&\' can only contain letters, numbers, dots, dashes and underscores.');
    });

    it('should not create a deployment without a name key', async function () {
      var testDeplNoName = { associatedPod: 'Cloud1a' };
      response = await agent.post('/deployments').send(testDeplNoName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` is required.');
    });

    it('should not create a deployment with an associated-pod that does not match regex pattern', async function () {
      var testDeplBadRegexPodName = {
        name: 'testDep1',
        associatedPod: '!£$%&'
      };
      response = await agent.post('/deployments').send(testDeplBadRegexPodName).expect(400);
      expect(response.body.message).to.deep.equal('associatedPod is not valid; \'!£$%&\' can only contain letters, numbers, dots, dashes and underscores.');
    });

    it('should not create a deployment with improperly formatted json', async function () {
      var testDeplBadformat = '{[.}]';
      await agent.post('/deployments').send(testDeplBadformat).expect(400);
    });

    it('should create a new deployment with queueStatus set to Queued when an associated-pod exists that has queuing disabled', async function () {
      response = await agent.post('/deployments').send(testDepl).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDepl.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal('Queued');

      // Information on the existing Pod's Queue Status
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDepl.associatedPod} with ${testDepl.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queuing must be enabled for Pod ${testPod.name} before handling.`);
    });

    it('should create a new deployment with queueStatus set to Active when an associated-pod exists that has queuing enabled', async function () {
      // Update Pod so that queuing is enabled
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(true);

      // Create a new Deployment
      response = await agent.post('/deployments').send(testDepl).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDepl.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal('Active');

      // Information on the existing Pod's Queue Status
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDepl.associatedPod} with ${testDepl.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDepl.name}.`); // eslint-disable-line max-len
    });

    it('should create a new Pod when a Deployment is created which is associated with a Pod that does not exist', async function () {
      // Create a new Deployment
      var testDeploymentWithNewPod = {
        name: 'testDeplNewPod',
        associatedPod: 'NewPod',
        jobType: 'Install',
        queueStatus: 'Active'
      };
      response = await agent.post('/deployments').send(testDeploymentWithNewPod).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDeploymentWithNewPod.name);
      expect(newDeployment.associatedPod).to.deep.equal(testDeploymentWithNewPod.associatedPod);
      expect(newDeployment.queueStatus).to.deep.equal(testDeploymentWithNewPod.queueStatus);

      // Information on the new Pod
      expect(response.body).to.have.property('podObject');
      var newPod = response.body.podObject;
      expect(newPod.name).to.deep.equal(testDeploymentWithNewPod.associatedPod);
      expect(newPod.queueEnabled).to.deep.equal(true);
    });

    it('should post a new log with user-details when a deployment is created by a logged-in user', async function () {
      response = await agent.post('/deployments').auth(validAdminUser.username, validAdminUser.password).send(testDepl).expect(201);
      expect(response.body).to.have.property('newDeployment');
      expect(response.body.newDeployment._id).to.have.length(24);
      testDeplId = response.body.newDeployment._id;

      deplReturned = await Deployment.findById(testDeplId).exec();
      expect(deplReturned.name).to.deep.equal(testDepl.name);
      expect(deplReturned.associatedPod).to.deep.equal(testDepl.associatedPod);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.createdBy.email).to.deep.equal(validAdminUser.email);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should post a new log with generic user-details when a deployment is created by a non-logged-in user', async function () {
      response = await nonAuthAgent.post('/deployments').send(testDepl).expect(201);
      expect(response.body).to.have.property('newDeployment');
      expect(response.body.newDeployment._id).to.have.length(24);
      testDeplId = response.body.newDeployment._id;

      deplReturned = await Deployment.findById(testDeplId).exec();
      expect(deplReturned.name).to.deep.equal(testDepl.name);
      expect(deplReturned.associatedPod).to.deep.equal(testDepl.associatedPod);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy).to.deep.equal('UNKNOWN USER');
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should post a new log with undefined user-details when a deployment is created by a logged-in user that is missing user attributes', async function () {
      var userWithUndefinedDetails = await User.findOne({ username: validAdminUser.username });
      expect(userWithUndefinedDetails).to.not.equal(undefined);
      userWithUndefinedDetails.displayName = undefined;
      userWithUndefinedDetails.email = undefined;
      await userWithUndefinedDetails.save();

      response = await agent.post('/deployments').auth(validAdminUser.username, validAdminUser.password).send(testDepl).expect(201);
      expect(response.body).to.have.property('newDeployment');
      expect(response.body.newDeployment._id).to.have.length(24);
      testDeplId = response.body.newDeployment._id;

      deplReturned = await Deployment.findById(testDeplId).exec();
      expect(deplReturned.name).to.deep.equal(testDepl.name);
      expect(deplReturned.associatedPod).to.deep.equal(testDepl.associatedPod);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();

      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.associatedPod).to.deep.equal(testDepl.associatedPod);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal('UNKNOWN NAME');
      expect(logReturned.createdBy.email).to.deep.equal('UNKNOWN EMAIL');
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not post a new log when attempting to create more than one deployment with the same name', async function () {
      // POST the first pod
      await agent.post('/deployments').send(testDepl).expect(201);

      // Try to post a 2nd pod with the same name.
      response = await agent.post('/deployments').send(testDepl).expect(400);
      expect(response.body.message).to.deep.equal('Name is not valid, provided name must be unique.');

      var logsReturned = await HistoryDeployments.find({ 'originalData.name': testDepl.name }).exec();
      expect(logsReturned.length).to.equal(1);
    });

    it('should not post a new log for a Health-Check deployment that is created with a name beginning with \'A_Health_\'', async function () {
      var testDeplHealth = _.cloneDeep(testDepl);
      testDeplHealth.name = 'A_Health_Deployment';
      response = await agent.post('/deployments').send(testDeplHealth).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Deployment
      expect(response.body).to.have.property('newDeployment');
      var newDeployment = response.body.newDeployment;
      expect(newDeployment.name).to.deep.equal(testDeplHealth.name);
      testDeplId = newDeployment._id;

      // Information on the new Log
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.deep.equal(null);
    });

    it('should create 3 new deployments with queueStatus set to Active when an associated-pod exists that has queuing enabled and pod load tolerance is not exceeded', async function () {
      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 45
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 45 }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(true);
      expect(updatedPod.podLoadTolerance).to.deep.equal(45);

      // Create a new Deployment cENM
      response = await agent.post('/deployments').send(testDeplcENM).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cENMDeployment = response.body.newDeployment;
      expect(cENMDeployment.associatedPod).to.deep.equal(cENMDeployment.associatedPod);
      expect(cENMDeployment.queueStatus).to.deep.equal('Active');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplcENM.associatedPod} with ${testDeplcENM.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment vENM
      response = await agent.post('/deployments').send(testDeplvENM).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var vENMDeployment = response.body.newDeployment;
      expect(vENMDeployment.associatedPod).to.deep.equal(vENMDeployment.associatedPod);
      expect(vENMDeployment.queueStatus).to.deep.equal('Active');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplvENM.associatedPod} with ${testDeplvENM.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplvENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Active');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplCCD.name}.`); // eslint-disable-line max-len
    });

    it('should create new deployment with queueStatus set to Queued when an associated-pod exists that has queuing enabled and pod load tolerance is exceeded', async function () {
      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 20
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 20 }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(true);
      expect(updatedPod.podLoadTolerance).to.deep.equal(20);

      // Create a new Deployment cENM
      response = await agent.post('/deployments').send(testDeplcENM).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cENMDeployment = response.body.newDeployment;
      expect(cENMDeployment.associatedPod).to.deep.equal(cENMDeployment.associatedPod);
      expect(cENMDeployment.queueStatus).to.deep.equal('Active');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplcENM.associatedPod} with ${testDeplcENM.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len
    });

    it('should create new deployment with queueStatus set to Active when an associated-pod exists that has queuing enabled and pod load tolerance is not exceeded for that deployment', async function () {
      // NOTE: cENm load tolerance 15, vENM load tolerance 10, CCD load tolerance 15
      // Update Pod so that queuing is enabled and load tolerance = 25
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 25, products: [{ name: 'vENM', loadValue: 10 }, { name: 'cENM', loadValue: 15 }, { name: 'CCD', loadValue: 15 }] }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(true);
      expect(updatedPod.podLoadTolerance).to.deep.equal(25);
      expect(updatedPod.products[0].loadValue).to.deep.equal(10);

      // Create a new Deployment cENM
      response = await agent.post('/deployments').send(testDeplcENM).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cENMDeployment = response.body.newDeployment;
      expect(cENMDeployment.associatedPod).to.deep.equal(cENMDeployment.associatedPod);
      expect(cENMDeployment.queueStatus).to.deep.equal('Active');
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplcENM.associatedPod} with ${testDeplcENM.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD - still queued as load tolerance is over 25 total
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len

      // Create a new Deployment vENM - Active as load tolerance is not exceeding total 25
      response = await agent.post('/deployments').send(testDeplvENM).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var vENMDeployment = response.body.newDeployment;
      expect(vENMDeployment.associatedPod).to.deep.equal(vENMDeployment.associatedPod);
      expect(vENMDeployment.queueStatus).to.deep.equal('Active');
      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplvENM.associatedPod} with ${testDeplvENM.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDeplvENM.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len
    });
  });

  describe('PUT deployments/{id}', function () {
    beforeEach(async function () { // eslint-disable-line
      var res = await agent.post('/deployments').send(testDepl).expect(201);
      testDeplId = res.body.newDeployment._id;
    });

    it('should update partial deployment info (eg. queueStatus = Active)', async function () {
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);
      expect(response.body).to.have.property('updatedDeployment');

      // Information on the updated Deployment
      var updatedDepl = response.body.updatedDeployment;
      expect(updatedDepl._id).to.deep.equal(testDeplId);
      expect(updatedDepl.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
    });

    it('should update full deployment info', async function () {
      var testDeplFullUpdate = {
        queueStatus: 'Finished',
        instanceRunningStartTime: new Date(),
        instanceRunningFinishTime: new Date(),
        product: 'cENM'
      };

      response = await agent.put('/deployments/' + testDeplId).send(testDeplFullUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');

      // Information on the updated Deployment
      var updatedDepl = response.body.updatedDeployment;
      expect(updatedDepl._id).to.deep.equal(testDeplId);
      expect(updatedDepl.queueStatus).to.deep.equal(testDeplFullUpdate.queueStatus);
      expect(updatedDepl.product).to.deep.equal(testDeplFullUpdate.product);

      expect(updatedDepl).to.have.property('instanceRunningStartTime');
      expect(updatedDepl).to.have.property('instanceRunningFinishTime');
    });

    it('should not set instance running finish time when queue status is set to Active', async function () {
      var testDeplUpdate = {
        queueStatus: 'Active'
      };

      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');

      // Information on the updated Deployment
      var updatedDepl = response.body.updatedDeployment;
      expect(updatedDepl._id).to.deep.equal(testDeplId);
      expect(updatedDepl.queueStatus).to.deep.equal(testDeplUpdate.queueStatus);
      expect(updatedDepl).to.have.property('instanceRunningStartTime');
      expect(updatedDepl).to.not.have.property('instanceRunningFinishTime');
    });

    it('should automatically set instance running start time to current time when queue status is set to Active', async function () {
      var testDeplUpdate = { queueStatus: 'Active' };

      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');

      // Information on the updated Deployment
      var updatedDepl = response.body.updatedDeployment;
      expect(updatedDepl._id).to.deep.equal(testDeplId);
      expect(updatedDepl.queueStatus).to.deep.equal(testDeplUpdate.queueStatus);
      expect(updatedDepl).to.have.property('instanceRunningStartTime');
    });

    it('should not update a deployment name - immutable', async function () {
      var testDeplUpdateName = { name: 'UPDATED_DEPL_NAME' };
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateName).expect(406);
      expect(response.body.message).to.deep.equal('Deployment \'name\' field is immutable and cannot be modified.');
    });

    it('should not update an associated-pod\'s name - immutable', async function () {
      var testDeplUpdatePodName = { associatedPod: 'newPodName' };
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdatePodName).expect(406);
      expect(response.body.message).to.deep.equal('Deployment \'associatedPod\' field is immutable and cannot be modified.');
    });

    it('should not update a deployment when an incorrect ID is entered', async function () {
      response = await agent.put('/deployments/' + invalidDeploymentID).send(testDeplUpdateStatus).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployment: A Deployment with that ID does not exist.');
    });

    it('should return an error message and status 422 when the Deployment.find function fails to return the Deployment to be updated', async function () {
      sinon.mock(Deployment).expects('findOne').yields(fakeCallbackErr);
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployment: Internal Server Error.');
    });

    it('should return an error message and status 400 when the Deployment.save function returns a ValidationError', async function () {
      function ValidationError(message) {
        this.name = 'ValidationError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new ValidationError('Simulated ValidationError'));
        });
      };
      sinon.replace(Deployment.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(400);
      expect(response.body.message).to.deep.equal('Simulated ValidationError');
    });

    it('should return an error message and status 400 when the Deployment.save function returns a StrictModeError', async function () {
      function StrictModeError(message) {
        this.name = 'StrictModeError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new StrictModeError('Simulated StrictModeError'));
        });
      };
      sinon.replace(Deployment.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(400);
      expect(response.body.message).to.deep.equal('Simulated StrictModeError');
    });

    it('should return an error message and status 422 when the Deployment.save function returns any other error', async function () {
      sinon.replace(Deployment.prototype, 'save', fakeCallbackErr);
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error');
    });

    it('should return status 200 and just the Deployment object when Parent Pod cannot be found', async function () {
      var fakeEmptyResponse = sinon.fake.returns(undefined);
      sinon.replace(Pod, 'findOne', fakeEmptyResponse);
      response = await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);
      expect(response.body).to.not.equal(undefined);
      expect(response.body.updatedDeployment.name).to.deep.equal(testDepl.name);
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
      expect(response.body.queueMessage).to.deep.equal('Associated Parent-Pod could not be found for queue-handling.');
    });

    it('should update an existing log with generic user-details for a deployment thats updated by a non-logged-in user', async function () {
      response = await nonAuthAgent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment._id).to.have.length(24);
      expect(response.body.updatedDeployment.name).to.deep.equal(testDepl.name);
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy).to.deep.equal('UNKNOWN USER');
      expect(logUpdate.updateData.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
    });

    it('should update an existing log with user-details for a deployment thats updated by a logged-in user', async function () {
      response = await agent.put('/deployments/' + testDeplId)
        .send(testDeplUpdateStatus)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment._id).to.have.length(24);
      expect(response.body.updatedDeployment.name).to.deep.equal(testDepl.name);
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
    });

    it('should create a log with generic user-details for a deployment thats updated by a non-logged-in user', async function () {
      // clear logs and verify
      await HistoryDeployments.remove().exec();
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);

      response = await nonAuthAgent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment._id).to.have.length(24);
      expect(response.body.updatedDeployment.name).to.deep.equal(testDepl.name);
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy).to.deep.equal('UNKNOWN USER');
      expect(logUpdate.updateData.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
    });

    it('should create a log with defined user-details for a deployment that gets updated by a logged-in user', async function () {
      // clear logs and verify
      await HistoryDeployments.remove().exec();
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.put('/deployments/' + testDeplId)
        .send(testDeplUpdateStatus)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment._id).to.have.length(24);
      expect(response.body.updatedDeployment.name).to.deep.equal(testDepl.name);
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueStatus).to.deep.equal(testDeplUpdateStatus.queueStatus);
    });

    it('should not update a deployments existing log-file when the update attributes cannot be parsed into an object', async function () {
      sinon.mock(Deployment.prototype).expects('toObject').throws(new Error('Simulated Error'));
      await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a deployments existing log-file when that deployment cant be found in the database', async function () {
      sinon.mock(Deployment).expects('findById').chain('exec').returns(undefined);
      await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a deployments existing log-file when an error occurs during the process', async function () {
      sinon.mock(Deployment).expects('findById').chain('exec').throws(new Error('Simulated Error'));
      await agent.put('/deployments/' + testDeplId).send(testDeplUpdateStatus).expect(200);
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });
  });

  describe('DELETE deployments/{id}', function () {
    beforeEach(async function () {
      var res = await agent.post('/deployments').send(testDepl).expect(201);
      testPodId = res.body.podObject._id;
      testDeplId = res.body.newDeployment._id;
    });

    it('should successfully delete a deployment using the Deployment ID & update its parent-Pod', async function () {
      response = await agent.delete('/deployments/' + testDeplId).expect(200);
      expect(response.body.message).to.deep.equal('Deployment deleted successfully.\nParent-Pod updated successfully.');
    });

    it('should successfully delete a deployment using the Deployment ID & alert that associated Pod cannot be found', async function () {
      await agent.put('/pods/' + testPodId).send({ deployments: [] }).expect(200);
      await agent.delete('/pods/' + testPodId).expect(204);
      response = await agent.delete('/deployments/' + testDeplId).expect(200);
      expect(response.body.message).to.deep.equal(`Deployment deleted successfully.\nError whilst updating Parent-Pod: ${testDepl.associatedPod} does not correspond to a known Pod.`); // eslint-disable-line max-len
    });

    it('should return a 404 message when using the wrong ID to delete a deployment', async function () {
      response = await agent.delete('/deployments/' + invalidDeploymentID).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Deployment to delete: A Deployment with that ID does not exist.');
    });

    it('should return an error message and status 500 when the Deployment.remove function fails to return the Deployment to be deleted', async function () {
      sinon.mock(Deployment.prototype).expects('remove').yields(fakeCallbackErr);
      response = await agent.delete('/deployments/' + testDeplId).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst deleting Deployment: Internal Server Error.');
    });

    it('should update an existing log with generic user-details for a deployment thats deleted by a non-logged-in user', async function () {
      response = await nonAuthAgent.delete('/deployments/' + testDeplId).expect(200);
      expect(response.body.message).to.contain('Deployment deleted successfully');

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.deep.equal('UNKNOWN USER');
    });

    it('should update an existing log with user-details for a deployment thats deleted by a logged-in user', async function () {
      response = await agent.delete('/deployments/' + testDeplId).auth(validAdminUser.username, validAdminUser.password).expect(200);
      expect(response.body.message).to.contain('Deployment deleted successfully');

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.originalData.queueStatus).to.deep.equal(testDepl.queueStatus);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should create a log with generic user-details for a deployment thats deleted by a non-logged-in user', async function () {
      // clear logs and verify
      await HistoryDeployments.remove().exec();
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);

      response = await nonAuthAgent.delete('/deployments/' + testDeplId).expect(200);
      expect(response.body.message).to.contain('Deployment deleted successfully');

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.deep.equal('UNKNOWN USER');
    });

    it('should create a log with defined user-details for a deployment that gets deleted by a logged-in user', async function () {
      // clear logs and verify
      await HistoryDeployments.remove().exec();
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.delete('/deployments/' + testDeplId).auth(validAdminUser.username, validAdminUser.password).expect(200);
      expect(response.body.message).to.contain('Deployment deleted successfully');

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testDepl.name);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should not create a deployment log-file with deletion info when an error occurs during the process', async function () {
      // clear logs and verify
      await HistoryDeployments.remove().exec();
      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);

      sinon.mock(Deployment.prototype).expects('toObject').throws(new Error('Simulated Error'));
      response = await agent.delete('/deployments/' + testDeplId).expect(200);
      expect(response.body.message).to.contain('Deployment deleted successfully');

      logReturned = await HistoryDeployments.findOne({ associated_id: testDeplId }).exec();
      expect(logReturned).to.equal(null);
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Configuration.remove().exec();
    await Deployment.remove().exec();
    await Pod.remove().exec();
    await HistoryDeployments.remove().exec();
    await HistoryPods.remove().exec();
  });
});
