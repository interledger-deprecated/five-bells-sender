/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
const pathUtils = require('../src/pathUtils')
const connector = 'http://connector.example'

describe('pathUtils.getPathFromConnector', function () {
  it('gets the quote', function * () {
    const quoteNock = nock(connector)
      .get('/quote')
      .query({
        source_account: 'http://ledger1.example/accounts/alice',
        destination_account: 'http://ledger2.example/accounts/bob',
        destination_amount: '123.456'
      })
      .reply(200, ['quotes'])
    const body = yield pathUtils.getPathFromConnector(connector, {
      sourceAccount: 'http://ledger1.example/accounts/alice',
      destinationAccount: 'http://ledger2.example/accounts/bob',
      destinationAmount: '123.456'
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
        destination_amount: '123.456'
      })
      .reply(500)
    try {
      yield pathUtils.getPathFromConnector(connector, {
        sourceAccount: 'http://ledger1.example/accounts/alice',
        destinationAccount: 'http://ledger2.example/accounts/bob',
        destinationAmount: '123.456'
      })
    } catch (err) {
      assert.equal(err.status, 500)
      quoteNock.done()
      return
    }
    assert(false)
  })
})

describe('pathUtils.getCheaperPath', function () {
  it('returns the cheaper path when sourceAmount is fixed', function () {
    assert.deepEqual(
      pathUtils.getCheaperPath([
        { source_transfers: makeCredits(5) },
        { destination_transfers: makeCredits(10) }
      ], [
        { source_transfers: makeCredits(5) },
        { destination_transfers: makeCredits(11) }
      ]), [
        { source_transfers: makeCredits(5) },
        { destination_transfers: makeCredits(10) }
      ])
  })

  it('returns the cheaper path when destinationAmount is fixed', function () {
    assert.deepEqual(
      pathUtils.getCheaperPath([
        { source_transfers: makeCredits(6) },
        { destination_transfers: makeCredits(10) }
      ], [
        { source_transfers: makeCredits(5) },
        { destination_transfers: makeCredits(10) }
      ]), [
        { source_transfers: makeCredits(5) },
        { destination_transfers: makeCredits(10) }
      ])
  })
})

function makeCredits (amount) {
  return [{ credits: [{amount: amount}] }]
}
