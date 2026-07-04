from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/dlq", tags=["Dead Letter Queue"])

@router.get("", response_model=List[schemas.DeadLetterJobOut])
def list_dlq_jobs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return crud.get_dlq_jobs(db)

@router.post("/{job_id}/replay")
def replay_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    success = crud.replay_dlq_job(db, job_id=job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found in Dead Letter Queue")
    
    # Audit log
    audit = models.AuditLog(
        user_id=current_user.id,
        action="REPLAY_DLQ_JOB",
        details=f"Replayed job {job_id} from DLQ"
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success"}
