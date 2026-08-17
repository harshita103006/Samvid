from cryptography.fernet import Fernet

from app.core.config import settings


fernet = Fernet(settings.encryption_key.encode())


def encrypt_file(data: bytes) -> bytes:
    return fernet.encrypt(data)


def decrypt_file(data: bytes) -> bytes:
    return fernet.decrypt(data)