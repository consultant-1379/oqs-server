'use strict';

var mongoose = require('mongoose'),
  mongooseImmutable = require('mongoose-immutable'),
  uniqueValidator = require('mongoose-unique-validator'),
  validators = require('../../core/controllers/validators.controller'),
  config = require('../../../config/config'),
  MongooseHistory = require('../../history/plugins/history.plugin'),
  Pod = require('../../pods/models/pods.model').Schema,
  meanDbConn = mongoose.createConnection(config.dbMean.uri);

var ProductSchema = new mongoose.Schema({
  _id: false,
  name: {
    type: String,
    trim: true,
    required: true
  },
  defaultProductLoadValue: {
    type: Number,
    default: 15,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  },
  defaultProductTimeoutValue: {
    type: Number,
    default: 60,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  }
}, { strict: 'throw' });

var configurationSchema = new mongoose.Schema({
  name: {
    type: String,
    immutable: true,
    trim: true,
    required: true,
    unique: true,
    minlength: 4,
    maxlength: 20,
    validate: validators.objectNameValidator
  },
  defaultPodLoadTolerance:
  {
    type: Number,
    required: true,
    default: 50,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  },
  products: {
    type: [ProductSchema],
    default: [{ name: 'vENM' }, { name: 'cENM' }, { name: 'CCD' }]
  }
});
configurationSchema.plugin(uniqueValidator, { message: 'Name is not valid, provided name must be unique.' });
configurationSchema.plugin(mongooseImmutable);

configurationSchema.pre('save', async function (next) {
  try {
    var configuration = this;
    var crudType = (configuration.isNew) ? 'create' : 'update';
    // Only 1 is currently allowed
    var configurations = await mongoose.model('Configuration').find({});
    if (crudType === 'create' && configurations.length > 0) {
      throw new Error('Only 1 Configuration is currently supported, edit existing one');
    }
    next();
  } catch (preSaveError) { return next(preSaveError); }
});

configurationSchema.plugin(MongooseHistory);

module.exports.Schema = meanDbConn.model('Configuration', configurationSchema);
