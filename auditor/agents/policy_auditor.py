from auditor.models.findings import Finding


class PolicyAuditor:

    def analyze(self, findings: list[Finding]) -> list[dict]:
        policy_findings = []

        for finding in findings:

            if finding.category == "INPUT_VALIDATION":
                policy_findings.append({
                    "severity": finding.severity,
                    "category": "POLICY_PRIVACY",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "The consent policy accepts an access type "
                        "without explicitly validating the value."
                    ),
                    "recommendation": (
                        "Require a valid and predefined access type "
                        "before granting or updating consent."
                    )
                })

            elif finding.category == "ACCESS_CONTROL":
                policy_findings.append({
                    "severity": finding.severity,
                    "category": "POLICY_PRIVACY",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "The contract does not visibly restrict "
                        "sensitive consent operations to authorized "
                        "participants."
                    ),
                    "recommendation": (
                        "Define and enforce authorized roles for "
                        "consent management operations."
                    )
                })

            elif finding.category == "TIMESTAMP":
                policy_findings.append({
                    "severity": finding.severity,
                    "category": "POLICY_PRIVACY",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "Consent validity is dependent on explicit "
                        "start and expiry timestamps."
                    ),
                    "recommendation": (
                        "Ensure every consent has a clearly defined "
                        "validity period and that expired consent "
                        "cannot provide access."
                    )
                })

        return policy_findings