from auditor.models.findings import Finding


class ConsentAuditor:

    def analyze(self, findings: list[Finding]) -> list[dict]:
        consent_findings = []

        for finding in findings:

            if finding.category == "INPUT_VALIDATION":
                consent_findings.append({
                    "severity": finding.severity,
                    "category": "CONSENT_LOGIC",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "The consent update logic accepts an access type "
                        "without explicitly validating that the value "
                        "is non-empty."
                    ),
                    "recommendation": (
                        "Validate accessType before updating the consent."
                    )
                })

            elif finding.category == "STATE_CHANGE":
                consent_findings.append({
                    "severity": finding.severity,
                    "category": "CONSENT_LOGIC",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "The consent checking function can change the "
                        "stored consent state when the consent expires."
                    ),
                    "recommendation": (
                        "Consider separating consent validation from "
                        "state-changing expiry handling."
                    )
                })

            elif finding.category == "TIMESTAMP":
                consent_findings.append({
                    "severity": finding.severity,
                    "category": "CONSENT_LOGIC",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "Consent validity depends on blockchain "
                        "timestamps for start and expiry conditions."
                    ),
                    "recommendation": (
                        "Ensure start and expiry timestamps are validated "
                        "consistently throughout the consent lifecycle."
                    )
                })

        return consent_findings