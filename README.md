# Five Bells Sender [![npm][npm-image]][npm-url] [![circle][circle-image]][circle-url] [![codecov][codecov-image]][codecov-url]

[npm-image]: https://img.shields.io/npm/v/five-bells-sender.svg?style=flat
[npm-url]: https://npmjs.org/package/five-bells-sender
[circle-image]: https://circleci.com/gh/interledgerjs/five-bells-sender.svg?style=shield
[circle-url]: https://circleci.com/gh/interledgerjs/five-bells-sender
[codecov-image]: https://codecov.io/gh/interledgerjs/five-bells-sender/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/interledgerjs/five-bells-sender

> A reference implementation of an [Interledger](https://interledger.org) sending client

You can see the visualization in action as part of the [`five-bells-demo`](https://github.com/interledgerjs/five-bells-demo)!

## Example: Universal Mode

``` js
    send({
      sourceAccount:      'http://localhost:3001/accounts/alice',
      // Using Basic-Auth
      sourcePassword:     'alice',
      // Using TLS Client Certificate Authentication
      sourceKey:          fs.readFileSync('./key.pem'),
      sourceCert:         fs.readFileSync('./cert.pem'),
      destinationAccount: 'http://localhost:3002/accounts/alice',
      destinationAmount:  '1',
      // sourceMemo:      { noteToSelf: 'Payment for the other alice' },
      // destinationMemo: { invoice: '614a67a4-26b4-40f0-a798-bcca35c6e1dd' },
      //additionalInfo:   { sourceAccount: accountUri },
      //ca:               fs.readFileSYnc('./ca.pem')
    }).then(function() {
      console.log('success')
    })
```

## Example: Universal Mode with fixed source amount

``` js
    send({
      sourceAccount:      'http://localhost:3001/accounts/alice',
      // Using Basic-Auth
      sourcePassword:     'alice',
      // Using TLS Client Certificate Authentication
      sourceKey:           fs.readFileSync('./key.pem'),
      sourceCert:          fs.readFileSync('./cert.pem'),
      destinationAccount: 'http://localhost:3002/accounts/alice',
      sourceAmount:       '1',
      //additionalInfo:   { sourceAccount: accountUri },
      //ca:               fs.readFileSYnc('./ca.pem')
}).then(function() {
      console.log('success')
    })
```

## Example: Atomic Mode

``` js
    send({
      sourceAccount:      'http://localhost:3001/accounts/alice',
      // Using Basic-Auth
      sourcePassword:     'alice',
      // Using TLS Client Certificate Authentication
      sourceKey:          fs.readFileSync('./key.pem'),
      sourceCert:          fs.readFileSync('./cert.pem'),
      destinationAccount: 'http://localhost:3002/accounts/bob',
      destinationAmount:  '1',
      notary:             'http://localhost:6001',
      notaryPublicKey:    'QD/UBKyptEXcu6mZThsfnE/2ZZGsrpokKqaLMUrTUqo=',
      //receiptCondition: { message_hash, signer, public_key, type },
      //additionalInfo:   { sourceAccount: accountUri }
      //ca:               fs.readFileSYnc('./ca.pem')
    }).then(function() {
      console.log('success')
    })
```

## Browser Support

This library can be compiled with [Babel](https://babeljs.io/) using the command `npm run build`. The compiled files will be in the `babel/` folder.
