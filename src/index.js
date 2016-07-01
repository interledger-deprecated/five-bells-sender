'use strict'

const co = require('co')
const request = require('superagent')
const transferUtils = require('./transferUtils')
const notaryUtils = require('./notaryUtils')
const conditionUtils = require('./conditionUtils')
const quoteUtils = require('./quoteUtils')

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
 * @param {String} params.caseId - User-provided UUID for notary case
 *
 * Other:
 * @param {Object} params.destinationMemo - Memo to be included in the transfer credit of the recipient
 * @param {Object} params.sourceMemo - Memo to be included in the transfer debit coming from the sender's account
 * @param {Object} params.additionalInfo
 * @param {Condition} params.receiptCondition - Object, execution condition.
 *                                              If not provided, one will be generated.
 * @param {Boolean} params.unsafeOptimisticTransport - Set for optimistic mode
 * @param {String|Buffer} [params.ca] - Optional TLS CA if not using default CA (optional for https requests)
 */
function sendPayment (params) {
  return findPath({
    sourceAccount: params.sourceAccount,
    destinationAccount: params.destinationAccount,
    sourceAmount: params.sourceAmount,
    destinationAmount: params.destinationAmount
  }).then((quote) => executePayment(quote, {
    sourceAccount: params.sourceAccount,
    sourcePassword: params.sourcePassword,
    sourceKey: params.sourceKey,
    sourceCert: params.sourceCert,
    destinationAccount: params.destinationAccount,
    notary: params.notary,
    notaryPublicKey: params.notaryPublicKey,
    caseId: params.caseId,
    destinationMemo: params.destinationMemo,
    sourceMemo: params.sourceMemo,
    additionalInfo: params.additionalInfo,
    receiptCondition: params.receiptCondition,
    unsafeOptimisticTransport: params.unsafeOptimisticTransport,
    ca: params.ca
  }))
}

/**
 * Execute a transaction.
 *
 * @param {Transfer} sourceTransfer - Transfer we need to execute to initiate the payment
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
 * @param {Object} params.destinationMemo - Memo to be included in the transfer credit of the recipient
 * @param {Object} params.sourceMemo - Memo to be included in the transfer debit coming from the sender's account
 * @param {Object} [params.additionalInfo]
 * @param {String} params.receiptCondition - Condition describing the receipt
 * @param {String} [params.executionCondition] - Execution condition.
 *   If not provided, one will be generated.
 * @param {String} [params.cancellationCondition] - Object, cancellation condition.
 *   If not provided, one will be generated.
 * @param {String} [params.caseId] = A notary case ID - if not provided, one will be generated
 * @param {Boolean} [params.unsafeOptimisticTransport] - Set for optimistic mode
 * @param {String|Buffer} [params.ca] - Optional TLS CA if not using default CA (optional for https requests)
 */
function executePayment (sourceTransfer, params) {
  return co(function * () {
    const isAtomic = !!params.notary
    const isOptimistic = !!params.unsafeOptimisticTransport
    const isUniversal = !isAtomic && !isOptimistic
    if (isAtomic && !params.notaryPublicKey) {
      throw new Error('Missing required parameter: notaryPublicKey')
    }

    sourceTransfer = transferUtils.setupTransferId(sourceTransfer)

    const sourceUsername = (yield getAccount(params.sourceAccount)).name
    const auth = {
      username: sourceUsername,
      password: params.sourcePassword,
      key: params.sourceKey,
      cert: params.sourceCert,
      ca: params.ca
    }

    if (params.additionalInfo) {
      sourceTransfer.additional_info = params.additionalInfo
    }
    if (params.sourceMemo) {
      sourceTransfer.debits[0].memo = params.sourceMemo
    }

    // Same-ledger transfer.
    if (!sourceTransfer.credits[0].memo || !sourceTransfer.credits[0].memo.ilp_header) {
      sourceTransfer.debits[0].authorized = true
      sourceTransfer.state = yield transferUtils.postTransfer(sourceTransfer, auth)
      return sourceTransfer
    }
    if (params.destinationMemo) {
      sourceTransfer.credits[0].memo.ilp_header.data = params.destinationMemo
    }

    // In universal mode, all transfers are prepared. Then the recipient
    // executes the transfer on the final ledger by providing a receipt. This
    // then triggers a chain of executions back to the sender.
    //
    // In atomic mode, all transfers execute when the notary receives the
    // receipt and notifies the ledgers that it was received on time.
    const receiptCondition = params.receiptCondition
    if (!receiptCondition && !isOptimistic) {
      throw new Error('Missing required parameter: receiptCondition')
    }

    const caseId = isAtomic && (yield notaryUtils.setupCase({
      notary: params.notary,
      caseId: params.caseID || params.caseId,
      receiptCondition,
      transfers: [sourceTransfer],
      expiresAt: transferUtils.transferExpiresAt(Date.now(), sourceTransfer)
    }))

    const conditionParams = {
      receiptCondition,
      caseId,
      notary: params.notary,
      notaryPublicKey: params.notaryPublicKey
    }

    const executionCondition = !isOptimistic && (params.executionCondition || conditionUtils.getExecutionCondition(conditionParams))
    const cancellationCondition = isAtomic && (params.cancellationCondition || conditionUtils.getCancellationCondition(conditionParams))

    sourceTransfer = transferUtils.setupConditions(sourceTransfer, {
      isAtomic,
      isUniversal,
      executionCondition,
      cancellationCondition,
      caseId
    })

    // Prepare the first transfer.
    sourceTransfer.state = yield transferUtils.postTransfer(sourceTransfer, auth)

    return sourceTransfer
  })
}

// /////////////////////////////////////////////////////////////////////////////
// Quoting
// /////////////////////////////////////////////////////////////////////////////

/**
 * @param {Object} params
 * @param {String} params.sourceAccount
 * @param {String} params.destinationAccount
 * @param {Number} params.destinationExpiryDuration
 * @param {Number} params.sourceExpiryDuration
 * Exactly one of the following:
 * @param {String} params.sourceAmount
 * @param {String} params.destinationAmount
 * @returns {Promise<Transfer>}
 */
function findPath (_params) {
  return co(function * () {
    const params = Object.assign({}, _params, {
      sourceLedger: yield getAccountLedger(_params.sourceAccount),
      destinationLedger: yield getAccountLedger(_params.destinationAccount)
    })
    // Same-ledger payment.
    if (params.sourceLedger === params.destinationLedger) {
      return getLocalTransfer(params.sourceLedger, params)
    }

    const connectorAccounts = yield getLedgerConnectors(params.sourceLedger)
    const quotes = (yield connectorAccounts.map(function (connectorAccount) {
      return quoteUtils.getQuoteFromConnector(connectorAccount.connector, params)
        // Don't fail if no path is found
        .catch(ignoreAssetsNotTradedError)
    })).filter((quote) => !!quote)
    if (!quotes.length) return
    return quoteUtils.quoteToTransfer(quotes.reduce(quoteUtils.getCheaperQuote),
      params.sourceAccount,
      params.destinationAccount)
  })
}

function ignoreAssetsNotTradedError (err) {
  if (err.response.body.id !== 'AssetsNotTradedError') throw err
}

/**
 * @param {URI} ledger
 * @param {Object} params
 * @param {String} params.sourceAccount
 * @param {String} params.destinationAccount
 * Exactly one of the following:
 * @param {String} params.sourceAmount
 * @param {String} params.destinationAmount
 * @returns {Transfer}
 */
function getLocalTransfer (ledger, params) {
  const amount = params.sourceAmount || params.destinationAmount
  return {
    ledger: ledger,
    debits: [{account: params.sourceAccount, amount: amount}],
    credits: [{account: params.destinationAccount, amount: amount}]
  }
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

/**
 * @param {URI} ledger
 * @returns {Promise<Object[]>}
 */
function getLedgerConnectors (ledger) {
  return co(function * () {
    const res = yield request.get(ledger + '/connectors')
    return res.body
  })
}

module.exports = sendPayment
module.exports.default = sendPayment
module.exports.executePayment = executePayment
module.exports.findPath = findPath
