from pathlib import Path
import shutil

from fastapi import APIRouter, File, HTTPException, UploadFile

from auditor.audit_service import AuditService


router = APIRouter(
    prefix="/smart-audit",
    tags=["Smart Contract Audit"]
)

audit_service = AuditService()


@router.post("/analyze")
def analyze_contract(
    file: UploadFile = File(...)
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Contract file is required"
        )

    if not file.filename.endswith(".sol"):
        raise HTTPException(
            status_code=400,
            detail="Only Solidity (.sol) files are supported"
        )

    temp_dir = Path("auditor/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = Path(file.filename).name
    contract_path = temp_dir / safe_filename

    try:
        with open(contract_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        report = audit_service.audit_contract(
            str(contract_path)
        )

        return {
            "filename": safe_filename,
            "report": report
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Contract audit failed: {str(exc)}"
        )

    finally:
        if contract_path.exists():
            contract_path.unlink()