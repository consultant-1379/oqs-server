var requestPromise = require('request-promise'),
  logger = require('../../../config/lib/logger'),
  helpers = require('../../core/controllers/helpers.controller'),
  Deployment = require('../../deployments/models/deployments.model').Schema,
  Pod = require('../../pods/models/pods.model').Schema;

/**
 * queues.controller.js
 *
 * @description :: Server-side logic for managing Queues.
 */

module.exports.handleRelationshipVerification = async function (req, res) {
  var msgHeader = 'Pod-Deployment Relationship Re-Associations: ';
  await relationshipVerificationHandler(msgHeader, function (resVerify) {
    var resStatus = (resVerify.error) ? 500 : 200;
    return res.status(resStatus).json(resVerify);
  });
};

// Links deployment-pod associations that previously failed.
async function relationshipVerificationHandler(resMessage, callBack) {
  var deployments,
    pods;
  try {
    deployments = await Deployment.find({});
    pods = await Pod.find({});
  } catch (errFind) {
    return callBack({
      message: resMessage + '(Error) Failed to find Pods/Deployments.',
      error: errFind
    });
  }
  var allDeplNames = deployments.map(depl => depl.name);
  var sortedDeplNames = [].concat.apply([], pods.map(pod => pod.deployments)); // Joining array of child string arrays into 1 parent string array

  // Get unsorted deployments by filtering out the sorted deployments from the full list of deployments.
  var unsortedDeplNames = helpers.arrayDifference(allDeplNames, sortedDeplNames);
  if (!unsortedDeplNames.length) return callBack({ message: resMessage + 'No relationships need to be re-associated.' });

  (async function () {
    var successDepls = [],
      errorsDepls = [],
      notFoundDepls = [];

    await helpers.asyncForEach(unsortedDeplNames, async function (deplName) {
      var deplFound = await Deployment.findOne({ name: deplName });
      if (!deplFound) {
        notFoundDepls.push(deplName);
        return;
      }
      var resAdd = await addDeploymentToParentPodHandler(deplFound.name, deplFound.associatedPod);
      if (resAdd && resAdd.podObject) successDepls.push(deplName);
      else errorsDepls.push(deplName);
    });
    resMessage += helpers.generateResponseString('Deployment', 're-associate', successDepls, notFoundDepls, errorsDepls);
    return callBack({ message: resMessage });
  }());
}

module.exports.handleAddDeploymentToParentPod = async function (deployment, podName) {
  return await addDeploymentToParentPodHandler(deployment, podName);
};

// Adds Deployments to Parent Pods Deployment-List - Creates the Parent Pod if needed
async function addDeploymentToParentPodHandler(deployment, podName) {
  try {
    var parentPod = await Pod.findOne({ name: podName });
    if (!parentPod) parentPod = new Pod({ name: podName, deployments: [] });
    if (parentPod.deployments.indexOf(deployment.name) === -1) parentPod.deployments.push(deployment.name);
    await parentPod.save();
    return {
      podStatus: `Successfully updated Pod ${podName} with ${deployment.name} details.`,
      podObject: parentPod
    };
  } catch (errAdding) {
    return {
      podStatus: `Error: Failed to update Pod ${podName} with ${deployment.name} details.`,
      error: errAdding
    };
  }
}

module.exports.handlePodQueue = async function (parentPod, refDepl) {
  return await podQueueHandler(parentPod, refDepl);
};

function getProductLoadValue(productName, pod) {
  if (!pod.products.find(prod => prod.name === productName)) return 0;
  // if product name is not in queue list, load tolerance shouldnt change
  return (pod.productType.includes(productName) || pod.productType.includes('All')) ? pod.products.find(prod => prod.name === productName).loadValue : 0;
}

// Performs Queue Handling of Deployments for a Specific Pod and returns a response message
async function podQueueHandler(pod, refDepl) {
  if (!pod.queueEnabled) return { queueMessage: `Queuing must be enabled for Pod ${pod.name} before handling.` };
  if (!pod.deployments.length) return { queueMessage: `There are no deployments for ${pod.name} to handle.` };

  var foundDepls = await Deployment.find({ name: { $in: pod.deployments } }).sort('queuingStartTime');
  var notFoundDeplNames = helpers.arrayDifference(pod.deployments, foundDepls.map(depl => depl.name));

  var queuedDepls = [],
    currentPodLoad = 0;

  foundDepls.forEach(depl => {
    if (depl.queueStatus === 'Queued') queuedDepls.push(depl);
    else if (depl.queueStatus === 'Active') currentPodLoad += getProductLoadValue(depl.product, pod);
  });

  var deploymentUpdatePromises = [],
    activeDeplNames = [];

  for (var i = 0; i < queuedDepls.length; i += 1) {
    // Exceedes max load tolerance
    var exceededTolerance = (currentPodLoad + getProductLoadValue(queuedDepls[i].product, pod) > pod.podLoadTolerance);
    if (!exceededTolerance) {
      var deployment = (refDepl && refDepl._id.equals(queuedDepls[i]._id)) ? refDepl : queuedDepls[i];
      deployment.queueStatus = 'Active';
      deploymentUpdatePromises.push(deployment.save());
      currentPodLoad += getProductLoadValue(queuedDepls[i].product, pod);
      // Adding Deployment to 'active' name list & Removing Deployment from the 'queued' object list ...
      activeDeplNames.push(deployment.name);
      queuedDepls.splice(i, 1);
    }
  }

  await Promise.all(deploymentUpdatePromises);
  var remainingQueuedDeplNames = queuedDepls.map(depl => depl.name);

  var resMessage = `Queue-Handling for Pod ${pod.name}.`;
  var deplMsgOutput = helpers.generateResponseString('Deployment', 'set to Active', activeDeplNames, notFoundDeplNames);
  if (remainingQueuedDeplNames.length) deplMsgOutput += `\nDeployments still queued: ${remainingQueuedDeplNames.join(', ')}.`;
  if (!deplMsgOutput) deplMsgOutput = '\nThere are no deployments within the queue.';
  return { queueMessage: resMessage + deplMsgOutput };
}

module.exports.handleDeploymentTimeouts = async function (req, res) {
  var msgHeader = 'Timed-Out Deployment Jobs Canceller: ';
  await deploymentTimeoutsHandler(msgHeader, function (resRetrieval) {
    var resStatus = (resRetrieval.error) ? 500 : 200;
    res.status(resStatus).json(resRetrieval);
  });
};

// Set any relevant 'Queued' Deployments to appropriate Active States
async function deploymentStartHandler(resMessage, callBack) {
  var startErrors = [];
  try {
    var allPods = await Pod.find({});
    await helpers.asyncForEach(allPods, async function (pod) {
      return await podQueueHandler(pod);
    });
  } catch (startErr) {
    startErrors.push(`Error starting Deployments. ${startErr.message}`);
  }
  var responseObj = { message: `${resMessage}${startErrors.length ? 'Failure' : 'Success'}.` };
  return callBack(responseObj);
}

// Set any relevant hanging 'Active' Deployments to 'Timed-Out'
async function deploymentTimeoutsHandler(resMessage, callBack) {
  var msgBuilder = '';
  var activeDepls;
  try {
    activeDepls = await Deployment.find({
      queueStatus: 'Active',
      instanceRunningStartTime: {
        $exists: true
      }
    });
  } catch (findErr) {
    return callBack({
      message: resMessage + 'Failure. Error finding Active Deployments.',
      error: findErr
    });
  }
  if (activeDepls.length === 0) msgBuilder += 'No active Deployments exist.';

  var deploymentErrors = [];
  await helpers.asyncForEach(activeDepls, async function (oqsDeployment) {
    msgBuilder += `\nFor Deployment ${oqsDeployment.name}: `;
    try {
      var minutesRunning = (new Date() - oqsDeployment.instanceRunningStartTime) / 60000;
      var productHasSpecificTimeout = await checkIfProductHasSpecificTimeout(oqsDeployment);
      // If custom timeout
      if (oqsDeployment.customTimeout) {
        msgBuilder += `Job is using custom timeout value. Running for ${minutesRunning}/${oqsDeployment.customTimeout} minutes. `;
        if (minutesRunning >= oqsDeployment.customTimeout) msgBuilder += await getDeploymentStatusUpdateResponse(oqsDeployment, 'Timed-Out');
      } else if (productHasSpecificTimeout) { // use product specific timeout
        msgBuilder += `Job is using specific timeout value for Product ${oqsDeployment.product}. Running for ${minutesRunning}/${productHasSpecificTimeout} minutes. `; // eslint-disable-line max-len
        if (minutesRunning >= productHasSpecificTimeout) msgBuilder += await getDeploymentStatusUpdateResponse(oqsDeployment, 'Timed-Out');
      } else { // No timeout used throw error
        throw new Error('Product has no Time-Out value specified.');
      }
    } catch (deploymentErr) {
      deploymentErrors.push(`Deployment '${oqsDeployment.name}': ${deploymentErr.message}`);
    }
  });
  var responseObj = { message: `${resMessage}${deploymentErrors.length ? 'Failure' : 'Success'}. ${msgBuilder}` };
  if (deploymentErrors.length) responseObj.error = `${deploymentErrors.length} Error(s) Occurred:\n${deploymentErrors.join('\n')}`;
  return callBack(responseObj);
}

async function checkIfProductHasSpecificTimeout(deployment) {
  var associatedPod = await Pod.findOne({ name: deployment.associatedPod });
  if (!associatedPod.products) return false;
  var productFound = associatedPod.products.filter(prod => prod.name === deployment.product);
  return (productFound.length !== 0) ? productFound[0].timeoutValue : 120;
}

async function getDeploymentStatusUpdateResponse(deployment, status) {
  try {
    deployment.queueStatus = status;
    await deployment.save();
    return `Successfully set Queue-Status to '${status}'.`;
  } catch (saveErr) {
    throw new Error(`Failed to set Queue-Status to '${status}': ${saveErr}`);
  }
}

// Call relationshipVerificationHandler once every 10 minutes
setInterval((function intervalRelationshipVerification() {
  var msgOutput = 'Scheduled Pod/Deployment Relationship Re-Associations: ';
  relationshipVerificationHandler(msgOutput, res => logger.info(res));
  return intervalRelationshipVerification;
}()), 600000);

// Call deploymentTimeoutsHandler once every minute
setInterval((function intervalTimedOutDeploymentsHandler() {
  var msgOutput = 'Scheduled Timed-Out Deployment Jobs Canceller: ';
  deploymentTimeoutsHandler(msgOutput, res => logger.info(res));
  return intervalTimedOutDeploymentsHandler;
}()), 60000);

// Call deploymentStartHandler once every 2minutes
setInterval((function intervalStartDeploymentsHandler() {
  var msgOutput = 'Scheduled Queued Deployment Jobs Starter: ';
  deploymentStartHandler(msgOutput, res => logger.info(res));
  return intervalStartDeploymentsHandler;
}()), 120000);
