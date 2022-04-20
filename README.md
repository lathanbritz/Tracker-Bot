# TRACK PRICE VIA ORACLE FEED
From oracle published at https://github.com/lathanbritz/XRP-Oracles

This code is setup to work with https://issue.cash/ USD it can be altered with work with other currency pairs from issue cache or something completely different, but that will require that pair feeds through via the oracle.

The BOT will the buy/sell everything in its path to get to that price. You need to keep the bot funded use the yarn fund option to fun the bot it needs a decent amount of TESTNET XRP at times....


# Setup
Copy .env.sample to .env and add a testnet wallet you have genorated. Now run the fund bot and let that run a while it creates new wallets and transfers those funds to your created wallet.

Once that has a decent amount of funds start the tracker and let it run, it uses the price that is published into the testnet via an oracle service to buy/sell to. As that price shifts it the buy/sell's.

