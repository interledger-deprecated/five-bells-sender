'use strict'
const crypto = require('crypto')
const stringifyJSON = require('canonical-json')
const makeCaseAttestation = require('five-bells-shared/utils/makeCaseAttestation')
import {getTransferState} from './transferUtils'

/**
 * @param {Transfer} finalTransfer
 * @param {TransferState} state "prepared" | "executed"
 * @returns {Promise<Condition>}
 */
export async function getReceiptCondition (finalTransfer, state) {
  const finalTransferState = await getTransferState(finalTransfer)
  // Execution condition is the final transfer in the chain
  return {
    message_hash: hashJSON({
      id: finalTransfer.id,
      state: state
    }),
    signer: finalTransfer.ledger,
    public_key: finalTransferState.public_key,
    type: finalTransferState.type
  }
}

/**
 * Get the compound execution_condition.
 * @param {Object} params
 * @param {Condition} params.receiptCondition
 * @param {URI} params.notary (optional)
 * @param {URI} params.caseID (required iff params.notary)
 * @param {String} params.notaryPublicKey (required iff params.notary)
 * @returns {Condition}
 */
export function getExecutionCondition (params) {
  params.state = 'executed'
  return params.notary ? {
    type: 'and',
    subconditions: [
      getNotaryCondition(params),
      params.receiptCondition
    ]
  } : params.receiptCondition
}

/**
 * @param {Object} params
 * @param {URI} params.caseID
 * @param {URI} params.notary
 * @param {String} params.notaryPublicKey
 * @returns {Ed25519_Sha512_Condition}
 */
export function getCancellationCondition (params) {
  params.state = 'cancelled'
  return getNotaryCondition(params)
}

/**
 * @param {Object} params
 * @param {String} params.state "executed" or "cancelled"
 * @param {URI} params.caseID
 * @param {URI} params.notary
 * @param {String} params.notaryPublicKey base64
 * @returns {Ed25519_Sha512_Condition}
 */
function getNotaryCondition (params) {
  return {
    type: 'ed25519-sha512',
    signer: params.notary,
    public_key: params.notaryPublicKey,
    message_hash: sha512(makeCaseAttestation(params.caseID, params.state))
  }
}

// /////////////////////////////////////////////////////////////////////////////
// Utilities
// /////////////////////////////////////////////////////////////////////////////

function hashJSON (object) {
  return sha512(stringifyJSON(object))
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
}
