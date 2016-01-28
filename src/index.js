'use strict'
const request = require('superagent')
const Pathfinder = require('five-bells-pathfind').Pathfinder

import * as Payments from './payments'
import {transferExpiresAt} from './transferUtils'
import {setupCase, postFulfillmentToNotary} from './notaryUtils'
import {
  getReceiptCondition,
  getExecutionCondition,
  getCancellationCondition
} from './conditionUtils'

/**
 * Create and execute a transaction.
 *
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {String} params.sourceUsername
 * @param {String} params.sourcePassword
 * @param {URI} params.destinationAccount - Account URI
 * @param {String} params.destinationAmount - Amount (a string, so as not to lose precision)
 *
 * Required for Atomic mode only:
 * @param {URI} params.notary - Notary URI (if provided, use Atomic mode)
 * @param {String} params.notaryPublicKey - Base64-encoded public key
 *
 * Other:
 * @param {String} params.destinationMemo
 * @param {Condition} params.receiptCondition - Object, execution condition.
 *                                              If not provided, one will be generated.
 */
export default async function sendPayment (params) {
  const subpayments = await findPath({
    sourceAccount: params.sourceAccount,
    destinationAccount: params.destinationAccount,
    destinationAmount: params.destinationAmount
  })
  await executePayment(subpayments, {
    sourceAccount: params.sourceAccount,
    sourceUsername: params.sourceUsername,
    sourcePassword: params.sourcePassword,
    notary: params.notary,
    notaryPublicKey: params.notaryPublicKey,
    destinationMemo: params.destinationMemo,
    receiptCondition: params.receiptCondition
  })
}

/**
 * Execute a transaction.
 *
 * @param {[Object]} _subpayments - The quoted payment path.
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {String} params.sourceUsername
 * @param {String} params.sourcePassword
 *
 * Required for Atomic mode only:
 * @param {URI} params.notary - Notary URI (if provided, use Atomic mode)
 * @param {String} params.notaryPublicKey - Base64-encoded public key
 *
 * Other:
 * @param {String} params.destinationMemo
 * @param {Condition} params.receiptCondition - Object, execution condition.
 *                                              If not provided, one will be generated.
 */
export async function executePayment (_subpayments, params) {
  const {
    sourceUsername,
    sourcePassword,
    sourceAccount,
    notary,
    notaryPublicKey
  } = params
  const isAtomic = !!notary
  if (isAtomic && !notaryPublicKey) {
    throw new Error('Missing required parameter: notaryPublicKey')
  }

  let subpayments = Payments.setupTransfers(_subpayments, sourceAccount)

  if (params.destinationMemo) {
    Payments.toFinalTransfer(subpayments).credits[0].memo = params.destinationMemo
  }

  // In universal mode, each transfer executes when the last transfer in the chain
  // has executed. The final one in the chain executes when all are prepared.
  //
  // In atomic mode, all transfers execute when the notary has confirmation
  // that all of the transfers are prepared.
  const receiptConditionState = isAtomic ? 'prepared' : 'executed'
  const receiptCondition = params.receiptCondition ||
    (await getReceiptCondition(
      Payments.toFinalTransfer(subpayments),
      receiptConditionState))

  const caseID = isAtomic && (await setupCase({
    notary,
    receiptCondition,
    payments: subpayments,
    expiresAt: transferExpiresAt(Date.now(), Payments.toFirstTransfer(subpayments))
  }))

  const conditionParams = {receiptCondition, caseID, notary, notaryPublicKey}
  const executionCondition = getExecutionCondition(conditionParams)
  const cancellationCondition = isAtomic && getCancellationCondition(conditionParams)

  subpayments = Payments.setupConditions(subpayments, {
    isAtomic,
    executionCondition,
    cancellationCondition,
    caseID
  })

  // Proposal.
  subpayments = await Payments.postTransfers(subpayments, {sourceUsername, sourcePassword})

  // Preparation, execution.
  subpayments = await Payments.postPayments(subpayments)

  // Execution (atomic)
  // If a custom receiptCondition is used, it is the recipient's
  // job to post fulfillment.
  if (isAtomic && !params.receiptCondition) {
    await postFulfillmentToNotary(Payments.toFinalTransfer(subpayments), caseID)
  }
  return subpayments
}

// /////////////////////////////////////////////////////////////////////////////
// Quoting
// /////////////////////////////////////////////////////////////////////////////

/**
 * @param {Object} params
 * @param {String} params.sourceAccount
 * @param {String} params.destinationAccount
 * @param {String} params.destinationAmount
 * @returns {Promise} an Array of subpayments
 */
export async function findPath (params) {
  const ledgers = await Promise.all([
    getAccountLedger(params.sourceAccount),
    getAccountLedger(params.destinationAccount)
  ])

  // TODO cache pathfinder so that it doesn't have to re-crawl for every payment
  const pathfinder = new Pathfinder({
    crawler: { initialLedgers: ledgers }
  })
  await pathfinder.crawl()
  return await pathfinder.findPath({
    sourceLedger: ledgers[0],
    destinationLedger: ledgers[1],
    destinationAmount: params.destinationAmount,
    destinationAccount: params.destinationAccount
  })
}

/**
 * @param {URI} account
 * @returns {Promise<URI>}
 */
async function getAccountLedger (account) {
  const res = await request.get(account)
  const ledger = res.body && res.body.ledger
  if (res.statusCode !== 200 || !ledger) {
    throw new Error('Unable to identify ledger from account: ' + account)
  }
  return ledger
}
