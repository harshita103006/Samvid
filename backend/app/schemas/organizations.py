from pydantic import BaseModel, EmailStr


class OrganizationCreate(BaseModel):
    name: str
    email: EmailStr
    description: str | None = None