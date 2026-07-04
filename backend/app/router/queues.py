from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/queues", tags=["Queues"])

@router.get("", response_model=List[schemas.QueueOut])
def list_queues(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Verify user owns the project
    projects = crud.get_projects(db, user_id=current_user.id)
    if not any(p.id == project_id for p in projects):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return crud.get_queues(db, project_id=project_id)

@router.post("", response_model=schemas.QueueOut)
def create_queue(
    queue: schemas.QueueCreate,
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    projects = crud.get_projects(db, user_id=current_user.id)
    if not any(p.id == project_id for p in projects):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
        
    db_queue = crud.get_queue_by_name(db, name=queue.name)
    if db_queue:
        raise HTTPException(status_code=400, detail="Queue name already exists")
        
    return crud.create_queue(db, queue=queue, project_id=project_id)

@router.put("/{queue_id}", response_model=schemas.QueueOut)
def update_queue(
    queue_id: int,
    queue_update: schemas.QueueUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Check project ownership before updating queue
    db_queue = db.query(models.Queue).filter(models.Queue.id == queue_id).first()
    if not db_queue:
        raise HTTPException(status_code=404, detail="Queue not found")
        
    projects = crud.get_projects(db, user_id=current_user.id)
    if not any(p.id == db_queue.project_id for p in projects):
        raise HTTPException(status_code=403, detail="Not authorized to update this queue")
        
    crud.update_queue(db, queue_id=queue_id, queue_update=queue_update)
    
    # Log audit
    audit = models.AuditLog(
        user_id=current_user.id,
        action="UPDATE_QUEUE",
        details=f"Updated queue {db_queue.name} (paused: {queue_update.is_paused}, concurrency: {queue_update.concurrency_limit})"
    )
    db.add(audit)
    db.commit()
    
    db_queue.pending_count = db.query(models.Job).filter(models.Job.queue_id == db_queue.id, models.Job.status == "queued").count()
    db_queue.running_count = db.query(models.Job).filter(models.Job.queue_id == db_queue.id, models.Job.status.in_(["claimed", "running"])).count()
    db_queue.completed_count = db.query(models.Job).filter(models.Job.queue_id == db_queue.id, models.Job.status == "completed").count()
    db_queue.failed_count = db.query(models.Job).filter(models.Job.queue_id == db_queue.id, models.Job.status.in_(["failed", "dlq"])).count()
    return db_queue
