/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const conditionUtils = require('../src/conditionUtils')

const notary = 'http://notary.example'

describe('conditionUtils.getExecutionCondition', function () {
  describe('atomic mode', function () {
    it('returns an "and" Condition', function () {
      const receiptCondition = 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
      assert.equal(
        conditionUtils.getExecutionCondition({
          notary: notary,
          receiptCondition: receiptCondition,
          caseId: 1234,
          notaryPublicKey: '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A='
        }),
        'cc:2:2f:iJDUYZFO49HAOnYWVPNkF6QNrzvF7rWbVoOZjiIOqzc:142')
    })
  })

  describe('universal mode', function () {
    it('returns the receiptCondition', function () {
      const receiptCondition = 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
      assert.deepEqual(
        conditionUtils.getExecutionCondition({receiptCondition}),
        receiptCondition)
    })
  })
})

describe('conditionUtils.getCancellationCondition', function () {
  it('returns an ed25519-sha512 Condition', function () {
    assert.deepEqual(
      conditionUtils.getCancellationCondition({
        caseId: 1234,
        notaryPublicKey: '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A=',
        notary: notary
      }),
      'cc:1:25:xQ9r0aMDlFYcaicrjVyIEqO8f7ZtWx7vsf9iGhuyMEw:121')
  })
})
