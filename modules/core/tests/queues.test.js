var chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  request = require('supertest'),
  sinon = require('sinon'),
  _ = require('lodash'),
  requestPromise = require('request-promise'),
  server = require('../../../server'),
  HistoryDeployments = require('../../history/models/history.model').getSchema('deployments'),
  HistoryPods = require('../../history/models/history.model').getSchema('pods'),
  Deployment = require('../../deployments/models/deployments.model').Schema,
  Pod = require('../../pods/models/pods.model').Schema,
  User = require('../../users/models/users.model').Schema,
  Configuration = require('../../configurations/models/configurations.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  clock,
  configuration,
  response,
  testPodId,
  userObject,
  testDeplId;

var testPod1 = {
  name: 'testCloud1',
  queueEnabled: true,
  timeoutDuration: 1,
  podLoadTolerance: 50
};

var testPod2 = {
  name: 'testCloud2',
  queueEnabled: true,
  timeoutDuration: 1,
  podLoadTolerance: 50
};

var testPod3 = {
  name: 'testCloud3',
  queueEnabled: true,
  timeoutDuration: 60,
  podLoadTolerance: 50,
  products: [{ name: 'vENM', loadValue: 15, timeoutValue: 5 }, { name: 'cENM', loadValue: 15, timeoutValue: 10 }, { name: 'CCD', loadValue: 15, timeoutValue: 15 }]
};

var testDepl1a = {
  name: 'testDep1a',
  associatedPod: testPod1.name,
  jobType: 'Install'
};

var testDepl1b = {
  name: 'testDep1b',
  associatedPod: testPod1.name,
  jobType: 'Install'
};

var testDepl1c = {
  name: 'testDep1c',
  associatedPod: testPod1.name,
  jobType: 'Install'
};

var testDepl1d = {
  name: 'testDep1c',
  associatedPod: testPod3.name,
  jobType: 'Install',
  product: 'vENM'
};

var testDepl1e = {
  name: 'testDep1e',
  associatedPod: testPod3.name,
  jobType: 'Install',
  product: 'cENM'
};

var testDepl1f = {
  name: 'testDep1f',
  associatedPod: testPod3.name,
  jobType: 'Install',
  product: 'CCD'
};

var testDepl2a = {
  name: 'testDep2a',
  associatedPod: testPod2.name,
  jobType: 'Install'
};

var testDeplcENM = {
  name: 'testDeplcENM',
  associatedPod: testPod1.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'cENM'
};

var testDeplCCD = {
  name: 'testDeplCCD',
  associatedPod: testPod1.name,
  queueStatus: 'Queued',
  jobType: 'Install',
  product: 'CCD'
};
var testDeplvENM = {
  name: 'testDeplvENM',
  associatedPod: testPod1.name,
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

var invalidDeplArray = ['INVALID_DEPLOYMENT'];

describe('Queues API tests', function () {
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

  describe('POST queues/verifyRelationships', function () {
    describe('with pre-added pod', function () {
      beforeEach(async function () {
        var res = await agent.post('/pods').send(testPod1).expect(201);
        testPodId = res.body._id;
      });

      it('should respond with message that there are no Pod-Deployment relationships to re-associate when no deployments exist', async function () {
        response = await agent.post('/queues/verifyRelationships').expect(200);
        expect(response.body.message).to.deep.equal('Pod-Deployment Relationship Re-Associations: No relationships need to be re-associated.');
      });

      it('should respond with message that a Deployment could not be found for re-association', async function () {
        await agent.put('/pods/' + testPodId).send({ deployments: invalidDeplArray }).expect(200);
        response = await agent.post('/queues/verifyRelationships').expect(200);
        expect(response.body.message).to.deep.equal(`Pod-Deployment Relationship Re-Associations: \nDeployments failed to re-associate (Not Found): ${invalidDeplArray[0]}.`); // eslint-disable-line max-len
      });

      it('should return an error message and status 500 when failure occurs during Deployment.find for re-association', async function () {
        var fake = sinon.fake.throws(new Error());
        sinon.replace(Deployment, 'find', fake);
        response = await agent.post('/queues/verifyRelationships').expect(500);
        expect(response.body.message).to.deep.equal('Pod-Deployment Relationship Re-Associations: (Error) Failed to find Pods/Deployments.');
      });
    });

    describe('with pre-added deployments', function () {
      beforeEach(async function () {
        await agent.post('/deployments').send(testDepl1a);
        await agent.post('/deployments').send(testDepl1b);
        await agent.post('/deployments').send(testDepl1c);
        await agent.post('/deployments').send(testDepl2a);
        var res = await agent.get('/pods');
        testPodId = res.body[0]._id;
      });

      it('should respond with message that there are no Pod-Deployment relationships to re-associate when all are already associated', async function () {
        response = await agent.post('/queues/verifyRelationships').expect(200);
        expect(response.body.message).to.deep.equal('Pod-Deployment Relationship Re-Associations: No relationships need to be re-associated.');
      });

      it('should respond with message that missing Pod-Deployment relationships were re-associated', async function () {
        await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send({ deployments: [] }).expect(200);
        await agent.delete('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).expect(204);
        response = await agent.post('/queues/verifyRelationships').expect(200);
        expect(response.body.message).to.deep.equal(`Pod-Deployment Relationship Re-Associations: \nDeployments successfully re-associate: ${testDepl1a.name}, ${testDepl1b.name}, ${testDepl1c.name}.`); // eslint-disable-line max-len
      });

      it('should respond with message that 2 Deployments were re-added and one Deployment could not be found for re-association', async function () {
        await agent.put('/pods/' + testPodId).auth(validAdminUser.username, validAdminUser.password).send({ deployments: invalidDeplArray }).expect(200);
        response = await agent.post('/queues/verifyRelationships').expect(200);
        expect(response.body.message).to.deep.equal(`Pod-Deployment Relationship Re-Associations: \nDeployments successfully re-associate: ${testDepl1a.name}, ${testDepl1b.name}, ${testDepl1c.name}.\nDeployments failed to re-associate (Not Found): ${invalidDeplArray[0]}.`); // eslint-disable-line max-len
      });
    });
  });

  describe('POST queues/handleDeploymentsTimeouts', function () {
    beforeEach(async function () {
      clock = sinon.useFakeTimers(Date.now());
      var res = await agent.post('/pods').send(testPod1).expect(201);
      testPodId = res.body._id;
    });

    it('should respond with an error message and status 500 when failure occurs during finding of active Deployments', async function () {
      var fake = sinon.fake.throws(new Error('Simulated Error'));
      sinon.replace(Deployment, 'find', fake);

      response = await agent.post('/queues/handleDeploymentTimeouts').expect(500);
      expect(response.body.message).to.deep.equal('Timed-Out Deployment Jobs Canceller: Failure. Error finding Active Deployments.');
    });

    it('should respond with a simple success message when no active deployments exist', async function () {
      response = await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      expect(response.body.message).to.deep.equal('Timed-Out Deployment Jobs Canceller: Success. No active Deployments exist.');
    });

    it('should set a Deployment with a Custom Timeout to Timed-Out when it has been active for the Custom Timeout value', async function () {
      // Create Deployment
      testDepl1a.customTimeout = 5;
      var nonDitDeployment = _.cloneDeep(testDepl1a);
      response = await agent.post('/deployments').send(nonDitDeployment).expect(201);
      expect(response.body).to.have.property('newDeployment');
      var newDepl = response.body.newDeployment;
      testDeplId = newDepl._id;

      // Check that the Deployment has been set to Active
      response = await agent.get('/deployments/' + testDeplId).expect(200);
      expect(response.body._id).to.deep.equal(testDeplId);
      expect(response.body.queueStatus).to.deep.equal('Active');

      // Check that deployment is set to Timed-Out after 7 minutes
      clock.tick(420000);
      response = await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      response = await agent.get('/deployments/' + testDeplId).expect(200);
      expect(response.body._id).to.deep.equal(testDeplId);
      expect(response.body.queueStatus).to.deep.equal('Timed-Out');
    });

    it('should set deployments to Timed-Out using specific timeouts set in pod', async function () {
      // Restore time
      clock.restore();
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      clock = sinon.useFakeTimers(yesterday.getTime());
      // Create a Pod
      await agent.post('/pods').send(testPod3).expect(201);

      // Post 3 Deployments. vENM = 5min, cENM = 10mins , CCD = 15mins
      var vENM = await agent.post('/deployments').send(testDepl1d).expect(201);
      var cENM = await agent.post('/deployments').send(testDepl1e).expect(201);
      var cCD = await agent.post('/deployments').send(testDepl1f).expect(201);

      // Check that all are 'Active'
      expect(vENM.body.newDeployment.queueStatus).to.deep.equal('Active');
      expect(cENM.body.newDeployment.queueStatus).to.deep.equal('Active');
      expect(cCD.body.newDeployment.queueStatus).to.deep.equal('Active');

      // Tick 6 minutes
      clock.tick(360000);
      await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      // Check vENM is Timed-Out, cENM and CCD still Active
      vENM = await agent.get(`/deployments/${vENM.body.newDeployment._id}`).expect(200);
      cENM = await agent.get(`/deployments/${cENM.body.newDeployment._id}`).expect(200);
      cCD = await agent.get(`/deployments/${cCD.body.newDeployment._id}`).expect(200);
      expect(vENM.body.queueStatus).to.deep.equal('Timed-Out');
      expect(cENM.body.queueStatus).to.deep.equal('Active');
      expect(cCD.body.queueStatus).to.deep.equal('Active');

      // Tick 6 minutes
      clock.tick(360000);
      await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      // Check vENM, cENM is Timed-Out and CCD still Active
      vENM = await agent.get(`/deployments/${vENM.body._id}`).expect(200);
      cENM = await agent.get(`/deployments/${cENM.body._id}`).expect(200);
      cCD = await agent.get(`/deployments/${cCD.body._id}`).expect(200);
      expect(vENM.body.queueStatus).to.deep.equal('Timed-Out');
      expect(cENM.body.queueStatus).to.deep.equal('Timed-Out');
      expect(cCD.body.queueStatus).to.deep.equal('Active');

      // Tick 6 minutes
      clock.tick(360000);
      await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      // Check vENM, cENM is Timed-Out and CCD still Active
      vENM = await agent.get(`/deployments/${vENM.body._id}`).expect(200);
      cENM = await agent.get(`/deployments/${cENM.body._id}`).expect(200);
      cCD = await agent.get(`/deployments/${cCD.body._id}`).expect(200);
      expect(vENM.body.queueStatus).to.deep.equal('Timed-Out');
      expect(cENM.body.queueStatus).to.deep.equal('Timed-Out');
      expect(cCD.body.queueStatus).to.deep.equal('Timed-Out');
    });

    it('should set deployment to Queued and keep it Queued if Pod queue is enabled and there is no load tolerance left when updating deployment from Failed to Active', async function () {
      // Restore time
      clock.restore();
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      clock = sinon.useFakeTimers(yesterday.getTime());

      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 20
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 20 }).expect(200);
      expect(response.body).to.be.an('object');
      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod1.name);
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
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len

      // Update cENM Deployment to Failed
      var cENMUpdate = {
        queueStatus: 'Failed'
      };

      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Failed');

      // Expect CCD to be 'Active'
      response = await agent.get('/deployments/' + cCDDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Active');

      // Update cENM to 'Active' , expect queueStatus to be 'Queued'
      cENMUpdate = {
        queueStatus: 'Active'
      };
      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Queued');

      // Tick 3 minutes, should still be 'Queued'
      clock.tick(180000);
      response = await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      response = await agent.get('/deployments/' + cENMDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Queued');
    });

    it('should set deployment to Queued and keep it Queued if Pod queue is enabled and there is no load tolerance left when updating deployment from Timed-Out to Active', async function () {
      // Restore time
      clock.restore();
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      clock = sinon.useFakeTimers(yesterday.getTime());

      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 20
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 20 }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod1.name);
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
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len

      // Update cENM Deployment to Timed-Out
      var cENMUpdate = {
        queueStatus: 'Timed-Out'
      };

      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Timed-Out');

      // Expect CCD to be 'Active'
      response = await agent.get('/deployments/' + cCDDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Active');

      // Update cENM to 'Active' , expect queueStatus to be 'Queued'
      cENMUpdate = {
        queueStatus: 'Active'
      };
      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Queued');

      // Tick 3 minutes, should still be 'Queued'
      clock.tick(180000);
      response = await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      response = await agent.get('/deployments/' + cENMDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Queued');
    });

    it('should set deployment to Queued and keep it Queued if Pod queue is enabled and there is no load tolerance left when updating deployment from Finished to Active', async function () {
      // Restore time
      clock.restore();
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      clock = sinon.useFakeTimers(yesterday.getTime());

      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 20
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 20 }).expect(200);
      expect(response.body).to.be.an('object');

      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod1.name);
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
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len

      // Update cENM Deployment to Finished
      var cENMUpdate = {
        queueStatus: 'Finished'
      };

      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Finished');

      // Expect CCD to be 'Active'
      response = await agent.get('/deployments/' + cCDDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Active');

      // Update cENM to 'Active' , expect queueStatus to be 'Queued'
      cENMUpdate = {
        queueStatus: 'Active'
      };
      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Queued');

      // Tick 3 minutes, should still be 'Queued'
      clock.tick(180000);
      response = await agent.post('/queues/handleDeploymentTimeouts').expect(200);
      response = await agent.get('/deployments/' + cENMDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Queued');
    });

    it('should set deployment to Queued but can be updated to Finished, so it never reaches Active status', async function () {
      // Restore time
      clock.restore();
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      clock = sinon.useFakeTimers(yesterday.getTime());

      // NOTE: default load value for products is 15
      // Update Pod so that queuing is enabled and load tolerance = 20
      response = await agent.put('/pods/' + testPodId).send({ queueEnabled: true, podLoadTolerance: 20 }).expect(200);
      expect(response.body).to.be.an('object');
      // Information on the updated Pod
      expect(response.body).to.have.property('updatedPod');
      var updatedPod = response.body.updatedPod;
      expect(updatedPod.name).to.deep.equal(testPod1.name);
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
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments successfully set to Active: ${testDeplcENM.name}.`); // eslint-disable-line max-len

      // Create a new Deployment CCD
      response = await agent.post('/deployments').send(testDeplCCD).expect(201);
      expect(response.body).to.be.an('object');
      expect(response.body).to.have.property('newDeployment');
      var cCDDeployment = response.body.newDeployment;
      expect(cCDDeployment.associatedPod).to.deep.equal(cCDDeployment.associatedPod);
      expect(cCDDeployment.queueStatus).to.deep.equal('Queued');

      expect(response.body.podStatus).to.deep.equal(`Successfully updated Pod ${testDeplCCD.associatedPod} with ${testDeplCCD.name} details.`);
      expect(response.body.queueMessage).to.deep.equal(`Queue-Handling for Pod ${testPod1.name}.\nDeployments still queued: testDeplCCD.`); // eslint-disable-line max-len

      // Update cENM Deployment to Failed
      var cENMUpdate = {
        queueStatus: 'Failed'
      };

      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Failed');

      // Expect CCD to be 'Active'
      response = await agent.get('/deployments/' + cCDDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Active');

      // Update cENM to 'Active' , expect queueStatus to be 'Queued'
      cENMUpdate = {
        queueStatus: 'Active'
      };
      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      expect(response.body).to.have.property('updatedDeployment');
      expect(response.body.updatedDeployment.queueStatus).to.deep.equal('Queued');

      // Updating Queued Deployment to Finished
      cENMUpdate = {
        queueStatus: 'Finished'
      };
      response = await agent.put('/deployments/' + cENMDeployment._id).send(cENMUpdate).expect(200);
      response = await agent.get('/deployments/' + cENMDeployment._id).expect(200);
      expect(response.body.queueStatus).to.deep.equal('Finished');
    });

    afterEach(async function () {
      clock.restore();
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
