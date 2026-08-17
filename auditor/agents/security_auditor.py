from auditor.models.findings import Finding


class SecurityAuditor:

    def analyze(self, findings: list[Finding]) -> list[dict]:
        security_findings = []

        for finding in findings:

            if finding.category == "ACCESS_CONTROL":
                security_findings.append({
                    "severity": finding.severity,
                    "category": "SECURITY",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "The function does not visibly enforce "
                        "caller authorization. An unauthorized "
                        "caller may potentially invoke this function."
                    ),
                    "recommendation": (
                        "Implement appropriate access control such as "
                        "owner-based or role-based authorization."
                    )
                })

            elif finding.category == "INPUT_VALIDATION":
                security_findings.append({
                    "severity": finding.severity,
                    "category": "SECURITY",
                    "function": finding.function,
                    "title": finding.title,
                    "analysis": (
                        "Insufficient input validation may allow "
                        "invalid values to be stored or processed."
                    ),
                    "recommendation": finding.recommendation
                })

        return security_findings