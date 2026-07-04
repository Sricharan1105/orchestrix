from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.post("", response_model=schemas.JobOut)
def enqueue_job(
    job: schemas.JobCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Authorization: Verify target queue belongs to user's projects
    db_queue = crud.get_queue_by_name(db, job.queue_name)
    if not db_queue:
        raise HTTPException(status_code=404, detail=f"Queue {job.queue_name} not found")
    if not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to enqueue jobs to this queue's project")
        
    try:
        return crud.create_job(db, job=job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/batch", response_model=schemas.BatchOut)
def enqueue_batch(
    batch: schemas.BatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Authorization: Verify queue belongs to user's projects
    db_queue = crud.get_queue_by_name(db, batch.queue_name)
    if not db_queue:
        raise HTTPException(status_code=404, detail=f"Queue {batch.queue_name} not found")
    if not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to enqueue batches to this queue's project")
        
    try:
        return crud.create_batch(db, batch=batch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=schemas.PaginatedJobsOut)
def list_jobs(
    status: Optional[str] = None,
    queue_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Returns paginated list of jobs filtered by the current user's authorized projects
    return crud.get_jobs_paginated(
        db, 
        user_id=current_user.id, 
        status=status, 
        queue_id=queue_id, 
        search=search, 
        page=page, 
        page_size=page_size
    )

@router.get("/{job_id}", response_model=schemas.JobDetailsOut)
def get_job_details(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    db_job = crud.get_job_details(db, job_id=job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Verify authorization
    if not crud.verify_project_access(db, user_id=current_user.id, project_id=db_job.queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to view this job")
        
    return db_job
