from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import AuditLog, User

router = APIRouter(
    prefix="/audit-logs",
    tags=["Auditor"]
)


@router.get("")
def get_audit_logs(
    result: str | None = None,
    record_id: int | None = None,
    actor_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "AUDITOR":
        raise HTTPException(
            status_code=403,
            detail="Only auditors can view audit logs"
        )

    query = db.query(AuditLog)

    if result:
        query = query.filter(
            AuditLog.result == result.upper()
        )

    if record_id is not None:
        query = query.filter(
            AuditLog.record_id == record_id
        )

    if actor_id is not None:
        query = query.filter(
            AuditLog.actor_id == actor_id
        )

    logs = query.order_by(
        AuditLog.timestamp.desc()
    ).all()

    return [
        {
            "id": log.id,
            "actor_id": log.actor_id,
            "record_id": log.record_id,
            "consent_id": log.consent_id,
            "blockchain_tx_hash": log.blockchain_tx_hash,
            "action": log.action,
            "purpose": log.purpose,
            "result": log.result,
            "timestamp": log.timestamp,
            "details": log.details
        }
        for log in logs
    ]