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
 * @returns {Promise} an Array of subpayments
 */
function getPathFromConnector (connector, params) {
  return co(function * () {
    const res = yield request.get(connector + '/quote')
      .query({
        source_account: params.sourceAccount,
        destination_account: params.destinationAccount
      })
      .query(params.sourceAmount
        ? {source_amount: params.sourceAmount}
        : {destination_amount: params.destinationAmount})
    return res.body
  })
}

function getAmount (transfers) {
  return new BigNumber(transfers[0].credits[0].amount)
}

/**
 * @param {Quote[]} path1
 * @param {Quote[]} path2
 * @returns {Quote[]}
 */
function getCheaperPath (path1, path2) {
  if ((getAmount(path1[0].source_transfers))
      .lessThan(getAmount(path2[0].source_transfers))) {
    return path1
  }

  if ((getAmount(path1[path1.length - 1].destination_transfers))
      .lessThan(getAmount(path2[path2.length - 1].destination_transfers))) {
    return path1
  }

  return path2
}

exports.getPathFromConnector = getPathFromConnector
exports.getCheaperPath = getCheaperPath
