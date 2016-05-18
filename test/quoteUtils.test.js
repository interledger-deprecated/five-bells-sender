/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
const quoteUtils = require('../src/quoteUtils')
const connector = 'http://connector.example'

describe('quoteUtils.getQuoteFromConnector', function () {
  it('gets the quote', function * () {
    const quoteNock = nock(connector)
      .get('/quote')
      .query({
        source_account: 'http://ledger1.example/accounts/alice',
        destination_account: 'http://ledger2.example/accounts/bob',
        destination_amount: '123.456',
        destination_expiry_duration: 2
      })
      .reply(200, ['quotes'])
    const body = yield quoteUtils.getQuoteFromConnector(connector, {
      sourceAccount: 'http://ledger1.example/accounts/alice',
      destinationAccount: 'http://ledger2.example/accounts/bob',
      destinationAmount: '123.456',
      destinationExpiryDuration: 2
    })
    assert.deepEqual(body, ['quotes'])
    quoteNock.done()
  })

  it('throws on 500', function * () {
    const quoteNock = nock(connector)
      .get('/quote')
      .query({
        source_account: 'http://ledger1.example/accounts/alice',
        destination_account: 'http://ledger2.example/accounts/bob',
        destination_amount: '123.456',
        destination_expiry_duration: 15,
        source_expiry_duration: 20
      })
      .reply(500)
    try {
      yield quoteUtils.getQuoteFromConnector(connector, {
        sourceAccount: 'http://ledger1.example/accounts/alice',
        destinationAccount: 'http://ledger2.example/accounts/bob',
        destinationAmount: '123.456',
        destinationExpiryDuration: 15,
        sourceExpiryDuration: 20
      })
    } catch (err) {
      assert.equal(err.status, 500)
      quoteNock.done()
      return
    }
    assert(false)
  })
})

describe('quoteUtils.getCheaperQuote', function () {
  it('returns the cheaper path when sourceAmount is fixed', function () {
    assert.deepEqual(
      quoteUtils.getCheaperQuote(
        makeTransfer(5, 10),
        makeTransfer(5, 11)),
      makeTransfer(5, 10))
  })

  it('returns the cheaper path when destinationAmount is fixed', function () {
    assert.deepEqual(
      quoteUtils.getCheaperQuote(
        makeTransfer(6, 10),
        makeTransfer(5, 10)),
      makeTransfer(5, 10))
  })
})

function makeTransfer (sourceAmount, destinationAmount) {
  return {
    credits: [{
      amount: sourceAmount,
      memo: {
        destination_transfer: { credits: [{amount: destinationAmount}] }
      }
    }]
  }
}
