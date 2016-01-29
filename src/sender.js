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

  this.notary = params.notary
  this.notary_public_key = params.notary_public_key
  this.receipt_condition = params.receipt_condition
  this.isAtomic = !!this.notary
  this.caseID = null
  if (this.isAtomic && !this.notary_public_key) {
    throw new Error('Missing required parameter: notary_public_key')
  }

  this.subpayments = params.subpayments
  this.transfers = null
  this.finalTransfer = null
  // Use one Date.now() as the base of all expiries so that when a ms passes
  // between when the source and destination expiries are calculated the
  // minMessageWindow isn't exceeded.
  this.now = Date.now()
}

// /////////////////////////////////////////////////////////////////////////////
// Quoting
// /////////////////////////////////////////////////////////////////////////////

Sender.prototype.findPath = async function () {
  const pathfinder = new Pathfinder({
    crawler: {
      initialLedgers: [this.source_ledger, this.destination_ledger]
    }
  })
  await pathfinder.crawl()
  this.subpayments = await pathfinder.findPath({
    sourceLedger: this.source_ledger,
    destinationLedger: this.destination_ledger,
    destinationAmount: this.destination_amount,
    destinationAccount: this.destination_account
  })
}

// /////////////////////////////////////////////////////////////////////////////
// Setup
// /////////////////////////////////////////////////////////////////////////////

Sender.prototype.setupTransfers = async function () {
  let payments = this.subpayments
  let firstPayment = payments[0]
  let firstTransfer = firstPayment.source_transfers[0]
  let finalPayment = payments[payments.length - 1]
  let finalTransfer = this.finalTransfer = finalPayment.destination_transfers[0]

  // Add start and endpoints in payment chain from user-provided payment
  // object
  firstTransfer.debits[0].account = this.source_account
  // Create final (rightmost) transfer
  finalTransfer.id = finalTransfer.ledger + '/transfers/' + uuid()
  if (this.destination_memo) {
    finalTransfer.credits[0].memo = this.destination_memo
  }

  // Fill in remaining transfers data
  payments.reduce(function (left, right) {
    right.source_transfers[0].debits = left.destination_transfers[0].debits
    return right
  })

  // Build the transfer list.
  let transfers = this.transfers = []
  for (let payment of payments) {
    let transfer = payment.source_transfers[0]
    transfer.id = transfer.ledger + '/transfers/' + uuid()
    transfer.additional_info = {part_of_payment: payment.id}
    transfers.push(transfer)
  }
  finalTransfer.additional_info = {part_of_payment: finalPayment.id}
  transfers.push(finalTransfer)

  // Build the conditions.
  this.receipt_condition = await this.setupReceiptCondition()
  await this.setupCase()
  let executionCondition = await this.getExecutionCondition()
  let cancellationCondition = this.getCancellationCondition()
  let cases = this.isAtomic ? [this.caseID] : undefined

  // Add conditions/expirations to all transfers.
  for (let transfer of transfers) {
    if (this.isAtomic) {
      transfer.execution_condition = executionCondition
      transfer.cancellation_condition = cancellationCondition
      transfer.additional_info.cases = cases
      // Atomic transfers don't expire
      // (or rather, their expiry is handled by the cancellation_condition).
    } else {
      transfer.expires_at = this.getExpiresAt(transfer)
      if (transfer !== finalTransfer) {
        transfer.execution_condition = executionCondition
      }
    }
    delete transfer.expiry_duration
  }

  // The first transfer must be submitted by us with authorization
  // TODO: This must be a genuine authorization from the user
  transfers[0].debits[0].authorized = true
}

Sender.prototype.setupCase = async function () {
  if (!this.isAtomic) return
  let caseUUID = uuid()
  this.caseID = this.notary + '/cases/' + encodeURIComponent(caseUUID)
  let caseRes = await request
    .put(this.caseID)
    .send({
      id: this.caseID,
      state: 'proposed',
      execution_condition: this.receipt_condition,
      expires_at: this.getExpiresAt(this.subpayments[0].source_transfers[0]),
      notaries: [{url: this.notary}],
      notification_targets: this.transfers.map(transfer => transfer.id + '/fulfillment')
    })
  if (caseRes.statusCode >= 400) {
    throw new Error('Notary error: ' + caseRes.statusCode + ' ' +
      JSON.stringify(caseRes.body))
  }
}

// Returns the compound execution_condition.
Sender.prototype.getExecutionCondition = async function () {
  return this.isAtomic ? {
    type: 'and',
    subconditions: [
      this.getNotaryCondition('executed'),
      this.receipt_condition
    ]
  } : this.receipt_condition
}

Sender.prototype.getCancellationCondition = function () {
  return this.isAtomic && this.getNotaryCondition('cancelled')
}

Sender.prototype.setupReceiptCondition = async function () {
  if (this.receipt_condition) return this.receipt_condition

  let finalTransfer = this.finalTransfer
  let finalTransferStateRes = await request.get(finalTransfer.id + '/state')
  if (finalTransferStateRes.status >= 400) {
    throw new Error('Remote error: ' + finalTransferStateRes.status + ' ' +
      JSON.stringify(finalTransferStateRes.body))
  }

  // Execution condition is the final transfer in the chain
  return {
    message_hash: hashJSON({
      id: finalTransfer.id,
      state: this.isAtomic ? 'prepared' : 'executed'
    }),
    signer: finalTransfer.ledger,
    public_key: finalTransferStateRes.body.public_key,
    type: finalTransferStateRes.body.type
  }
}

Sender.prototype.getNotaryCondition = function (state) {
  return {
    type: 'ed25519-sha512',
    signer: this.notary,
    public_key: this.notary_public_key,
    message_hash: sha512('urn:notary:' + this.caseID + ':' + state)
  }
}

// /////////////////////////////////////////////////////////////////////////////
// Proposal
// /////////////////////////////////////////////////////////////////////////////

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
}

// /////////////////////////////////////////////////////////////////////////////
// Preparation, execution
// /////////////////////////////////////////////////////////////////////////////

Sender.prototype.postPayments = async function () {
  let payments = this.subpayments
  let transfers = this.transfers
  for (let i = 0; i < payments.length; i++) {
    let payment = payments[i]
    payment.source_transfers = [transfers[i]]
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

// /////////////////////////////////////////////////////////////////////////////
// Execution
// /////////////////////////////////////////////////////////////////////////////

Sender.prototype.postFulfillmentToNotary = async function () {
  let finalTransfer = this.finalTransfer
  let finalTransferStateRes = await request.get(finalTransfer.id + '/state')
  if (finalTransferStateRes.statusCode >= 400) {
    throw new Error('Remote error: ' + finalTransferStateRes.statusCode + ' ' +
      JSON.stringify(finalTransferStateRes.body))
  }
  let state = finalTransferStateRes.body
  let notaryFulfillmentRes = await request
    .put(this.caseID + '/fulfillment')
    .send({ type: state.type, signature: state.signature })
  if (notaryFulfillmentRes >= 400) {
    throw new Error('Remote error: ' + notaryFulfillmentRes.statusCode + ' ' +
      JSON.stringify(notaryFulfillmentRes.body))
  }
}

// /////////////////////////////////////////////////////////////////////////////
// Utilities
// /////////////////////////////////////////////////////////////////////////////

Sender.prototype.getExpiresAt = function (transfer) {
  return (new Date(this.now + (transfer.expiry_duration * 1000))).toISOString()
}

function hashJSON (json) {
  return sha512(JSON.stringify(json))
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
}

function toAccount (ledger, name) {
  return ledger + '/accounts/' + encodeURIComponent(name)
}

export default Sender
