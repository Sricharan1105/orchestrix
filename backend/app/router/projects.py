from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[schemas.ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return crud.get_projects(db, user_id=current_user.id)

@router.post("", response_model=schemas.ProjectOut)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Find user's first organization to bind the project
    if not current_user.organizations:
        raise HTTPException(status_code=400, detail="User has no organizations associated")
    org_id = current_user.organizations[0].id
    return crud.create_project(db, project=project, org_id=org_id)
