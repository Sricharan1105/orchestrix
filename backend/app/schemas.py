from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Auth Schemas ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# --- Project Schemas ---
class ProjectCreate(BaseModel):
    name: str

class ProjectOut(BaseModel):
    id: int
    name: str
    organization_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Retry Policy Schemas ---
class RetryPolicyCreate(BaseModel):
    strategy: str = "EXPONENTIAL"  # FIXED, LINEAR, EXPONENTIAL
    max_retries: int = 3
    backoff_factor: int = 2
    backoff_max_delay: int = 60

class RetryPolicyOut(BaseModel):
    id: int
    strategy: str
    max_retries: int
    backoff_factor: int
    backoff_max_delay: int
    
    class Config:
        from_attributes = True

# --- Queue Schemas ---
class QueueCreate(BaseModel):
    name: str
    priority: str = "MEDIUM"  # HIGH, MEDIUM, LOW
    concurrency_limit: Optional[int] = None
    retry_policy: Optional[RetryPolicyCreate] = None

class QueueUpdate(BaseModel):
    priority: Optional[str] = None
    concurrency_limit: Optional[int] = None
    is_paused: Optional[bool] = None

class QueueOut(BaseModel):
    id: int
    name: str
    project_id: int
    priority: str
    concurrency_limit: Optional[int]
    is_paused: bool
    created_at: datetime
    retry_policy: Optional[RetryPolicyOut] = None
    
    # Custom counts for dashboard dashboard view
    pending_count: int = 0
    running_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    
    class Config:
        from_attributes = True

# --- Job Schemas ---
class JobCreate(BaseModel):
    name: str
    queue_name: str
    priority: int = 1  # higher priority first
    payload: Optional[Dict[str, Any]] = None
    scheduled_at: Optional[datetime] = None
    batch_id: Optional[str] = None
    cron_schedule_id: Optional[int] = None

# --- Batch Job Schemas ---
class BatchCreate(BaseModel):
    name: str
    queue_name: str
    priority: int = 1
    payloads: List[Dict[str, Any]]

class BatchOut(BaseModel):
    id: str
    name: str
    status: str
    total_count: int
    completed_count: int
    failed_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Cron Schedule Schemas ---
class CronScheduleCreate(BaseModel):
    name: str
    cron_expression: str
    queue_name: str
    priority: int = 1
    payload: Optional[Dict[str, Any]] = None

class CronScheduleOut(BaseModel):
    id: int
    name: str
    cron_expression: str
    queue_id: int
    priority: int
    payload: Optional[Dict[str, Any]]
    last_run_at: Optional[datetime]
    next_run_at: datetime
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class JobExecutionOut(BaseModel):
    id: int
    job_id: str
    worker_id: Optional[str]
    status: str
    error_message: Optional[str]
    attempt_number: int
    started_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class JobLogOut(BaseModel):
    id: int
    timestamp: datetime
    level: str
    message: str
    
    class Config:
        from_attributes = True

class DeadLetterJobOut(BaseModel):
    id: int
    job_id: str
    queue_id: int
    failed_at: datetime
    error_message: Optional[str]
    failure_summary: Optional[str]
    failure_category: Optional[str]
    
    class Config:
        from_attributes = True

class JobOut(BaseModel):
    id: str
    name: str
    queue_id: int
    status: str
    priority: int
    payload: Optional[Dict[str, Any]]
    error_message: Optional[str]
    worker_id: Optional[str]
    scheduled_at: Optional[datetime]
    claimed_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    retry_count: int
    batch_id: Optional[str]
    cron_schedule_id: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

class JobDetailsOut(JobOut):
    queue_name: str
    retry_policy: Optional[RetryPolicyOut] = None
    executions: List[JobExecutionOut] = []
    logs: List[JobLogOut] = []
    dlq_entry: Optional[DeadLetterJobOut] = None
    
    class Config:
        from_attributes = True

# --- Paginated Jobs ---
class PaginatedJobsOut(BaseModel):
    items: List[JobOut]
    page: int
    page_size: int
    total: int
    total_pages: int

# --- Worker Schemas ---
class WorkerHeartbeatSchema(BaseModel):
    status: str = "healthy"  # healthy, busy, unhealthy, dead
    metadata_info: Optional[Dict[str, Any]] = None

class WorkerOut(BaseModel):
    id: str
    status: str
    last_heartbeat: datetime
    metadata_info: Optional[Dict[str, Any]]
    active_jobs_count: int = 0
    affected_jobs_count: int = 0
    requeued_jobs_count: int = 0
    dlq_jobs_count: int = 0
    
    class Config:
        from_attributes = True

# --- Metrics & Analytics ---
class StatsOverview(BaseModel):
    completed: int
    running: int
    failed: int
    queued: int
    active_workers: int
    throughput_per_minute: float

class ThroughputDataPoint(BaseModel):
    time: str  # HH:MM format
    completed: int
    failed: int
