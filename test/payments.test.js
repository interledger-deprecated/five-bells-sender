/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const InvalidBodyError = require('five-bells-shared').InvalidBodyError
const Payments = require('../src/payments')
const clone = require('./helpers').clone

const alice = 'http://usd-ledger.example/accounts/alice'
const bob = 'http://eur-ledger.example/accounts/bob'

beforeEach(function () {
  this.payments = clone(require('./fixtures/payments.json'))
  this.quote = clone(require('./fixtures/quote.json'))
  this.quotes = clone(require('./fixtures/quotes.json'))
  this.quoteOneToMany = clone(require('./fixtures/quoteOneToMany.json'))
  this.invalidPayment = clone(require('./fixtures/invalidPayment'))
  this.paymentInvalidSourceTransfer = clone(require('./fixtures/paymentInvalidSourceTransfer'))
  this.paymentInvalidDestinationTransfer = clone(require('./fixtures/paymentInvalidDestinationTransfer'))
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

describe('Payments.validatePayments', function () {
  it('throws an InvalidBodyError when passed invalid payments', function () {
    assert.throws(function () {
      Payments.validatePayments([this.invalidPayment])
    }.bind(this), InvalidBodyError, /Payment schema validation error: Missing required property: destination_transfers/)
  })

  it('throws an InvalidBodyError when passed a payment with an invalid source_transfer', function () {
    assert.throws(function () {
      Payments.validatePayments([this.paymentInvalidSourceTransfer])
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: debits/)
  })

  it('throws an InvalidBodyError when passed a payment with an invalid destination_transfer', function () {
    assert.throws(function () {
      Payments.validatePayments([this.paymentInvalidDestinationTransfer])
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: account/)
  })
})

function isTransferID (prefix, transfer_id) {
  const pattern = new RegExp('^http://' + prefix + '-ledger\\.example/transfers/[\\w-]+$')
  return pattern.test(transfer_id)
}
