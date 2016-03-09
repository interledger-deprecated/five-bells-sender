/* eslint-env node, mocha */
'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')
const assert = require('assert')
const nock = require('nock')
const transferUtils = require('../src/transferUtils')

const transfer = { id: 'http://ledger.example/transfers/1234' }
const now = 1454400000000

describe('transferUtils.setupTransferConditionsAtomic', function () {
  it('adds conditions and cases', function () {
    const executionCondition = [1]
    const cancellationCondition = [2]
    assert.deepEqual(
      transferUtils.setupTransferConditionsAtomic({
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
      transferUtils.setupTransferConditionsUniversal({
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
      transferUtils.setupTransferConditionsUniversal({
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
  it('returns the state on 200 -- basic-auth', function * () {
    const transferNock = nock(transfer.id)
      .put('')
      .basicAuth({user: 'foo', pass: 'bar'})
      .reply(200, {state: 'prepared'})
    const state = yield transferUtils.postTransfer(transfer, {username: 'foo', password: 'bar'})
    assert.equal(state, 'prepared')
    transferNock.done()
  })

  it('returns the state on 200 -- client-cert-auth', function * () {
    const transferSecure = { id: 'https://localhost:32000/transfers/1234' }
    const key = fs.readFileSync(path.resolve(__dirname, './fixtures/server-key.pem'))
    const cert = fs.readFileSync(path.resolve(__dirname, './fixtures/server-crt.pem'))
    const ca = fs.readFileSync(path.resolve(__dirname, './fixtures/ca-crt.pem'))
    const options = {
      key: key,
      cert: cert,
      ca: ca,
      rejectUnauthorized: true,
      requestCert: true
    }

    const server = https.createServer(options, (req, res) => {
      assert(req.socket.authorized)
      assert.strictEqual(req.socket.getPeerCertificate().fingerprint,
        '81:1E:69:17:74:F8:8F:79:63:74:AD:BD:3F:21:B2:24:4B:37:BE:C4')

      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({state: 'prepared'}))
    }).listen(32000)

    const state = yield transferUtils.postTransfer(transferSecure, {key, cert, ca})
    assert.equal(state, 'prepared')
    server.close()
  })

  it('throws on 400', function * () {
    const transferNock = nock(transfer.id).put('').reply(400)
    try {
      yield transferUtils.postTransfer(transfer, {username: 'foo', password: 'bar'})
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
      transferUtils.transferExpiresAt(1454400000000, {expiry_duration: 2}),
      '2016-02-02T08:00:02.000Z')
  })
})

describe('transferUtils.getTransferState', function () {
  it('returns the response body on 200', function * () {
    const transferNock = nock(transfer.id).get('/state').reply(200, {foo: 'bar'})
    const body = yield transferUtils.getTransferState(transfer)
    assert.deepEqual(body, {foo: 'bar'})
    transferNock.done()
  })

  it('should throw an error on 400', function * () {
    const transferNock = nock(transfer.id).get('/state').reply(400)
    try {
      yield transferUtils.getTransferState(transfer)
    } catch (err) {
      assert.equal(err.status, 400)
      transferNock.done()
      return
    }
    assert(false)
  })
})
