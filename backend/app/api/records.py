from datetime import datetime
from pathlib import Path


from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import Record, User, AuditLog
from app.services.record_service import (
    save_uploaded_file,
    calculate_file_hash
)
from app.services.blockchain_service import blockchain_service
router = APIRouter(prefix="/records", tags=["Records"])


@router.post("/upload")
def upload_record(
    title: str = Form(...),
    record_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can upload records"
        )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required"
        )

    safe_filename = Path(file.filename).name
    file_path = save_uploaded_file(file, safe_filename)
    file_hash = calculate_file_hash(file_path)

    record = Record(
        owner_id=current_user.id,
        title=title,
        record_type=record_type,
        file_path=str(file_path),
        file_hash=file_hash
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "message": "Record uploaded successfully",
        "record_id": record.id,
        "title": record.title,
        "record_type": record.record_type,
        "file_hash": record.file_hash
    }


@router.get("")
def get_my_records(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    records = db.query(Record).filter(
        Record.owner_id == current_user.id
    ).order_by(Record.created_at.desc()).all()

    return [
        {
            "record_id": record.id,
            "title": record.title,
            "record_type": record.record_type,
            "file_hash": record.file_hash,
            "created_at": record.created_at
        }
        for record in records
    ]


@router.get("/{record_id}")
def get_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record = db.query(Record).filter(
        Record.id == record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    return {
        "record_id": record.id,
        "title": record.title,
        "record_type": record.record_type,
        "file_path": record.file_path,
        "file_hash": record.file_hash,
        "created_at": record.created_at
    }
@router.get("/{record_id}/file")
def get_record_file(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record = db.query(Record).filter(
        Record.id == record_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    consent = None

    # DATA OWNER
    if current_user.role == "DATA_OWNER":

        if record.owner_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You do not own this record"
            )

    # ORGANIZATION
    elif current_user.role == "ORGANIZATION":

        from app.models import Organization, Consent, AccessRequest

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
            Consent.record_id == record_id,
            Consent.status == "ACTIVE"
        ).order_by(
            Consent.created_at.desc()
        ).first()

        if not consent:
            audit_log = AuditLog(
                actor_id=current_user.id,
                record_id=record.id,
                
                action="RECORD_ACCESS",
                result="DENIED",
                details="No active consent found"
            )

            db.add(audit_log)
            db.commit()

            raise HTTPException(
                status_code=403,
                detail="No active consent found for this record"
            )

        # Check blockchain consent
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
            datetime.utcnow().timestamp()
        )

        # 0 = ACTIVE
        # 1 = REVOKED
        # 2 = EXPIRED

        if blockchain_status != 0:
            raise HTTPException(
                status_code=403,
                detail="Blockchain consent is not active"
            )

        if organization_id != organization.id:
            raise HTTPException(
                status_code=403,
                detail="Consent organization mismatch"
            )

        if blockchain_record_id != record_id:
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

    else:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access this record"
        )

    # Check physical file
    file_path = Path(record.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found on server"
        )

    # Successful organization access
    if current_user.role == "ORGANIZATION":

        audit_log = AuditLog(
            actor_id=current_user.id,
            record_id=record.id,
            consent_id=consent.id,
            blockchain_tx_hash=consent.blockchain_tx_hash,
            action="RECORD_ACCESS",
            purpose=consent.purpose,
            result="GRANTED",
            details="Access granted after blockchain consent verification"
        )

        db.add(audit_log)
        db.commit()

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream"
    )