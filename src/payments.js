'use strict'

const uuid = require('node-uuid').v4

/**
 * @param {Payment[]} payments
 * @param {URI} sourceAccount
 * @param {URI} destinationAccount
 * @param {Object} additionalInfo
 * @returns {Payment[]}
 */
function setupTransfers (payments, sourceAccount, destinationAccount, additionalInfo) {
  // The forEach only modifies `source_transfers` because:
  //   payment[n-1].destination_transfers == payment[n].source_transfers
  // The final transfer is updated at the end.
  payments.forEach(function (payment, i) {
    validateOneToOnePayment(payment)
    const transfer = payment.source_transfers[0]
    transfer.id = transfer.id || transfer.ledger + '/transfers/' + uuid()
    transfer.additional_info = Object.assign({}, additionalInfo)
    transfer.additional_info.part_of_payment = payment.id

    // Add start and endpoints in payment chain from user-provided payment object
    if (i === 0) {
      transfer.debits[0].account = sourceAccount
    } else {
      transfer.debits = payments[i - 1].destination_transfers[0].debits
      // Make sure the source and destination transfers reference the same objects,
      // so that modifications to one affect both.
      payments[i - 1].destination_transfers = [transfer]
    }
  })

  // Create final (rightmost) transfer
  const finalPayment = payments[payments.length - 1]
  const finalTransfer = finalPayment.destination_transfers[0]
  finalTransfer.id = finalTransfer.id || finalTransfer.ledger + '/transfers/' + uuid()
  finalTransfer.additional_info = Object.assign({}, additionalInfo)
  finalTransfer.additional_info.part_of_payment = finalPayment.id
  finalTransfer.credits[0].account = destinationAccount
  return payments
}

/**
 * @param {Payment} payment
 */
function validateOneToOnePayment (payment) {
  if (payment.source_transfers.length !== 1 ||
      payment.destination_transfers.length !== 1) {
    throw new Error('five-bells-sender only supports one-to-one payments')
  }
}

/**
 * @param {Payment[]} payments
 * @returns {Transfers[]}
 */
function toTransfers (payments) {
  return payments.map(function (payment) {
    return payment.source_transfers[0]
  }).concat([
    payments[payments.length - 1].destination_transfers[0]
  ])
}

exports.setupTransfers = setupTransfers
exports.toTransfers = toTransfers
