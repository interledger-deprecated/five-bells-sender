'use strict'

const co = require('co')
const request = require('superagent')
const Pathfinder = require('five-bells-pathfind').Pathfinder
const Payments = require('./payments')
const transferUtils = require('./transferUtils')
const notaryUtils = require('./notaryUtils')
const conditionUtils = require('./conditionUtils')

/**
 * Create and execute a transaction.
 *
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {String} params.sourcePassword
 * @param {URI} params.destinationAccount - Account URI
 * Exactly one of the following:
 * @param {String} params.sourceAmount - Amount (a string, so as not to lose precision)
 * @param {String} params.destinationAmount - Amount
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
function sendPayment (params) {
  return findPath({
    sourceAccount: params.sourceAccount,
    destinationAccount: params.destinationAccount,
    sourceAmount: params.sourceAmount,
    destinationAmount: params.destinationAmount
  })
  .then(subpayments => executePayment(subpayments, {
    sourceAccount: params.sourceAccount,
    sourcePassword: params.sourcePassword,
    destinationAccount: params.destinationAccount,
    notary: params.notary,
    notaryPublicKey: params.notaryPublicKey,
    destinationMemo: params.destinationMemo,
    receiptCondition: params.receiptCondition
  }))
}

/**
 * Execute a transaction.
 *
 * @param {[Object]} _subpayments - The quoted payment path.
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {URI} params.destinationAccount
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
function executePayment (_subpayments, params) {
  return co(function * () {
    const isAtomic = !!params.notary
    if (isAtomic && !params.notaryPublicKey) {
      throw new Error('Missing required parameter: notaryPublicKey')
    }

    let subpayments = Payments.setupTransfers(_subpayments,
      params.sourceAccount,
      params.destinationAccount)

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
      (yield conditionUtils.getReceiptCondition(
        Payments.toFinalTransfer(subpayments),
        receiptConditionState))

    const caseID = isAtomic && (yield notaryUtils.setupCase({
      notary: params.notary,
      receiptCondition: receiptCondition,
      payments: subpayments,
      expiresAt: transferUtils.transferExpiresAt(Date.now(), Payments.toFirstTransfer(subpayments))
    }))

    const conditionParams = {
      receiptCondition: receiptCondition,
      caseID: caseID,
      notary: params.notary,
      notaryPublicKey: params.notaryPublicKey
    }
    const executionCondition = conditionUtils.getExecutionCondition(conditionParams)
    const cancellationCondition = isAtomic && conditionUtils.getCancellationCondition(conditionParams)

    subpayments = Payments.setupConditions(subpayments, {
      isAtomic,
      executionCondition,
      cancellationCondition,
      caseID
    })

    // Prepare the first transfer.
    const sourceUsername = (yield getAccount(params.sourceAccount)).name
    const firstTransfer = Payments.toFirstTransfer(subpayments)
    firstTransfer.state = yield transferUtils.postTransfer(firstTransfer, {
      username: sourceUsername,
      password: params.sourcePassword
    })

    // Preparation, execution.
    subpayments = yield Payments.postPayments(subpayments)

    // Execution (atomic)
    // If a custom receiptCondition is used, it is the recipient's
    // job to post fulfillment.
    if (isAtomic && !params.receiptCondition) {
      yield notaryUtils.postFulfillmentToNotary(Payments.toFinalTransfer(subpayments), caseID)
    }
    return subpayments
  })
}

// /////////////////////////////////////////////////////////////////////////////
// Quoting
// /////////////////////////////////////////////////////////////////////////////

/**
 * @param {Object} params
 * @param {String} params.sourceAccount
 * @param {String} params.destinationAccount
 * Exactly one of the following:
 * @param {String} params.sourceAmount
 * @param {String} params.destinationAmount
 * @returns {Promise} an Array of subpayments
 */
function findPath (params) {
  return co(function * () {
    const ledgers = yield Promise.all([
      getAccountLedger(params.sourceAccount),
      getAccountLedger(params.destinationAccount)
    ])

    // TODO cache pathfinder so that it doesn't have to re-crawl for every payment
    const pathfinder = new Pathfinder({
      crawler: { initialLedgers: ledgers }
    })
    yield pathfinder.crawl()
    return pathfinder.findPath({
      sourceLedger: ledgers[0],
      destinationLedger: ledgers[1],
      sourceAmount: params.sourceAmount,
      destinationAmount: params.destinationAmount,
      destinationAccount: params.destinationAccount
    })
  })
}

/**
 * @param {URI} account
 * @returns {Promise<Account>}
 */
function getAccount (account) {
  return co(function * () {
    const res = yield request.get(account)
    if (res.statusCode !== 200) {
      throw new Error('Unable to identify ledger from account: ' + account)
    }
    return res.body
  })
}

/**
 * @param {URI} account
 * @returns {Promise<URI>}
 */
function getAccountLedger (account) {
  return getAccount(account).then(account => account.ledger)
}

module.exports = sendPayment
module.exports.default = sendPayment
module.exports.executePayment = executePayment
module.exports.findPath = findPath
