'use strict';

/**
 * Get the error message from error object
 */
exports.getErrorMessage = function (err) {
  var message = err;
  if (err.message && !err.errors) {
    message = err.message;
  } else if (err.name === 'ValidationError') {
    for (var key in err.errors) {
      if (Object.prototype.hasOwnProperty.call(err.errors, key)) {
        message = err.errors[key].message;
      }
    }
  }
  return message;
};

exports.checkForImmutableFieldChange = function (req, objToUpdate, fieldNames) {
  for (var i = 0; i < fieldNames.length; i += 1) {
    var fieldName = fieldNames[i];
    if (req.body[fieldName] && req.body[fieldName] !== objToUpdate[fieldName]) {
      throw Error(`${objToUpdate.constructor.modelName} '${fieldName}' field is immutable and cannot be modified.`);
    }
  }
};
