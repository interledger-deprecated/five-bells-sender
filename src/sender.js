'use strict'
const crypto = require('crypto')
const request = require('superagent')
const uuid = require('uuid4')
const Pathfinder = require('five-bells-pathfind').Pathfinder

function Sender (params) {
  this.source_ledger = params.source_ledger
  this.source_username = params.source_username
  this.source_account = params.source_account || toAccount(this.source_ledger, this.source_username)
  this.source_password = params.source_password
  this.destination_ledger = params.destination_ledger
  this.destination_account = params.destination_account || toAccount(this.destination_ledger, params.destination_username)
  this.destination_amount = params.destination_amount
  this.destination_memo = params.destination_memo

  this.pathfinder = new Pathfinder({
    crawler: {
      initialLedgers: [this.source_ledger, this.destination_ledger]
    }
  })

  this.subpayments = []
  this.transfers = []
  this.finalTransfer = null
}

Sender.prototype.findPath = async function () {
  if (this.source_ledger === this.destination_ledger) {
    // Same ledger transfer
    // TODO add an execution_condition here whenever we switch to having
    // the recipient creat the execution_condition_fulfillment
    // TODO ledger fees?
    this.transfers.push({
      debits: [{
        account: this.source_account,
        amount: this.destination_amount
      }],
      credits: [{
        account: this.destination_account,
        amount: this.destination_amount
      }]
    })
  } else {
    await this.pathfinder.crawl()
    this.subpayments = await this.pathfinder.findPath(
      this.source_ledger,
      this.destination_ledger,
      this.destination_amount)
  }
}

Sender.prototype.setupTransfers = async function () {
  let payments = this.subpayments
  let firstTransfer = payments.length > 0 ? payments[0].source_transfers[0] : this.transfers[0]
  let finalTransfer = this.finalTransfer = payments.length > 0 ? payments[payments.length - 1].destination_transfers[0] : this.transfers[0]

  // Add start and endpoints in payment chain from user-provided payment object
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
  // This is handled separately because the final transfer right now has no
  // execution condition and we have to calculate its expiryDate
  finalTransfer.id = finalTransfer.ledger + '/transfers/' + uuid()
  finalTransfer.part_of_payment = payments.length > 0 ? payments[payments.length - 1].id : undefined
  let expiryDate = new Date(Date.now() + (finalTransfer.expiry_duration * 1000))
  finalTransfer.expires_at = expiryDate.toISOString()
  delete finalTransfer.expiry_duration
  if (this.destination_memo) {
    finalTransfer.credits[0].memo = this.destination_memo
  }

  // Only set the execution condition if this is not a same-ledger transfer
  let executionCondition
  if (payments.length > 0) {
    executionCondition = await this.getCondition()
  }

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

Sender.prototype.getCondition = async function () {
  let finalTransfer = this.finalTransfer
  let finalTransferRes = await request
    .put(finalTransfer.id)
    .send(finalTransfer)
  if (finalTransferRes.status >= 400) {
    throw new Error('Remote error: ' + finalTransferRes.status + ' ' +
      JSON.stringify(finalTransferRes.body))
  }

  let finalTransferStateRes = await request
    .get(finalTransfer.id + '/state')
  if (finalTransferStateRes.status >= 400) {
    throw new Error('Remote error: ' + finalTransferStateRes.status + ' ' +
      JSON.stringify(finalTransferStateRes.body))
  }

  // Execution condition is the final transfer in the chain
  return {
    message_hash: hashJSON({
      id: finalTransfer.id,
      state: 'executed'
    }),
    signer: finalTransfer.ledger,
    public_key: finalTransferStateRes.body.public_key,
    type: finalTransferStateRes.body.type
  }
}

// Propose + Prepare transfers
Sender.prototype.postTransfers = async function () {
  let transfers = this.transfers
  // TODO Theoretically we'd need to keep track of the signed responses
  // Prepare first transfer
  let transfer = transfers[0]
  let transferRes = await request
    .put(transfer.id)
    .auth(this.source_username, this.source_password)
    .send(transfer)
  if (transferRes.status >= 400) {
    throw new Error('Remote error: ' + transferRes.status + ' ' + JSON.stringify(transferRes.body))
  }
  transfer.state = transferRes.body.state

  // Propose other transfers
  for (transfer of transfers.slice(1)) {
    transferRes = await request
      .put(transfer.id)
      .send(transfer)
    if (transferRes.status >= 400) {
      throw new Error('Remote error: ' + transferRes.status + ' ' + JSON.stringify(transferRes.body))
    }

    // Update transfer state
    // TODO: Also keep copy of state signature
    transfer.state = transferRes.body.state
  }

  transfers.push(this.finalTransfer)
}

Sender.prototype.postPayments = async function () {
  let payments = this.subpayments
  let transfers = this.transfers
  for (let i = 0; i < payments.length; i++) {
    let payment = payments[i]
    payment.source_transfers = [transfers[i]]
    // TODO this will need to be fixed when payments have more than 1 source or destination transfer
    payment.destination_transfers = [transfers[i + 1]]

    let paymentRes = await request
      .put(payment.id)
      .send(payment)
    if (paymentRes.status >= 400) {
      throw new Error('Remote error: ' + paymentRes.status + ' ' +
        JSON.stringify(paymentRes.body))
    }

    transfers[i + 1] = paymentRes.body.destination_transfers[0]
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

export default Sender
