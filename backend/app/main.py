from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os 
from app.api.auth import router as auth_router
from app.core.database import engine, Base
from app import models

from app.api.records import router as records_router
from app.api.organizations import router as organizations_router
from app.api.access_requests import router as access_requests_router
from app.api.auditor import router as auditor_router
from app.api.smart_audit import router as smart_audit_router
from app.api import consents
app = FastAPI(
    title="Samvid API",
    description="Universal Blockchain-Based Consent Management and Secure Data Access Platform",
    version="1.0.0"
)
Base.metadata.create_all(bind=engine)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,https://frontend-samvid.vercel.app,https://samviddata-8484kndx.manus.space,https://frontend-samvid-80q1x9y4-ishani024342s-projects.vercel.app"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(records_router)
app.include_router(organizations_router)
app.include_router(access_requests_router)
app.include_router(auditor_router)
app.include_router(smart_audit_router)
app.include_router(consents.router)

@app.get("/")
def root():
    return {
        "message": "Samvid API is running",
        "status": "healthy"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }