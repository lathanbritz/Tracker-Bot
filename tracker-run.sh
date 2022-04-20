#!/usr/bin/env bash

cd "`dirname "$0"`"

export DEBUG=price-tracker*

source ./.env
node ./src/bots/testnet/price-tracker.js &> ./log-tracker.txt