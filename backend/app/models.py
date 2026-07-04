import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON, Table, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

# Association table for many-to-many relationship of organization members
organization_members = Table(
    "organization_members",
    Base.metadata,
    Column("organization_id", Integer, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String, default="member")  # owner, admin, member
)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    organizations = relationship("Organization", secondary=organization_members, back_populates="members")
    audit_logs = relationship("AuditLog", back_populates="user")

class Organization(Base):
    __tablename__ = "organizations"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    members = relationship("User", secondary=organization_members, back_populates="organizations")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    organization = relationship("Organization", back_populates="projects")
    queues = relationship("Queue", back_populates="project", cascade="all, delete-orphan")

class Queue(Base):
    __tablename__ = "queues"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    priority = Column(String, default="MEDIUM")  # HIGH, MEDIUM, LOW
    concurrency_limit = Column(Integer, nullable=True)  # NULL means unlimited
    is_paused = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    project = relationship("Project", back_populates="queues")
    retry_policy = relationship("RetryPolicy", back_populates="queue", uselist=False, cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="queue", cascade="all, delete-orphan")
    cron_schedules = relationship("CronSchedule", back_populates="queue", cascade="all, delete-orphan")

class RetryPolicy(Base):
    __tablename__ = "retry_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queues.id", ondelete="CASCADE"), unique=True, nullable=False)
    strategy = Column(String, default="EXPONENTIAL")  # FIXED, LINEAR, EXPONENTIAL
    max_retries = Column(Integer, default=3)
    backoff_factor = Column(Integer, default=2)  # Exponential backoff base or fixed delay
    backoff_max_delay = Column(Integer, default=60)  # Max wait time in seconds
    
    queue = relationship("Queue", back_populates="retry_policy")

class Batch(Base):
    __tablename__ = "batches"
    
    id = Column(String, primary_key=True, index=True)  # BATCH-XXXX format
    name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    total_count = Column(Integer, default=0)
    completed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    jobs = relationship("Job", back_populates="batch", cascade="all, delete-orphan")

class CronSchedule(Base):
    __tablename__ = "cron_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    cron_expression = Column(String, nullable=False)
    queue_id = Column(Integer, ForeignKey("queues.id", ondelete="CASCADE"), nullable=False)
    payload = Column(JSON, nullable=True)
    priority = Column(Integer, default=1)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    queue = relationship("Queue", back_populates="cron_schedules")
    jobs = relationship("Job", back_populates="cron_schedule")

class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("idx_jobs_queue_status", "queue_id", "status"),
        Index("idx_jobs_status_scheduled", "status", "scheduled_at"),
        Index("idx_jobs_queue_priority_created", "queue_id", "priority", "created_at"),
    )
    
    id = Column(String, primary_key=True, index=True)  # JOB-A81F format
    name = Column(String, nullable=False)
    queue_id = Column(Integer, ForeignKey("queues.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, index=True, default="queued")  # queued, scheduled, claimed, running, completed, failed, dlq
    priority = Column(Integer, default=1)  # Higher is more urgent
    payload = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    worker_id = Column(String, ForeignKey("workers.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Extensions for scheduler schedules/batches
    batch_id = Column(String, ForeignKey("batches.id", ondelete="CASCADE"), nullable=True)
    cron_schedule_id = Column(Integer, ForeignKey("cron_schedules.id", ondelete="SET NULL"), nullable=True)
    
    scheduled_at = Column(DateTime, nullable=True, index=True)
    claimed_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    queue = relationship("Queue", back_populates="jobs")
    worker = relationship("Worker", back_populates="jobs")
    batch = relationship("Batch", back_populates="jobs")
    cron_schedule = relationship("CronSchedule", back_populates="jobs")
    
    executions = relationship("JobExecution", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("JobLog", back_populates="job", cascade="all, delete-orphan")
    dlq_entry = relationship("DeadLetterJob", back_populates="job", uselist=False, cascade="all, delete-orphan")

class JobExecution(Base):
    __tablename__ = "job_executions"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id = Column(String, nullable=True)
    status = Column(String, nullable=False)  # running, completed, failed
    error_message = Column(Text, nullable=True)
    attempt_number = Column(Integer, nullable=False)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    job = relationship("Job", back_populates="executions")

class JobLog(Base):
    __tablename__ = "job_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_id = Column(Integer, ForeignKey("job_executions.id", ondelete="SET NULL"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    level = Column(String, default="INFO")  # INFO, WARNING, ERROR, SUCCESS
    message = Column(Text, nullable=False)
    
    job = relationship("Job", back_populates="logs")

class Worker(Base):
    __tablename__ = "workers"
    
    id = Column(String, primary_key=True, index=True)  # unique worker name
    status = Column(String, default="healthy")  # healthy, busy, unhealthy, dead
    last_heartbeat = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    metadata_info = Column(JSON, nullable=True)  # CPU, memory, OS details
    
    jobs = relationship("Job", back_populates="worker")
    heartbeats = relationship("WorkerHeartbeat", back_populates="worker", cascade="all, delete-orphan")

class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String, ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    status = Column(String, nullable=False)
    metadata_info = Column(JSON, nullable=True)
    
    worker = relationship("Worker", back_populates="heartbeats")

class DeadLetterJob(Base):
    __tablename__ = "dead_letter_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    queue_id = Column(Integer, ForeignKey("queues.id", ondelete="CASCADE"), nullable=False)
    failed_at = Column(DateTime, default=datetime.datetime.utcnow)
    error_message = Column(Text, nullable=True)
    failure_summary = Column(Text, nullable=True)  # Orchestrix Insight Summary
    failure_category = Column(String, nullable=True)  # NETWORK, TIMEOUT, DATABASE, BUG, OOM, etc.
    
    job = relationship("Job", back_populates="dlq_entry")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)  # CREATE_QUEUE, PAUSE_QUEUE, etc.
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    details = Column(String, nullable=True)
    
    user = relationship("User", back_populates="audit_logs")
