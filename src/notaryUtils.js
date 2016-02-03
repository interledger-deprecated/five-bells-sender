'use strict'

const request = require('superagent')
const uuid = require('uuid4')
import {getTransferState} from './transferUtils'
import * as Payments from './payments'

/**
 * @param {Object} params
 * @param {URI} params.notary
 * @param {Condition} params.receiptCondition
 * @param {[Payment]} params.payments
 * @param {String} params.expiresAt
 * @returns {Promise<URI>} Case ID
 */
export async function setupCase (params) {
  const caseID = params.notary + '/cases/' + uuid()
  const caseRes = await request
    .put(caseID)
    .send({
      id: caseID,
      state: 'proposed',
      execution_condition: params.receiptCondition,
      expires_at: params.expiresAt,
      notaries: [{url: params.notary}],
      notification_targets: Payments.toTransfers(params.payments).map(transferToFulfillmentURI)
    })
  if (caseRes.status >= 400) {
    throw new Error('Notary error: ' + caseRes.status + ' ' +
      JSON.stringify(caseRes.body))
  }
  return caseID
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
export async function postFulfillmentToNotary (finalTransfer, caseID) {
  const finalTransferState = await getTransferState(finalTransfer)
  const notaryFulfillmentRes = await request
    .put(caseID + '/fulfillment')
    .send({ type: finalTransferState.type, signature: finalTransferState.signature })
  if (notaryFulfillmentRes >= 400) {
    throw new Error('Remote error: ' + notaryFulfillmentRes.status + ' ' +
      JSON.stringify(notaryFulfillmentRes.body))
  }
}
