/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
const quoteUtils = require('../src/quoteUtils')
const connector = 'http://connector.example'

describe('quoteUtils.getQuoteFromConnector', function () {
  it('gets the quote', function * () {
    const query = {
      source_ledger: 'http://ledger1.example',
      destination_ledger: 'http://ledger2.example',
      destination_amount: '123.456',
      destination_expiry_duration: 2
    }
    const quote = Object.assign({destination_amount: '123.456'}, query)
    const quoteNock = nock(connector)
      .get('/quote')
      .query(query)
      .reply(200, quote)
    const body = yield quoteUtils.getQuoteFromConnector(connector, {
      sourceLedger: 'http://ledger1.example',
      destinationLedger: 'http://ledger2.example',
      destinationAmount: '123.456',
      destinationExpiryDuration: 2
    })
    assert.deepEqual(body, quote)
    quoteNock.done()
  })

  it('throws on 500', function * () {
    const quoteNock = nock(connector)
      .get('/quote')
      .query({
        source_ledger: 'http://ledger1.example',
        destination_ledger: 'http://ledger2.example',
        destination_amount: '123.456',
        destination_expiry_duration: 15,
        source_expiry_duration: 20
      })
      .reply(500)
    try {
      yield quoteUtils.getQuoteFromConnector(connector, {
        sourceLedger: 'http://ledger1.example',
        destinationLedger: 'http://ledger2.example',
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

  ;[
    { source_ledger: 'http://ledger3.example' },
    { destination_ledger: 'http://ledger3.example' },
    { destination_amount: '999' }
  ].forEach(function (patch) {
    const field = Object.keys(patch)[0]
    it('throws if the ' + field + ' is tampered with', function * () {
      const query = {
        source_ledger: 'http://ledger1.example',
        destination_ledger: 'http://ledger2.example',
        destination_amount: '123.456'
      }
      const quoteNock = nock(connector)
        .get('/quote')
        .query(query)
        .reply(200, Object.assign({}, query, patch))
      try {
        yield quoteUtils.getQuoteFromConnector(connector, {
          sourceLedger: 'http://ledger1.example',
          destinationLedger: 'http://ledger2.example',
          destinationAmount: '123.456'
        })
      } catch (err) {
        assert.equal(err.message, 'quote has unexpected ' + field)
        quoteNock.done()
        return
      }
      assert(false)
    })
  })
})

describe('quoteUtils.getCheaperQuote', function () {
  it('returns the cheaper path when sourceAmount is fixed', function () {
    assert.deepEqual(
      quoteUtils.getCheaperQuote(
        makeQuote(5, 10),
        makeQuote(5, 11)),
      makeQuote(5, 10))
  })

  it('returns the cheaper path when destinationAmount is fixed', function () {
    assert.deepEqual(
      quoteUtils.getCheaperQuote(
        makeQuote(6, 10),
        makeQuote(5, 10)),
      makeQuote(5, 10))
  })
})

describe('quoteUtils.quoteToTransfer', function () {
  it('returns a transfer', function () {
    const alice = 'http://ledgerA.example/accounts/alice'
    const bob = 'http://ledgerC.example/accounts/bob'
    assert.deepStrictEqual(
      quoteUtils.quoteToTransfer({
        source_connector_account: 'http://ledgerA.example/accounts/mark',
        source_ledger: 'http://ledgerA.example',
        source_amount: '100',
        source_expiry_duration: 6,
        destination_ledger: 'http://ledgerC.example',
        destination_amount: '50',
        destination_expiry_duration: 5
      }, alice, bob), {
        ledger: 'http://ledgerA.example',
        debits: [{
          account: alice,
          amount: '100'
        }],
        credits: [{
          account: 'http://ledgerA.example/accounts/mark',
          amount: '100',
          memo: {
            destination_transfer: {
              ledger: 'http://ledgerC.example',
              debits: [{ account: null, amount: '50' }],
              credits: [{ account: bob, amount: '50' }],
              expiry_duration: 5
            }
          }
        }],
        expiry_duration: 6
      })
  })
})

function makeQuote (sourceAmount, destinationAmount) {
  return {
    source_amount: sourceAmount,
    destination_amount: destinationAmount
  }
}
