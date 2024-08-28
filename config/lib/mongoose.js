var mongoose = require('mongoose'),
  logger = require('./logger');

// Initialize Mongoose
module.exports.connect = function (database, cb) {
  mongoose.Promise = database.promise;

  mongoose.connect(database.uri, database.options, function (err, db) {
    // Log Error
    if (err) {
      logger.info('Could not connect to MongoDB!');
      logger.info(err);
    } else {
      // Enabling mongoose debug mode if required
      mongoose.set('debug', database.debug);
      // Call callback FN
      if (cb) cb(db);
    }
  });
};
