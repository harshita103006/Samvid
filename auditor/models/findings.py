from dataclasses import dataclass


@dataclass
class Finding:
    severity: str
    category: str
    function: str | None
    title: str
    description: str
    recommendation: str