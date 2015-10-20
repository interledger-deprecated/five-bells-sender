'use strict'
const co = require('co')
const Sender = require('./lib/sender')

// params -
//   source_ledger
//   source_username
//   source_password
//   destination_ledger
//   destination_amount
// hops - [ {trader, source, destination} ]
module.exports = co.wrap(function * (params, hops) {
  let sender = new Sender(params)
  yield sender.findPath(hops)
  yield sender.setupTransfers()
  yield sender.postTransfers()
  yield sender.postPayments()
})
