var _ = require('lodash'),
  chai = require('chai'),
  superagentDefaults = require('superagent-defaults'),
  supertest = require('supertest'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  request = require('supertest'),
  sinon = require('sinon'),
  server = require('../../../server'),
  HistoryPods = require('../../history/models/history.model').getSchema('pods'),
  HistoryDeployments = require('../../history/models/history.model').getSchema('deployments'),
  Pod = require('../models/pods.model').Schema,
  Deployment = require('../../deployments/models/deployments.model').Schema,
  User = require('../../users/models/users.model').Schema,
  Configuration = require('../../configurations/models/configurations.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  configuration,
  nonAuthAgent,
  response,
  podReturned,
  logReturned,
  logUpdate,
  testPodId,
  userObject,
  testDeplInstallId,
  testDeplUpgradeId;

// Fake sinon errors
var fakeCallbackErr = function (callback) {
  process.nextTick(function () {
    callback(new Error('Simulated Error'));
  });
};

// Pods
var testPod = { name: 'testCloud1', queueEnabled: false };
var testPodUpdateQueue = { queueEnabled: true };
var invalidPodID = '000000000000000000000000';

// Deployments
var testDeplInstall = {
  name: 'testDeplInstall',
  associatedPod: testPod.name,
  queueStatus: 'Active',
  jobType: 'Install',
  instanceRunningStartTime: new Date(2018, 11, 25, 12, 45)
};

var testDeplUpgrade = {
  name: 'testDeplUpgrade',
  associatedPod: testPod.name,
  queueStatus: 'Active',
  jobType: 'Upgrade',
  instanceRunningStartTime: new Date(2018, 11, 25, 12, 45)
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

// Configuration
var testConfigurationFull = {
  name: 'testConfigFull',
  defaultPodLoadTolerance: 77,
  products: [{
    name: 'vENM',
    defaultProductLoadValue: 44,
    defaultProductTimeoutValue: 4
  },
  {
    name: 'cENM',
    defaultProductLoadValue: 55,
    defaultProductTimeoutValue: 5
  },
  {
    name: 'CCD',
    defaultProductLoadValue: 66,
    defaultProductTimeoutValue: 6
  },
  {
    name: 'anotherProduct',
    defaultProductLoadValue: 77,
    defaultProductTimeoutValue: 7
  }]
};

describe('Pod API tests', function () {
  before(function () {
    sinon.restore();
    agent = request.agent(server);
    nonAuthAgent = superagentDefaults(supertest(server));
  });

  beforeEach(async function () {
    response = null;
    userObject = new User(validAdminUser);
    await userObject.save();
    response = await agent.post('/configurations').auth(validAdminUser.username, validAdminUser.password).send(testConfigurationFull).expect(201);
    configuration = response.body;
    response = null;
  });

  describe('GET pods/', function () {
    it('should get a pod list with 0 elements', async function () {
      response = await agent.get('/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(0);
    });

    it('should get a pod list with 1 element', async function () {
      await agent.post('/pods').send(testPod).expect(201);
      response = await agent.get('/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);
    });

    it('should get a pod list with more than 1 element', async function () {
      await agent.post('/pods').send(testPod).expect(201);
      await agent.post('/pods').send({ name: 'testCloud2' }).expect(201);

      response = await agent.get('/pods').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
    });

    it('should return an error message and status 422 when the Pod.find function fails', async function () {
      sinon.replace(Pod, 'find', fakeCallbackErr);
      response = await agent.get('/pods').expect(422);
      expect(response.body.message).to.deep.equal('Error whilst attempting to retrieve the Pods.');
    });
  });

  describe('GET pods/search?{query}', function () {
    var queueEnabledPod = {
      name: 'testCloud1',
      queueEnabled: true,
      products: [{ name: 'vENM', loadValue: 15 }, { name: 'cENM', loadValue: 15 }, { name: 'CCD', loadValue: 15 }]
    };
    var queueNotEnabledPod = {
      name: 'testCloud2',
      queueEnabled: false,
      products: [{ name: 'vENM', loadValue: 25 }, { name: 'cENM', loadValue: 15 }, { name: 'CCD', loadValue: 25 }]
    };

    beforeEach(async function () {
      await agent.post('/pods').send(queueEnabledPod);
      await agent.post('/pods').send(queueNotEnabledPod);
    });

    it('should return all Pods when no search filter criteria is provided', async function () {
      response = await agent.get('/pods/search').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
    });

    it('should get a collection of pods matching the search criteria with one query param', async function () {
      response = await agent.get('/pods/search?products.loadValue=15').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(2);
    });

    it('should get a smaller collections of pods when matching the search criteria with two query params', async function () {
      response = await agent.get('/pods/search?products.loadValue=15').expect(200);
      // set collectionSize to pods Array length for comparison
      var collectionSize = Object.keys(response.body).length;

      // there should be less pods returned when specifying more params
      response = await agent.get('/pods/search?queueEnabled=true&products.loadValue=15').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.below(collectionSize);
    });

    it('should return an error message and status 422 when the Pod.find function fails', async function () {
      sinon.mock(Pod).expects('find').chain('exec').yields(new Error('Simulated Error.'));
      response = await agent.get('/pods/search').expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error.');
    });
  });

  describe('GET pods/{:id}', function () {
    it('should get a single pod with its ID value', async function () {
      response = await agent.post('/pods').send(testPod);
      testPodId = response.body._id;

      response = await agent.get('/pods/' + testPodId).expect(200);
      expect(response.body._id).to.deep.equal(testPodId);
      expect(response.body.name).to.deep.equal(testPod.name);
    });

    it('should throw 404 when a correctly formatted Pod ID is not in database', async function () {
      response = await agent.get('/pods/' + invalidPodID).expect(404);
      expect(response.body.message).to.deep.equal('A pod with that ID does not exist');
    });

    it('should throw 404 when an incorrectly formatted Pod ID is used for searching the database', async function () {
      response = await agent.get('/pods/0').expect(404);
      expect(response.body.message).to.deep.equal('A pod with that ID does not exist');
    });

    describe('METRICS', function () {
      beforeEach(async function () { // eslint-disable-line
        var res = await agent.post('/pods').send({ name: testPod.name, queueEnabled: true }).expect(201);
        testPodId = res.body._id;
        res = await agent.post('/deployments').send(testDeplInstall).expect(201);
        testDeplInstallId = res.body.newDeployment._id;
        res = await agent.post('/deployments').send(testDeplUpgrade).expect(201);
        testDeplUpgradeId = res.body.newDeployment._id;
      });

      it('should have all metrics set to zero on initialization', async function () {
        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
      });

      it('should have totalInstallSuccesses set to 1 after successful deployment install', async function () {
        response = await agent.put('/deployments/' + testDeplInstallId).send({ queueStatus: 'Finished' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplInstallId);
        expect(updatedDepl.queueStatus).to.deep.equal('Finished');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(1);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
        expect(response.body.totalInstallTimeouts).to.deep.equal(0);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(0);
      });

      it('should have totalUpgradeSuccesses set to 1 after successful deployment upgrade', async function () {
        response = await agent.put('/deployments/' + testDeplUpgradeId).send({ queueStatus: 'Finished' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplUpgradeId);
        expect(updatedDepl.queueStatus).to.deep.equal('Finished');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(1);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
        expect(response.body.totalInstallTimeouts).to.deep.equal(0);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(0);
      });

      it('should have totalInstallFailures set to 1 after deployment install failure', async function () {
        response = await agent.put('/deployments/' + testDeplInstallId).send({ queueStatus: 'Failed' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplInstallId);
        expect(updatedDepl.queueStatus).to.deep.equal('Failed');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(1);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
        expect(response.body.totalInstallTimeouts).to.deep.equal(0);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(0);
      });

      it('should have totalUpgradeFailures set to 1 after deployment upgrade failure', async function () {
        response = await agent.put('/deployments/' + testDeplUpgradeId).send({ queueStatus: 'Failed' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplUpgradeId);
        expect(updatedDepl.queueStatus).to.deep.equal('Failed');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(1);
        expect(response.body.totalInstallTimeouts).to.deep.equal(0);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(0);
      });

      it('should have totalInstallTimeouts set to 1 after deployment install time-out', async function () {
        response = await agent.put('/deployments/' + testDeplInstallId).send({ queueStatus: 'Timed-Out' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplInstallId);
        expect(updatedDepl.queueStatus).to.deep.equal('Timed-Out');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
        expect(response.body.totalInstallTimeouts).to.deep.equal(1);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(0);
      });

      it('should have totalUpgradeTimeouts set to 1 after deployment upgrade time-out', async function () {
        response = await agent.put('/deployments/' + testDeplUpgradeId).send({ queueStatus: 'Timed-Out' }).expect(200);
        expect(response.body).to.have.property('updatedDeployment');
        var updatedDepl = response.body.updatedDeployment;
        expect(updatedDepl._id).to.deep.equal(testDeplUpgradeId);
        expect(updatedDepl.queueStatus).to.deep.equal('Timed-Out');

        response = await agent.get('/pods/' + testPodId).expect(200);
        expect(response.body._id).to.deep.equal(testPodId);
        expect(response.body.name).to.deep.equal(testPod.name);
        expect(response.body.totalInstallSuccesses).to.deep.equal(0);
        expect(response.body.totalUpgradeSuccesses).to.deep.equal(0);
        expect(response.body.totalInstallFailures).to.deep.equal(0);
        expect(response.body.totalUpgradeFailures).to.deep.equal(0);
        expect(response.body.totalInstallTimeouts).to.deep.equal(0);
        expect(response.body.totalUpgradeTimeouts).to.deep.equal(1);
      });
    });
  });

  describe('POST pods/', function () {
    it('should create a new pod with default values', async function () {
      var defaultQueueEnabled = false;
      var defaultProductType = ['All'];

      response = await agent.post('/pods').send(testPod).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body.name).to.deep.equal(testPod.name);
      expect(response.body.queueEnabled).to.deep.equal(defaultQueueEnabled);
      expect(response.body.products[0].loadValue).to.deep.equal(configuration.products[0].defaultProductLoadValue);
      expect(response.body.products[1].loadValue).to.deep.equal(configuration.products[1].defaultProductLoadValue);
      expect(response.body.products[2].loadValue).to.deep.equal(configuration.products[2].defaultProductLoadValue);
      expect(response.body.products[0].timeoutValue).to.deep.equal(configuration.products[0].defaultProductTimeoutValue);
      expect(response.body.products[1].timeoutValue).to.deep.equal(configuration.products[1].defaultProductTimeoutValue);
      expect(response.body.products[2].timeoutValue).to.deep.equal(configuration.products[2].defaultProductTimeoutValue);
      expect(response.body.podLoadTolerance).to.deep.equal(configuration.defaultPodLoadTolerance);
      expect(response.body.productType).to.deep.equal(defaultProductType);
    });

    it('should create a new pod with defined values', async function () {
      var testPodDetailed = {
        name: 'testCloudDetailed',
        queueEnabled: true,
        products: [{ name: 'vENM', loadValue: 20 }, { name: 'cENM', loadValue: 25 }, { name: 'CCD', loadValue: 30 }],
        podLoadTolerance: 50,
        productType: ['cENM']
      };

      response = await agent.post('/pods').send(testPodDetailed).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body.name).to.deep.equal(testPodDetailed.name);
      expect(response.body.queueEnabled).to.deep.equal(testPodDetailed.queueEnabled);
      expect(response.body.products[0].loadValue).to.deep.equal(testPodDetailed.products[0].loadValue);
      expect(response.body.products[1].loadValue).to.deep.equal(testPodDetailed.products[1].loadValue);
      expect(response.body.products[2].loadValue).to.deep.equal(testPodDetailed.products[2].loadValue);
      expect(response.body.podLoadTolerance).to.deep.equal(testPodDetailed.podLoadTolerance);
      expect(response.body.productType).to.deep.equal(testPodDetailed.productType);
    });

    it('should create a new pod with defined values and make sure product not included in json but is in configuration is there', async function () {
      var testPodDetailed = {
        name: 'testCloudDetailed2',
        queueEnabled: true,
        products: [{ name: 'vENM', loadValue: 20 }, { name: 'cENM', loadValue: 25 }, { name: 'CCD', loadValue: 30 }],
        podLoadTolerance: 50,
        productType: ['cENM']
      };

      response = await agent.post('/pods').send(testPodDetailed).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body.name).to.deep.equal(testPodDetailed.name);
      expect(response.body.queueEnabled).to.deep.equal(testPodDetailed.queueEnabled);
      expect(response.body.products[0].loadValue).to.deep.equal(testPodDetailed.products[0].loadValue);
      expect(response.body.products[1].loadValue).to.deep.equal(testPodDetailed.products[1].loadValue);
      expect(response.body.products[2].loadValue).to.deep.equal(testPodDetailed.products[2].loadValue);
      expect(response.body.podLoadTolerance).to.deep.equal(testPodDetailed.podLoadTolerance);
      expect(response.body.productType).to.deep.equal(testPodDetailed.productType);
      // 4th Product
      expect(response.body.products[3].name).to.deep.equal(configuration.products[3].name);
      expect(response.body.products[3].loadValue).to.deep.equal(configuration.products[3].defaultProductLoadValue);
      expect(response.body.products[3].timeoutValue).to.deep.equal(configuration.products[3].defaultProductTimeoutValue);
    });

    it('should create a new pod with defined values and make sure product included in json but is not in configuration is not there', async function () {
      var testPodDetailed = {
        name: 'testCloudDetailed2',
        queueEnabled: true,
        products: [{ name: 'vENM', loadValue: 20 }, { name: 'cENM', loadValue: 25 }, { name: 'CCD', loadValue: 30 }, { name: 'notInConfig', loadValue: 30 }],
        podLoadTolerance: 50,
        productType: ['cENM']
      };

      response = await agent.post('/pods').send(testPodDetailed).expect(201);
      expect(response.body).to.be.an('object');
      // Should only be 4 Products (4th is anotherConfig)
      expect(response.body.products.length).to.equal(4);
      expect(response.body.name).to.deep.equal(testPodDetailed.name);
      expect(response.body.queueEnabled).to.deep.equal(testPodDetailed.queueEnabled);
      expect(response.body.products[0].name).to.deep.equal(testPodDetailed.products[0].name);
      expect(response.body.products[1].name).to.deep.equal(testPodDetailed.products[1].name);
      expect(response.body.products[2].name).to.deep.equal(testPodDetailed.products[2].name);
      expect(response.body.products[3].name).to.deep.equal(configuration.products[3].name);
      expect(response.body.products[0].loadValue).to.deep.equal(testPodDetailed.products[0].loadValue);
      expect(response.body.products[1].loadValue).to.deep.equal(testPodDetailed.products[1].loadValue);
      expect(response.body.products[2].loadValue).to.deep.equal(testPodDetailed.products[2].loadValue);
      expect(response.body.products[3].loadValue).to.deep.equal(configuration.products[3].defaultProductLoadValue);
      expect(response.body.podLoadTolerance).to.deep.equal(testPodDetailed.podLoadTolerance);
      expect(response.body.productType).to.deep.equal(testPodDetailed.productType);
    });

    it('should not create more than one pod with the same name', async function () {
      // POST the first pod
      await agent.post('/pods').send(testPod).expect(201);

      // Try to post a 2nd pod with the same name.
      response = await agent.post('/pods').send(testPod).expect(400);
      expect(response.body.message).to.deep.equal('Name is not valid, provided name must be unique.');
    });

    it('should not post a pod with a name with an invalid length - too short', async function () {
      var testPostPodShortName = { name: 'xxxx' };
      response = await agent.post('/pods').send(testPostPodShortName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testPostPodShortName.name + '`) is shorter than the minimum allowed length (5).');
    });

    it('should not post a pod with a name with an invalid length - too long', async function () {
      var testPostPodLongName = { name: 'xxxxxxxxxxxxxxxxxxxxx' };
      response = await agent.post('/pods').send(testPostPodLongName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testPostPodLongName.name + '`) is longer than the maximum allowed length (20).');
    });

    it('should not post a pod with a name that does not match regex pattern', async function () {
      var testPostPodBadPattern = { name: '!£$%&' };
      response = await agent.post('/pods').send(testPostPodBadPattern).expect(400);
      expect(response.body.message).to.deep.equal('name is not valid; \'!£$%&\' can only contain letters, numbers, dots, dashes and underscores.');
    });

    it('should not post a pod without a name key', async function () {
      var testPostPodNoValues = {};
      response = await agent.post('/pods').send(testPostPodNoValues).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` is required.');
    });

    it('should not post a pod with improperly formatted json', async function () {
      var testBadPod = '{[.}]';
      await agent.post('/pods').send(testBadPod).expect(400);
    });

    it('should post a new log with user-details when a pod is created by a logged-in user', async function () {
      response = await agent.post('/pods').send(testPod).expect(201);
      expect(response.body._id).to.have.length(24);
      testPodId = response.body._id;

      podReturned = await Pod.findById(testPodId).exec();
      expect(podReturned.name).to.deep.equal(testPod.name);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.createdBy.email).to.deep.equal(validAdminUser.email);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should post a new log with generic user-details when a pod is created by a non-logged-in user', async function () {
      response = await nonAuthAgent.post('/pods').send(testPod).expect(201);
      expect(response.body._id).to.have.length(24);
      testPodId = response.body._id;

      podReturned = await Pod.findById(testPodId).exec();
      expect(podReturned.name).to.deep.equal(testPod.name);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy).to.deep.equal('UNKNOWN USER');
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should post a new log with undefined user-details when a pod is created by a logged-in admin-user that is missing user attributes', async function () {
      var userWithUndefinedDetails = await User.findOne({ username: validAdminUser.username });
      expect(userWithUndefinedDetails).to.not.equal(undefined);
      userWithUndefinedDetails.displayName = undefined;
      userWithUndefinedDetails.email = undefined;
      await userWithUndefinedDetails.save();

      response = await agent.post('/pods').send(testPod).expect(201);
      expect(response.body._id).to.have.length(24);
      testPodId = response.body._id;

      podReturned = await Pod.findById(testPodId).exec();
      expect(podReturned.name).to.deep.equal(testPod.name);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal('UNKNOWN NAME');
      expect(logReturned.createdBy.email).to.deep.equal('UNKNOWN EMAIL');
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should post a new log with undefined user-details when a pod is created by a logged-in superAdmin-user that is missing user attributes', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      var userWithUndefinedDetails = await User.findOne({ username: validAdminUser.username });
      expect(userWithUndefinedDetails).to.not.equal(undefined);
      userWithUndefinedDetails.displayName = undefined;
      userWithUndefinedDetails.email = undefined;
      await userWithUndefinedDetails.save();

      response = await agent.post('/pods').send(testPod).expect(201);
      expect(response.body._id).to.have.length(24);
      testPodId = response.body._id;

      podReturned = await Pod.findById(testPodId).exec();
      expect(podReturned.name).to.deep.equal(testPod.name);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal('UNKNOWN NAME');
      expect(logReturned.createdBy.email).to.deep.equal('UNKNOWN EMAIL');
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not post a new log when attempting to create more than one pod with the same name', async function () {
      // POST the first pod
      await agent.post('/pods').send(testPod).expect(201);

      // Try to post a 2nd pod with the same name.
      response = await agent.post('/pods').send(testPod).expect(400);
      expect(response.body.message).to.deep.equal('Name is not valid, provided name must be unique.');

      var logsReturned = await HistoryPods.find({ 'originalData.name': testPod.name }).exec();
      expect(logsReturned.length).to.equal(1);
    });

    it('should not post a new log for a Health-Check pod that is created with a name beginning with \'A_Health_\'', async function () {
      var testPodHealth = _.cloneDeep(testPod);
      testPodHealth.name = 'A_Health_Pod';
      response = await agent.post('/pods').send(testPodHealth).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Pod
      expect(response.body.name).to.deep.equal(testPodHealth.name);
      testPodId = response.body._id;

      // Information on the new Log
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.deep.equal(null);
    });

    it('should not create a new pod if configuration doesnt exist', async function () {
      await Configuration.remove().exec();
      response = await agent.post('/pods').send(testPod).expect(400);
      expect(response.body.message).to.deep.equal('No Default Configuration detected, please let Admin create one before proceeding.');
    });
  });

  describe('PUT pods/{id}', function () {
    beforeEach(async function () {
      var res = await agent.post('/pods').send(testPod).expect(201);
      testPodId = res.body._id;
    });

    it('should update partial pod info (eg. queueEnabled = true) and return a message after handling its (empty) queue.', async function () {
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.queueEnabled).to.deep.equal(true);

      // Information on the updated Pod Queue
      expect(response.body.queueMessage).to.deep.equal(`There are no deployments for ${testPod.name} to handle.`);
    });

    it('should update full pod info and return a message after handling its (empty) queue', async function () {
      var podFullUpdate = {
        queueEnabled: true,
        products: [{ name: 'vENM', loadValue: 15 }, { name: 'cENM', loadValue: 15 }, { name: 'CCD', loadValue: 20 }],
        podLoadTolerance: 50,
        productType: ['cENM']
      };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(podFullUpdate).expect(200);
      expect(response.body).to.have.property('updatedPod');

      // Information on the updated Pod
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.queueEnabled).to.deep.equal(podFullUpdate.queueEnabled);
      expect(updatedPod.products[0].loadValue).to.deep.equal(podFullUpdate.products[0].loadValue);
      expect(updatedPod.products[1].loadValue).to.deep.equal(podFullUpdate.products[1].loadValue);
      expect(updatedPod.products[2].loadValue).to.deep.equal(podFullUpdate.products[2].loadValue);
      expect(updatedPod.podLoadTolerance).to.deep.equal(podFullUpdate.podLoadTolerance);
      expect(updatedPod.productType).to.deep.equal(podFullUpdate.productType);

      // Information on the updated Pod Queue
      expect(response.body.queueMessage).to.deep.equal(`There are no deployments for ${testPod.name} to handle.`);
    });

    it('should not update a pod name - immutable', async function () {
      var testPodName = { name: 'UPDATED_POD_NAME' };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodName).expect(406);
      expect(response.body.message).to.deep.equal('Pod \'name\' field is immutable and cannot be modified.');
    });

    it('should update product type for different product types', async function () {
      var testPodDetailed = {
        name: 'testProductType',
        queueEnabled: true,
        products: [{ name: 'vENM', loadValue: 15 }, { name: 'cENM', loadValue: 15 }, { name: 'CCD', loadValue: 15 }],
        podLoadTolerance: 50,
        productType: ['cENM']
      };

      response = await agent.post('/pods').send(testPodDetailed).expect(201);
      testPodId = response.body._id;

      var productType1 = { productType: ['cENM', 'vENM'] };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(productType1).expect(200);
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.productType).to.deep.equal(productType1.productType);

      var productType2 = { productType: ['cENM', 'CCD'] };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(productType2).expect(200);
      var updatedPod2 = response.body.updatedPod;
      expect(updatedPod2.productType).to.deep.equal(productType2.productType);

      var productType3 = { productType: ['vENM', 'CCD'] };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(productType3).expect(200);
      var updatedPod3 = response.body.updatedPod;
      expect(updatedPod3.productType).to.deep.equal(productType3.productType);

      var productType4 = { productType: ['cENM', 'vENM', 'CCD'] };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(productType4).expect(200);
      var updatedPod4 = response.body.updatedPod;
      expect(updatedPod4.productType).to.deep.equal(productType4.productType);

      var productType5 = { productType: [] };
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(productType5).expect(200);
      var updatedPod5 = response.body.updatedPod;
      expect(updatedPod5.productType).to.deep.equal(['All']);
    });

    it('should not update a pod when an incorrect ID is entered', async function () {
      var testPodInvalidId = { name: 'testPodInvalidId' };
      response = await agent.put('/pods/' + invalidPodID).auth(validAdminUser.username, validAdminUser.password).send(testPodInvalidId).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst getting Pod: A Pod with that ID does not exist');
    });

    it('should return an error message and status 422 when the Pod.find function fails to return the Pod to be updated', async function () {
      sinon.mock(Pod).expects('findOne').yields(fakeCallbackErr);
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst getting Pod: Internal Server Error');
    });

    it('should return an error message and status 400 when the Pod.save function returns a ValidationError', async function () {
      function ValidationError(message) {
        this.name = 'ValidationError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new ValidationError('Simulated ValidationError'));
        });
      };
      sinon.replace(Pod.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(400);
      expect(response.body.message).to.deep.equal('Simulated ValidationError');
    });

    it('should return an error message and status 400 when the Pod.save function returns a StrictModeError', async function () {
      function StrictModeError(message) {
        this.name = 'StrictModeError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new StrictModeError('Simulated StrictModeError'));
        });
      };
      sinon.replace(Pod.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(400);
      expect(response.body.message).to.deep.equal('Simulated StrictModeError');
    });

    it('should return an error message and status 422 when the Pod.save function returns any other error', async function () {
      sinon.replace(Pod.prototype, 'save', fakeCallbackErr);
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error');
    });

    it('should update an existing log with user-details for a pod thats updated by a logged-in admin-user', async function () {
      response = await agent.put('/pods/' + testPodId)
        .send(testPodUpdateQueue)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);
    });

    it('should update an existing log with user-details for a pod thats updated by a logged-in superAdmin-user', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      response = await agent.put('/pods/' + testPodId)
        .send(testPodUpdateQueue)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);
    });

    it('should create a log with defined user-details for a pod that gets updated by a logged-in admin-user', async function () {
      // clear logs and verify
      await HistoryPods.remove().exec();
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.put('/pods/' + testPodId)
        .send(testPodUpdateQueue)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);
    });

    it('should create a log with defined user-details for a pod that gets updated by a logged-in superAdmin-user', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      // clear logs and verify
      await HistoryPods.remove().exec();
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.put('/pods/' + testPodId)
        .send(testPodUpdateQueue)
        .auth(validAdminUser.username, validAdminUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod._id).to.deep.equal(testPodId);
      expect(updatedPod.name).to.deep.equal(testPod.name);
      expect(updatedPod.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validAdminUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validAdminUser.email);
      expect(logUpdate.updateData.queueEnabled).to.deep.equal(testPodUpdateQueue.queueEnabled);
    });

    it('should not update a pods existing log-file when the update attributes cannot be parsed into an object', async function () {
      sinon.mock(Pod.prototype).expects('toObject').throws(new Error('Simulated Error'));
      await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a pods existing log-file when that pod cant be found in the database', async function () {
      sinon.mock(Pod).expects('findById').chain('exec').returns(undefined);
      await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a pods existing log-file when an error occurs during the process', async function () {
      sinon.mock(Pod).expects('findById').chain('exec').throws(new Error('Simulated Error'));
      await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a pods existing log-file when an update changes no pods attributes', async function () {
      await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPod).expect(200);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not able to update a pod when user is standard-user', async function () {
      userObject.roles = ['user'];
      await userObject.save();
      response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPod).expect(403);
      expect(response.body.message).to.deep.equal('User is not authorized');
    });

    describe('setting QueueEnabled=Active with associated-deployments', function () {
      var testDepl1 = { name: 'testDepl1', associatedPod: testPod.name, jobType: 'Install' };
      var testDepl2 = { name: 'testDepl2', associatedPod: testPod.name, jobType: 'Install' };
      beforeEach(async function () {
        await agent.post('/deployments').send(testDepl1);
      });

      it('should alert about queued-deployments that are set to active', async function () {
        response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);
        // Information on the updated Pod
        expect(response.body).to.have.property('updatedPod');
        var updatedPod = response.body.updatedPod;
        expect(updatedPod._id).to.deep.equal(testPodId);
        expect(updatedPod.queueEnabled).to.deep.equal(true);

        // Information on the updated Pod Queue
        expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDepl1.name}.`); // eslint-disable-line max-len
      });

      it('should alert about any queued-deployments that are still waiting on tokens to become available', async function () {
        await agent.post('/deployments').send(testDepl2).expect(201);
        response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);
        // Information on the updated Pod
        expect(response.body).to.have.property('updatedPod');
        var updatedPod = response.body.updatedPod;
        expect(updatedPod._id).to.deep.equal(testPodId);
        expect(updatedPod.queueEnabled).to.deep.equal(true);

        // Information on the updated Pod Queue
        expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDepl1.name}.\nDeployments still queued: ${testDepl2.name}.`); // eslint-disable-line max-len
      });

      it('should alert when none of the associated-deployments are queued', async function () {
        response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(testPodUpdateQueue).expect(200);
        // Information on the updated Pod
        expect(response.body).to.have.property('updatedPod');
        var updatedPod = response.body.updatedPod;
        expect(updatedPod._id).to.deep.equal(testPodId);
        expect(updatedPod.queueEnabled).to.deep.equal(true);

        // Information on the updated Pod Queue
        expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments successfully set to Active: ${testDepl1.name}.`); // eslint-disable-line max-len

        var podLoadTolerance = { podLoadTolerance: 70 };
        response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(podLoadTolerance).expect(200);
        // Information on the second Pod Queue update
        expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nThere are no deployments within the queue.`);
      });

      it('should alert about any deployments that cannot be found for queue-handling', async function () {
        var podErrorDeplUpdate = { queueEnabled: true, deployments: ['WONT_BE_FOUND'] };
        response = await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send(podErrorDeplUpdate).expect(200);
        // Information on the updated Pod
        expect(response.body).to.have.property('updatedPod');
        var updatedPod = response.body.updatedPod;
        expect(updatedPod._id).to.deep.equal(testPodId);
        expect(updatedPod.queueEnabled).to.deep.equal(true);

        // Information on the updated Pod Queue
        expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod.name}.\nDeployments failed to set to Active (Not Found): ${podErrorDeplUpdate.deployments[0]}.`); // eslint-disable-line max-len
      });
    });
  });

  describe('DELETE pods/{id}', function () {
    beforeEach(async function () {
      var res = await agent.post('/pods').send(testPod).expect(201);
      testPodId = res.body._id;
    });

    it('should not delete a pod if user is standard-user', async function () {
      userObject.roles = ['user'];
      await userObject.save();
      response = await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(403);
      expect(response.body.message).to.deep.equal('User is not authorized');
    });

    it('should delete a pod using pod ID if user is admin-user', async function () {
      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);
    });

    it('should delete a pod using pod ID if user is superAdmin-user', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);
    });

    it('should return a 404 message when using the wrong ID to delete a pod', async function () {
      response = await agent.delete('/pods/' + invalidPodID).auth(validAdminUser.username, validAdminUser.password).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst finding the Pod to delete: A Pod with that ID does not exist');
    });

    it('should return a 422 message when the pod has dependant deployments', async function () {
      var testPodWithDependantDepls = {
        name: 'testPodDependants',
        deployments: ['deployment1a', 'deployment1b']
      };
      response = await agent.post('/pods').send(testPodWithDependantDepls).expect(201);
      testPodId = response.body._id;

      response = await agent.delete('/pods/' + testPodId).expect(422);
      expect(response.body.message).to.deep.equal('Error whilst deleting Pod: This Pod has dependant Deployments so cannot be deleted');
    });

    it('should return an error message and status 500 when the Pod.findOne function fails to return the Pod to be deleted', async function () {
      sinon.mock(Pod).expects('findOne').yields(fakeCallbackErr);
      response = await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst finding the Pod to delete: Internal Server Error');
    });

    it('should return an error message and status 500 when the Pod.remove function fails to return the Pod to be deleted', async function () {
      sinon.mock(Pod.prototype).expects('remove').yields(fakeCallbackErr);
      response = await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst deleting Pod: Internal Server Error');
    });

    it('should update an existing log with user-details for a pod thats deleted by a logged-in admin-user', async function () {
      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should update an existing log with user-details for a pod thats deleted by a logged-in superAdmin-user', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);
      expect(logReturned.originalData.queueEnabled).to.deep.equal(false);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should create a log with defined user-details for a pod that gets deleted by a logged-in admin-user', async function () {
      // clear logs and verify
      await HistoryPods.remove().exec();
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);

      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should create a log with defined user-details for a pod that gets deleted by a logged-in superAdmin-user', async function () {
      userObject.roles = ['superAdmin'];
      await userObject.save();
      // clear logs and verify
      await HistoryPods.remove().exec();
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);

      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testPod.name);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validAdminUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validAdminUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validAdminUser.email);
    });

    it('should not create a pod log-file with deletion info when an error occurs during the process', async function () {
      // clear logs and verify
      await HistoryPods.remove().exec();
      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);

      sinon.mock(Pod.prototype).expects('toObject').throws(new Error('Simulated Error'));
      await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);

      logReturned = await HistoryPods.findOne({ associated_id: testPodId }).exec();
      expect(logReturned).to.equal(null);
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Deployment.remove().exec();
    await Pod.remove().exec();
    await Configuration.remove().exec();
    await HistoryPods.remove().exec();
    await HistoryDeployments.remove().exec();
  });
});
