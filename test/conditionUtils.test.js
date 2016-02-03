/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
import {
  getReceiptCondition,
  getExecutionCondition,
  getCancellationCondition
} from '../src/conditionUtils'

const notary = 'http://notary.example'
const transfer = {
  id: 'http://ledger.example/transfers/1234',
  ledger: 'http://ledger.example'
}

describe('conditionUtils.getReceiptCondition', function () {
  it('builds a Condition', async function () {
    const transferNock = nock(transfer.id).get('/state').reply(200, {
      type: 'ed25519-sha512',
      public_key: 1234
    })
    assert.deepEqual((await getReceiptCondition(transfer, 'executed')),
      {
        message_hash: 'ZZeLK/FVt4iGMxy6FDohwnFxNBbPbC/2Hf7Y2a9/WLBb/AlmLTpA91lVRmMJLSSLwTgOUsqGTi9EPzlowHdl9Q==',
        signer: 'http://ledger.example',
        type: 'ed25519-sha512',
        public_key: 1234
      })
    transferNock.done()
  })
})

describe('conditionUtils.getExecutionCondition', function () {
  describe('atomic mode', function () {
    it('returns an "and" Condition', function () {
      const receiptCondition = [1]
      assert.deepEqual(
        getExecutionCondition({
          notary,
          receiptCondition,
          caseID: 1234,
          notaryPublicKey: 5678
        }),
        {
          type: 'and',
          subconditions: [
            {
              type: 'ed25519-sha512',
              signer: notary,
              public_key: 5678,
              message_hash: 'dm5xWlvQPyH0+bfK80HVCXgViBpEG0JQm2oorRIOQqfQKwC5cDwwdMvyXRSFGxbHJXWdjlkrtZK+3rAkIJMUFw=='
            },
            receiptCondition
          ]
        })
    })
  })

  describe('universal mode', function () {
    it('returns the receiptCondition', function () {
      const receiptCondition = [1]
      assert.deepEqual(
        getExecutionCondition({receiptCondition}),
        receiptCondition)
    })
  })
})

describe('conditionUtils.getCancellationCondition', function () {
  it('returns an ed25519-sha512 Condition', function () {
    assert.deepEqual(
      getCancellationCondition({
        caseID: 1234,
        notaryPublicKey: 5678,
        notary
      }),
      {
        type: 'ed25519-sha512',
        signer: notary,
        public_key: 5678,
        message_hash: 'LUR6zM9B+Jx6D+G/XMhb+OSaw7R6JHJigFcUuccj5ldodUbxqed7y8VhLGCVO24/lKdFExoJJFUutISunQyApw=='
      })
  })
})
