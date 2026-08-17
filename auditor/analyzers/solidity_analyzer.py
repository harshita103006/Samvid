import re
from pathlib import Path

from auditor.models.findings import Finding


class SolidityAnalyzer:

    def analyze(self, contract_path: str) -> list[Finding]:
        path = Path(contract_path)

        if not path.exists():
            raise FileNotFoundError(
                f"Contract not found: {contract_path}"
            )

        source = path.read_text(encoding="utf-8")

        findings = []

        findings.extend(
            self._check_missing_access_control(source)
        )

        findings.extend(
            self._check_empty_string_validation(source)
        )

        findings.extend(
            self._check_state_changing_check_functions(source)
        )

        findings.extend(
            self._check_timestamp_usage(source)
        )

        return findings

    def _check_missing_access_control(
        self,
        source: str
    ) -> list[Finding]:

        findings = []

        sensitive_functions = [
            "createConsent",
            "updateConsent",
            "revokeConsent"
        ]

        for function_name in sensitive_functions:

            pattern = (
                rf"function\s+{function_name}\s*\("
                rf"[\s\S]*?\)\s*external"
            )

            match = re.search(pattern, source)

            if match:
                function_block = match.group(0)

                if (
                    "onlyOwner" not in function_block
                    and "msg.sender" not in function_block
                    and "require(" not in function_block
                ):
                    findings.append(
                        Finding(
                            severity="HIGH",
                            category="ACCESS_CONTROL",
                            function=function_name,
                            title="Missing caller authorization",
                            description=(
                                f"{function_name} does not visibly enforce "
                                "caller authorization."
                            ),
                            recommendation=(
                                "Restrict the function to an authorized "
                                "owner or role."
                            )
                        )
                    )

        return findings

    def _check_empty_string_validation(
        self,
        source: str
    ) -> list[Finding]:

        findings = []

        function_name = "updateConsent"

        pattern = (
            rf"function\s+{function_name}\s*\("
            rf"[\s\S]*?\)\s*external\s*\{{([\s\S]*?)\n\s*\}}"
        )

        match = re.search(pattern, source)

        if match:
            body = match.group(1)

            if (
                "accessType" in body
                and "bytes(accessType).length" not in body
            ):
                findings.append(
                    Finding(
                        severity="MEDIUM",
                        category="INPUT_VALIDATION",
                        function=function_name,
                        title="Access type is not validated",
                        description=(
                            "updateConsent accepts an access type without "
                            "checking that it is non-empty."
                        ),
                        recommendation=(
                            "Validate that accessType contains a "
                            "non-empty value."
                        )
                    )
                )

        return findings

    def _check_state_changing_check_functions(
        self,
        source: str
    ) -> list[Finding]:

        findings = []

        pattern = (
            r"function\s+(\w*check\w*)\s*\("
            r"[\s\S]*?\)\s*external"
        )

        matches = re.finditer(
            pattern,
            source,
            re.IGNORECASE
        )

        for match in matches:

            function_name = match.group(1)

            function_start = match.start()

            next_function = source.find(
                "function ",
                function_start + 1
            )

            if next_function == -1:
                function_block = source[function_start:]
            else:
                function_block = source[
                    function_start:next_function
                ]

            if (
                "view" not in function_block[:300]
                and "pure" not in function_block[:300]
                and "=" in function_block
            ):
                findings.append(
                    Finding(
                        severity="LOW",
                        category="STATE_CHANGE",
                        function=function_name,
                        title="Check function may modify state",
                        description=(
                            f"{function_name} is named like a check "
                            "function but is not declared view/pure "
                            "and contains state-assignment logic."
                        ),
                        recommendation=(
                            "Consider separating read-only validation "
                            "from state-changing operations."
                        )
                    )
                )

        return findings

    def _check_timestamp_usage(
        self,
        source: str
    ) -> list[Finding]:

        findings = []

        if "block.timestamp" in source:
            findings.append(
                Finding(
                    severity="INFO",
                    category="TIMESTAMP",
                    function=None,
                    title="Contract relies on block timestamp",
                    description=(
                        "Consent validity and expiry depend on "
                        "block.timestamp."
                    ),
                    recommendation=(
                        "Ensure timestamp-based conditions are used only "
                        "for coarse validity windows and are not relied "
                        "upon for precision-sensitive logic."
                    )
                )
            )

        return findings