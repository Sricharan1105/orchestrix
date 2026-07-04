from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/cron", tags=["Cron Schedules"])

@router.get("", response_model=List[schemas.CronScheduleOut])
def list_cron_schedules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Filter schedules by user's authorized projects
    user_project_ids = crud.get_user_project_ids(db, user_id=current_user.id)
    schedules = db.query(models.CronSchedule).join(models.Queue).filter(
        models.Queue.project_id.in_(user_project_ids)
    ).all()
    return schedules

@router.post("", response_model=schemas.CronScheduleOut)
def create_cron_schedule(
    schedule: schemas.CronScheduleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    # Verify queue exists and user has project access
    db_queue = crud.get_queue_by_name(db, schedule.queue_name)
    if not db_queue:
        raise HTTPException(status_code=404, detail=f"Queue '{schedule.queue_name}' not found")
        
    if not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to create cron schedules in this project")
        
    try:
        db_schedule = crud.create_cron_schedule(db, schedule=schedule)
        
        # Log audit
        audit = models.AuditLog(
            user_id=current_user.id,
            action="CREATE_CRON_SCHEDULE",
            details=f"Created recurring schedule {schedule.name} with cron ({schedule.cron_expression})"
        )
        db.add(audit)
        db.commit()
        
        return db_schedule
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create cron schedule: {e}")

@router.post("/{cron_id}/pause", response_model=schemas.CronScheduleOut)
def pause_cron_schedule(
    cron_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    schedule = db.query(models.CronSchedule).filter(models.CronSchedule.id == cron_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Cron schedule not found")
        
    db_queue = db.query(models.Queue).filter(models.Queue.id == schedule.queue_id).first()
    if not db_queue or not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to pause this cron schedule")
        
    schedule.is_active = False
    
    # Audit log
    audit = models.AuditLog(
        user_id=current_user.id,
        action="PAUSE_CRON_SCHEDULE",
        details=f"Paused cron schedule: {schedule.name}"
    )
    db.add(audit)
    db.commit()
    db.refresh(schedule)
    return schedule

@router.post("/{cron_id}/resume", response_model=schemas.CronScheduleOut)
def resume_cron_schedule(
    cron_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    schedule = db.query(models.CronSchedule).filter(models.CronSchedule.id == cron_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Cron schedule not found")
        
    db_queue = db.query(models.Queue).filter(models.Queue.id == schedule.queue_id).first()
    if not db_queue or not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to resume this cron schedule")
        
    schedule.is_active = True
    
    # Recalculate next run time starting from now
    import datetime
    from app.crud import calculate_next_run
    schedule.next_run_at = calculate_next_run(schedule.cron_expression, datetime.datetime.utcnow())
    
    # Audit log
    audit = models.AuditLog(
        user_id=current_user.id,
        action="RESUME_CRON_SCHEDULE",
        details=f"Resumed cron schedule: {schedule.name}"
    )
    db.add(audit)
    db.commit()
    db.refresh(schedule)
    return schedule

@router.delete("/{cron_id}")
def delete_cron_schedule(
    cron_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    schedule = db.query(models.CronSchedule).filter(models.CronSchedule.id == cron_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Cron schedule not found")
        
    db_queue = db.query(models.Queue).filter(models.Queue.id == schedule.queue_id).first()
    if not db_queue or not crud.verify_project_access(db, user_id=current_user.id, project_id=db_queue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this cron schedule")
        
    # Audit log
    audit = models.AuditLog(
        user_id=current_user.id,
        action="DELETE_CRON_SCHEDULE",
        details=f"Deleted cron schedule: {schedule.name}"
    )
    db.add(audit)
    db.delete(schedule)
    db.commit()
    return {"message": f"Cron schedule {cron_id} deleted successfully"}
