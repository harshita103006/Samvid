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