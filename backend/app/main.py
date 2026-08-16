from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.records import router as records_router
from app.api.organizations import router as organizations_router
from app.api.access_requests import router as access_requests_router


app = FastAPI(
    title="Samvid API",
    description="Universal Blockchain-Based Consent Management and Secure Data Access Platform",
    version="1.0.0"
)


app.include_router(auth_router)
app.include_router(records_router)
app.include_router(organizations_router)
app.include_router(access_requests_router)


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