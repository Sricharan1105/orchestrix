from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/workers", tags=["Workers"])

@router.get("", response_model=List[schemas.WorkerOut])
def list_workers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return crud.get_active_workers(db)

@router.post("/{worker_id}/heartbeat", response_model=schemas.WorkerOut)
def worker_heartbeat(
    worker_id: str,
    heartbeat: schemas.WorkerHeartbeatSchema,
    db: Session = Depends(get_db)
):
    # This route is usually called by worker client without user token (or can be configured with API key)
    # We allow anonymous worker enrollment for development
    return crud.register_worker_heartbeat(
        db, 
        worker_id=worker_id, 
        status=heartbeat.status, 
        metadata_info=heartbeat.metadata_info
    )

@router.post("/{worker_id}/claim", response_model=Optional[schemas.JobOut])
def claim_job(
    worker_id: str,
    db: Session = Depends(get_db)
):
    # Atomic claim endpoint
    # Called by worker loop
    job = crud.claim_next_job(db, worker_id=worker_id)
    return job

@router.post("/{worker_id}/jobs/{job_id}/complete")
def complete_job(
    worker_id: str,
    job_id: str,
    db: Session = Depends(get_db)
):
    crud.update_execution_success(db, job_id=job_id, worker_id=worker_id)
    return {"status": "success"}

@router.post("/{worker_id}/jobs/{job_id}/fail")
def fail_job(
    worker_id: str,
    job_id: str,
    error_msg: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    crud.update_execution_failure(db, job_id=job_id, worker_id=worker_id, error_msg=error_msg)
    return {"status": "success"}

@router.post("/{worker_id}/terminate")
def terminate_worker(
    worker_id: str,
    db: Session = Depends(get_db)
):
    worker = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.status = "dead"
    db.commit()
    crud.cleanup_dead_workers(db)
    return {"status": "success"}
