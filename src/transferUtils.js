'use strict'

const uuid = require('node-uuid').v4
const co = require('co')
const request = require('superagent')
const https = require('https')
const agents = {}

/**
 * @param {Transfer} sourceTransfer
 * @param {Object} additionalInfo
 * @returns {Transfer}
 */
function setupTransfers (sourceTransfer, additionalInfo) {
  return mapTransferChain(sourceTransfer, function (transfer) {
    transfer.id = transfer.id || transfer.ledger + '/transfers/' + uuid()
    transfer.additional_info = Object.assign({}, additionalInfo)
    return transfer
  })
}

/**
 * @param {Transfer} sourceTransfer
 * @param {Object} params
 * @param {Boolean} params.isAtomic
 * @param {Condition} params.executionCondition
 * @param {Condition} params.cancellationCondition (iff isAtomic)
 * @param {URI} params.caseId (iff isAtomic)
 * @returns {Transfer[]}
 */
function setupConditions (sourceTransfer, params) {
  // Use one Date.now() as the base of all expiries so that when a ms passes
  // between when the source and destination expiries are calculated the
  // minMessageWindow isn't exceeded.
  const now = Date.now()

  // The first transfer must be submitted by us with authorization
  // TODO: This must be a genuine authorization from the user
  sourceTransfer.debits[0].authorized = true

  // Add conditions/expirations to all transfers.
  return mapTransferChain(sourceTransfer, function (transfer) {
    if (params.isAtomic) {
      return setupTransferConditionsAtomic(transfer, {
        executionCondition: params.executionCondition,
        cancellationCondition: params.cancellationCondition,
        caseId: params.caseId
      })
    } else {
      return setupTransferConditionsUniversal(transfer, {
        executionCondition: params.executionCondition,
        now: now
      })
    }
  })
}

/**
 * @param {Transfer} firstTransfer
 * @param {Function(transfer) -> newTransfer} each
 * @returns {Transfer} the new first transfer
 */
function mapTransferChain (firstTransfer, each) {
  const newFirstTransfer = each(firstTransfer)
  const memo = newFirstTransfer.credits[0].memo
  if (memo && memo.destination_transfer) {
    memo.destination_transfer = mapTransferChain(memo.destination_transfer, each)
  }
  return newFirstTransfer
}

/**
 * @param {Transfer} _transfer
 * @param {Object} params
 * @param {Condition} params.executionCondition
 * @param {Condition} params.cancellationCondition
 * @param {URI} params.caseId
 * @returns {Transfer}
 */
function setupTransferConditionsAtomic (_transfer, params) {
  const transfer = Object.assign({}, _transfer, {
    execution_condition: params.executionCondition,
    cancellation_condition: params.cancellationCondition
  })
  transfer.additional_info = transfer.additional_info || {}
  transfer.additional_info.cases = [params.caseId]
  // Atomic transfers don't expire
  // (or rather, their expiry is handled by the cancellation_condition).
  delete transfer.expiry_duration
  return transfer
}

/**
 * @param {Transfer} transfer
 * @param {Object} params
 * @param {Integer} params.now
 * @param {Condition} params.executionCondition
 * @returns {Transfer}
 */
function setupTransferConditionsUniversal (transfer, params) {
  transfer.expires_at = transferExpiresAt(params.now, transfer)
  transfer.execution_condition = params.executionCondition
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

function getAgent (auth) {
  return agents[auth.cert] || (agents[auth.cert] = new https.Agent(auth))
}

exports.setupTransfers = setupTransfers
exports.setupConditions = setupConditions
exports.setupTransferConditionsAtomic = setupTransferConditionsAtomic
exports.setupTransferConditionsUniversal = setupTransferConditionsUniversal
exports.postTransfer = postTransfer
exports.transferExpiresAt = transferExpiresAt
