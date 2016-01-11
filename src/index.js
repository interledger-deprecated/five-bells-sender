'use strict'
const Sender = require('./sender').default

// params (required for both modes) -
//   source_ledger        - Ledger URI
//   source_account       - Account URI
//   source_username      - String
//   source_password      - String
//   destination_ledger   - Ledger URI
//   destination_account  - Account URI
//   destination_username - String
//   destination_amount   - String Amount (so as not to lose precision)
// params (required for Atomic mode only) -
//   notary               - Notary URI (if provided, use Atomic mode)
//   notary_public_key    - String
//   receipt_condition    - Object, execution condition
export default async function (params) {
  const sender = new Sender(params)
  await sender.findPath()
  await sender.setupTransfers()
  await sender.postTransfers()
  await sender.postPayments()
  if (sender.isAtomic) {
    await sender.postFulfillmentToNotary()
  }
  return sender.subpayments
}
