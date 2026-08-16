import json
from pathlib import Path

from web3 import Web3

from app.core.config import settings


BASE_DIR = Path(__file__).resolve().parents[2]
ABI_PATH = BASE_DIR / "app" / "blockchain_abi.json"


class BlockchainService:

    def __init__(self):
        self.w3 = Web3(
            Web3.HTTPProvider(settings.blockchain_rpc_url)
        )

        if not self.w3.is_connected():
            raise RuntimeError(
                "Could not connect to blockchain RPC"
            )

        abi = json.loads(
            ABI_PATH.read_text(encoding="utf-8")
        )

        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(
                settings.contract_address
            ),
            abi=abi
        )

        self.account = Web3.to_checksum_address(
            self.w3.eth.account.from_key(
                settings.blockchain_private_key
            ).address
        )

    def get_blockchain_info(self):
        return {
            "connected": self.w3.is_connected(),
            "chain_id": self.w3.eth.chain_id,
            "account": self.account,
            "contract_address": self.contract.address
        }

    def create_consent_on_chain(
        self,
        owner_id: int,
        organization_id: int,
        record_id: int,
        purpose: str,
        access_type: str,
        start_time: int,
        expiry_time: int
    ):
        transaction = self.contract.functions.createConsent(
            owner_id,
            organization_id,
            record_id,
            purpose,
            access_type,
            start_time,
            expiry_time
        ).build_transaction({
            "from": self.account,
            "nonce": self.w3.eth.get_transaction_count(
                self.account
            ),
            "chainId": self.w3.eth.chain_id
        })

        signed_transaction = self.w3.eth.account.sign_transaction(
            transaction,
            settings.blockchain_private_key
        )

        tx_hash = self.w3.eth.send_raw_transaction(
            signed_transaction.raw_transaction
        )

        receipt = self.w3.eth.wait_for_transaction_receipt(
            tx_hash
        )

        events = self.contract.events.ConsentCreated().process_receipt(
            receipt
        )

        if not events:
            raise RuntimeError(
                "ConsentCreated event not found in transaction"
            )

        blockchain_consent_id = events[0]["args"]["consentId"]

        return {
            "consent_id": blockchain_consent_id,
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber
        }

    def update_consent_on_chain(
                self,
                consent_id: int,
                access_type: str,
                expiry_time: int
            ):
                transaction = self.contract.functions.updateConsent(
                    consent_id,
                    access_type,
                    expiry_time
                ).build_transaction({
                    "from": self.account,
                    "nonce": self.w3.eth.get_transaction_count(
                        self.account
                    ),
                    "chainId": self.w3.eth.chain_id
                })

                signed_transaction = self.w3.eth.account.sign_transaction(
                    transaction,
                    settings.blockchain_private_key
                )

                tx_hash = self.w3.eth.send_raw_transaction(
                    signed_transaction.raw_transaction
                )

                receipt = self.w3.eth.wait_for_transaction_receipt(
                    tx_hash
                )

                return {
                    "transaction_hash": tx_hash.hex(),
                    "block_number": receipt.blockNumber
                }
    
    def revoke_consent_on_chain(
        self,
        consent_id: int
    ):
        transaction = self.contract.functions.revokeConsent(
            consent_id
        ).build_transaction({
            "from": self.account,
            "nonce": self.w3.eth.get_transaction_count(
                self.account
            ),
            "chainId": self.w3.eth.chain_id
        })

        signed_transaction = self.w3.eth.account.sign_transaction(
            transaction,
            settings.blockchain_private_key
        )

        tx_hash = self.w3.eth.send_raw_transaction(
            signed_transaction.raw_transaction
        )

        receipt = self.w3.eth.wait_for_transaction_receipt(
            tx_hash
        )

        return {
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber
        }
    def get_consent_from_chain(self, consent_id: int):
        consent = self.contract.functions.getConsent(
            consent_id
        ).call()

        return consent

blockchain_service = BlockchainService()