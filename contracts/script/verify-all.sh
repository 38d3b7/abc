#!/bin/bash
# Retries Blockscout verification for the hook-v2 stack until all pass.
# The hosted API rate-limits; 90s backoff between attempts, 15 attempts each.
cd "$(dirname "$0")/.."
BLOCKSCOUT_API_KEY=$(grep '^BLOCKSCOUT_API_KEY=' .env | cut -d= -f2- | tr -d '\r')
export BLOCKSCOUT_API_KEY
LIB=$(grep '^LIBRARY_ADDRESS=' .env | cut -d= -f2- | tr -d '\r')
export FOUNDRY_LIBRARIES="src/libraries/LGECalculationsLibrary.sol:LGECalculationsLibrary:$LIB"
URL="https://explorer.testnet.arc.io/api?apikey=$BLOCKSCOUT_API_KEY"

# Addresses from the latest broadcast run (single source of truth).
B=broadcast/Deploy.s.sol/5042002/run-latest.json
addr() { jq -r ".transactions[] | select(.contractName==\"$1\") | .contractAddress" "$B"; }

verify() {
  local addr="$1" path="$2"
  for i in $(seq 1 15); do
    out=$(forge verify-contract "$addr" "$path" --verifier blockscout \
      --verifier-url "$URL" --chain 5042002 \
      --compiler-version v0.8.26+commit.8a97fa7a 2>&1)
    if echo "$out" | grep -q 'Response: `OK`\|already verified'; then
      echo "[verify] OK $path"
      return 0
    fi
    echo "[verify] attempt $i failed for $path: $(echo "$out" | tail -1)"
    sleep 90
  done
  echo "[verify] GAVE UP on $path"
  return 1
}

verify "$LIB" src/libraries/LGECalculationsLibrary.sol:LGECalculationsLibrary
verify "$(addr HookMinerWrapper)" src/utils/HookMinerWrapper.sol:HookMinerWrapper
verify "$(addr VestingVault)" src/VestingVault.sol:VestingVault
verify "$(addr InferenceEscrow)" src/InferenceEscrow.sol:InferenceEscrow
verify "$(addr HookCreationCode)" src/HookCreationCode.sol:HookCreationCode
verify "$(addr LGEManager)" src/LGEManager.sol:LGEManager
echo "[verify] done"
