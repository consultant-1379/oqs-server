'use strict';

var mongoose = require('mongoose'),
  mongooseImmutable = require('mongoose-immutable'),
  uniqueValidator = require('mongoose-unique-validator'),
  validators = require('../../core/controllers/validators.controller'),
  config = require('../../../config/config'),
  MongooseHistory = require('../../history/plugins/history.plugin'),
  Configuration = require('../../configurations/models/configurations.model').Schema,
  meanDbConn = mongoose.createConnection(config.dbMean.uri);


var ProductSchema = new mongoose.Schema({
  _id: false,
  name: {
    type: String,
    trim: true,
    required: true
  },
  loadValue: {
    type: Number,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  },
  timeoutValue: {
    type: Number,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  }
}, { strict: 'throw' });

var podSchema = new mongoose.Schema({
  name: {
    type: String,
    immutable: true,
    trim: true,
    required: true,
    unique: true,
    minlength: 5,
    maxlength: 20,
    validate: validators.objectNameValidator
  },
  queueEnabled:
  {
    type: Boolean,
    default: true
  },
  products: {
    type: [ProductSchema],
    default: [{ name: 'vENM' }, { name: 'cENM' }, { name: 'CCD' }]
  },
  podLoadTolerance:
  {
    type: Number,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer'
    }
  },
  deployments:
    [{
      type: String
    }],
  totalInstallSuccesses:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  totalInstallFailures:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  totalInstallTimeouts:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  totalUpgradeSuccesses:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  totalUpgradeFailures:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  totalUpgradeTimeouts:
  {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: validators.isInteger,
      message: '{PATH} is not valid, {VALUE} is not an integer >= 0'
    }
  },
  productType: {
    type: [String],
    default: ['All']
  }
});
podSchema.plugin(uniqueValidator, { message: 'Name is not valid, provided name must be unique.' });
podSchema.plugin(mongooseImmutable);

podSchema.pre('save', async function (next) {
  try {
    var pod = this;
    var crudType = (pod.isNew) ? 'create' : 'update';
    var configuration = await Configuration.find({});
    var configurationExists = configuration.length !== 0;
    if (!configurationExists) throw new Error('No Default Configuration detected, please let Admin create one before proceeding.');

    // If products, check that all present in json
    var productsRequired = [];
    configuration[0].products.forEach(function (product) {
      productsRequired.push(product.name);
    });

    // Remove productTypes that are not valid
    pod.productType.forEach(function (type, index) {
      if (type !== 'All' && !productsRequired.includes(type)) pod.productType.splice(index, 1);
    });

    if (pod.productType && pod.productType.length === 0) pod.productType = ['All'];

    var currentProducts = [];

    if (pod.products) {
      pod.products.forEach(function (thisProduct) {
        currentProducts.push(thisProduct.name);
      });
    }

    // If products are missing, populate with default values
    var missingProducts = productsRequired.filter(x => !currentProducts.includes(x));
    var allProducts = pod.products;

    if (crudType === 'create') {
      pod.podLoadTolerance = (!pod.podLoadTolerance) ? configuration[0].defaultPodLoadTolerance : pod.podLoadTolerance;
      // Set defaults if loadValue/timeoutValue is missing
      pod.products.forEach(function (prod) {
        prod.loadValue = (!prod.loadValue) ? getProductDefaultValue(prod.name, 'defaultProductLoadValue', configuration[0]) : prod.loadValue;
        prod.timeoutValue = (!prod.timeoutValue) ? getProductDefaultValue(prod.name, 'defaultProductTimeoutValue', configuration[0]) : prod.timeoutValue;
      });
    }
    // Add missing products from configuration
    missingProducts.forEach(function (prodName) {
      var loadValue = getProductDefaultValue(prodName, 'defaultProductLoadValue', configuration[0]);
      var timeoutValue = getProductDefaultValue(prodName, 'defaultProductTimeoutValue', configuration[0]);
      allProducts.push({
        name: prodName,
        loadValue: loadValue,
        timeoutValue: timeoutValue
      });
    });
    // Remove any extra products that arent in configuration
    pod.products.forEach(function (product, index) {
      if (!productsRequired.includes(product.name)) pod.products.splice(index, 1);
    });
    pod.products = allProducts;

    next();
  } catch (preSaveError) { return next(preSaveError); }
});

podSchema.plugin(MongooseHistory);

module.exports.Schema = meanDbConn.model('Pod', podSchema);

function getProductDefaultValue(prodName, type, config) {
  var value;
  config.products.forEach(function (prod) {
    if (prod.name === prodName) value = prod[type];
  });
  return value;
}
