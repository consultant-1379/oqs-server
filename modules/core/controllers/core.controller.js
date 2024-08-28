var fs = require('fs'),
  requestPromise = require('request-promise'),
  cron = require('node-cron'),
  helperHandler = require('../../core/controllers/helpers.controller'),
  HistoryLog = require('../../history/models/history.model'),
  clearArtifactLogsFor = ['pod', 'deployment'];

exports.getVersions = async function (req, res) {
  try {
    var serverVersion = await fs.readFileSync('VERSION', 'utf8');
    var clientVersion = await fs.readFileSync('version-info/client/VERSION', 'utf8');
    var apidocsVersion = await fs.readFileSync('version-info/apidocs/VERSION', 'utf8');
    var helpdocsVersion = await fs.readFileSync('version-info/helpdocs/VERSION', 'utf8');
    var baselineVersion = await fs.readFileSync('version-info/baseline/VERSION', 'utf8');

    res.send({
      server: serverVersion.replace('\n', ''),
      client: clientVersion.replace('\n', ''),
      apidocs: apidocsVersion.replace('\n', ''),
      helpdocs: helpdocsVersion.replace('\n', ''),
      baseline: baselineVersion.replace('\n', '')
    });
  } catch (err) {
    res.status(500).json(`Error Retrieving Versions: ${err.message}.`);
  }
};

// Tool's upgrade email
exports.getUpgradeEmail = async function (req, res) {
  try {
    var oqsRepos = ['oqs-baseline', 'oqs-client', 'oqs-server', 'oqs-helpdocs', 'oqs-apidocs'];
    for (var i = 0; i < oqsRepos.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      var toolResponse = await requestPromise.get({
        uri: `${process.env.UPGRADE_TOOL_URL}/api/upgradeCheck?q=toolName=${oqsRepos[i]}`,
        json: true
      });
      if (!toolResponse.message) {
        res.send(toolResponse);
        break;
      }
      // If last repo still has no upgrades, send 'no upgrades planned'
      if (i === 4 && toolResponse.message) res.send(toolResponse);
    }
  } catch (requestErr) {
    // 200 = Error in this api should not impact the tool itself
    return res.status(200).send({
      message: `Upgrade Tool Request Error: ${requestErr.message}`
    });
  }
};
// Get Tool Notifications
exports.getToolNotifications = async function (req, res) {
  var options = {
    uri: `${process.env.UPGRADE_TOOL_URL}/api/toolnotifications/oqs-baseline`,
    json: true
  };

  try {
    var toolResponse = await requestPromise.get(options);
    res.send(toolResponse);
  } catch (requestErr) {
    // 200 = Error in this api should not impact the tool itself
    return res.status(200).send({
      message: `Upgrade tool request error: ${requestErr.message}`
    });
  }
};

exports.artifactCleanup = async function (req, res) {
  try {
    var result = {};
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var before,
      after,
      HistoryLogArtifact;
    await helperHandler.asyncForEach(clearArtifactLogsFor, async function (artifact) {
      HistoryLogArtifact = HistoryLog.getSchema(artifact + 's');
      before = await HistoryLogArtifact.count();
      await HistoryLogArtifact.deleteMany({
        deletedAt: { $lt: sixMonthsAgo }
      });
      after = await HistoryLogArtifact.count();
      result[artifact + 'Logs'] = {
        before: before, after: after, deleted: before - after
      };
    });
    if (req) {
      result.message = 'Logs cleared successfully';
      res.status(200).send(result);
    } else {
      await helperHandler.sendMonthlyCleanupMail(result);
    }
  } catch (clearError) {
    await helperHandler.sendMonthlyCleanupMail(false, clearError);

    if (req) {
      res.status(422).send({
        message: `Error Whilst clearing Logs: ${clearError.message}`
      });
    } else {
      await helperHandler.sendMonthlyCleanupMail(false, clearError);
    }
  }
};
// sec/min/hr/day/mth/day(week)
cron.schedule('0 0 0 1 * *', async function () {
  await exports.artifactCleanup(false, false);
});
