'use strict';

var mongoose = require('mongoose'),
  MongooseSchema = mongoose.Schema,
  config = require('../../../config/config'),
  loggingDbConn = mongoose.createConnection(config.dbLogging.uri, config.dbLogging.options),
  historyModels = {},
  loggedInUser = 'UNKNOWN USER';

var UpdateSchema = new MongooseSchema({
  _id: false,
  updatedAt: { type: Date, required: true },
  updatedBy: { type: mongoose.Schema.Types.Mixed, required: true },
  updateData: { type: mongoose.Schema.Types.Mixed, required: true }
});

var LogSchema = new MongooseSchema({
  associated_id: { type: mongoose.Schema.ObjectId, ref: 'associated_id', required: true },
  createdAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.Mixed, required: true },
  originalData: { type: mongoose.Schema.Types.Mixed, required: true },
  updates: [UpdateSchema],
  deletedAt: Date,
  deletedBy: mongoose.Schema.Types.Mixed
});

// Returns the history-log equivalent collection for any object - creating it first if it does not exist.
module.exports.getSchema = function (collectionName) {
  collectionName += '_log';
  if (!historyModels[collectionName]) historyModels[collectionName] = loggingDbConn.model(collectionName, LogSchema);
  return historyModels[collectionName];
};

// Sets all logged-in user details relevant to the history-logs.
module.exports.setLoggedInUser = function (user) {
  if (user) {
    loggedInUser = {
      email: (user.email) ? user.email : 'UNKNOWN EMAIL',
      username: (user.username) ? user.username : 'UNKNOWN USERNAME',
      displayName: (user.displayName) ? user.displayName : 'UNKNOWN NAME'
    };
  } else loggedInUser = 'UNKNOWN USER';
};

module.exports.getLoggedInUser = function () {
  return loggedInUser;
};
