'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _sender = require('./sender');

var _sender2 = _interopRequireDefault(_sender);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// params -
//   source_ledger
//   source_username
//   source_password
//   destination_ledger
//   destination_amount

exports.default = (function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(params) {
    var sender;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            sender = new _sender2.default(params);
            _context.next = 3;
            return sender.findPath();

          case 3:
            _context.next = 5;
            return sender.setupTransfers();

          case 5:
            _context.next = 7;
            return sender.postTransfers();

          case 7:
            _context.next = 9;
            return sender.postPayments();

          case 9:
            return _context.abrupt('return', sender.subpayments);

          case 10:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this);
  }));
  return function (_x) {
    return ref.apply(this, arguments);
  };
})();