from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import Organization, User
from app.schemas.organizations import OrganizationCreate

router = APIRouter(
    prefix="/organizations",
    tags=["Organizations"]
)


@router.post("")
def create_organization(
    request: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only organization users can create organizations
    if current_user.role != "ORGANIZATION":
        raise HTTPException(
            status_code=403,
            detail="Only organization users can create organizations"
        )

    # Check whether organization email already exists
    existing_organization = db.query(Organization).filter(
        Organization.email == request.email
    ).first()

    if existing_organization:
        raise HTTPException(
            status_code=400,
            detail="Organization email already registered"
        )

    organization = Organization(
        name=request.name,
        email=request.email,
        description=request.description
    )

    db.add(organization)
    db.commit()
    db.refresh(organization)

    return {
        "message": "Organization created successfully",
        "organization_id": organization.id,
        "name": organization.name,
        "email": organization.email,
        "description": organization.description,
        "created_at": organization.created_at
    }


@router.get("")
def get_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    organizations = db.query(Organization).order_by(
        Organization.created_at.desc()
    ).all()

    return [
        {
            "organization_id": organization.id,
            "name": organization.name,
            "email": organization.email,
            "description": organization.description,
            "created_at": organization.created_at
        }
        for organization in organizations
    ]


@router.get("/{organization_id}")
def get_organization(
    organization_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    organization = db.query(Organization).filter(
        Organization.id == organization_id
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization not found"
        )

    return {
        "organization_id": organization.id,
        "name": organization.name,
        "email": organization.email,
        "description": organization.description,
        "created_at": organization.created_at
    }