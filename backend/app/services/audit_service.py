import re

from app.models import AuditLog


def create_audit_log(
    db,
    actor_id=None,
    record_id=None,
    consent_id=None,
    blockchain_tx_hash=None,
    action="",
    purpose=None,
    result="SUCCESS",
    details=None
):
    audit_log = AuditLog(
        actor_id=actor_id,
        record_id=record_id,
        consent_id=consent_id,
        blockchain_tx_hash=blockchain_tx_hash,
        action=action,
        purpose=purpose,
        result=result,
        details=details
    )

    db.add(audit_log)

    return audit_log


class AuditService:

    def audit_contract(self, file_path):
        with open(file_path, "r", encoding="utf-8") as file:
            source = file.read()

        findings = []

        # Reentrancy risk
        if re.search(r"\.call\s*\{", source) or re.search(
            r"\.call\s*\(", source
        ):
            findings.append({
                "severity": "HIGH",
                "title": "Potential Reentrancy Risk",
                "description":(
                    "Low-level call usage was detected. "
                    "External calls should follow checks-effects-interactions "
                    "and use appropriate reentrancy protection."
                )
            })

        # tx.origin authentication
        if re.search(r"\btx\.origin\b", source):
            findings.append({
                "severity": "HIGH",
                "title": "tx.origin Usage",
                "description": (
                    "tx.origin is used in the contract. "
                    "It should generally not be used for authorization."
                )
            })

        # selfdestruct
        if re.search(r"\bselfdestruct\s*\(", source):
            findings.append({
                "severity": "CRITICAL",
                "title": "Selfdestruct Detected",
                "description": (
                    "The contract contains selfdestruct, which can "
                    "destroy contract code and transfer remaining Ether."
                )
            })

        # delegatecall
        if re.search(r"\.delegatecall\s*\(", source):
            findings.append({
                "severity": "HIGH",
                "title": "delegatecall Detected",
                "description": (
                    "delegatecall executes code in the caller's storage "
                    "context and can introduce serious security risks."
                )
            })

        # block.timestamp
        if re.search(r"\bblock\.timestamp\b", source):
            findings.append({
                "severity": "MEDIUM",
                "title": "block.timestamp Usage",
                "description": (
                    "block.timestamp is used. It should not be relied upon "
                    "for security-critical randomness or highly precise timing."
                )
            })

        # blockhash
        if re.search(r"\bblockhash\s*\(", source):
            findings.append({
                "severity": "MEDIUM",
                "title": "blockhash Usage",
                "description": (
                    "blockhash was detected. Blockchain block hashes should "
                    "not be treated as secure randomness."
                )
            })

        # unchecked blocks
        if re.search(r"\bunchecked\s*\{", source):
            findings.append({
                "severity": "MEDIUM",
                "title": "Unchecked Arithmetic",
                "description": (
                    "An unchecked block was detected. Arithmetic overflow "
                    "and underflow protections are disabled inside it."
                )
            })

        # Hardcoded private keys
        if re.search(
            r"(private[_\s-]*key|secret[_\s-]*key)\s*[:=]\s*[\"']",
            source,
            re.IGNORECASE
        ):
            findings.append({
                "severity": "CRITICAL",
                "title": "Potential Hardcoded Secret",
                "description": (
                    "A possible private key or secret was detected in "
                    "the Solidity source."
                )
            })

        # Floating pragma
        if re.search(r"pragma\s+solidity\s+\^", source):
            findings.append({
                "severity": "LOW",
                "title": "Floating Solidity Version",
                "description": (
                    "The contract uses a floating Solidity compiler version. "
                    "Pinning the compiler version improves reproducibility."
                )
            })

        # Missing visibility
        function_matches = re.findall(
            r"\bfunction\s+\w+\s*\([^)]*\)\s*(.*?)(?=\{|;)",
            source,
            re.DOTALL
        )

        functions_without_visibility = []

        for declaration in function_matches:
            if not re.search(
                r"\b(public|private|internal|external)\b",
                declaration
            ):
                functions_without_visibility.append(declaration.strip())

        if functions_without_visibility:
            findings.append({
                "severity": "LOW",
                "title": "Function Visibility Review",
                "description": (
                    "One or more functions could not be identified with "
                    "an explicit visibility modifier."
                )
            })

        severity_order = {
            "CRITICAL": 0,
            "HIGH": 1,
            "MEDIUM": 2,
            "LOW": 3
        }

        findings.sort(
            key=lambda finding: severity_order[finding["severity"]]
        )

        counts = {
            "CRITICAL": 0,
            "HIGH": 0,
            "MEDIUM": 0,
            "LOW": 0
        }

        for finding in findings:
            counts[finding["severity"]] += 1

        if counts["CRITICAL"] > 0:
            risk_level = "CRITICAL"
        elif counts["HIGH"] > 0:
            risk_level = "HIGH"
        elif counts["MEDIUM"] > 0:
            risk_level = "MEDIUM"
        elif counts["LOW"] > 0:
            risk_level = "LOW"
        else:
            risk_level = "LOW"

        return {
            "status": "completed",
            "risk_level": risk_level,
            "summary": {
                "total_findings": len(findings),
                "critical": counts["CRITICAL"],
                "high": counts["HIGH"],
                "medium": counts["MEDIUM"],
                "low": counts["LOW"]
            },
            "findings": findings
        }