module.exports.isInteger = function (value) {
  return Number.isInteger(value);
};

module.exports.objectNameValidator = {
  validator: function (name) {
    return /^[a-zA-Z0-9\-_.]*$/.test(name);
  },
  message: '{PATH} is not valid; \'{VALUE}\' can only contain letters, numbers, dots, dashes and underscores.'
};
