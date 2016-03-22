'use strict'

const co = require('co')
const request = require('superagent')
const Pathfinder = require('five-bells-pathfind').Pathfinder
const Payments = require('./payments')
const transferUtils = require('./transferUtils')
const notaryUtils = require('./notaryUtils')
const conditionUtils = require('./conditionUtils')
const validator = require('./validator')

/**
 * Create and execute a transaction.
 *
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {URI} params.destinationAccount - Account URI
 *
 * Optional depending on ledger authentication method
 * @param {String} [params.sourcePassword] - Account password (basic-auth)
 * @param {String|Buffer} [params.sourceKey] - Account TLS Key (client-cert-auth)
 * @param {String|Buffer} [params.sourceCert] - Account TLS Certificate (client-cert-auth)
 *
 * Exactly one of the following:
 * @param {String} params.sourceAmount - Amount (a string, so as not to lose precision)
 * @param {String} params.destinationAmount - Amount
 *
 * Required for Atomic mode only:
 * @param {URI} params.notary - Notary URI (if provided, use Atomic mode)
 * @param {String} params.notaryPublicKey - Base64-encoded public key
 *
 * Other:
 * @param {Object} params.destinationMemo
 * @param {Object} params.additionalInfo
 * @param {Condition} params.receiptCondition - Object, execution condition.
 *                                              If not provided, one will be generated.
 * @param {String|Buffer} [params.ca] - Optional TLS CA if not using default CA (optional for https requests)
 */
function sendPayment (params) {
  return findPath({
    sourceAccount: params.sourceAccount,
    destinationAccount: params.destinationAccount,
    sourceAmount: params.sourceAmount,
    destinationAmount: params.destinationAmount
  })
  .then((subpayments) => executePayment(subpayments, {
    sourceAccount: params.sourceAccount,
    sourcePassword: params.sourcePassword,
    sourceKey: params.sourceKey,
    sourceCert: params.sourceCert,
    destinationAccount: params.destinationAccount,
    notary: params.notary,
    notaryPublicKey: params.notaryPublicKey,
    destinationMemo: params.destinationMemo,
    additionalInfo: params.additionalInfo,
    receiptCondition: params.receiptCondition,
    ca: params.ca
  }))
}

/**
 * Execute a transaction.
 *
 * @param {Object[]} _subpayments - The quoted payment path.
 * @param {Object} params
 *
 * Required for both modes:
 * @param {URI} params.sourceAccount - Account URI
 * @param {URI} params.destinationAccount
 *
 * Optional depending on ledger authentication method
 * @param {String} [params.sourcePassword] - Account password (basic-auth)
 * @param {String|Buffer} [params.sourceKey] - Account TLS Key (client-cert-auth)
 * @param {String|Buffer} [params.sourceCert] - Account TLS Certificate (client-cert-auth)
 *
 * Required for Atomic mode only:
 * @param {URI} params.notary - Notary URI (if provided, use Atomic mode)
 * @param {String} params.notaryPublicKey - Base64-encoded public key
 *
 * Other:
 * @param {Object} params.destinationMemo
 * @param {Object} params.additionalInfo
 * @param {Condition} params.receiptCondition - Object, execution condition.
 *                                              If not provided, one will be generated.
 * @param {String} params.caseID = A notary case ID - if not provided, one will be generated
 * @param {String|Buffer} [params.ca] - Optional TLS CA if not using default CA (optional for https requests)
 */
function executePayment (_subpayments, params) {
  return co(function * () {
    const isAtomic = !!params.notary
    if (isAtomic && !params.notaryPublicKey) {
      throw new Error('Missing required parameter: notaryPublicKey')
    }

    const subpayments = Payments.setupTransfers(_subpayments,
      params.sourceAccount,
      params.destinationAccount,
      params.additionalInfo)
    let transfers = Payments.toTransfers(subpayments)

    if (params.destinationMemo) {
      transfers[transfers.length - 1].credits[0].memo = params.destinationMemo
    }

    // In universal mode, each transfer executes when the last transfer in the chain
    // has executed. The final one in the chain executes when all are prepared.
    //
    // In atomic mode, all transfers execute when the notary has confirmation
    // that all of the transfers are prepared.
    const receiptConditionState = isAtomic ? 'prepared' : 'executed'
    const receiptCondition = params.receiptCondition ||
      (yield conditionUtils.getReceiptCondition(
        transfers[transfers.length - 1],
        receiptConditionState))

    const caseID = isAtomic && (yield notaryUtils.setupCase({
      notary: params.notary,
      caseID: params.caseID,
      receiptCondition: receiptCondition,
      transfers: transfers,
      expiresAt: transferUtils.transferExpiresAt(Date.now(), transfers[0])
    }))

    const conditionParams = {
      receiptCondition: receiptCondition,
      caseID: caseID,
      notary: params.notary,
      notaryPublicKey: params.notaryPublicKey
    }
    const executionCondition = conditionUtils.getExecutionCondition(conditionParams)
    const cancellationCondition = isAtomic && conditionUtils.getCancellationCondition(conditionParams)

    transfers = transferUtils.setupConditions(transfers, {
      isAtomic,
      executionCondition,
      cancellationCondition,
      caseID
    })

    // Prepare the first transfer.
    const sourceUsername = (yield getAccount(params.sourceAccount)).name
    const firstTransfer = transferUtils.setupTransferChain(transfers)
    validator.validateTransfer(firstTransfer)
    firstTransfer.state = yield transferUtils.postTransfer(firstTransfer, {
      username: sourceUsername,
      password: params.sourcePassword,
      key: params.sourceKey,
      cert: params.sourceCert,
      ca: params.ca
    })

    // Execution (atomic)
    // If a custom receiptCondition is used, it is the recipient's
    // job to post fulfillment.
    if (isAtomic && !params.receiptCondition) {
      yield notaryUtils.postFulfillmentToNotary(transfers[transfers.length - 1], caseID)
    }
    return transfers
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
