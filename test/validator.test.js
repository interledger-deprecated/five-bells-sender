/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const InvalidBodyError = require('five-bells-shared').InvalidBodyError
const validator = require('../src/validator')
const clone = require('./helpers').clone

describe('validator.validateTransfer', function () {
  beforeEach(function () {
    this.paymentInvalidSourceTransfer = clone(require('./fixtures/paymentInvalidSourceTransfer'))
    this.paymentInvalidDestinationTransfer = clone(require('./fixtures/paymentInvalidDestinationTransfer'))
  })

  it('throws an InvalidBodyError when passed a payment with an invalid source_transfer', function () {
    assert.throws(function () {
      validator.validateTransfer([this.paymentInvalidSourceTransfer])
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: debits/)
  })

  it('throws an InvalidBodyError when passed a payment with an invalid destination_transfer', function () {
    assert.throws(function () {
      validator.validateTransfer([this.paymentInvalidDestinationTransfer])
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: account/)
  })
})
