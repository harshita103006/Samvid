from auditor.analyzers.solidity_analyzer import SolidityAnalyzer
from auditor.agents.security_auditor import SecurityAuditor
from auditor.agents.consent_auditor import ConsentAuditor
from auditor.agents.policy_auditor import PolicyAuditor
from auditor.agents.audit_orchestrator import AuditOrchestrator


class AuditService:

    def __init__(self):
        self.analyzer = SolidityAnalyzer()
        self.security_auditor = SecurityAuditor()
        self.consent_auditor = ConsentAuditor()
        self.policy_auditor = PolicyAuditor()
        self.orchestrator = AuditOrchestrator()

    def audit_contract(self, contract_path: str) -> dict:

        findings = self.analyzer.analyze(contract_path)

        security_findings = (
            self.security_auditor.analyze(findings)
        )

        consent_findings = (
            self.consent_auditor.analyze(findings)
        )

        policy_findings = (
            self.policy_auditor.analyze(findings)
        )

        report = self.orchestrator.generate_report(
            security_findings,
            consent_findings,
            policy_findings
        )

        return report