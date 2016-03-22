'use strict'

const co = require('co')
const request = require('superagent')
const uuid = require('node-uuid').v4
const getTransferState = require('./transferUtils').getTransferState

const STATE_RETRY_ATTEMPTS = 5
const STATE_RETRY_INTERVAL = 1000

/**
 * @returns {String} New case ID
 */
function createCaseID () {
  return uuid()
}

/**
 * @param {Object} params
 * @param {URI} params.notary
 * @param {Condition} params.receiptCondition
 * @param {Transfer[]} params.transfers
 * @param {String} params.expiresAt
 * @param {String} params.caseID
 * @returns {Promise<URI>} Case ID
 */
function setupCase (params) {
  return co(function * () {
    // the caseID param will be in the format of notary/cases/uuid,
    // only check if its uuid is less than 40 characters
    const uniqueID = params.caseID ? params.caseID.substring(params.caseID.indexOf('/cases/') + 7) : uuid()

    if (uniqueID.length > 40) {
      throw new Error('caseID length is limited to 40 characters')
    }

    const caseID = params.caseID || params.notary + '/cases/' + uniqueID
    yield request
      .put(caseID)
      .send({
        id: caseID,
        state: 'proposed',
        execution_condition: params.receiptCondition,
        expires_at: params.expiresAt,
        notaries: [{url: params.notary}],
        notification_targets: params.transfers.map(transferToFulfillmentURI)
      })
    return caseID
  })
}

/**
 * @param {Transfer} transfer
 * @returns {URI}
 */
function transferToFulfillmentURI (transfer) {
  return transfer.id + '/fulfillment'
}

/**
 * @param {Transfer} finalTransfer
 * @param {URI} caseID
 * @param {Promise}
 */
function postFulfillmentToNotary (finalTransfer, caseID) {
  return co(function * () {
    const finalTransferState = yield waitForTransferState(finalTransfer, 'prepared')
    yield request
      .put(caseID + '/fulfillment')
      .send({ type: finalTransferState.type, signature: finalTransferState.signature })
  })
}

/**
 * @param {Transfer} transfer
 * @param {TransferState} state
 * @returns {SignedMessageTemplate}
 */
function * waitForTransferState (transfer, state) {
  for (let i = 0; i < STATE_RETRY_ATTEMPTS; i++) {
    const finalTransferState = yield getTransferState(transfer)
    if (finalTransferState.message.state === state) {
      return finalTransferState
    } else {
      yield wait(STATE_RETRY_INTERVAL)
    }
  }
  throw new Error('Transfer ' + transfer.id + ' still hasn\'t reached state=' + state)
}

/**
 * @param {Integer} ms
 * @returns {Promise}
 */
function wait (ms) {
  return new Promise(function (resolve, reject) { setTimeout(resolve, ms) })
}

exports.setupCase = setupCase
exports.postFulfillmentToNotary = postFulfillmentToNotary
exports.createCaseID = createCaseID
