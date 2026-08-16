from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import Consent, User
from app.services.blockchain_service import blockchain_service
from app.services.audit_service import create_audit_log
router = APIRouter(
    prefix="/consents",
    tags=["Consents"]
)


@router.put("/{consent_id}")
def update_consent(
    consent_id: int,
    access_type: str,
    expiry_time: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can modify consent"
        )

    consent = db.query(Consent).filter(
        Consent.id == consent_id,
        Consent.owner_id == current_user.id
    ).first()

    if not consent:
        raise HTTPException(
            status_code=404,
            detail="Consent not found"
        )

    if consent.status != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail="Only active consent can be modified"
        )

    if not access_type.strip():
        raise HTTPException(
            status_code=400,
            detail="Access type is required"
        )

    if expiry_time <= consent.start_time.timestamp():
        raise HTTPException(
            status_code=400,
            detail="Expiry time must be after consent start time"
        )

    try:
        blockchain_result = (
            blockchain_service.update_consent_on_chain(
                consent.blockchain_consent_id,
                access_type,
                expiry_time
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain consent update failed: {str(exc)}"
        )

    consent.access_type = access_type
    consent.expiry_time = (
        __import__("datetime").datetime.fromtimestamp(
            expiry_time,
            tz=__import__("datetime").timezone.utc
        )
    )
    consent.blockchain_tx_hash = blockchain_result["transaction_hash"]

    create_audit_log(
        db=db,
        actor_id=current_user.id,
        record_id=consent.record_id,
        consent_id=consent.id,
        blockchain_tx_hash=consent.blockchain_tx_hash,
        action="CONSENT_UPDATED",
        purpose=consent.purpose,
        result="SUCCESS",
        details="Consent access type or expiry updated on blockchain"
    )

    db.commit()
    db.refresh(consent)
    return {
        "message": "Consent updated successfully",
        "consent_id": consent.id,
        "blockchain_consent_id": consent.blockchain_consent_id,
        "blockchain_tx_hash": consent.blockchain_tx_hash,
        "access_type": consent.access_type,
        "expiry_time": consent.expiry_time,
        "status": consent.status
    }


@router.get("")
def get_my_consents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can view consents"
        )

    consents = db.query(Consent).filter(
        Consent.owner_id == current_user.id
    ).order_by(
        Consent.created_at.desc()
    ).all()

    current_time = datetime.now(timezone.utc)

    for consent in consents:
        if (
            consent.status == "ACTIVE"
            and current_time > consent.expiry_time
        ):
            consent.status = "EXPIRED"

            create_audit_log(
                db=db,
                actor_id=current_user.id,
                record_id=consent.record_id,
                consent_id=consent.id,
                blockchain_tx_hash=consent.blockchain_tx_hash,
                action="CONSENT_EXPIRED",
                purpose=consent.purpose,
                result="SUCCESS",
                details="Consent expired after reaching its expiry time"
            )

    db.commit()

    return [
        {
            "consent_id": consent.id,
            "organization_id": consent.organization_id,
            "record_id": consent.record_id,
            "purpose": consent.purpose,
            "access_type": consent.access_type,
            "start_time": consent.start_time,
            "expiry_time": consent.expiry_time,
            "status": consent.status,
            "blockchain_consent_id": consent.blockchain_consent_id,
            "blockchain_tx_hash": consent.blockchain_tx_hash,
            "created_at": consent.created_at,
            "revoked_at": consent.revoked_at
        }
        for consent in consents
    ]