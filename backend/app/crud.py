from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta
import random
import string
import threading
from typing import Optional, List, Dict, Any
from croniter import croniter
from app import models, schemas
from app.security import get_password_hash

# Global thread lock for SQLite concurrent claims serialization
sqlite_claim_lock = threading.Lock()

# Helper to generate professional looking job IDs: JOB-A81F
def generate_job_id() -> str:
    slug = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"JOB-{slug}"

# Helper to generate Batch IDs: BATCH-A81F
def generate_batch_id() -> str:
    slug = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"BATCH-{slug}"

# --- Authorization & Scoping Helpers ---
def verify_project_access(db: Session, user_id: int, project_id: int) -> bool:
    # Query organizations where user is a member
    user_org_ids = db.query(models.organization_members.c.organization_id).filter(
        models.organization_members.c.user_id == user_id
    ).all()
    user_org_ids = [org_id for (org_id,) in user_org_ids]
    
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    return project.organization_id in user_org_ids

def get_user_project_ids(db: Session, user_id: int) -> List[int]:
    user_org_ids = db.query(models.organization_members.c.organization_id).filter(
        models.organization_members.c.user_id == user_id
    ).all()
    user_org_ids = [org_id for (org_id,) in user_org_ids]
    
    projects = db.query(models.Project).filter(models.Project.organization_id.in_(user_org_ids)).all()
    return [p.id for p in projects]

# --- User CRUD ---
def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    hashed_pwd = get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_pwd)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Auto-create a default Organization and Project for the new user
    org = models.Organization(name=f"{user.username}'s Org")
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # Add member association
    db.execute(
        models.organization_members.insert().values(
            organization_id=org.id,
            user_id=db_user.id,
            role="owner"
        )
    )
    db.commit()
    
    project = models.Project(name="Default Project", organization_id=org.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    
    # Auto-create some default queues: email, payments, reports, notifications
    default_queues = [
        ("email", "HIGH", 10),
        ("payments", "HIGH", 5),
        ("reports", "MEDIUM", 2),
        ("notifications", "LOW", 15)
    ]
    for q_name, priority, concurrency in default_queues:
        db_queue = models.Queue(
            name=q_name,
            project_id=project.id,
            priority=priority,
            concurrency_limit=concurrency
        )
        db.add(db_queue)
        db.commit()
        db.refresh(db_queue)
        
        # Add a default retry policy
        db_policy = models.RetryPolicy(
            queue_id=db_queue.id,
            strategy="EXPONENTIAL",
            max_retries=3,
            backoff_factor=2,
            backoff_max_delay=60
        )
        db.add(db_policy)
        db.commit()
        
    return db_user

# --- Project & Queue CRUD ---
def get_projects(db: Session, user_id: int) -> List[models.Project]:
    return db.query(models.Project).join(models.Organization).join(
        models.organization_members,
        models.organization_members.c.organization_id == models.Organization.id
    ).filter(models.organization_members.c.user_id == user_id).all()

def create_project(db: Session, project: schemas.ProjectCreate, org_id: int) -> models.Project:
    db_project = models.Project(name=project.name, organization_id=org_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def get_queues(db: Session, project_id: int) -> List[models.Queue]:
    queues = db.query(models.Queue).filter(models.Queue.project_id == project_id).all()
    # Enrich with job count stats
    for q in queues:
        q.pending_count = db.query(models.Job).filter(models.Job.queue_id == q.id, models.Job.status == "queued").count()
        q.running_count = db.query(models.Job).filter(models.Job.queue_id == q.id, models.Job.status.in_(["claimed", "running"])).count()
        q.completed_count = db.query(models.Job).filter(models.Job.queue_id == q.id, models.Job.status == "completed").count()
        q.failed_count = db.query(models.Job).filter(models.Job.queue_id == q.id, models.Job.status.in_(["failed", "dlq"])).count()
    return queues

def get_queue_by_name(db: Session, name: str) -> Optional[models.Queue]:
    return db.query(models.Queue).filter(models.Queue.name == name).first()

def create_queue(db: Session, queue: schemas.QueueCreate, project_id: int) -> models.Queue:
    db_queue = models.Queue(
        name=queue.name,
        project_id=project_id,
        priority=queue.priority,
        concurrency_limit=queue.concurrency_limit
    )
    db.add(db_queue)
    db.commit()
    db.refresh(db_queue)
    
    # Create retry policy
    policy_data = queue.retry_policy or schemas.RetryPolicyCreate()
    db_policy = models.RetryPolicy(
        queue_id=db_queue.id,
        strategy=policy_data.strategy,
        max_retries=policy_data.max_retries,
        backoff_factor=policy_data.backoff_factor,
        backoff_max_delay=policy_data.backoff_max_delay
    )
    db.add(db_policy)
    db.commit()
    
    return db_queue

def update_queue(db: Session, queue_id: int, queue_update: schemas.QueueUpdate) -> Optional[models.Queue]:
    db_queue = db.query(models.Queue).filter(models.Queue.id == queue_id).first()
    if not db_queue:
        return None
    for key, value in queue_update.dict(exclude_unset=True).items():
        if key == "priority" or key == "concurrency_limit" or key == "is_paused":
            setattr(db_queue, key, value)
    db.commit()
    db.refresh(db_queue)
    return db_queue

# --- Job CRUD ---
def create_job(db: Session, job: schemas.JobCreate) -> models.Job:
    db_queue = get_queue_by_name(db, job.queue_name)
    if not db_queue:
        raise ValueError(f"Queue '{job.queue_name}' not found")
        
    job_id = generate_job_id()
    status = "queued"
    if job.scheduled_at and job.scheduled_at > datetime.utcnow():
        status = "scheduled"
        
    db_job = models.Job(
        id=job_id,
        name=job.name,
        queue_id=db_queue.id,
        status=status,
        priority=job.priority,
        payload=job.payload,
        scheduled_at=job.scheduled_at or datetime.utcnow(),
        batch_id=job.batch_id,
        cron_schedule_id=job.cron_schedule_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    # Log audit
    log_job_event(db, job_id, "INFO", f"Job created in queue '{job.queue_name}'")
    return db_job

def get_jobs(db: Session, status: Optional[str] = None, queue_id: Optional[int] = None, search: Optional[str] = None) -> List[models.Job]:
    query = db.query(models.Job)
    if status:
        query = query.filter(models.Job.status == status)
    if queue_id:
        query = query.filter(models.Job.queue_id == queue_id)
    if search:
        query = query.filter(
            or_(
                models.Job.id.ilike(f"%{search}%"),
                models.Job.name.ilike(f"%{search}%")
            )
        )
    return query.order_by(models.Job.created_at.desc()).all()

# --- Job Pagination & Project Scoping ---
def get_jobs_paginated(
    db: Session,
    user_id: int,
    status: Optional[str] = None,
    queue_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 10
) -> Dict[str, Any]:
    # Enforce Project Scoping: Only return jobs in projects the user has access to
    user_project_ids = get_user_project_ids(db, user_id=user_id)
    
    query = db.query(models.Job).join(models.Queue).filter(
        models.Queue.project_id.in_(user_project_ids)
    )
    
    if status:
        query = query.filter(models.Job.status == status)
    if queue_id:
        query = query.filter(models.Job.queue_id == queue_id)
    if search:
        query = query.filter(
            or_(
                models.Job.id.ilike(f"%{search}%"),
                models.Job.name.ilike(f"%{search}%")
            )
        )
        
    total = query.count()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    
    offset = (page - 1) * page_size
    items = query.order_by(models.Job.created_at.desc()).offset(offset).limit(page_size).all()
    
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages
    }

def get_job_details(db: Session, job_id: str) -> Optional[models.Job]:
    db_job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if db_job:
        db_job.queue_name = db_job.queue.name
        db_job.retry_policy = db_job.queue.retry_policy
    return db_job

def log_job_event(db: Session, job_id: str, level: str, message: str, execution_id: Optional[int] = None):
    log = models.JobLog(
        job_id=job_id,
        execution_id=execution_id,
        level=level,
        message=message,
        timestamp=datetime.utcnow()
    )
    db.add(log)
    db.commit()

# --- Batch Job CRUD ---
def create_batch(db: Session, batch: schemas.BatchCreate) -> models.Batch:
    db_queue = get_queue_by_name(db, batch.queue_name)
    if not db_queue:
        raise ValueError(f"Queue '{batch.queue_name}' not found")
        
    batch_id = generate_batch_id()
    db_batch = models.Batch(
        id=batch_id,
        name=batch.name,
        status="pending",
        total_count=len(batch.payloads),
        completed_count=0,
        failed_count=0,
        created_at=datetime.utcnow()
    )
    db.add(db_batch)
    db.commit()
    
    # Enqueue each payload as an individual job referencing the batch_id
    for idx, payload in enumerate(batch.payloads):
        job_create = schemas.JobCreate(
            name=f"{batch.name} - Job {idx + 1}",
            queue_name=batch.queue_name,
            priority=batch.priority,
            payload=payload,
            batch_id=batch_id
        )
        create_job(db, job_create)
        
    db.refresh(db_batch)
    return db_batch

def get_batch(db: Session, batch_id: str) -> Optional[models.Batch]:
    return db.query(models.Batch).filter(models.Batch.id == batch_id).first()

# --- Cron Schedule CRUD ---
def calculate_next_run(cron_expression: str, base_time: Optional[datetime] = None) -> datetime:
    if not base_time:
        base_time = datetime.utcnow()
    iter = croniter(cron_expression, base_time)
    return iter.get_next(datetime)

def create_cron_schedule(db: Session, schedule: schemas.CronScheduleCreate) -> models.CronSchedule:
    db_queue = get_queue_by_name(db, schedule.queue_name)
    if not db_queue:
        raise ValueError(f"Queue '{schedule.queue_name}' not found")
        
    next_run = calculate_next_run(schedule.cron_expression)
    db_schedule = models.CronSchedule(
        name=schedule.name,
        cron_expression=schedule.cron_expression,
        queue_id=db_queue.id,
        payload=schedule.payload,
        priority=schedule.priority,
        next_run_at=next_run,
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    return db_schedule

def get_cron_schedules(db: Session) -> List[models.CronSchedule]:
    return db.query(models.CronSchedule).all()

def tick_cron_schedules(db: Session):
    """
    Checks active cron schedules and triggers jobs if next_run_at <= now
    """
    now = datetime.utcnow()
    schedules = db.query(models.CronSchedule).filter(
        models.CronSchedule.is_active == True,
        models.CronSchedule.next_run_at <= now
    ).all()
    
    for sched in schedules:
        # 1. Enqueue job
        job_id = generate_job_id()
        db_job = models.Job(
            id=job_id,
            name=f"[Cron] {sched.name}",
            queue_id=sched.queue_id,
            status="queued",
            priority=sched.priority,
            payload=sched.payload,
            scheduled_at=now,
            cron_schedule_id=sched.id,
            created_at=now,
            updated_at=now
        )
        db.add(db_job)
        
        # 2. Update schedule run times
        sched.last_run_at = now
        sched.next_run_at = calculate_next_run(sched.cron_expression, now)
        
        db.commit()
        log_job_event(db, job_id, "INFO", f"Job spawned by cron schedule '{sched.name}'")

# --- Concurrency & Claiming Engine ---
def claim_next_job(db: Session, worker_id: str) -> Optional[models.Job]:
    is_sqlite = db.bind.dialect.name == "sqlite"
    
    if is_sqlite:
        with sqlite_claim_lock:
            # We query the database fresh inside the lock
            active_queues = db.query(models.Queue).filter(models.Queue.is_paused == False).all()
            allowed_queue_ids = []
            
            for q in active_queues:
                if q.concurrency_limit is None:
                    allowed_queue_ids.append(q.id)
                    continue
                running_count = db.query(models.Job).filter(
                    models.Job.queue_id == q.id,
                    models.Job.status.in_(["claimed", "running"])
                ).count()
                if running_count < q.concurrency_limit:
                    allowed_queue_ids.append(q.id)
                    
            if not allowed_queue_ids:
                return None
                
            query = db.query(models.Job).filter(
                models.Job.status.in_(["queued", "scheduled"]),
                models.Job.queue_id.in_(allowed_queue_ids),
                models.Job.scheduled_at <= datetime.utcnow()
            ).order_by(
                models.Job.priority.desc(),
                models.Job.created_at.asc()
            )
            
            job = query.first()
            if job:
                job.status = "claimed"
                job.worker_id = worker_id
                job.claimed_at = datetime.utcnow()
                job.updated_at = datetime.utcnow()
                
                execution = models.JobExecution(
                    job_id=job.id,
                    worker_id=worker_id,
                    status="running",
                    attempt_number=job.retry_count + 1,
                    started_at=datetime.utcnow()
                )
                db.add(execution)
                db.commit()
                db.refresh(job)
                
                log_job_event(db, job.id, "INFO", f"Job claimed by worker {worker_id}", execution.id)
                
                # If batch state was pending, update it to running
                if job.batch_id:
                    batch = get_batch(db, job.batch_id)
                    if batch and batch.status == "pending":
                        batch.status = "running"
                        db.commit()
                return job
    else:
        # PostgreSQL: atomic claims using row-level locking
        active_queues = db.query(models.Queue).filter(models.Queue.is_paused == False).all()
        allowed_queue_ids = []
        
        for q in active_queues:
            if q.concurrency_limit is None:
                allowed_queue_ids.append(q.id)
                continue
            running_count = db.query(models.Job).filter(
                models.Job.queue_id == q.id,
                models.Job.status.in_(["claimed", "running"])
            ).count()
            if running_count < q.concurrency_limit:
                allowed_queue_ids.append(q.id)
                
        if not allowed_queue_ids:
            return None
            
        query = db.query(models.Job).filter(
            models.Job.status.in_(["queued", "scheduled"]),
            models.Job.queue_id.in_(allowed_queue_ids),
            models.Job.scheduled_at <= datetime.utcnow()
        ).order_by(
            models.Job.priority.desc(),
            models.Job.created_at.asc()
        )
        
        job = query.with_for_update(skip_locked=True).first()
        if job:
            job.status = "claimed"
            job.worker_id = worker_id
            job.claimed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            
            execution = models.JobExecution(
                job_id=job.id,
                worker_id=worker_id,
                status="running",
                attempt_number=job.retry_count + 1,
                started_at=datetime.utcnow()
            )
            db.add(execution)
            db.commit()
            db.refresh(job)
            
            log_job_event(db, job.id, "INFO", f"Job claimed by worker {worker_id}", execution.id)
            
            if job.batch_id:
                batch = get_batch(db, job.batch_id)
                if batch and batch.status == "pending":
                    batch.status = "running"
                    db.commit()
            return job
            
    return None

def update_execution_success(db: Session, job_id: str, worker_id: str):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        return
        
    job.status = "completed"
    job.completed_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    
    execution = db.query(models.JobExecution).filter(
        models.JobExecution.job_id == job_id,
        models.JobExecution.status == "running"
    ).order_by(models.JobExecution.started_at.desc()).first()
    
    if execution:
        execution.status = "completed"
        execution.completed_at = datetime.utcnow()
        
    db.commit()
    log_job_event(db, job_id, "SUCCESS", "Job completed successfully", execution.id if execution else None)

    # Batch progression hook
    if job.batch_id:
        update_batch_progress(db, job.batch_id)

def update_execution_failure(db: Session, job_id: str, worker_id: str, error_msg: str):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        return
        
    execution = db.query(models.JobExecution).filter(
        models.JobExecution.job_id == job_id,
        models.JobExecution.status == "running"
    ).order_by(models.JobExecution.started_at.desc()).first()
    
    if execution:
        execution.status = "failed"
        execution.error_message = error_msg
        execution.completed_at = datetime.utcnow()
        
    # Check retry policy
    policy = db.query(models.RetryPolicy).filter(models.RetryPolicy.queue_id == job.queue_id).first()
    max_retries = policy.max_retries if policy else 3
    
    log_job_event(db, job_id, "ERROR", f"Execution failed: {error_msg}", execution.id if execution else None)
    
    if job.retry_count < max_retries:
        job.retry_count += 1
        
        # Calculate retry delay based on strategy
        strategy = policy.strategy if (policy and policy.strategy) else "EXPONENTIAL"
        backoff_factor = policy.backoff_factor if policy else 2
        max_delay = policy.backoff_max_delay if policy else 60
        
        if strategy == "FIXED":
            delay = backoff_factor
        elif strategy == "LINEAR":
            delay = backoff_factor * job.retry_count
        else:  # EXPONENTIAL
            delay = backoff_factor ** job.retry_count
            
        delay = min(delay, max_delay)
        
        job.status = "queued"
        job.scheduled_at = datetime.utcnow() + timedelta(seconds=delay)
        job.updated_at = datetime.utcnow()
        job.worker_id = None
        db.commit()
        log_job_event(db, job_id, "WARNING", f"Scheduled for retry attempt {job.retry_count} in {delay}s (Strategy: {strategy})")
    else:
        # Move to Dead Letter Queue (DLQ)
        job.status = "dlq"
        job.updated_at = datetime.utcnow()
        
        # Analyze failure with Orchestrix Insight
        analysis = analyze_failure(error_msg)
        dlq_entry = models.DeadLetterJob(
            job_id=job.id,
            queue_id=job.queue_id,
            failed_at=datetime.utcnow(),
            error_message=error_msg,
            failure_category=analysis["category"],
            failure_summary=analysis["summary"]
        )
        db.add(dlq_entry)
        db.commit()
        log_job_event(db, job_id, "ERROR", f"Permanently failed. Moved to Dead Letter Queue (Category: {analysis['category']})")
        
        # Batch progression hook
        if job.batch_id:
            update_batch_progress(db, job.batch_id)

def update_batch_progress(db: Session, batch_id: str):
    batch = get_batch(db, batch_id)
    if not batch:
        return
        
    completed = db.query(models.Job).filter(models.Job.batch_id == batch_id, models.Job.status == "completed").count()
    failed = db.query(models.Job).filter(models.Job.batch_id == batch_id, models.Job.status == "dlq").count()
    
    batch.completed_count = completed
    batch.failed_count = failed
    
    if completed + failed >= batch.total_count:
        batch.status = "failed" if failed > 0 else "completed"
    else:
        batch.status = "running"
        
    db.commit()

# --- Orchestrix Insight (Failure Analytics) ---
def analyze_failure(error_msg: str) -> Dict[str, str]:
    err = error_msg.lower()
    
    category = "APPLICATION_ERROR"
    summary = "The execution failed due to an unhandled application error."
    
    if any(k in err for k in ["timeout", "timed out", "connection reset", "504", "502"]):
        category = "NETWORK_TIMEOUT"
        summary = "External service request exceeded the configured timeout parameter. The target API node failed to respond within the designated window."
    elif any(k in err for k in ["connection refused", "dns", "unreachable", "host"]):
        category = "NETWORK_UNREACHABLE"
        summary = "An external network server could not be reached. Check DNS, routing routes, and API server availability."
    elif any(k in err for k in ["sqlalchemy", "psycopg2", "deadlock", "postgres", "sqlite", "operationalerror", "lock timeout"]):
        category = "DATABASE_LOCK"
        summary = "A database transactional execution error occurred, likely due to row lock contention or connection pool saturation."
    elif any(k in err for k in ["oom", "out of memory", "memory limit", "killed"]):
        category = "OUT_OF_MEMORY"
        summary = "The execution task exceeded system memory limits on the worker node and was terminated by the OOM killer."
    elif any(k in err for k in ["permission", "unauthorized", "token", "401", "403"]):
        category = "AUTHENTICATION_FAILURE"
        summary = "Authentication failed. The security credentials, token validations, or API authorization keys are expired or invalid."
    elif any(k in err for k in ["syntax", "keyerror", "typeerror", "zerodivision", "indexerror"]):
        category = "CODE_BUG"
        summary = "A standard runtime python exception occurred. This is a coding bug inside the execution payload handler."
        
    return {"category": category, "summary": summary}

# --- Worker & Heartbeats CRUD ---
def register_worker_heartbeat(db: Session, worker_id: str, status: str, metadata_info: Optional[Dict[str, Any]]):
    worker = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker:
        worker = models.Worker(id=worker_id, status=status, last_heartbeat=datetime.utcnow(), metadata_info=metadata_info)
        db.add(worker)
    else:
        worker.status = status
        worker.last_heartbeat = datetime.utcnow()
        worker.metadata_info = metadata_info or worker.metadata_info
        
    heartbeat = models.WorkerHeartbeat(
        worker_id=worker_id,
        timestamp=datetime.utcnow(),
        status=status,
        metadata_info=metadata_info
    )
    db.add(heartbeat)
    db.commit()
    return worker

def get_active_workers(db: Session) -> List[models.Worker]:
    # Keep dead workers in the list for dashboard visibility (e.g., checked in within last 10 minutes)
    threshold = datetime.utcnow() - timedelta(minutes=10)
    workers = db.query(models.Worker).filter(
        models.Worker.last_heartbeat >= threshold
    ).all()
    for w in workers:
        w.active_jobs_count = db.query(models.Job).filter(
            models.Job.worker_id == w.id,
            models.Job.status.in_(["claimed", "running"])
        ).count()
        
        if w.status == "dead":
            # Dynamic lookups of jobs affected by this worker's crash
            crash_phrase = f"Worker crash detected: Worker {w.id}"
            affected_jobs = db.query(models.Job).join(models.JobExecution).filter(
                models.JobExecution.worker_id == w.id,
                models.JobExecution.error_message.like(f"%{crash_phrase}%")
            ).distinct().all()
            w.affected_jobs_count = len(affected_jobs)
            w.requeued_jobs_count = sum(1 for j in affected_jobs if j.status in ["queued", "claimed", "running", "completed"])
            w.dlq_jobs_count = sum(1 for j in affected_jobs if j.status == "dlq")
        else:
            w.affected_jobs_count = 0
            w.requeued_jobs_count = 0
            w.dlq_jobs_count = 0
    return workers

def cleanup_dead_workers(db: Session):
    """
    Finds workers whose heartbeat has stopped (> 15 seconds) and recovers their jobs
    """
    threshold = datetime.utcnow() - timedelta(seconds=15)
    dead_workers = db.query(models.Worker).filter(
        models.Worker.status != "dead",
        models.Worker.status != "offline",
        models.Worker.last_heartbeat < threshold
    ).all()
    
    for worker in dead_workers:
        worker.status = "dead"
        db.commit()
        
        stuck_jobs = db.query(models.Job).filter(
            models.Job.worker_id == worker.id,
            models.Job.status.in_(["claimed", "running"])
        ).all()
        
        # Log incident detail
        for job in stuck_jobs:
            error_msg = f"Worker crash detected: Worker {worker.id} stopped sending heartbeats (>15s ago)"
            update_execution_failure(db, job.id, worker.id, error_msg)

# --- DLQ CRUD ---
def get_dlq_jobs(db: Session) -> List[models.DeadLetterJob]:
    return db.query(models.DeadLetterJob).order_by(models.DeadLetterJob.failed_at.desc()).all()

def replay_dlq_job(db: Session, job_id: str) -> bool:
    job = db.query(models.Job).filter(models.Job.id == job_id, models.Job.status == "dlq").first()
    if not job:
        return False
        
    job.status = "queued"
    job.retry_count = 0
    job.error_message = None
    job.worker_id = None
    job.scheduled_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    
    db.query(models.DeadLetterJob).filter(models.DeadLetterJob.job_id == job_id).delete()
    db.commit()
    
    log_job_event(db, job_id, "INFO", "Job replayed from Dead Letter Queue")
    return True

# --- Metrics Dashboard CRUD ---
def get_system_stats(db: Session) -> schemas.StatsOverview:
    completed = db.query(models.Job).filter(models.Job.status == "completed").count()
    running = db.query(models.Job).filter(models.Job.status.in_(["claimed", "running"])).count()
    failed = db.query(models.Job).filter(models.Job.status.in_(["failed", "dlq"])).count()
    queued = db.query(models.Job).filter(models.Job.status == "queued").count()
    
    active_workers = len(get_active_workers(db))
    
    five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
    recent_completed = db.query(models.Job).filter(
        models.Job.status == "completed",
        models.Job.completed_at >= five_mins_ago
    ).count()
    throughput = recent_completed / 5.0
    
    return schemas.StatsOverview(
        completed=completed,
        running=running,
        failed=failed,
        queued=queued,
        active_workers=active_workers,
        throughput_per_minute=throughput
    )

def get_throughput_chart_data(db: Session) -> List[schemas.ThroughputDataPoint]:
    data = []
    now = datetime.utcnow()
    for i in range(14, -1, -1):
        minute_start = now - timedelta(minutes=i+1)
        minute_end = now - timedelta(minutes=i)
        
        comp_count = db.query(models.Job).filter(
            models.Job.status == "completed",
            models.Job.completed_at >= minute_start,
            models.Job.completed_at < minute_end
        ).count()
        
        fail_count = db.query(models.Job).filter(
            models.Job.status.in_(["failed", "dlq"]),
            models.Job.updated_at >= minute_start,
            models.Job.updated_at < minute_end
        ).count()
        
        time_str = minute_end.strftime("%H:%M")
        data.append(schemas.ThroughputDataPoint(time=time_str, completed=comp_count, failed=fail_count))
        
    return data
