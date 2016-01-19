'use strict'
const Sender = require('./sender').default

// params -
//   source_ledger
//   source_username
//   source_password
//   destination_ledger
//   destination_amount
export default async function (params) {
  const sender = new Sender(params)
  await sender.findPath()
  await sender.setupTransfers()
  await sender.postTransfers()
  await sender.postPayments()
  return {
    payments: sender.subpayments,
    transfers: sender.transfers
  }
}
