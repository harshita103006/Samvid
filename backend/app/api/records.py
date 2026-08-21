from app.services.encryption_service import decrypt_file
from app.services.record_service import save_uploaded_file
from app.services.access_service import verify_record_access
from pathlib import Path
import mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from app.services.encryption_service import decrypt_file
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import Record, User, AuditLog, AccessRequest, Consent
from app.services.record_service import (
    save_uploaded_file,
    calculate_file_hash
)



router = APIRouter(prefix="/records", tags=["Records"])
@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can remove records"
        )

    record = db.query(Record).filter(
        Record.id == record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    has_consent_history = db.query(Consent).filter(
        Consent.record_id == record.id
    ).first()

    has_access_history = db.query(AccessRequest).filter(
        AccessRequest.record_id == record.id
    ).first()

    if has_consent_history or has_access_history:
        raise HTTPException(
            status_code=409,
            detail="Record cannot be removed while consent or access history exists"
        )

    file_path = Path(record.file_path)

    db.delete(record)
    db.commit()

    if file_path.exists():
        file_path.unlink()

    return {
        "message": "Record removed successfully",
        "record_id": record_id
    }

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
    file_path, file_hash = save_uploaded_file(file, safe_filename)

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

    consent = verify_record_access(
        record=record,
        current_user=current_user,
        db=db
    )

    file_path = Path(record.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found on server"
        )

    try:
        with open(file_path, "rb") as file:
            encrypted_data = file.read()

        decrypted_data = decrypt_file(encrypted_data)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"File decryption failed: {str(exc)}"
        )

    # Audit successful organization access
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

    return Response(
        content=decrypted_data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{file_path.name}"'
        }
    )

@router.get("/directory")
def browse_owner_directory(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ORGANIZATION":
        raise HTTPException(
            status_code=403,
            detail="Only organization users can browse the owner directory"
        )

    rows = (
        db.query(Record, User)
        .join(User, Record.owner_id == User.id)
        .order_by(User.name.asc(), Record.created_at.desc())
        .all()
    )

    directory = {}

    for record, owner in rows:
        if owner.id not in directory:
            directory[owner.id] = {
                "owner_id": owner.id,
                "owner_name": owner.name,
                "records": []
            }

        directory[owner.id]["records"].append({
            "record_id": record.id,
            "title": record.title,
            "record_type": record.record_type,
            "created_at": record.created_at
        })

    return list(directory.values())

@router.get("/{record_id}/view")
def view_record(
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

    consent = verify_record_access(
        record=record,
        current_user=current_user,
        db=db
    )

    # View-only access is intended for organizations
    if current_user.role == "ORGANIZATION":

        if consent.access_type != "VIEW_ONLY":
            raise HTTPException(
                status_code=403,
                detail="View-only access is not permitted by this consent"
            )

    file_path = Path(record.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found on server"
        )

    try:
        with open(file_path, "rb") as file:
            encrypted_data = file.read()

        decrypted_data = decrypt_file(encrypted_data)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"File decryption failed: {str(exc)}"
        )

    if current_user.role == "ORGANIZATION":

        audit_log = AuditLog(
            actor_id=current_user.id,
            record_id=record.id,
            consent_id=consent.id,
            blockchain_tx_hash=consent.blockchain_tx_hash,
            action="RECORD_VIEW",
            purpose=consent.purpose,
            result="GRANTED",
            details="View-only access granted after blockchain consent verification"
        )

        db.add(audit_log)
        db.commit()

    media_type, _ = mimetypes.guess_type(file_path.name)

    return Response(
        content=decrypted_data,
        media_type=media_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache"
        }
    )

@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "DATA_OWNER":
        raise HTTPException(
            status_code=403,
            detail="Only data owners can remove records"
        )

    record = db.query(Record).filter(
        Record.id == record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    has_consent_history = db.query(Consent).filter(
        Consent.record_id == record.id
    ).first()

    has_access_history = db.query(AccessRequest).filter(
        AccessRequest.record_id == record.id
    ).first()

    if has_consent_history or has_access_history:
        raise HTTPException(
            status_code=409,
            detail="Record cannot be removed while consent or access history exists"
        )

    file_path = Path(record.file_path)

    db.delete(record)
    db.commit()

    if file_path.exists():
        file_path.unlink()

    return {
        "message": "Record removed successfully",
        "record_id": record_id
    }