from pathlib import Path
import hashlib

from fastapi import UploadFile

from app.services.encryption_service import encrypt_file


UPLOAD_DIR = Path("storage/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def save_uploaded_file(file: UploadFile, filename: str) -> tuple[Path, str]:
    file_data = file.file.read()

    # Hash the ORIGINAL document
    sha256 = hashlib.sha256(file_data).hexdigest()

    # Encrypt before storing
    encrypted_data = encrypt_file(file_data)

    file_path = UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        buffer.write(encrypted_data)

    return file_path, sha256


def calculate_file_hash(file_path: Path) -> str:
    sha256 = hashlib.sha256()

    with open(file_path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            sha256.update(chunk)

    return sha256.hexdigest()