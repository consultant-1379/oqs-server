var _ = require('lodash'),
  chai = require('chai'),
  chaiHttp = require('chai-http'),
  expect = chai.expect,
  request = require('supertest'),
  sinon = require('sinon'),
  server = require('../../../server'),
  Configuration = require('../models/configurations.model').Schema,
  HistoryConfigurations = require('../../history/models/history.model').getSchema('configurations'),
  User = require('../../users/models/users.model').Schema;

require('sinon-mongoose');
chai.use(chaiHttp);

var agent,
  response,
  configReturned,
  logReturned,
  logUpdate,
  testConfigurationId,
  userObject;

// Fake sinon errors
var fakeCallbackErr = function (callback) {
  process.nextTick(function () {
    callback(new Error('Simulated Error'));
  });
};

// Configurations
var defaultPodLoadTolerance = 50;
var defaultProductLoadValue = 15;
var defaultProductTimeoutValue = 60;

var testConfigurationDefault = { name: 'testConfigDefault' };
var testConfiguration = {
  name: 'testConfig',
  defaultPodLoadTolerance: 40,
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
  }]
};
var testConfigurationUpdate = { defaultPodLoadTolerance: 58 };

// Users
var validUser = {
  username: 'testuser',
  password: 'validPassword',
  firstName: 'firstName',
  roles: ['admin'],
  lastName: 'lastName',
  displayName: 'firstName lastName',
  email: 'testuser@ericsson.com'
};

var invalidConfigurationID = '000000000000000000000000';

describe('Configuration API tests', function () {
  before(function () {
    sinon.restore();
    agent = request.agent(server);
  });

  beforeEach(async function () {
    userObject = new User(validUser);
    await userObject.save();
    response = null;
  });

  describe('GET configurations/', function () {
    it('should get a configuration list with 0 elements', async function () {
      response = await agent.get('/configurations').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(0);
    });

    it('should get a configuration list with 1 element', async function () {
      await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);
      response = await agent.get('/configurations').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.deep.equal(1);
    });

    it('should get a single configuration log with its ID value', async function () {
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);
      expect(response.body).to.not.equal(undefined);
      var testObjId = response.body._id;
      response = await agent.get('/logs/configurations/' + testObjId).expect(200);
      expect(response.body.associated_id).to.deep.equal(testObjId);
      expect(response.body.originalData).to.not.equal(undefined);
      expect(response.body.originalData.name).to.deep.equal(testConfiguration.name);
      expect(response.body.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(response.body.originalData.products[0].defaultProductLoadValue).to.deep.equal(testConfiguration.products[0].defaultProductLoadValue);
      expect(response.body.originalData.products[0].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[0].defaultProductTimeoutValue); // eslint-disable-line max-len
    });
  });

  describe('GET configurations/{:id}', function () {
    it('should get a single configuration with its ID value', async function () {
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration);
      testConfigurationId = response.body._id;
      response = await agent.get('/configurations/' + testConfigurationId).expect(200);
      expect(response.body._id).to.deep.equal(testConfigurationId);
      expect(response.body.name).to.deep.equal(testConfiguration.name);
      expect(response.body.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(response.body.products[0].defaultProductLoadValue).to.deep.equal(testConfiguration.products[0].defaultProductLoadValue);
      expect(response.body.products[0].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[0].defaultProductTimeoutValue);
    });

    it('should throw 404 when a correctly formatted Pod ID is not in database', async function () {
      response = await agent.get('/configurations/' + invalidConfigurationID).expect(404);
      expect(response.body.message).to.deep.equal('A configuration with that ID does not exist');
    });

    it('should throw 404 when an incorrectly formatted Pod ID is used for searching the database', async function () {
      response = await agent.get('/configurations/0').expect(404);
      expect(response.body.message).to.deep.equal('A configuration with that ID does not exist');
    });
  });
  describe('GET configurations/search?{query}', function () {
    var configSearch = {
      name: 'configSearch',
      defaultPodLoadTolerance: 55,
      products: [{
        name: 'abc',
        defaultProductLoadValue: 44,
        defaultProductTimeoutValue: 4
      },
      {
        name: 'def',
        defaultProductLoadValue: 55,
        defaultProductTimeoutValue: 5
      },
      {
        name: 'ghi',
        defaultProductLoadValue: 66,
        defaultProductTimeoutValue: 6
      }]
    };

    beforeEach(async function () {
      await agent.post('/configurations').auth(validUser.username, validUser.password).send(configSearch);
    });

    it('should return all Configurations when no search filter criteria is provided', async function () {
      response = await agent.get('/configurations/search').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);
    });

    it('should get a collection of configurations matching the search criteria with one query param', async function () {
      response = await agent.get('/configurations/search?defaultPodLoadTolerance=55').expect(200);
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.equal(1);
    });

    it('should return an error message and status 422 when the Configuration.find function fails', async function () {
      sinon.mock(Configuration).expects('find').chain('exec').yields(new Error('Simulated Error.'));
      response = await agent.get('/configurations/search').expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error.');
    });
  });

  describe('POST configurations/', function () {
    it('should create a new configuration with default values', async function () {
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationDefault).expect(201);
      expect(response.body).to.be.an('object');

      // Information on the new Configuration
      var newConfiguration = response.body;
      expect(newConfiguration.name).to.deep.equal(testConfigurationDefault.name);
      expect(newConfiguration.defaultPodLoadTolerance).to.deep.equal(defaultPodLoadTolerance);
      expect(newConfiguration.products[0].defaultProductLoadValue).to.deep.equal(defaultProductLoadValue);
      expect(newConfiguration.products[0].defaultProductTimeoutValue).to.deep.equal(defaultProductTimeoutValue);
      expect(newConfiguration.products[1].defaultProductLoadValue).to.deep.equal(defaultProductLoadValue);
      expect(newConfiguration.products[1].defaultProductTimeoutValue).to.deep.equal(defaultProductTimeoutValue);
      expect(newConfiguration.products[2].defaultProductLoadValue).to.deep.equal(defaultProductLoadValue);
      expect(newConfiguration.products[2].defaultProductTimeoutValue).to.deep.equal(defaultProductTimeoutValue);
    });

    it('should create a new configuration with set values', async function () {
      var testConfigurationFull = {
        name: 'testConfigFull',
        defaultPodLoadTolerance: 77,
        products: [{
          name: 'abc',
          defaultProductLoadValue: 44,
          defaultProductTimeoutValue: 4
        },
        {
          name: 'def',
          defaultProductLoadValue: 55,
          defaultProductTimeoutValue: 5
        },
        {
          name: 'ghi',
          defaultProductLoadValue: 66,
          defaultProductTimeoutValue: 6
        }]
      };
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationFull).expect(201);

      expect(response.body).to.be.an('object');
      // Information on the new Configuration
      var newConfiguration = response.body;
      expect(newConfiguration.name).to.deep.equal(testConfigurationFull.name);
      expect(newConfiguration.defaultPodLoadTolerance).to.deep.equal(testConfigurationFull.defaultPodLoadTolerance);
      expect(newConfiguration.products[0].defaultProductLoadValue).to.deep.equal(testConfigurationFull.products[0].defaultProductLoadValue);
      expect(newConfiguration.products[0].defaultProductTimeoutValue).to.deep.equal(testConfigurationFull.products[0].defaultProductTimeoutValue);
      expect(newConfiguration.products[1].defaultProductLoadValue).to.deep.equal(testConfigurationFull.products[1].defaultProductLoadValue);
      expect(newConfiguration.products[1].defaultProductTimeoutValue).to.deep.equal(testConfigurationFull.products[1].defaultProductTimeoutValue);
      expect(newConfiguration.products[2].defaultProductLoadValue).to.deep.equal(testConfigurationFull.products[2].defaultProductLoadValue);
      expect(newConfiguration.products[2].defaultProductTimeoutValue).to.deep.equal(testConfigurationFull.products[2].defaultProductTimeoutValue);
    });

    it('should not create more than one configuration (currently)', async function () {
      // POST the first configuration
      await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);

      // Try to post a 2nd configuration.
      var testConfiguration2 = {
        name: 'testConfig2',
        defaultPodLoadTolerance: 40
      };
      response = await agent.post('/configurations').send(testConfiguration2).expect(400);
      expect(response.body.message).to.deep.equal('Only 1 Configuration is currently supported, edit existing one');
    });

    it('should not create more than one configuration with the same name', async function () {
      // POST the first configuration
      await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);

      // Try to post a 2nd configuration with the same name.
      response = await agent.post('/configurations').send(testConfiguration).expect(400);
      expect(response.body.message).to.deep.equal('Name is not valid, provided name must be unique.');
    });

    it('should not create a configuration with a name with an invalid length - too short', async function () {
      var testConfigurationShortName = { name: 'xxx' };
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationShortName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testConfigurationShortName.name + '`) is shorter than the minimum allowed length (4).');
    });

    it('should not create a configuration with a name with an invalid length - too long', async function () {
      var testConfigurationLongName = { name: 'xxxxxxxxxxxxxxxxxxxxx' };
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationLongName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` (`' + testConfigurationLongName.name + '`) is longer than the maximum allowed length (20).');
    });

    it('should not create a configuration with a name that does not match regex pattern', async function () {
      var testConfigurationBadRegexName = { name: '!£$%&' };
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationBadRegexName).expect(400);
      expect(response.body.message).to.deep.equal('name is not valid; \'!£$%&\' can only contain letters, numbers, dots, dashes and underscores.');
    });

    it('should not create a configuration without a name key', async function () {
      var testConfigurationNoName = { defaultPodLoadTolerance: '90' };
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfigurationNoName).expect(400);
      expect(response.body.message).to.deep.equal('Path `name` is required.');
    });

    it('should post a new log with user-details when a configuration is created by a logged-in user', async function () {
      response = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);
      expect(response.body._id).to.have.length(24);
      testConfigurationId = response.body._id;

      configReturned = await Configuration.findById(testConfigurationId).exec();
      expect(configReturned.name).to.deep.equal(testConfiguration.name);

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(logReturned.createdAt).to.not.equal(undefined);
      expect(logReturned.createdBy).to.not.equal(undefined);
      expect(logReturned.createdBy.username).to.deep.equal(validUser.username);
      expect(logReturned.createdBy.displayName).to.deep.equal(validUser.displayName);
      expect(logReturned.createdBy.email).to.deep.equal(validUser.email);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });
  });

  describe('PUT configurations/{id}', function () {
    beforeEach(async function () { // eslint-disable-line
      var res = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);
      testConfigurationId = res.body._id;
    });

    it('should update partial configuration info (eg. defaultPodLoadTolerance = 58)', async function () {
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(200);

      // Information on the updated Configuration
      var updatedConf = response.body;
      expect(updatedConf.updatedConfiguration._id).to.deep.equal(testConfigurationId);
      expect(updatedConf.updatedConfiguration.defaultPodLoadTolerance).to.deep.equal(58);
    });

    it('should update full configuration info', async function () {
      var testConfigurationFullUpdate = {
        defaultPodLoadTolerance: 5,
        products: [{
          name: 'abc',
          defaultProductLoadValue: 44,
          defaultProductTimeoutValue: 4
        },
        {
          name: 'def',
          defaultProductLoadValue: 55,
          defaultProductTimeoutValue: 5
        },
        {
          name: 'ghi',
          defaultProductLoadValue: 66,
          defaultProductTimeoutValue: 6
        }]
      };

      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationFullUpdate).expect(200);

      // Information on the updated Configuration
      var updatedConf = response.body;
      expect(updatedConf.updatedConfiguration._id).to.deep.equal(testConfigurationId);
      expect(updatedConf.updatedConfiguration.defaultPodLoadTolerance).to.deep.equal(testConfigurationFullUpdate.defaultPodLoadTolerance);
      expect(updatedConf.updatedConfiguration.products[0].defaultProductLoadValue).to.deep.equal(testConfigurationFullUpdate.products[0].defaultProductLoadValue); // eslint-disable-line max-len
      expect(updatedConf.updatedConfiguration.products[0].defaultProductTimeoutValue).to.deep.equal(testConfigurationFullUpdate.products[0].defaultProductTimeoutValue); // eslint-disable-line max-len
      expect(updatedConf.updatedConfiguration.products[1].defaultProductLoadValue).to.deep.equal(testConfigurationFullUpdate.products[1].defaultProductLoadValue); // eslint-disable-line max-len
      expect(updatedConf.updatedConfiguration.products[1].defaultProductTimeoutValue).to.deep.equal(testConfigurationFullUpdate.products[1].defaultProductTimeoutValue); // eslint-disable-line max-len
      expect(updatedConf.updatedConfiguration.products[2].defaultProductLoadValue).to.deep.equal(testConfigurationFullUpdate.products[2].defaultProductLoadValue); // eslint-disable-line max-len
      expect(updatedConf.updatedConfiguration.products[2].defaultProductTimeoutValue).to.deep.equal(testConfigurationFullUpdate.products[2].defaultProductTimeoutValue); // eslint-disable-line max-len
    });

    it('should not update a configuration when an incorrect ID is entered', async function () {
      response = await agent.put('/configurations/' + invalidConfigurationID).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst getting Configuration: A Configuration with that ID does not exist');
    });

    it('should not update a configuration name - immutable', async function () {
      var testConfigName = { name: 'UPDATED_CONFIG_NAME' };
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigName).expect(406);
      expect(response.body.message).to.deep.equal('Configuration \'name\' field is immutable and cannot be modified.');
    });

    it('should return an error message and status 422 when the Configuration.find function fails to return the Configuration to be updated', async function () {
      sinon.mock(Configuration).expects('findOne').yields(fakeCallbackErr);
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst getting Configuration: Internal Server Error');
    });

    it('should return an error message and status 400 when the Configuration.save function returns a ValidationError', async function () {
      function ValidationError(message) {
        this.name = 'ValidationError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new ValidationError('Simulated ValidationError'));
        });
      };
      sinon.replace(Configuration.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(400);
      expect(response.body.message).to.deep.equal('Simulated ValidationError');
    });

    it('should return an error message and status 400 when the Configuration.save function returns a StrictModeError', async function () {
      function StrictModeError(message) {
        this.name = 'StrictModeError';
        this.message = message;
      }
      var fakeCallbackErrCustom = function (callback) {
        process.nextTick(function () {
          callback(new StrictModeError('Simulated StrictModeError'));
        });
      };
      sinon.replace(Configuration.prototype, 'save', fakeCallbackErrCustom);
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(400);
      expect(response.body.message).to.deep.equal('Simulated StrictModeError');
    });

    it('should return an error message and status 422 when the Configuration.save function returns any other error', async function () {
      sinon.replace(Configuration.prototype, 'save', fakeCallbackErr);
      response = await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(422);
      expect(response.body.message).to.deep.equal('Simulated Error');
    });

    it('should update an existing log with user-details for a configuration thats updated by a logged-in user', async function () {
      response = await agent.put('/configurations/' + testConfigurationId)
        .send(testConfigurationUpdate)
        .auth(validUser.username, validUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedConfiguration');
      expect(response.body.updatedConfiguration._id).to.have.length(24);
      expect(response.body.updatedConfiguration.name).to.deep.equal(testConfiguration.name);
      expect(response.body.updatedConfiguration.defaultPodLoadTolerance).to.deep.equal(testConfigurationUpdate.defaultPodLoadTolerance);

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validUser.email);
      expect(logUpdate.updateData.defaultPodLoadTolerance).to.deep.equal(testConfigurationUpdate.defaultPodLoadTolerance);
    });

    it('should create a log with defined user-details for a configuration that gets updated by a logged-in user', async function () {
      // clear logs and verify
      await HistoryConfigurations.remove().exec();
      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.put('/configurations/' + testConfigurationId)
        .send(testConfigurationUpdate)
        .auth(validUser.username, validUser.password)
        .expect(200);

      expect(response.body).to.have.property('updatedConfiguration');
      expect(response.body.updatedConfiguration._id).to.have.length(24);
      expect(response.body.updatedConfiguration.name).to.deep.equal(testConfiguration.name);
      expect(response.body.updatedConfiguration.defaultPodLoadTolerance).to.deep.equal(testConfigurationUpdate.defaultPodLoadTolerance);

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(1);

      logUpdate = logReturned.updates[0];
      expect(logUpdate.updatedAt).to.not.equal(undefined);
      expect(logUpdate.updatedBy.username).to.deep.equal(validUser.username);
      expect(logUpdate.updatedBy.displayName).to.deep.equal(validUser.displayName);
      expect(logUpdate.updatedBy.email).to.deep.equal(validUser.email);
      expect(logUpdate.updateData.defaultPodLoadTolerance).to.deep.equal(testConfigurationUpdate.defaultPodLoadTolerance);
    });

    it('should not update a configurations existing log-file when that configuration cant be found in the database', async function () {
      sinon.mock(Configuration).expects('findById').chain('exec').returns(undefined);
      await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(200);

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(logReturned.originalData.products[0].defaultProductLoadValue).to.deep.equal(testConfiguration.products[0].defaultProductLoadValue);
      expect(logReturned.originalData.products[0].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[0].defaultProductTimeoutValue);
      expect(logReturned.originalData.products[1].defaultProductLoadValue).to.deep.equal(testConfiguration.products[1].defaultProductLoadValue);
      expect(logReturned.originalData.products[1].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[1].defaultProductTimeoutValue);
      expect(logReturned.originalData.products[2].defaultProductLoadValue).to.deep.equal(testConfiguration.products[2].defaultProductLoadValue);
      expect(logReturned.originalData.products[2].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[2].defaultProductTimeoutValue);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });

    it('should not update a configurations existing log-file when an error occurs during the process', async function () {
      sinon.mock(Configuration).expects('findById').chain('exec').throws(new Error('Simulated Error'));
      await agent.put('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).send(testConfigurationUpdate).expect(200);
      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(logReturned.originalData.products[0].defaultProductLoadValue).to.deep.equal(testConfiguration.products[0].defaultProductLoadValue);
      expect(logReturned.originalData.products[0].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[0].defaultProductTimeoutValue);
      expect(logReturned.originalData.products[1].defaultProductLoadValue).to.deep.equal(testConfiguration.products[1].defaultProductLoadValue);
      expect(logReturned.originalData.products[1].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[1].defaultProductTimeoutValue);
      expect(logReturned.originalData.products[2].defaultProductLoadValue).to.deep.equal(testConfiguration.products[2].defaultProductLoadValue);
      expect(logReturned.originalData.products[2].defaultProductTimeoutValue).to.deep.equal(testConfiguration.products[2].defaultProductTimeoutValue);
      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
    });
  });

  describe('DELETE configurations/{id}', function () {
    beforeEach(async function () {
      var res = await agent.post('/configurations').auth(validUser.username, validUser.password).send(testConfiguration).expect(201);
      testConfigurationId = res.body._id;
    });

    it('should successfully delete a configuration using the Configuration ID', async function () {
      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(200);
      expect(response.body.message).to.deep.equal('Configuration deleted successfully.');
    });

    it('should return a 404 message when using the wrong ID to delete a configuration', async function () {
      response = await agent.delete('/configurations/' + invalidConfigurationID).auth(validUser.username, validUser.password).expect(404);
      expect(response.body.message).to.deep.equal('Error whilst finding the Configuration to delete: A Configuration with that ID does not exist');
    });

    it('should return an error message and status 500 when the Configuration.findOne function fails to return the Configuration to be deleted', async function () {
      sinon.mock(Configuration).expects('findOne').yields(fakeCallbackErr);
      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst finding the Configuration to delete: Internal Server Error');
    });

    it('should return an error message and status 500 when the Configuration.remove function fails to return the Configuration to be deleted', async function () {
      sinon.mock(Configuration.prototype).expects('remove').yields(fakeCallbackErr);
      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(500);
      expect(response.body.message).to.deep.equal('Error whilst deleting Configuration: Internal Server Error');
    });

    it('should update an existing log with user-details for a configuration thats deleted by a logged-in user', async function () {
      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(200);
      expect(response.body.message).to.contain('Configuration deleted successfully');

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);
      expect(logReturned.originalData.defaultPodLoadTolerance).to.deep.equal(testConfiguration.defaultPodLoadTolerance);
      expect(logReturned.originalData.defaultProductLoadValue).to.deep.equal(testConfiguration.defaultProductLoadValue);
      expect(logReturned.originalData.defaultProductTimeoutValue).to.deep.equal(testConfiguration.defaultProductTimeoutValue);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validUser.email);
    });

    it('should create a log with defined user-details for a configuration that gets deleted by a logged-in user', async function () {
      // clear logs and verify
      await HistoryConfigurations.remove().exec();
      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned).to.equal(null);

      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(200);
      expect(response.body.message).to.contain('Configuration deleted successfully');

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned.originalData).to.not.equal(undefined);
      expect(logReturned.originalData.name).to.deep.equal(testConfiguration.name);

      expect(logReturned.updates).to.be.instanceof(Array).and.have.lengthOf(0);
      expect(logReturned.deletedAt).to.not.equal(undefined);
      expect(logReturned.deletedBy).to.not.equal(undefined);
      expect(logReturned.deletedBy.username).to.deep.equal(validUser.username);
      expect(logReturned.deletedBy.displayName).to.deep.equal(validUser.displayName);
      expect(logReturned.deletedBy.email).to.deep.equal(validUser.email);
    });

    it('should not create a configuration log-file with deletion info when an error occurs during the process', async function () {
      // clear logs and verify
      await HistoryConfigurations.remove().exec();
      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned).to.equal(null);

      sinon.mock(Configuration.prototype).expects('toObject').throws(new Error('Simulated Error'));
      response = await agent.delete('/configurations/' + testConfigurationId).auth(validUser.username, validUser.password).expect(200);
      expect(response.body.message).to.contain('Configuration deleted successfully');

      logReturned = await HistoryConfigurations.findOne({ associated_id: testConfigurationId }).exec();
      expect(logReturned).to.equal(null);
    });
  });

  afterEach(async function () {
    sinon.restore();
    await User.remove().exec();
    await Configuration.remove().exec();
    await HistoryConfigurations.remove().exec();
  });
});
