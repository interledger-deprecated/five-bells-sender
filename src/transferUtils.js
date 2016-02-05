'use strict'

const co = require('co')
const request = require('superagent')

/**
 * @param {Transfer} transfer
 * @param {Object} params
 * @param {Condition} params.executionCondition
 * @param {Condition} params.cancellationCondition
 * @param {URI} params.caseID
 * @returns {Transfer}
 */
function setupTransferConditionsAtomic (transfer, params) {
  transfer.execution_condition = params.executionCondition
  transfer.cancellation_condition = params.cancellationCondition
  transfer.additional_info = transfer.additional_info || {}
  transfer.additional_info.cases = [params.caseID]
  // Atomic transfers don't expire
  // (or rather, their expiry is handled by the cancellation_condition).
  delete transfer.expiry_duration
  return transfer
}

/**
 * @param {Transfer} transfer
 * @param {Object} params
 * @param {Integer} params.now
 * @param {Boolean} params.isFinalTransfer
 * @param {Condition} params.executionCondition
 * @returns {Transfer}
 */
function setupTransferConditionsUniversal (transfer, params) {
  transfer.expires_at = transferExpiresAt(params.now, transfer)
  if (!params.isFinalTransfer) {
    transfer.execution_condition = params.executionCondition
  }
  delete transfer.expiry_duration
  return transfer
}

/**
 * @param {Transfer} transfer
 * @param {Object} auth (optional)
 * @param {String} auth.username
 * @param {String} auth.password
 * @returns {Promise<String>} the state of the transfer
 */
function postTransfer (transfer, auth) {
  return co(function * () {
    const transferReq = request.put(transfer.id).send(transfer)
    if (auth) {
      transferReq.auth(auth.username, auth.password)
    }
    const transferRes = yield transferReq
    if (transferRes.status >= 400) {
      throw new Error('Remote error: ' + transferRes.status + ' ' + JSON.stringify(transferRes.body))
    }
    return transferRes.body.state
  })
}

/**
 * @param {Integer} now
 * @param {Transfer} transfer
 * @returns {String} ISO-formatted date string
 */
function transferExpiresAt (now, transfer) {
  return (new Date(now + (transfer.expiry_duration * 1000))).toISOString()
}

/**
 * @param {Transfer} transfer
 * @returns {Promise<Object>}
 */
function getTransferState (transfer) {
  return co(function * () {
    const transferStateRes = yield request.get(transfer.id + '/state')
    if (transferStateRes.status >= 400) {
      throw new Error('Remote error: ' + transferStateRes.status + ' ' +
        JSON.stringify(transferStateRes.body))
    }
    return transferStateRes.body
  })
}

exports.setupTransferConditionsAtomic = setupTransferConditionsAtomic
exports.setupTransferConditionsUniversal = setupTransferConditionsUniversal
exports.postTransfer = postTransfer
exports.transferExpiresAt = transferExpiresAt
exports.getTransferState = getTransferState
