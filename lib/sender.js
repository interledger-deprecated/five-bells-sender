'use strict'
const crypto = require('crypto')
const request = require('co-request')
const uuid = require('uuid4')
const Pathfinder = require('@ripple/five-bells-pathfind').Pathfinder

function Sender (params) {
  this.source_ledger = params.source_ledger
  this.source_username = params.source_username
  this.source_password = params.source_password
  this.destination_ledger = params.destination_ledger
  this.destination_username = params.destination_username
  this.destination_amount = params.destination_amount

  this.source_account = toAccount(
    this.source_ledger, this.source_username)
  this.destination_account = toAccount(
    this.destination_ledger, this.destination_username)

  this.pathfinder = new Pathfinder({
    crawler: {
      initialNodes: [this.source_ledger, this.destination_ledger]
    }
  })

  this.subpayments = null
  this.transfers = null
  this.finalTransfer = null
}

Sender.prototype.findPath = function * () {
  yield this.pathfinder.crawl()
  this.subpayments = yield this.pathfinder.findPath(
    this.source_ledger,
    this.destination_ledger,
    this.destination_amount)
}

Sender.prototype.setupTransfers = function * () {
  let payments = this.subpayments
  let firstPayment = payments[0]
  let firstTransfer = firstPayment.source_transfers[0]
  let finalPayment = payments[payments.length - 1]
  let finalTransfer = this.finalTransfer = finalPayment.destination_transfers[0]

  // Add start and endpoints in payment chain from user-provided payment
  // object
  firstTransfer.debits = [{
    amount: firstTransfer.credits[0].amount,
    account: this.source_account
  }]
  finalTransfer.credits = [{
    amount: finalTransfer.debits[0].amount,
    account: this.destination_account
  }]

  // Fill in remaining transfers data
  payments.reduce(function (left, right) {
    left.destination_transfers[0].credits = right.source_transfers[0].credits
    right.source_transfers[0].debits = left.destination_transfers[0].debits
    return right
  })

  // Create final (rightmost) transfer
  finalTransfer.id = finalTransfer.ledger + '/transfers/' + uuid()
  finalTransfer.part_of_payment = finalPayment.id
  let expiryDate = new Date(Date.now() + (finalTransfer.expiry_duration * 1000))
  finalTransfer.expires_at = expiryDate.toISOString()
  delete finalTransfer.expiry_duration

  let executionCondition = yield this.getCondition()

  // Prepare remaining transfer objects
  let transfers = this.transfers = []
  for (let i = payments.length - 1; i >= 0; i--) {
    let transfer = payments[i].source_transfers[0]
    transfer.id = transfer.ledger + '/transfers/' + uuid()
    transfer.execution_condition = executionCondition
    transfer.part_of_payment = payments[i].id
    let expiryDate = new Date(Date.now() + (transfer.expiry_duration * 1000))
    transfer.expires_at = expiryDate.toISOString()
    delete transfer.expiry_duration
    transfers.unshift(transfer)
  }

  // The first transfer must be submitted by us with authorization
  // TODO: This must be a genuine authorization from the user
  transfers[0].debits[0].authorized = true
}

Sender.prototype.getCondition = function * () {
  let finalTransfer = this.finalTransfer
  let finalTransferReq = yield request({
    method: 'put',
    uri: finalTransfer.id,
    body: finalTransfer,
    json: true
  })
  if (finalTransferReq.statusCode >= 400) {
    throw new Error('Remote error: ' + finalTransferReq.statusCode + ' ' +
      JSON.stringify(finalTransferReq.body))
  }

  let finalTransferStateReq = yield request({
    method: 'get',
    uri: finalTransfer.id + '/state',
    json: true
  })
  if (finalTransferStateReq.statusCode >= 400) {
    throw new Error('Remote error: ' + finalTransferStateReq.statusCode + ' ' +
      JSON.stringify(finalTransferStateReq.body))
  }

  // Execution condition is the final transfer in the chain
  return {
    message_hash: hashJSON({
      id: finalTransfer.id,
      state: 'executed'
    }),
    signer: finalTransfer.ledger,
    public_key: finalTransferStateReq.body.public_key,
    type: finalTransferStateReq.body.type
  }
}

// Propose + Prepare transfers
Sender.prototype.postTransfers = function * () {
  let transfers = this.transfers
  // TODO Theoretically we'd need to keep track of the signed responses
  for (let transfer of transfers) {
    let auth = transfer === transfers[0] ? {
      user: this.source_username,
      pass: this.source_password
    } : undefined
    let transferReq = yield request({
      method: 'put',
      auth: auth,
      uri: transfer.id,
      body: transfer,
      json: true
    })
    if (transferReq.statusCode >= 400) {
      throw new Error('Remote error: ' + transferReq.statusCode + ' ' +
        JSON.stringify(transferReq.body))
    }

    // Update transfer state
    // TODO: Also keep copy of state signature
    transfer.state = transferReq.body.state
  }

  transfers.push(this.finalTransfer)
}

Sender.prototype.postPayments = function * () {
  let payments = this.subpayments
  let transfers = this.transfers
  for (let i = 0; i < payments.length; i++) {
    let payment = payments[i]
    payment.source_transfers = [transfers[i]]
    payment.destination_transfers = [transfers[i + 1]]

    let paymentReq = yield request({
      method: 'put',
      uri: payment.id,
      body: payment,
      json: true
    })
    if (paymentReq.statusCode >= 400) {
      throw new Error('Remote error: ' + paymentReq.statusCode + ' ' +
        JSON.stringify(paymentReq.body))
    }

    transfers[i + 1] = paymentReq.body.destination_transfers[0]
  }
}

function hashJSON (json) {
  let str = JSON.stringify(json)
  let hash = crypto.createHash('sha512').update(str).digest('base64')
  return hash
}

function toAccount (ledger, name) {
  return ledger + '/accounts/' + encodeURIComponent(name)
}

module.exports = Sender
