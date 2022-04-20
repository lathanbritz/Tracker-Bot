'use strict'
const xrpl = require("xrpl")
const { Wallet } = require("xrpl")
const debug = require('debug') 
const dotenv = require('dotenv')

const log = debug('fund-ballencer:main')

class main {
    constructor () {
        const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
        dotenv.config()

        let wallet = null
        Object.assign(this, {
            async run() {
                let count = 0
                while (count < 100) {
                    await this.createWallet()
                    count++
                }
            },
            async createWallet() {
                await client.connect()
                const { wallet } = await client.fundWallet()
                log('wallet setup')
                log(wallet.classicAddress)

                const account_data = await client.request({
                    id: 2,
                    command: 'account_info',
                    account: wallet.classicAddress,
                    strict: true,
                    ledger_index: 'current',
                    queue: true
                })
                
                log('account')
                log(account_data)

                const payment_tx = {
                    TransactionType: 'Payment',
                    Account: wallet.classicAddress,
                    Destination: process.env.TRACK_CLASSIC_ADDRESS,
                    Amount: '899999000',
                    Fee: '12'
                }
                log(payment_tx)
                const result = await client.submitAndWait(payment_tx, {
                    wallet: wallet,
                })
                log(result)
            }
        })
    }
}
module.exports = main

const app = new main()
app.run()