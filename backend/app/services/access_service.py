from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Organization, Consent, Record, User
from app.services.blockchain_service import blockchain_service


def verify_record_access(
    record: Record,
    current_user: User,
    db: Session
):
    """
    Verify whether the current user is authorized to access a record.

    Returns the active Consent for organizations.
    Returns None for the record owner.
    """

    # DATA OWNER
    if current_user.role == "DATA_OWNER":

        if record.owner_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You do not own this record"
            )

        return None

    # ORGANIZATION
    if current_user.role != "ORGANIZATION":
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access this record"
        )

    organization = db.query(Organization).filter(
        Organization.email == current_user.email
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization profile not found"
        )

    consent = db.query(Consent).filter(
        Consent.organization_id == organization.id,
        Consent.record_id == record.id,
        Consent.status == "ACTIVE"
    ).order_by(
        Consent.created_at.desc()
    ).first()

    if not consent:
        raise HTTPException(
            status_code=403,
            detail="No active consent found for this record"
        )

    if consent.blockchain_consent_id is None:
        raise HTTPException(
            status_code=403,
            detail="Blockchain consent reference missing"
        )

    try:
        blockchain_consent = (
            blockchain_service.get_consent_from_chain(
                consent.blockchain_consent_id
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain consent verification failed: {str(exc)}"
        )

    (
        owner_id,
        organization_id,
        blockchain_record_id,
        purpose,
        access_type,
        start_time,
        expiry_time,
        blockchain_status
    ) = blockchain_consent

    current_timestamp = int(
        datetime.now(timezone.utc).timestamp()
    )

    # 0 = ACTIVE
    # 1 = REVOKED
    # 2 = EXPIRED

    if blockchain_status != 0:
        raise HTTPException(
            status_code=403,
            detail="Blockchain consent is not active"
        )

    if owner_id != record.owner_id:
        raise HTTPException(
            status_code=403,
            detail="Consent owner mismatch"
        )

    if organization_id != organization.id:
        raise HTTPException(
            status_code=403,
            detail="Consent organization mismatch"
        )

    if blockchain_record_id != record.id:
        raise HTTPException(
            status_code=403,
            detail="Consent record mismatch"
        )

    if purpose != consent.purpose:
        raise HTTPException(
            status_code=403,
            detail="Consent purpose mismatch"
        )

    if access_type != consent.access_type:
        raise HTTPException(
            status_code=403,
            detail="Consent access type mismatch"
        )

    if current_timestamp < start_time:
        raise HTTPException(
            status_code=403,
            detail="Consent is not active yet"
        )

    if current_timestamp > expiry_time:
        raise HTTPException(
            status_code=403,
            detail="Consent has expired"
        )

    return consent