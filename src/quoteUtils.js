'use strict'

const assert = require('assert')
const co = require('co')
const request = require('superagent')
const BigNumber = require('bignumber.js')

/**
 * @param {URI} connector
 * @param {Object} params
 * @param {String} params.sourceLedger
 * @param {String} params.destinationLedger
 * @param {Number} params.destinationExpiryDuration
 * @param {Number} params.sourceExpiryDuration
 * Exactly one of the following:
 * @param {String} params.sourceAmount
 * @param {String} params.destinationAmount
 * @returns {Promise<Transfer>}
 */
function getQuoteFromConnector (connector, params) {
  return co(function * () {
    const res = yield request.get(connector + '/quote')
      .query({
        source_ledger: params.sourceLedger,
        destination_ledger: params.destinationLedger,
        destination_expiry_duration: params.destinationExpiryDuration,
        source_expiry_duration: params.sourceExpiryDuration
      })
      .query(params.sourceAmount
        ? {source_amount: params.sourceAmount}
        : {destination_amount: params.destinationAmount})
    const quote = res.body

    // Verify that the connector returned the correct fields.
    assert.equal(quote.source_ledger, params.sourceLedger, 'quote has unexpected source_ledger')
    assert.equal(quote.destination_ledger, params.destinationLedger, 'quote has unexpected destination_ledger')
    if (params.sourceAmount) {
      assert.ok((new BigNumber(quote.source_amount)).equals(params.sourceAmount),
        'quote has unexpected source_amount')
    } else {
      assert.ok((new BigNumber(quote.destination_amount)).equals(params.destinationAmount),
        'quote has unexpected destination_amount')
    }
    return quote
  })
}

/**
 * @param {Quote} quote1
 * @param {Quote} quote2
 * @returns {Quote}
 */
function getCheaperQuote (quote1, quote2) {
  if ((new BigNumber(quote1.source_amount))
      .lessThan(quote2.source_amount)) {
    return quote1
  }

  if ((new BigNumber(quote1.destination_amount))
      .lessThan(quote2.destination_amount)) {
    return quote1
  }

  return quote2
}

/**
 * @param {Quote} quote
 * @param {String} sourceAccount
 * @param {String} destinationAccount
 * @param {Quote} quote
 * @returns {Transfer}
 */
function quoteToTransfer (quote, sourceAccount, destinationAccount) {
  return {
    ledger: quote.source_ledger,
    debits: [{
      account: sourceAccount,
      amount: quote.source_amount
    }],
    credits: [{
      account: quote.source_connector_account,
      amount: quote.source_amount,
      memo: {
        destination_transfer: {
          ledger: quote.destination_ledger,
          debits: [{ account: null, amount: quote.destination_amount }],
          credits: [{ account: destinationAccount, amount: quote.destination_amount }],
          expiry_duration: quote.destination_expiry_duration
        }
      }
    }],
    expiry_duration: quote.source_expiry_duration
  }
}

exports.getQuoteFromConnector = getQuoteFromConnector
exports.getCheaperQuote = getCheaperQuote
exports.quoteToTransfer = quoteToTransfer
