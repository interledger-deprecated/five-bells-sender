/* eslint-env node, mocha */
'use strict'
const assert = require('assert')
const nock = require('nock')
import {
  setupTransferConditionsAtomic,
  setupTransferConditionsUniversal,
  postTransfer,
  transferExpiresAt,
  getTransferState
} from '../src/transferUtils'

const transfer = { id: 'http://ledger.example/transfers/1234' }
const now = 1454400000000

describe('transferUtils.setupTransferConditionsAtomic', function () {
  it('adds conditions and cases', function () {
    const executionCondition = [1]
    const cancellationCondition = [2]
    assert.deepEqual(
      setupTransferConditionsAtomic({
        id: transfer.id,
        expiry_duration: 1
      }, {caseID: 123, executionCondition, cancellationCondition}),
      {
        id: transfer.id,
        execution_condition: executionCondition,
        cancellation_condition: cancellationCondition,
        additional_info: {cases: [123]}
      })
  })
})

describe('transferUtils.setupTransferConditionsUniversal', function () {
  it('adds the execution_condition when isFinalTransfer=false', function () {
    const executionCondition = [1]
    assert.deepEqual(
      setupTransferConditionsUniversal({
        id: transfer.id,
        expiry_duration: 1
      }, {isFinalTransfer: false, now, executionCondition}),
      {
        id: transfer.id,
        expires_at: '2016-02-02T08:00:01.000Z',
        execution_condition: executionCondition
      })
  })

  it('doesn\'t add the execution_condition when isFinalTransfer=true', function () {
    const executionCondition = {}
    assert.deepEqual(
      setupTransferConditionsUniversal({
        id: transfer.id,
        expiry_duration: 1
      }, {isFinalTransfer: true, now, executionCondition}),
      {
        id: transfer.id,
        expires_at: '2016-02-02T08:00:01.000Z'
      })
  })
})

describe('transferUtils.postTransfer', function () {
  it('returns the state on 200', async function () {
    const transferNock = nock(transfer.id)
      .put('')
      .basicAuth({user: 'foo', pass: 'bar'})
      .reply(200, {state: 'prepared'})
    const state = await postTransfer(transfer, {username: 'foo', password: 'bar'})
    assert.equal(state, 'prepared')
    transferNock.done()
  })

  it('throws on 400', async function () {
    const transferNock = nock(transfer.id).put('').reply(400)
    try {
      await postTransfer(transfer, {username: 'foo', password: 'bar'})
    } catch (err) {
      assert.equal(err.status, 400)
      transferNock.done()
      return
    }
    assert(false)
  })
})

describe('transferUtils.transferExpiresAt', function () {
  it('should return an ISO string', function () {
    assert.equal(
      transferExpiresAt(1454400000000, {expiry_duration: 2}),
      '2016-02-02T08:00:02.000Z')
  })
})

describe('transferUtils.getTransferState', function () {
  it('returns the response body on 200', async function () {
    const transferNock = nock(transfer.id).get('/state').reply(200, {foo: 'bar'})
    const body = await getTransferState(transfer)
    assert.deepEqual(body, {foo: 'bar'})
    transferNock.done()
  })

  it('should throw an error on 400', async function () {
    const transferNock = nock(transfer.id).get('/state').reply(400)
    try {
      await getTransferState(transfer)
    } catch (err) {
      assert.equal(err.status, 400)
      transferNock.done()
      return
    }
    assert(false)
  })
})
