'use strict'

const co = require('co')
const request = require('superagent')
const uuid = require('uuid4')
const getTransferState = require('./transferUtils').getTransferState
const Payments = require('./payments')

/**
 * @param {Object} params
 * @param {URI} params.notary
 * @param {Condition} params.receiptCondition
 * @param {[Payment]} params.payments
 * @param {String} params.expiresAt
 * @returns {Promise<URI>} Case ID
 */
function setupCase (params) {
  return co(function * () {
    const caseID = params.notary + '/cases/' + uuid()
    yield request
      .put(caseID)
      .send({
        id: caseID,
        state: 'proposed',
        execution_condition: params.receiptCondition,
        expires_at: params.expiresAt,
        notaries: [{url: params.notary}],
        notification_targets: Payments.toTransfers(params.payments).map(transferToFulfillmentURI)
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
    const finalTransferState = yield getTransferState(finalTransfer)
    yield request
      .put(caseID + '/fulfillment')
      .send({ type: finalTransferState.type, signature: finalTransferState.signature })
  })
}

exports.setupCase = setupCase
exports.postFulfillmentToNotary = postFulfillmentToNotary
