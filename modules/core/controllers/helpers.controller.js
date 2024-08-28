var nodemailer = require('nodemailer'),
  logger = require('../../../config/lib/logger');
var mailTransporter = nodemailer.createTransport({
  host: 'smtp-central.internal.ericsson.com',
  port: 25,
  secure: false, // true for 465, false for other ports
  tls: { rejectUnauthorized: false } // dont check certificate trust
});

module.exports.sendMail = async function (email) {
  try {
    // Send email
    await mailTransporter.sendMail(email);
  } catch (emailError) {
    logger.info(`Error whilst sending Email: ${emailError}`);
  }
};

module.exports.asyncForEach = async function (array, callBack) {
  for (var i = 0; i < array.length; i += 1) {
    await callBack(array[i], i, array); //eslint-disable-line
  }
};

module.exports.arrayDifference = function (array1, array2) {
  var newArray = [],
    difference = [];
  for (var x = 0; x < array1.length; x += 1) {
    newArray[array1[x]] = true;
  }
  for (var y = 0; y < array2.length; y += 1) {
    if (newArray[array2[y]]) {
      delete newArray[array2[y]];
    } else {
      newArray[array2[y]] = true;
    }
  }
  for (var item in newArray) { // eslint-disable-line
    difference.push(item);
  }
  return difference;
};

module.exports.generateResponseString = function (objName, jobName, successes, notFounds, errors) {
  var response = '';
  if (successes && successes.length) response += `\n${objName}s successfully ${jobName}: ${successes.join(', ')}.`;
  if (notFounds && notFounds.length) response += `\n${objName}s failed to ${jobName} (Not Found): ${notFounds.join(', ')}.`;
  if (errors && errors.length) response += `\n${objName}s failed to ${jobName} (Error): ${errors.join(', ')}.`;
  return response;
};

module.exports.returnJSON = function (res, statusCode, msg, err) {
  var responseObj = { message: msg };
  if (err) responseObj.error = err;
  return res.status(statusCode).json(responseObj);
};

module.exports.sendMonthlyCleanupMail = async function (result, error) {
  var emailSubject = 'OQS Monthly Logs Cleanup Result';
  var emailBody = `<a>Result: ${(error) ? 'Fail' : 'Success'}</a><br>
  <br>${(error) ? `${error}` : generateEmailBody(result)}`;
  var emailObject = {
    from: process.env.OQS_EMAIL_ADDRESS,
    to: process.env.TEAM_EMAIL,
    subject: emailSubject,
    html: emailBody
  };
  try {
    // Send email
    await mailTransporter.sendMail(emailObject);
  } catch (emailError) {
    logger.info(`Error whilst sending Monthly Cleanup Email: ${emailError}`);
  }
};

function generateEmailBody(results) {
  var body = '';
  for (var artifact in results) {
    if (results[artifact]) {
      var data = results[artifact];
      body += `<a>${artifact}:</a><hr>
      <a>Before: ${data.before} | After: ${data.after} | Deleted: ${data.deleted}</a><hr><br>`;
    }
  }
  return body;
}
