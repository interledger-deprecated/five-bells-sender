'use strict'
const co = require('co')
const Sender = require('./lib/sender')

// params -
//   source_username
//   source_password
//   source_account
//   destination_account
//   destination_amount
// hops - [ {trader, source, destination} ]
module.exports = co.wrap(function * (params, hops) {
  let sender = new Sender(params)
  yield sender.getQuotes(hops)
  yield sender.setupTransfers()
  yield sender.postTransfers()
  yield sender.postPayments()
})
