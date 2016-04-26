'use strict'

const cc = require('five-bells-condition')
const makeCaseAttestation = require('five-bells-shared/utils/makeCaseAttestation')

/**
 * Get the compound execution_condition.
 * @param {Object} params
 * @param {String} params.receiptCondition Receipt condition
 * @param {URI} params.notary (optional)
 * @param {URI} params.caseId (required iff params.notary)
 * @param {String} params.notaryPublicKey (required iff params.notary)
 * @returns {String} Execution condition
 */
function getExecutionCondition (params) {
  if (!params.notary) return params.receiptCondition

  const condition = new cc.ThresholdSha256()
  condition.addSubconditionUri(params.receiptCondition)
  const notaryConditionParams = Object.assign({}, params, { state: 'executed' })
  condition.addSubconditionUri(getNotaryCondition(notaryConditionParams))
  condition.setThreshold(2)
  return condition.getConditionUri()
}

/**
 * @param {Object} params
 * @param {URI} params.caseId
 * @param {URI} params.notary
 * @param {String} params.notaryPublicKey
 * @returns {String} Cancellation condition
 */
function getCancellationCondition (params) {
  params.state = 'rejected'
  return getNotaryCondition(params)
}

/**
 * @param {Object} params
 * @param {String} params.state "executed" or "cancelled"
 * @param {URI} params.caseId
 * @param {URI} params.notary
 * @param {String} params.notaryPublicKey base64
 * @returns {String} Notary condition
 */
function getNotaryCondition (params) {
  const signatureCondition = new cc.Ed25519()
  signatureCondition.setPublicKey(new Buffer(params.notaryPublicKey, 'base64'))
  const attestationUri = makeCaseAttestation(params.caseId, params.state)
  const condition = new cc.PrefixSha256()
  condition.setPrefix(new Buffer(attestationUri, 'utf8'))
  condition.setSubfulfillment(signatureCondition)
  return condition.getConditionUri()
}

exports.getExecutionCondition = getExecutionCondition
exports.getCancellationCondition = getCancellationCondition
