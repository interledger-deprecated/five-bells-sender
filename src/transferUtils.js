'use strict'

const co = require('co')
const request = require('superagent')
const https = require('https')
const agents = {}

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
 * @param {Object} auth
 * @param {String} auth.username
 * @param {String} auth.password
 * @param {String|Buffer} auth.key
 * @param {String|Buffer} auth.cert
 * @param {String|Buffer} auth.ca
 * @returns {Promise<String>} the state of the transfer
 */
function postTransfer (transfer, auth) {
  return co(function * () {
    const transferReq = request.put(transfer.id)
    if (auth.username && auth.password) {
      transferReq.auth(auth.username, auth.password)
    }
    if (auth.cert || auth.ca) {
      transferReq.agent(getAgent(auth))
    }
    const transferRes = yield transferReq.send(transfer)
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
    return transferStateRes.body
  })
}

function getAgent (auth) {
  return agents[auth.cert] || (agents[auth.cert] = new https.Agent(auth))
}

exports.setupTransferConditionsAtomic = setupTransferConditionsAtomic
exports.setupTransferConditionsUniversal = setupTransferConditionsUniversal
exports.postTransfer = postTransfer
exports.transferExpiresAt = transferExpiresAt
exports.getTransferState = getTransferState
