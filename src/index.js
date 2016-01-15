'use strict'
const Sender = require('./sender').default

/**
 * Create and execute a transaction.
 *
 * @param {Object} params
 * Required for both modes:
 * @param {String} params.source_ledger - Ledger URI
 * @param {String} params.source_account - Account URI
 * @param {String} params.source_username
 * @param {String} params.source_password
 * @param {String} params.destination_ledger - Ledger URI
 * @param {String} params.destination_account - Account URI
 * @param {String} params.destination_username
 * @param {String} params.destination_amount - Amount (a string, so as not to lose precision)
 * Required for Atomic mode only:
 * @param {String} params.notary - Notary URI (if provided, use Atomic mode)
 * @param {String} params.notary_public_key - Base64-encoded public key
 * @param {String} params.receipt_condition - Object, execution condition.
 *   If not provided, one will be generated.
 */
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
