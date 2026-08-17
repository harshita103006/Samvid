from pathlib import Path
import json

from web3 import Web3


RPC_URL = "http://127.0.0.1:8545"

ARTIFACT_PATH = Path(
    "artifacts/contracts/ConsentManager.sol/ConsentManager.json"
)


w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    raise RuntimeError("Could not connect to local blockchain")

account = w3.eth.accounts[0]

artifact = json.loads(
    ARTIFACT_PATH.read_text(encoding="utf-8")
)

abi = artifact["abi"]
bytecode = artifact["bytecode"]

contract = w3.eth.contract(
    abi=abi,
    bytecode=bytecode
)

print("Deploying ConsentManager...")
print("Deployer:", account)

tx_hash = contract.constructor().transact({
    "from": account
})

tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

print("Contract deployed successfully!")
print("Contract address:", tx_receipt.contractAddress)
print("Transaction hash:", tx_receipt.transactionHash.hex())