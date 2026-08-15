from fastapi import FastAPI
from app.api.auth import router as auth_router

app = FastAPI(
    title="Samvid API",
    description="Universal Blockchain-Based Consent Management and Secure Data Access Platform",
    version="1.0.0"
)

app.include_router(auth_router)


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
