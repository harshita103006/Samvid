class AuditOrchestrator:

    def generate_report(
        self,
        security_findings: list[dict],
        consent_findings: list[dict],
        policy_findings: list[dict]
    ) -> dict:

        all_findings = (
            security_findings
            + consent_findings
            + policy_findings
        )

        unique_findings = {}

        for finding in all_findings:

            key = (
                finding.get("function"),
                finding.get("title")
            )

            if key not in unique_findings:

                unique_findings[key] = {
                    "severity": finding.get("severity"),
                    "function": finding.get("function"),
                    "title": finding.get("title"),
                    "description": finding.get("analysis"),
                    "recommendation": finding.get("recommendation"),
                    "perspectives": []
                }

            unique_findings[key]["perspectives"].append(
                {
                    "category": finding.get("category"),
                    "analysis": finding.get("analysis")
                }
            )

        final_findings = list(unique_findings.values())

        severity_counts = {
            "HIGH": 0,
            "MEDIUM": 0,
            "LOW": 0,
            "INFO": 0
        }

        for finding in final_findings:

            severity = finding.get("severity")

            if severity in severity_counts:
                severity_counts[severity] += 1

        return {
            "total_findings": len(final_findings),
            "severity_summary": severity_counts,
            "findings": final_findings
        }