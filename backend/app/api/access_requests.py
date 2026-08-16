from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import (
    AccessRequest,
    Consent,
    Organization,
    Record,
    User
)
from app.schemas.access_requests import AccessRequestCreate
from app.schemas.consent import ConsentApproval
from app.services.blockchain_service import blockchain_service
from app.services.audit_service import create_audit_log
router = APIRouter(
    prefix="/access-requests",
    tags=["Access Requests"]
)


@router.post("")
def create_access_request(
    request: AccessRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ORGANIZATION":
        raise HTTPException(
            status_code=403,
            detail="Only organization users can request access"
        )

    organization = db.query(Organization).filter(
        Organization.email == current_user.email
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization profile not found"
        )

    record = db.query(Record).filter(
        Record.id == request.record_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    existing_request = db.query(AccessRequest).filter(
        AccessRequest.organization_id == organization.id,
        AccessRequest.record_id == request.record_id,
        AccessRequest.status == "PENDING"
    ).first()

    if existing_request:
        raise HTTPException(
            status_code=400,
            detail="A pending access request already exists"
        )

    access_request = AccessRequest(
        organization_id=organization.id,
        record_id=request.record_id,
        purpose=request.purpose,
        requested_access_type=request.requested_access_type,
        status="PENDING"
    )

    db.add(access_request)
    db.commit()
    db.refresh(access_request)

    return {
        "message": "Access request created successfully",
        "request_id": access_request.id,
        "organization_id": access_request.organization_id,
        "record_id": access_request.record_id,
        "purpose": access_request.purpose,
        "requested_access_type": access_request.requested_access_type,
        "status": access_request.status,
        "requested_at": access_request.requested_at
    }


@router.get("")
def get_my_access_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ORGANIZATION":
        raise HTTPException(
            status_code=403,
            detail="Only organization users can view access requests"
        )

    organization = db.query(Organization).filter(
        Organization.email == current_user.email
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization profile not found"
        )

    requests = db.query(AccessRequest).filter(
        AccessRequest.organization_id == organization.id
    ).order_by(
        AccessRequest.requested_at.desc()
    ).all()

    return [
        {
            "request_id": access_request.id,
            "record_id": access_request.record_id,
            "purpose": access_request.purpose,
            "requested_access_type": access_request.requested_access_type,
            "status": access_request.status,
            "requested_at": access_request.requested_at
        }
        for access_request in requests
    ]


@router.post("/{request_id}/approve")
def approve_access_request(
    request_id: int,
    approval: ConsentApproval,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can approve access requests"
        )

    access_request = db.query(AccessRequest).filter(
        AccessRequest.id == request_id
    ).first()

    if not access_request:
        raise HTTPException(
            status_code=404,
            detail="Access request not found"
        )

    if access_request.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending requests can be approved"
        )

    record = db.query(Record).filter(
        Record.id == access_request.record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=403,
            detail="You do not own the requested record"
        )

    if approval.expiry_time <= approval.start_time:
        raise HTTPException(
            status_code=400,
            detail="Expiry time must be after start time"
        )

    consent = Consent(
        owner_id=current_user.id,
        organization_id=access_request.organization_id,
        record_id=access_request.record_id,
        purpose=access_request.purpose,
        access_type=access_request.requested_access_type,
        start_time=approval.start_time,
        expiry_time=approval.expiry_time,
        status="ACTIVE"
    )

    db.add(consent)
    db.flush()

    start_timestamp = int(
        approval.start_time.timestamp()
    )

    expiry_timestamp = int(
        approval.expiry_time.timestamp()
    )

    try:
        blockchain_result = blockchain_service.create_consent_on_chain(
            owner_id=current_user.id,
            organization_id=access_request.organization_id,
            record_id=access_request.record_id,
            purpose=access_request.purpose,
            access_type=access_request.requested_access_type,
            start_time=start_timestamp,
            expiry_time=expiry_timestamp
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain consent creation failed: {str(exc)}"
        )

    consent.blockchain_consent_id = blockchain_result["consent_id"]
    consent.blockchain_tx_hash = blockchain_result["transaction_hash"]

    access_request.consent_id = consent.id
    access_request.status = "APPROVED"
    create_audit_log(
        db=db,
        actor_id=current_user.id,
        record_id=consent.record_id,
        consent_id=consent.id,
        blockchain_tx_hash=consent.blockchain_tx_hash,
        action="CONSENT_CREATED",
        purpose=consent.purpose,
        result="SUCCESS",
        details="Consent created and recorded on blockchain"
    )
    db.commit()
    db.refresh(consent)

 

    return {
        "message": "Access request approved and consent created",
        "request_id": access_request.id,
        "consent_id": consent.id,
        "blockchain_consent_id": consent.blockchain_consent_id,
        "blockchain_tx_hash": consent.blockchain_tx_hash,
        "record_id": consent.record_id,
        "organization_id": consent.organization_id,
        "status": consent.status,
        "start_time": consent.start_time,
        "expiry_time": consent.expiry_time
    }


@router.post("/{request_id}/reject")
def reject_access_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can reject access requests"
        )

    access_request = db.query(AccessRequest).filter(
        AccessRequest.id == request_id
    ).first()

    if not access_request:
        raise HTTPException(
            status_code=404,
            detail="Access request not found"
        )

    if access_request.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending requests can be rejected"
        )

    record = db.query(Record).filter(
        Record.id == access_request.record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=403,
            detail="You do not own the requested record"
        )

    access_request.status = "REJECTED"

    db.commit()
    db.refresh(access_request)

    return {
        "message": "Access request rejected",
        "request_id": access_request.id,
        "status": access_request.status
    }


@router.post("/{request_id}/revoke")
def revoke_consent(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can revoke consent"
        )

    access_request = db.query(AccessRequest).filter(
        AccessRequest.id == request_id
    ).first()

    if not access_request:
        raise HTTPException(
            status_code=404,
            detail="Access request not found"
        )

    consent = db.query(Consent).filter(
        Consent.id == access_request.consent_id,
        Consent.owner_id == current_user.id
    ).first()

    if not consent:
        raise HTTPException(
            status_code=404,
            detail="Active consent not found"
        )

    if consent.status != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail="Only active consent can be revoked"
        )

    try:
        blockchain_result = blockchain_service.revoke_consent_on_chain(
            consent.blockchain_consent_id
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain consent revocation failed: {str(exc)}"
        )

    consent.status = "REVOKED"
    consent.revoked_at = datetime.utcnow()

    blockchain_tx_hash = None

    if consent.blockchain_consent_id:
        try:
            blockchain_result = blockchain_service.revoke_consent_on_chain(
                consent.blockchain_consent_id
            )

            blockchain_tx_hash = blockchain_result["transaction_hash"]
            consent.blockchain_tx_hash = blockchain_tx_hash

        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Blockchain consent revocation failed: {str(exc)}"
            )

    create_audit_log(
        db=db,
        actor_id=current_user.id,
        record_id=consent.record_id,
        consent_id=consent.id,
        blockchain_tx_hash=blockchain_tx_hash,
        action="CONSENT_REVOKED",
        purpose=consent.purpose,
        result="SUCCESS",
        details="Consent revoked and blockchain status updated"
    )

    db.commit()
    db.refresh(consent)

    return {
        "message": "Consent revoked successfully",
        "consent_id": consent.id,
        "blockchain_consent_id": consent.blockchain_consent_id,
        "blockchain_tx_hash": blockchain_result["transaction_hash"],
        "request_id": access_request.id,
        "status": consent.status,
        "revoked_at": consent.revoked_at
    }