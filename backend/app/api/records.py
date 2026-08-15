from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import Record, User
from app.services.record_service import (
    save_uploaded_file,
    calculate_file_hash
)

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
        Record.id == record_id,
        Record.owner_id == current_user.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Record not found"
        )

    file_path = Path(record.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found on server"
        )

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream"
    )
