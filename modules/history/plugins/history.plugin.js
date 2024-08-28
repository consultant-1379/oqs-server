'use strict';

var getObjDifferences = require('deep-object-diff-mod').diff,
  History = require('../models/history.model'),
  logger = require('../../../config/lib/logger');
/**
 * history.plugin.js
 *
 * @description :: Server-side logic for generating Object logs.
 */

module.exports = function (oqsObject) {
  // Write a log on any object creation/update
  oqsObject.pre('save', async function (next) {
    var collectionName = this.collection.name;
    var HistoryDbSchema = History.getSchema(collectionName);
    var historyDoc;
    if (this.name.startsWith('A_Health_')) {
      logger.info('no logging for Health-Check artifacts.. returning.');
      return next();
    }
    try {
      if (this.isNew) {
        historyDoc = createBaseHistoryDocument(initObject(this), this._id, false);
        await new HistoryDbSchema(historyDoc).save(next);
        return;
      }
      var MeanDbSchema = require('../../' + collectionName + '/models/' + collectionName + '.model').Schema; // eslint-disable-line global-require
      var foundExistingObj = await MeanDbSchema.findById(this._id).exec();
      if (!foundExistingObj) {
        logger.info('no existing object found.. returning.');
        return next();
      }
      var originalObj = initObject(foundExistingObj);
      var updatedObj = initObject(this);
      var objDifferences = getObjDifferences(originalObj, updatedObj);
      if (!Object.keys(objDifferences).length) {
        logger.info('no differences exist.. returning.');
        return next();
      }
      var updateLog = {
        updatedAt: new Date(),
        updatedBy: History.getLoggedInUser(),
        updateData: objDifferences
      };
      var foundExistingLog = await HistoryDbSchema.findOne({ associated_id: this._id }).exec();
      if (!foundExistingLog) {
        historyDoc = createBaseHistoryDocument(originalObj, this._id, true);
        historyDoc.updates = [updateLog];
        await new HistoryDbSchema(historyDoc).save(next);
        return;
      }
      foundExistingLog.updates = foundExistingLog.updates.concat(updateLog);
      foundExistingLog.save(next);
    } catch (errGenDiff) {
      logger.info(`Failed to generate object-difference for ${collectionName}: [${errGenDiff.name}] ${errGenDiff.message}`);
      next();
    }
  });

  // Write a log on any object removal
  oqsObject.pre('remove', async function (next) {
    var collectionName = this.collection.name;
    var HistoryDbSchema = History.getSchema(collectionName);
    var historyDoc;
    try {
      var foundLog = await HistoryDbSchema.findOne({ associated_id: this._id }).exec();
      if (!foundLog) {
        historyDoc = createBaseHistoryDocument(initObject(this), this._id, true);
        historyDoc.deletedAt = new Date();
        historyDoc.deletedBy = History.getLoggedInUser();
        await new HistoryDbSchema(historyDoc).save(next);
        return;
      }
      foundLog.set({ deletedAt: new Date(), deletedBy: History.getLoggedInUser() });
      foundLog.save(next);
    } catch (errRemoveLog) {
      logger.info(`Failed to create/update ${collectionName} log with deletion info: [${errRemoveLog.name}] ${errRemoveLog.message}`);
      next();
    }
  });

  // Generates an object history-log into the required template before it gets added to MongoDb.
  function createBaseHistoryDocument(originalObj, objectId, isLegacyObject) {
    var historyDoc = {
      associated_id: objectId,
      originalData: originalObj,
      createdAt: (isLegacyObject) ? new Date(0) : new Date(),
      createdBy: (isLegacyObject) ? 'UNKNOWN USER' : History.getLoggedInUser()
    };
    return historyDoc;
  }

  function initObject(thisRef) {
    try {
      var obj = thisRef.toObject();
      delete obj._id;
      delete obj.__v;
      return obj;
    } catch (errInitObj) { throw errInitObj; }
  }
};
