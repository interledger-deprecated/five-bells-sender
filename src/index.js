'use strict'
import Sender from './sender'

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
  return sender.subpayments
}
