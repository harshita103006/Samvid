from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    record_type = Column(String(100), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Consent(Base):
    __tablename__ = "consents"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    record_id = Column(Integer, ForeignKey("records.id"), nullable=False)
    purpose = Column(String(255), nullable=False)
    access_type = Column(String(50), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    expiry_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(30), nullable=False, default="ACTIVE")
    blockchain_tx_hash = Column(String(255), nullable=True)
    blockchain_consent_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    record_id = Column(Integer, ForeignKey("records.id"), nullable=False)
    consent_id = Column(Integer, ForeignKey("consents.id"), nullable=True)
    purpose = Column(String(255), nullable=False)
    requested_access_type = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    record_id = Column(Integer, ForeignKey("records.id"), nullable=True)
    consent_id = Column(Integer, ForeignKey("consents.id"), nullable=True)
    blockchain_tx_hash = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False)
    purpose = Column(String(255), nullable=True)
    result = Column(String(50), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    details = Column(Text, nullable=True)