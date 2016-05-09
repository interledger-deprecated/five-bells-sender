/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const Payments = require('../src/payments')
const clone = require('./helpers').clone

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

  it('should use provided transfer IDs', function () {
    const sourceTransferId = 'http://eur-ledger.example/transfers/d3170b2b-7b98-4528-8ace-d810460dbe15'
    const destinationTransferID = 'http://eur-ledger.example/transfers/35bc13b3-b929-446d-9ed7-e78d75abef07'
    const quote = clone(this.quote)
    quote[0].source_transfers[0].id = sourceTransferId
    quote[0].destination_transfers[0].id = destinationTransferID
    const payment = Payments.setupTransfers(quote, alice, bob)[0]
    assert(sourceTransferId === payment.source_transfers[0].id)
    assert(destinationTransferID === payment.destination_transfers[0].id)
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

function isTransferID (prefix, transfer_id) {
  const pattern = new RegExp('^http://' + prefix + '-ledger\\.example/transfers/[\\w-]+$')
  return pattern.test(transfer_id)
}
