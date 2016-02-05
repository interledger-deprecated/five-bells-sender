/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
const notaryUtils = require('../src/notaryUtils')

const payments = require('./fixtures/payments.json')

const notary = 'http://notary.example'

describe('notaryUtils.setupCase', function () {
  it('throws on 400', function * () {
    const caseNock = nock(notary).put(/\/cases\/[\w-]+/).reply(400)
    try {
      yield notaryUtils.setupCase({
        notary,
        payments,
        receiptCondition: [1],
        expiresAt: '2016-02-02T08:00:02.000Z'
      })
    } catch (err) {
      assert.equal(err.status, 400)
      caseNock.done()
      return
    }
    assert(false)
  })

  it('returns the case ID on 200', function * () {
    const caseNock = nock(notary).put(/\/cases\/[\w-]+/, {
      id: /^http:\/\/notary\.example\/cases\/[\w-]+$/,
      state: 'proposed',
      execution_condition: [1],
      expires_at: '2016-02-02T08:00:02.000Z',
      notaries: [{url: notary}],
      notification_targets: [
        'http://ledger1.example/transfers/1/fulfillment',
        'http://ledger2.example/transfers/2/fulfillment',
        'http://ledger3.example/transfers/3/fulfillment'
      ]
    }).reply(204)

    const caseID = yield notaryUtils.setupCase({
      notary,
      payments,
      receiptCondition: [1],
      expiresAt: '2016-02-02T08:00:02.000Z'
    })
    const pathParts = caseID.split('/')
    assert.equal(caseID, notary + '/cases/' + pathParts[pathParts.length - 1])
    caseNock.done()
  })
})

describe('notaryUtils.postFulfillmentToNotary', function () {
  const transfer = {id: 'http://ledger.example/transfers/1'}
  const caseID = notary + '/cases/123'

  it('throws on /fulfillment 400', function * () {
    const stateNock = nock(transfer.id).get('/state').reply(200, {type: 'ed25519-sha512'})
    const fulfillNock = nock(caseID).put('/fulfillment').reply(400)
    try {
      yield notaryUtils.postFulfillmentToNotary(transfer, caseID)
    } catch (err) {
      assert.equal(err.status, 400)
      stateNock.done()
      fulfillNock.done()
      return
    }
    assert(false)
  })

  it('posts the type and signature', function * () {
    const stateNock = nock(transfer.id).get('/state').reply(200, {
      type: 'ed25519-sha512',
      signature: 'abcdefg'
    })
    const fulfillNock = nock(caseID).put('/fulfillment', {
      type: 'ed25519-sha512',
      signature: 'abcdefg'
    }).reply(204)
    yield notaryUtils.postFulfillmentToNotary(transfer, caseID)
    stateNock.done()
    fulfillNock.done()
  })
})
