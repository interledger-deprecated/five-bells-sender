/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
const Payments = require('../src/payments')

const alice = 'http://usd-ledger.example/accounts/alice'
const bob = 'http://eur-ledger.example/accounts/bob'

beforeEach(function () {
  this.payments = clone(require('./fixtures/payments.json'))
  this.quote = clone(require('./fixtures/quote.json'))
  this.quotes = clone(require('./fixtures/quotes.json'))
  this.quoteOneToMany = clone(require('./fixtures/quoteOneToMany.json'))
})

describe('Payments.setupTransfers', function () {
  it('throws on a one-to-many payment', function () {
    assert.throws(function () {
      Payments.setupTransfers(this.quoteOneToMany, alice, bob)
    }.bind(this), function (err) {
      return err.message === 'five-bells-sender only supports one-to-one payments'
    })
  })

  it('throws on a many-to-one payment', function () {
    assert.throws(function () {
      Payments.setupTransfers([{
        id: this.quoteOneToMany[0].id,
        source_transfers: this.quoteOneToMany[0].destination_transfers,
        destination_transfers: this.quoteOneToMany[0].source_transfers
      }], alice, bob)
    }.bind(this), function (err) {
      return err.message === 'five-bells-sender only supports one-to-one payments'
    })
  })

  it('sets up a valid payment', function () {
    const payment = Payments.setupTransfers(this.quote, alice, bob)[0]
    assert(isTransferID('usd', payment.source_transfers[0].id))
    assert(isTransferID('eur', payment.destination_transfers[0].id))
    assert.equal(
      payment.source_transfers[0].additional_info.part_of_payment,
      payment.id)
    assert.equal(
      payment.destination_transfers[0].additional_info.part_of_payment,
      payment.id)
    assert.equal(payment.source_transfers[0].debits[0].account, alice)
    assert.equal(payment.destination_transfers[0].credits[0].account, bob)
  })

  it('setups up valid payments', function () {
    const payments = Payments.setupTransfers(this.quotes, alice, bob)
    assert.equal(payments[0].source_transfers[0].debits[0].account, alice)
    assert.equal(
      payments[0].destination_transfers[0],
      payments[1].source_transfers[0])
    assert.equal(
      payments[1].source_transfers[0].debits[0].account,
      'http://ledger2.example/accounts/mark')
  })
})

describe('Payments.setupConditions', function () {
  it('authorizes the first debit', function () {
    const template = Payments.setupTransfers(this.quotes, alice, bob)
    const payments = Payments.setupConditions(template, {
      isAtomic: false,
      executionCondition: [0]
    })
    assert.strictEqual(payments[0].source_transfers[0].debits[0].authorized, true)
    assert.deepEqual(payments[0].source_transfers[0].execution_condition, [0])
    assert.deepEqual(payments[1].destination_transfers[0].execution_condition, undefined)
  })
})

describe('Payments.toTransfers', function () {
  it('converts a list of Payments to a list of Transfers', function () {
    assert.deepEqual(
      Payments.toTransfers(this.payments),
      [
        this.payments[0].source_transfers[0],
        this.payments[1].source_transfers[0],
        this.payments[1].destination_transfers[0]
      ])
  })

  it('converts a Payment to a list of Transfers', function () {
    assert.deepEqual(
      Payments.toTransfers([this.payments[0]]), [
        this.payments[0].source_transfers[0],
        this.payments[0].destination_transfers[0]
      ])
  })
})

describe('Payment.toFirstTransfer', function () {
  it('returns a Transfer', function () {
    assert.deepEqual(
      Payments.toFirstTransfer(this.payments),
      this.payments[0].source_transfers[0])
  })
})

describe('Payment.toFinalTransfer', function () {
  it('returns a Transfer', function () {
    assert.deepEqual(
      Payments.toFinalTransfer(this.payments),
      this.payments[1].destination_transfers[0])
  })
})

describe('Payments.postTransfers', function () {
  it('sends username+password to the first PUT, and updates the states', function * () {
    const transfers = Payments.toTransfers(this.payments)
    const transfer1Nock = nock(transfers[0].id)
      .put('', transfers[0])
      .basicAuth({user: 'foo', pass: 'bar'})
      .reply(200, { state: 'STATE1' })
    const transfer2Nock = nock(transfers[1].id)
      .put('', transfers[1])
      .reply(200, { state: 'STATE2' })
    const transfer3Nock = nock(transfers[2].id)
      .put('', transfers[2])
      .reply(200, { state: 'STATE3' })

    yield Payments.postTransfers(this.payments, {
      sourceUsername: 'foo',
      sourcePassword: 'bar'
    })

    assert.equal(transfers[0].state, 'STATE1')
    assert.equal(transfers[1].state, 'STATE2')
    assert.equal(transfers[2].state, 'STATE3')
    transfer1Nock.done()
    transfer2Nock.done()
    transfer3Nock.done()
  })
})

describe('Payments.postPayments', function () {
  it('updates the transfers in the payment list', function * () {
    const transfers = Payments.toTransfers(this.payments)
    const transfer1 = clone(transfers[1])
    const transfer2 = clone(transfers[2])
    transfer1.updated = transfer2.updated = 'yes'
    const payment1Nock = nock(this.payments[0].id)
      .put('', this.payments[0])
      .reply(200, {destination_transfers: [transfer1]})
    const payment2Nock = nock(this.payments[1].id)
      .put('', this.payments[1])
      .reply(200, {destination_transfers: [transfer2]})
    const payments = yield Payments.postPayments(this.payments)
    assert.deepEqual(payments[0].destination_transfers, [transfer1])
    assert.deepEqual(payments[1].source_transfers, [transfer1])
    assert.deepEqual(payments[1].destination_transfers, [transfer2])
    payment1Nock.done()
    payment2Nock.done()
  })

  it('throws on 400', function * () {
    const payment1Nock = nock(this.payments[0].id).put('').reply(400)
    try {
      yield Payments.postPayments(this.payments)
    } catch (err) {
      assert.equal(err.status, 400)
      payment1Nock.done()
      return
    }
    assert(false)
  })
})

function isTransferID (prefix, transfer_id) {
  const pattern = new RegExp('^http://' + prefix + '-ledger\\.example/transfers/[\\w-]+$')
  return pattern.test(transfer_id)
}

function clone (obj) {
  if (obj instanceof Array) return obj.map(clone)
  if (typeof obj !== 'object') return obj
  const copy = {}
  for (let key in obj) copy[key] = obj[key]
  return copy
}
