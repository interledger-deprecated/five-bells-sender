/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const InvalidBodyError = require('five-bells-shared').InvalidBodyError
const validator = require('../src/validator')
const clone = require('./helpers').clone

describe('validator.validateTransfer', function () {
  beforeEach(function () {
    this.transferMissingDebits = clone(require('./fixtures/transferMissingDebits'))
    this.transferMissingAccount = clone(require('./fixtures/transferMissingAccount'))
  })

  it('throws an InvalidBodyError when passed a payment with an invalid source_transfer', function () {
    assert.throws(function () {
      validator.validateTransfer(this.transferMissingDebits)
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: debits/)
  })

  it('throws an InvalidBodyError when passed a payment with an invalid destination_transfer', function () {
    assert.throws(function () {
      validator.validateTransfer(this.transferMissingAccount)
    }.bind(this), InvalidBodyError, /Transfer schema validation error: Missing required property: account/)
  })
})
