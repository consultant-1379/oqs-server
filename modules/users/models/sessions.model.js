var mongoose = require('mongoose'),
  config = require('../../../config/config'),
  meanDbConn = mongoose.createConnection(config.dbMean.uri);

var sessionSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  session: {
    type: String
  },
  expires:
  {
    type: Date
  }
});

module.exports.Schema = meanDbConn.model('Session', sessionSchema);
