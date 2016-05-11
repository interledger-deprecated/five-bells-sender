'use strict'

const co = require('co')
const request = require('superagent')
const BigNumber = require('bignumber.js')

/**
 * @param {URI} connector
 * @param {Object} params
 * @param {String} params.sourceAccount
 * @param {String} params.destinationAccount
 * Exactly one of the following:
 * @param {String} params.sourceAmount
 * @param {String} params.destinationAmount
 * @returns {Promise<Transfer>}
 */
function getQuoteFromConnector (connector, params) {
  return co(function * () {
    const res = yield request.get(connector + '/quote')
      .query({
        source_account: params.sourceAccount,
        destination_account: params.destinationAccount,
        destination_expiry_duration: 2
      })
      .query(params.sourceAmount
        ? {source_amount: params.sourceAmount}
        : {destination_amount: params.destinationAmount})
    return res.body
  })
}

function getAmount (transfer) {
  return new BigNumber(transfer.credits[0].amount)
}

/**
 * @param {Transfer} quote1
 * @param {Transfer} quote2
 * @returns {Transfer}
 */
function getCheaperQuote (quote1, quote2) {
  if ((getAmount(quote1))
      .lessThan(getAmount(quote2))) {
    return quote1
  }

  if ((getAmount(quote1.credits[0].memo.destination_transfer))
      .lessThan(getAmount(quote2.credits[0].memo.destination_transfer))) {
    return quote1
  }

  return quote2
}

exports.getQuoteFromConnector = getQuoteFromConnector
exports.getCheaperQuote = getCheaperQuote
