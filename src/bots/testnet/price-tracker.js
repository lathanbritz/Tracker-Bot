'use strict'

const { XrplClient } = require('xrpl-client')
const {LiquidityCheck} = require('xrpl-orderbook-reader')
const Client = require('rippled-ws-client')
const lib = require('xrpl-accountlib')
const debug = require('debug') 
const dotenv = require('dotenv')

const log = debug('price-tracker:main')

class main {
    constructor () {
        dotenv.config()
        const client = new XrplClient(["wss://s.altnet.rippletest.net:51233"])
        const drop = 1_000_000

        const trades = []
        
        let sequence = null
        let balance = null
        let account_info = null
        let account_lines = null
        let offers = null
        let trustline = 'rwtDvu9QDfCskWuyE2TSEt3s56RbiWUKJN'

        Object.assign(this, {
            async run() {
                log('start')
                await this.createWallet()
                this.oracleFeed()
                //this.removeOffers()
                this.listenOracle()
            },
            async createWallet() {
                log('create wallet')
                log(process.env.TRACK_CLASSIC_ADDRESS)
                await client.ready()
                
                const { account_data } = await client.send({ command: 'account_info', account: process.env.TRACK_CLASSIC_ADDRESS })
                
                sequence = account_data.Sequence
                log('sequence: ' + sequence)
                account_info = account_data
                log('account_info')
                log(account_info)

                balance = account_info.Balance
                log('account has balance: ' + balance)

                account_lines = await this.getAccountLines()
                let find_trustline = false
                for (let index = 0; index < account_lines.lines.length; index++) {
                    const element = account_lines.lines[index]
                    log(element)
                    if (element.account == trustline && element.currency == 'USD') {
                        find_trustline = true
                    }
                }
                if (find_trustline == false){
                    const trust = await this.addTrustline('USD')
                }
                log('wallet setup')
            },
            async oracleFeed(oracles = ['rURUD69hsgJYtrt1xJ4drhs45qRirg36CU']) {
                // addresses are oracle-sam and xumm oracle
                const request = {
                  'command': 'subscribe',
                  'accounts': oracles
                }               
                let response = await client.send(request)
            },
            listenOracle() {
                client.on('message', (event) => {
                    this.getOracleData(event)
                })
            },
            getOracleData(event) {
                if (!('engine_result' in event)) { return }
                if (!('transaction' in event)) { return }
                if (!('TransactionType' in event.transaction)) { return }
                if (!('Memos' in event.transaction)) { return }
                if (!('Account' in event.transaction)) { return }
                if (!('LimitAmount' in event.transaction)) { return }
        
                if (event.engine_result != 'tesSUCCESS') { return }
                if (event.transaction.TransactionType != 'TrustSet') { return }
        
                const results = {
                  limited_amount: event.transaction.LimitAmount, 
                  ledger_index: event.ledger_index,
                  oracle: event.transaction.Account,
                  'meta': []
                }
                for (var i = 0; i < event.transaction.Memos.length; i++) {
                  const result = { source: '', rates: [] }
        
                  const sMemoType = Buffer.from(event.transaction.Memos[i].Memo.MemoType, 'hex').toString('utf8').split(':')
                  const sMemoData = Buffer.from(event.transaction.Memos[i].Memo.MemoData, 'hex').toString('utf8').split(';')
        
                  if (sMemoType[0] != 'rates') { break }
                  result.source = sMemoType[1]
                  for (var j = 0; j < sMemoData.length; j++) {
                    result.rates.push(sMemoData[j])
                  }
                  
                  results.meta.push(result)
                }

                if (results.limited_amount.currency == 'USD') {
                    log(results)
                    this.slicePrice(results.limited_amount.value, results.limited_amount.currency)
                }
            },
            async checkConnection() {
                const state = client.getState()
                log(state)

                if (state.online == false) {
                    await client.reinstate()
                }
            },
            async getAccountLines() {
                account_lines = await client.send({ command: 'account_lines', account: process.env.TRACK_CLASSIC_ADDRESS })
                log('account_lines')
                log(account_lines)

                return account_lines
            },
            async removeOffers() {
                offers = await this.getOffers()
                for (let index = 0; index < offers.offers.length; index++) {
                    const element = offers.offers[index]
                    this.offerCancel(element.seq)
                }
            },
            async getOffers() {
                offers = await client.send({
                    command: 'account_offers',
                    account: process.env.CLASSIC_ADDRESS,
                })
                log('offers')

                for (let index = 0; index < offers.offers.length; index++) {
                    const element = offers.offers[index]
                    log(element)
                }
                return offers
            },
            async offerCancel(OfferSequence) {
                if (OfferSequence == null) { return }
                const offer_cancel_tx = {
                    TransactionType: 'OfferCancel',
                    Account: process.env.TRACK_CLASSIC_ADDRESS,
                    OfferSequence: OfferSequence
                }

                return await this.signTx(offer_cancel_tx)
            },
            async signTx(tx) {
                tx.Sequence = sequence
                sequence++
                tx.Fee = '10'
                
                const keypair = lib.derive.familySeed(process.env.TRACK_SEED)
                const {signedTransaction} = lib.sign(tx, keypair)
                const Signed = await client.send({ command: 'submit', 'tx_blob': signedTransaction })
                log({Signed})
                return Signed
            },
            async getBookOffers(symbol, limit = 10) {
                const tx = {
                    id: 4,
                    command: 'book_offers',
                    taker: process.env.TRACK_CLASSIC_ADDRESS,
                    taker_gets: {
                      currency: 'XRP'
                    },
                    taker_pays: {
                      currency: 'USD',
                      issuer: trustline
                    },
                    limit: limit
                }
                
                const sells = await client.send(tx)

                const book0 = []
                for (let index = 0; index < sells.offers.length; index++) {
                    const element = sells.offers[index]
                    element.rate = (element.TakerPays.value / (element.TakerGets / drop)).toFixed(12)
                    book0.push(element)
                }

                const book1 = []
                const tx2 = {
                    id: 4,
                    command: 'book_offers',
                    taker: process.env.TRACK_CLASSIC_ADDRESS,
                    taker_pays: {
                      currency: 'XRP'
                    },
                    taker_gets: {
                      currency: 'USD',
                      issuer: trustline
                    },
                    limit: limit
                }
                const buys = await client.send(tx2)

                for (let index = 0; index < buys.offers.length; index++) {
                    const element = buys.offers[index]
                    element.rate = ((element.TakerGets.value) / (element.TakerPays / drop)).toFixed(12)
                    book1.push(element)
                }

                return { books:  [book0, book1] }
            },
            async liquidityBook2(price, symbol) {
                const Liquidity = await this.getBookOffers(symbol)
                log('BookOffers[0] Buy: ' + Liquidity.books[0][0].rate + ':' + symbol)
                //log(Liquidity.books[0][0])
                log('BookOffers[0] Sell: ' + Liquidity.books[1][0].rate + ':' + symbol)
                //log(Liquidity.books[1][0])

                // log('============================ BUY BOOK')
                const buyBook = Liquidity.books[0]
                if (buyBook.length > 0) {
                    for (let index = 0; index < buyBook.length; index++) {
                        const element = buyBook[index]
                        // buy
                        // log('buy rate: ' + element.rate)
                        // log('price: ' + price)

                        if (price > (element.rate * 1)) {
                            
                            log('Buying for value first item buy book')
                            log(element)
                            const offer_result = await this.offerCreate(element.TakerGets, element.TakerPays, 'RecieveTaker')
                            if (offer_result == null) {
                                log('BOT ERROR ~ offer_result is null')
                            }
                        }
                    }
                }
                // log('============================ SELL BOOK')
                const sellBook = Liquidity.books[1]
                // log(sellBook)
                if (sellBook.length > 0) {
                    // log('in sell: ' + sellBook.length)
                    for (let index = 0; index < sellBook.length; index++) {
                        const element = sellBook[index]
                        // sell
                        // log('sell rate: ' + element.rate)
                        // log('price: ' + price)

                        if (price < (element.rate * 1)) {
                            
    
                            log('Selling for value of first item sell book')
                            log(element)
                            const offer_result = await this.offerCreate(element.TakerGets, element.TakerPays, 'SendTaker')
                            if (offer_result == null) {
                                log('BOT ERROR ~ offer_result is null')
                            }
                        }
                    }
                }
            },
            async offerCreate(RecieveTaker, SendTaker, AdditionSide, flag = 'tfImmediateOrCancel') {
                // https://xrpl.org/offercreate.html
                log('offerCreate')
                
                const flags = {
                    tfPassive: 65536,
                    tfImmediateOrCancel: 131072,
                    tfFillOrKill: 262144,
                    tfSell: 524288
                }
                if (!(flag) in flags) {
                    log('invalid flag specced in offerCreate')
                    return
                }
                if (AdditionSide !== 'RecieveTaker' && AdditionSide !== 'SendTaker') {
                    log('invalid AdditionSide specced in offerCreate')
                    return
                }
                
                // Issue here is XRPL IOU's are represented by floating point numbers.
                // That means there can basically never be a 1 to 1 there will always be some rounding.
                // What we do is offer a max of 1% extra to the offer (SendTaker).

                let percentToGet = 0.01

                if (typeof SendTaker === 'object' && AdditionSide == 'RecieveTaker') {
                    let percent = (percentToGet / 100) * SendTaker.value
                    SendTaker.value = (((SendTaker.value * 1) + percent)).toFixed(6).toString()
                }
                if (typeof SendTaker !== 'object' && AdditionSide == 'RecieveTaker') {
                    let percent = (percentToGet / 100) * SendTaker
                    SendTaker = Math.trunc(((SendTaker * 1) + percent)).toString()
                }
                

                if (typeof SendTaker === 'object' && AdditionSide == 'SendTaker') {
                    let percent = (percentToGet / 100) * SendTaker.value
                    SendTaker.value = (((SendTaker.value * 1) + percent)).toFixed(6).toString()
                }
                if (typeof SendTaker !== 'object' && AdditionSide == 'SendTaker') {
                    let percent = (percentToGet / 100) * SendTaker
                    SendTaker = Math.trunc(((SendTaker * 1) + percent)).toString()
                }
        
                let offer_create_tx = {
                    TransactionType: 'OfferCreate',
                    Account: process.env.TRACK_CLASSIC_ADDRESS,
                    TakerPays: RecieveTaker,
                    TakerGets: SendTaker,
                    Flags: flags[flag]
                }
                
                log(offer_create_tx)
                
                const offer = await this.signTx(offer_create_tx)
                if (offer.engine_result != 'tesSUCCESS') { return }
                if (!('Sequence' in offer.tx_json)) { return }

                return offer.tx_json
            },
            async addTrustline(currency) {
                const trust_set_tx = {
                    TransactionType: 'TrustSet',
                    Account: process.env.TRACK_CLASSIC_ADDRESS,
                    LimitAmount: {
                        currency: 'USD',
                        issuer: trustline,
                        // Value for the new IOU - 10_000_000_000 - is arbitarily chosen.
                        value: '10000000000',
                    },
                }
                
                return await this.signTx(trust_set_tx)
            },
            async slicePrice(price, symbol = 'USD') {
                try {
                    await this.checkConnection()
                    log('price slice: ' + price + ':' + symbol)
                    this.liquidityBook2(price, symbol)
                } catch (error) {
                    log(error)
                }
            }            
        })
    }
}
module.exports = main

const app = new main()
app.run()