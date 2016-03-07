'use strict'

const co = require('co')
const request = require('co-request')
const lodash = require('lodash')

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

function * _request (options, auth) {
  const res = yield request(lodash.defaults(options, {
    json: true,
    ca: auth && auth.ca,
    cert: auth && auth.cert,
    key: auth && auth.key,
    auth: auth && auth.username && auth.password ? {
      user: auth.username,
      pass: auth.password
    } : undefined
  }))

  if (res.statusCode >= 400) {
    const error = new Error('Remote error: ' + res.statusCode + ' ' +
        JSON.stringify(res.body || ''))
    error.status = res.statusCode
    error.response = res
    throw error
  }

  return res
}

/**
 * @param {Transfer} transfer
 * @param {Object} auth (optional)
 * @param {String} auth.username
 * @param {String} auth.password
 * @param {String|Buffer} auth.key
 * @param {String|Buffer} auth.cert
 * @param {String|Buffer} auth.ca
 * @returns {Promise<String>} the state of the transfer
 */
function postTransfer (transfer, auth) {
  return co(function * () {
    const reqOptions = {
      uri: transfer.id,
      method: 'put',
      json: true,
      body: transfer
    }

    const transferRes = yield _request(reqOptions, auth)
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
    const transferStateRes = yield _request({
      method: 'get',
      uri: transfer.id + '/state'
    })

    return transferStateRes.body
  })
}

exports.setupTransferConditionsAtomic = setupTransferConditionsAtomic
exports.setupTransferConditionsUniversal = setupTransferConditionsUniversal
exports.postTransfer = postTransfer
exports.transferExpiresAt = transferExpiresAt
exports.getTransferState = getTransferState
