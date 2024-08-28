var express = require('express');
var router = express.Router(); //eslint-disable-line
var core = require('../controllers/core.controller');

router.get('/versions', core.getVersions);
router.get('/upgradeEmail', core.getUpgradeEmail);
router.get('/artifactCleanup', core.artifactCleanup);
router.get('/toolnotifications', core.getToolNotifications);
module.exports = router;
