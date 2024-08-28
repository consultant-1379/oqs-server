'use strict';

var mongoose = require('mongoose'),
  mongooseImmutable = require('mongoose-immutable'),
  uniqueValidator = require('mongoose-unique-validator'),
  validators = require('../../core/controllers/validators.controller'),
  MongooseHistory = require('../../history/plugins/history.plugin'),
  config = require('../../../config/config'),
  meanDbConn = mongoose.createConnection(config.dbMean.uri),
  Pod = require('../../pods/models/pods.model').Schema;

var deploymentSchema = new mongoose.Schema({
  name: {
    type: String,
    immutable: true,
    trim: true,
    required: true,
    unique: true,
    minlength: 5,
    maxlength: 50,
    validate: validators.objectNameValidator
  },
  associatedPod: {
    type: String,
    immutable: true,
    trim: true,
    required: true,
    minlength: 5,
    maxlength: 20,
    validate: validators.objectNameValidator
  },
  jobType: {
    type: String,
    enum: ['Install', 'Upgrade'],
    default: ['Install']
  },
  queueStatus: {
    type: String,
    enum: ['Queued', 'Active', 'Finished', 'Failed', 'Timed-Out'],
    default: ['Queued']
  },
  productSet: {
    type: String
  },
  queuingStartTime: {
    type: Date,
    default: undefined
  },
  instanceRunningStartTime: {
    type: Date,
    default: undefined
  },
  instanceRunningFinishTime: {
    type: Date,
    default: undefined
  },
  product: {
    type: String,
    enum: ['vENM', 'cENM', 'CCD'],
    default: ['vENM']
  },
  customTimeout: {
    type: Number,
    min: 1,
    max: 999,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 1'
    }
  }
});

deploymentSchema.plugin(uniqueValidator, { message: 'Name is not valid, provided name must be unique.' });
deploymentSchema.plugin(mongooseImmutable);

deploymentSchema.pre('save', async function (next) {
  var deployment = this;

  var crudType = (deployment.isNew) ? 'create' : 'update';
  if (crudType === 'create') deployment.queueStatus = 'Queued';

  var parentPod = await Pod.findOne({ name: deployment.associatedPod });
  if (!parentPod) parentPod = new Pod({ name: deployment.associatedPod, deployments: [deployment.name] });

  var currentTime = Date.now();
  if (crudType === 'create') deployment.queuingStartTime = currentTime;

  // Reset start/finish/queueing time fields when Deployment gets sent back to queue
  if (deployment.queueStatus !== 'Failed' && deployment.queueStatus !== 'Finished' && deployment.queueStatus !== 'Timed-Out' && crudType === 'update') {
    // Put it back to queue if trying to update deployment to 'Active' that finished before
    if (deployment.queueStatus === 'Active' && deployment.instanceRunningFinishTime) deployment.queueStatus = 'Queued';
    if (deployment.queueStatus === 'Queued') deployment.queuingStartTime = currentTime;
    deployment.instanceRunningStartTime = undefined;
    deployment.instanceRunningFinishTime = undefined;
  }

  if (deployment.queueStatus !== 'Queued') {
    if (deployment.queueStatus === 'Active') {
      deployment.instanceRunningStartTime = currentTime;
    } else {
      if (!deployment.instanceRunningStartTime) deployment.instanceRunningStartTime = currentTime;
      deployment.instanceRunningFinishTime = currentTime;
      // Increment relevant metric counter for parent pod.
      var fieldToIncrement = (deployment.jobType === 'Install') ? 'totalInstall' : 'totalUpgrade';
      switch (deployment.queueStatus) {
        case 'Finished': fieldToIncrement += 'Successes'; break;
        case 'Failed': fieldToIncrement += 'Failures'; break;
        case 'Timed-Out': fieldToIncrement += 'Timeouts'; break;
        default: // Do nothing
      }
      parentPod[fieldToIncrement] += 1;
      await parentPod.save();
    }
  }
  next();
});

// The order of middleware is important. History Logging follows after the above Pre-Save
deploymentSchema.plugin(MongooseHistory);

module.exports.Schema = meanDbConn.model('Deployment', deploymentSchema);
