'use strict'

const co = require('co')
const request = require('superagent')
const uuid = require('node-uuid').v4

/**
 * @returns {String} New case ID
 */
function createCaseId () {
  return uuid()
}

/**
 * @param {Object} params
 * @param {URI} params.notary
 * @param {Condition} params.receiptCondition
 * @param {Transfer[]} params.transfers
 * @param {String} params.expiresAt
 * @param {String} params.caseId
 * @returns {Promise<URI>} Case ID
 */
function setupCase (params) {
  return co(function * () {
    const uniqueID = params.caseId || uuid()
    if (uniqueID.length > 40) {
      throw new Error('caseId length is limited to 40 characters')
    }
    const caseId = params.notary + '/cases/' + uniqueID
    yield request
      .put(caseId)
      .send({
        id: caseId,
        state: 'proposed',
        execution_condition: params.receiptCondition,
        expires_at: params.expiresAt,
        notaries: [params.notary],
        notification_targets: params.transfers.map(transferToFulfillmentURI)
      })
    return caseId
  })
}

/**
 * @param {Transfer} transfer
 * @returns {URI}
 */
function transferToFulfillmentURI (transfer) {
  return transfer.id + '/fulfillment'
}

exports.setupCase = setupCase
exports.createCaseId = createCaseId
