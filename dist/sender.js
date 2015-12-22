'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var crypto = require('crypto');
var request = require('superagent');
var uuid = require('uuid4');
var Pathfinder = require('five-bells-pathfind').Pathfinder;

function Sender(params) {
  this.source_ledger = params.source_ledger;
  this.source_username = params.source_username;
  this.source_password = params.source_password;
  this.destination_ledger = params.destination_ledger;
  this.destination_username = params.destination_username;
  this.destination_amount = params.destination_amount;

  this.source_account = toAccount(this.source_ledger, this.source_username);
  this.destination_account = toAccount(this.destination_ledger, this.destination_username);

  this.pathfinder = new Pathfinder({
    crawler: {
      initialLedgers: [this.source_ledger, this.destination_ledger]
    }
  });

  this.subpayments = null;
  this.transfers = null;
  this.finalTransfer = null;
}

Sender.prototype.findPath = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee() {
  return _regenerator2.default.wrap(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return this.pathfinder.crawl();

        case 2:
          _context.next = 4;
          return this.pathfinder.findPath(this.source_ledger, this.destination_ledger, this.destination_amount);

        case 4:
          this.subpayments = _context.sent;

        case 5:
        case 'end':
          return _context.stop();
      }
    }
  }, _callee, this);
}));

Sender.prototype.setupTransfers = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2() {
  var payments, firstPayment, firstTransfer, finalPayment, finalTransfer, expiryDate, executionCondition, transfers, i, transfer, _expiryDate;

  return _regenerator2.default.wrap(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          payments = this.subpayments;
          firstPayment = payments[0];
          firstTransfer = firstPayment.source_transfers[0];
          finalPayment = payments[payments.length - 1];
          finalTransfer = this.finalTransfer = finalPayment.destination_transfers[0];

          // Add start and endpoints in payment chain from user-provided payment
          // object

          firstTransfer.debits = [{
            amount: firstTransfer.credits[0].amount,
            account: this.source_account
          }];
          finalTransfer.credits = [{
            amount: finalTransfer.debits[0].amount,
            account: this.destination_account
          }];

          // Fill in remaining transfers data
          payments.reduce(function (left, right) {
            left.destination_transfers[0].credits = right.source_transfers[0].credits;
            right.source_transfers[0].debits = left.destination_transfers[0].debits;
            return right;
          });

          // Create final (rightmost) transfer
          finalTransfer.id = finalTransfer.ledger + '/transfers/' + uuid();
          finalTransfer.part_of_payment = finalPayment.id;
          expiryDate = new Date(Date.now() + finalTransfer.expiry_duration * 1000);

          finalTransfer.expires_at = expiryDate.toISOString();
          delete finalTransfer.expiry_duration;

          _context2.next = 15;
          return this.getCondition();

        case 15:
          executionCondition = _context2.sent;

          // Prepare remaining transfer objects
          transfers = this.transfers = [];

          for (i = payments.length - 1; i >= 0; i--) {
            transfer = payments[i].source_transfers[0];

            transfer.id = transfer.ledger + '/transfers/' + uuid();
            transfer.execution_condition = executionCondition;
            transfer.part_of_payment = payments[i].id;
            _expiryDate = new Date(Date.now() + transfer.expiry_duration * 1000);

            transfer.expires_at = _expiryDate.toISOString();
            delete transfer.expiry_duration;
            transfers.unshift(transfer);
          }

          // The first transfer must be submitted by us with authorization
          // TODO: This must be a genuine authorization from the user
          transfers[0].debits[0].authorized = true;

        case 19:
        case 'end':
          return _context2.stop();
      }
    }
  }, _callee2, this);
}));

Sender.prototype.getCondition = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3() {
  var finalTransfer, finalTransferRes, finalTransferStateRes;
  return _regenerator2.default.wrap(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          finalTransfer = this.finalTransfer;
          _context3.next = 3;
          return request.put(finalTransfer.id).send(finalTransfer);

        case 3:
          finalTransferRes = _context3.sent;

          if (!(finalTransferRes.status >= 400)) {
            _context3.next = 6;
            break;
          }

          throw new Error('Remote error: ' + finalTransferRes.status + ' ' + (0, _stringify2.default)(finalTransferRes.body));

        case 6:
          _context3.next = 8;
          return request.get(finalTransfer.id + '/state');

        case 8:
          finalTransferStateRes = _context3.sent;

          if (!(finalTransferStateRes.status >= 400)) {
            _context3.next = 11;
            break;
          }

          throw new Error('Remote error: ' + finalTransferStateRes.status + ' ' + (0, _stringify2.default)(finalTransferStateRes.body));

        case 11:
          return _context3.abrupt('return', {
            message_hash: hashJSON({
              id: finalTransfer.id,
              state: 'executed'
            }),
            signer: finalTransfer.ledger,
            public_key: finalTransferStateRes.body.public_key,
            type: finalTransferStateRes.body.type
          });

        case 12:
        case 'end':
          return _context3.stop();
      }
    }
  }, _callee3, this);
}));

// Propose + Prepare transfers
Sender.prototype.postTransfers = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee4() {
  var transfers, transfer, transferRes, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step;

  return _regenerator2.default.wrap(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          transfers = this.transfers;
          // TODO Theoretically we'd need to keep track of the signed responses
          // Prepare first transfer

          transfer = transfers[0];
          _context4.next = 4;
          return request.put(transfer.id).auth(this.source_username, this.source_password).send(transfer);

        case 4:
          transferRes = _context4.sent;

          if (!(transferRes.status >= 400)) {
            _context4.next = 7;
            break;
          }

          throw new Error('Remote error: ' + transferRes.status + ' ' + (0, _stringify2.default)(transferRes.body));

        case 7:

          // Propose other transfers
          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context4.prev = 10;
          _iterator = (0, _getIterator3.default)(transfers.slice(1));

        case 12:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context4.next = 23;
            break;
          }

          transfer = _step.value;
          _context4.next = 16;
          return request.put(transfer.id).send(transfer);

        case 16:
          transferRes = _context4.sent;

          if (!(transferRes.status >= 400)) {
            _context4.next = 19;
            break;
          }

          throw new Error('Remote error: ' + transferRes.status + ' ' + (0, _stringify2.default)(transferRes.body));

        case 19:

          // Update transfer state
          // TODO: Also keep copy of state signature
          transfer.state = transferRes.body.state;

        case 20:
          _iteratorNormalCompletion = true;
          _context4.next = 12;
          break;

        case 23:
          _context4.next = 29;
          break;

        case 25:
          _context4.prev = 25;
          _context4.t0 = _context4['catch'](10);
          _didIteratorError = true;
          _iteratorError = _context4.t0;

        case 29:
          _context4.prev = 29;
          _context4.prev = 30;

          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }

        case 32:
          _context4.prev = 32;

          if (!_didIteratorError) {
            _context4.next = 35;
            break;
          }

          throw _iteratorError;

        case 35:
          return _context4.finish(32);

        case 36:
          return _context4.finish(29);

        case 37:

          transfers.push(this.finalTransfer);

        case 38:
        case 'end':
          return _context4.stop();
      }
    }
  }, _callee4, this, [[10, 25, 29, 37], [30,, 32, 36]]);
}));

Sender.prototype.postPayments = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee5() {
  var payments, transfers, _i, payment, paymentRes;

  return _regenerator2.default.wrap(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          payments = this.subpayments;
          transfers = this.transfers;
          _i = 0;

        case 3:
          if (!(_i < payments.length)) {
            _context5.next = 16;
            break;
          }

          payment = payments[_i];

          payment.source_transfers = [transfers[_i]];
          payment.destination_transfers = [transfers[_i + 1]];

          _context5.next = 9;
          return request.put(payment.id).send(payment);

        case 9:
          paymentRes = _context5.sent;

          if (!(paymentRes.status >= 400)) {
            _context5.next = 12;
            break;
          }

          throw new Error('Remote error: ' + paymentRes.status + ' ' + (0, _stringify2.default)(paymentRes.body));

        case 12:

          transfers[_i + 1] = paymentRes.body.destination_transfers[0];

        case 13:
          _i++;
          _context5.next = 3;
          break;

        case 16:
        case 'end':
          return _context5.stop();
      }
    }
  }, _callee5, this);
}));

function hashJSON(json) {
  var str = (0, _stringify2.default)(json);
  var hash = crypto.createHash('sha512').update(str).digest('base64');
  return hash;
}

function toAccount(ledger, name) {
  return ledger + '/accounts/' + encodeURIComponent(name);
}

exports.default = Sender;