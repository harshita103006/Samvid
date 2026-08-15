from fastapi import FastAPI
from app.api.auth import router as auth_router
from app.api.records import router as records_router

app = FastAPI(
    title="Samvid API",
    description="Universal Blockchain-Based Consent Management and Secure Data Access Platform",
    version="1.0.0"
)

app.include_router(auth_router)
app.include_router(records_router)


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
