from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.router import auth, projects, queues, jobs, workers, metrics, dlq, cron
from app.scheduler.engine import init_db, FailoverDaemon
from app.database import SessionLocal
from app.config import settings
from app import crud, models, schemas
import datetime

app = FastAPI(title="Orchestrix API", version="1.0.0")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(queues.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(workers.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(dlq.router, prefix="/api")
app.include_router(cron.router, prefix="/api")

# Failover daemon reference
failover_daemon = None

@app.on_event("startup")
def startup_event():
    global failover_daemon
    
    # Initialize DB (creates tables if they don't exist)
    init_db()
    
    # Warn developer if database is using SQLite fallback or default secrets
    from app.config import settings
    import logging
    logger = logging.getLogger("orchestrix-system")
    
    if "sqlite" in settings.DATABASE_URL.lower():
        logger.warning(
            "⚠️ WARNING: Running with SQLite development fallback database. "
            "PostgreSQL is the primary database. Concurrency claims locking (FOR UPDATE SKIP LOCKED) "
            "is simulated with global threading locks in SQLite dev mode."
        )
    else:
        logger.info("✅ Database: Primary PostgreSQL engine connected.")
        
    if settings.IS_DEFAULT_SECRET:
        logger.warning(
            "Default JWT secret is in use. "
            "Set JWT_SECRET in backend/.env "
            "before production deployment."
        )
    
    # Start failover checker thread
    failover_daemon = FailoverDaemon(check_interval=5)
    failover_daemon.start()
    
    # Seed mock data if enabled and no users exist
    if settings.SEED_DEMO_DATA:
        seed_mock_data()

@app.on_event("shutdown")
def shutdown_event():
    global failover_daemon
    if failover_daemon:
        failover_daemon.stop()

def seed_mock_data():
    db = SessionLocal()
    try:
        # Check if we already have users
        user_count = db.query(models.User).count()
        if user_count > 0:
            return
            
        # Create a default developer account
        admin_user = schemas.UserCreate(username="developer", password="password123")
        user = crud.create_user(db, admin_user)
        
        # We now have a project and queues seeded by create_user. Let's find them.
        project = db.query(models.Project).first()
        if not project:
            return
            
        # Create some completed, running, failed, and DLQ jobs to populate the charts/stats
        email_queue = crud.get_queue_by_name(db, "email")
        payments_queue = crud.get_queue_by_name(db, "payments")
        reports_queue = crud.get_queue_by_name(db, "reports")
        notifications_queue = crud.get_queue_by_name(db, "notifications")
        
        # Enqueue some seed jobs
        # 1. Active Running jobs
        # We need mock workers to own them
        worker1 = models.Worker(id="Worker-01", status="healthy", last_heartbeat=datetime.datetime.utcnow())
        worker2 = models.Worker(id="Worker-02", status="healthy", last_heartbeat=datetime.datetime.utcnow())
        worker3 = models.Worker(id="Worker-03", status="busy", last_heartbeat=datetime.datetime.utcnow())
        db.add_all([worker1, worker2, worker3])
        db.commit()
        
        # 2. Add Completed Jobs (last 15 minutes)
        now = datetime.datetime.utcnow()
        for i in range(50):
            completion_time = now - datetime.timedelta(minutes=float(i) * 0.3)
            job = models.Job(
                id=crud.generate_job_id(),
                name=f"Send Newsletter Batch {i}",
                queue_id=email_queue.id,
                status="completed",
                priority=1,
                payload={"batch_id": i, "recipients": 100},
                worker_id="Worker-01",
                claimed_at=completion_time - datetime.timedelta(seconds=2),
                started_at=completion_time - datetime.timedelta(seconds=2),
                completed_at=completion_time,
                retry_count=0,
                created_at=completion_time - datetime.timedelta(seconds=5),
                updated_at=completion_time
            )
            db.add(job)
            
            # Add execution log for some jobs
            if i % 10 == 0:
                db.flush() # get database instance
                exec_rec = models.JobExecution(
                    job_id=job.id, worker_id="Worker-01", status="completed", attempt_number=1,
                    started_at=job.started_at, completed_at=job.completed_at
                )
                db.add(exec_rec)
                
        # 3. Add Failed and DLQ Jobs
        # Job A: Network failure
        dlq_job1 = models.Job(
            id="JOB-C19D",
            name="Process Paypal Settlement",
            queue_id=payments_queue.id,
            status="dlq",
            priority=3,
            payload={"amount": 499.00, "txn_id": "PAY-8291A"},
            error_message="HTTPConnectionError: Connection timed out after 30 seconds when reaching api.paypal.com",
            worker_id="Worker-03",
            created_at=now - datetime.timedelta(minutes=10),
            updated_at=now - datetime.timedelta(minutes=8),
            retry_count=3
        )
        db.add(dlq_job1)
        db.flush()
        
        analysis1 = crud.analyze_failure(dlq_job1.error_message)
        dlq_entry1 = models.DeadLetterJob(
            job_id=dlq_job1.id,
            queue_id=payments_queue.id,
            failed_at=now - datetime.timedelta(minutes=8),
            error_message=dlq_job1.error_message,
            failure_category=analysis1["category"],
            failure_summary=analysis1["summary"]
        )
        db.add(dlq_entry1)
        
        # Log timeline for this job
        crud.log_job_event(db, dlq_job1.id, "INFO", "Job created and added to payments queue")
        crud.log_job_event(db, dlq_job1.id, "WARNING", "Attempt 1 failed. Scheduled for retry.")
        crud.log_job_event(db, dlq_job1.id, "WARNING", "Attempt 2 failed. Scheduled for retry.")
        crud.log_job_event(db, dlq_job1.id, "ERROR", "Attempt 3 failed. No retries left. Moved to Dead Letter Queue.")

        # Job B: Bug in code
        dlq_job2 = models.Job(
            id="JOB-E81K",
            name="Generate Financial PDF",
            queue_id=reports_queue.id,
            status="dlq",
            priority=2,
            payload={"year": 2026, "month": "June"},
            error_message="KeyError: 'revenue_totals' missing from payload dictionary",
            worker_id="Worker-02",
            created_at=now - datetime.timedelta(minutes=15),
            updated_at=now - datetime.timedelta(minutes=12),
            retry_count=2
        )
        db.add(dlq_job2)
        db.flush()
        
        analysis2 = crud.analyze_failure(dlq_job2.error_message)
        dlq_entry2 = models.DeadLetterJob(
            job_id=dlq_job2.id,
            queue_id=reports_queue.id,
            failed_at=now - datetime.timedelta(minutes=12),
            error_message=dlq_job2.error_message,
            failure_category=analysis2["category"],
            failure_summary=analysis2["summary"]
        )
        db.add(dlq_entry2)
        
        crud.log_job_event(db, dlq_job2.id, "INFO", "Job created and added to reports queue")
        crud.log_job_event(db, dlq_job2.id, "ERROR", "KeyError: 'revenue_totals' missing during PDF generation")

        # 4. Currently running jobs
        running1 = models.Job(
            id="JOB-B72C",
            name="Bulk Sync CRM Contacts",
            queue_id=reports_queue.id,
            status="running",
            priority=1,
            payload={"sync_source": "Hubspot"},
            worker_id="Worker-03",
            claimed_at=now - datetime.timedelta(seconds=12),
            started_at=now - datetime.timedelta(seconds=10),
            created_at=now - datetime.timedelta(minutes=2),
            updated_at=now
        )
        db.add(running1)
        
        running2 = models.Job(
            id="JOB-D82K",
            name="Slack Channel Alert Dispatch",
            queue_id=notifications_queue.id,
            status="running",
            priority=2,
            payload={"channel": "#ops-alerts", "message": "High latency detected on api gateway"},
            worker_id="Worker-01",
            claimed_at=now - datetime.timedelta(seconds=5),
            started_at=now - datetime.timedelta(seconds=4),
            created_at=now - datetime.timedelta(seconds=10),
            updated_at=now
        )
        db.add(running2)

        # 5. Some Queued Jobs
        for i in range(8):
            queued_job = models.Job(
                id=crud.generate_job_id(),
                name=f"Queue Notifications Alert #{i}",
                queue_id=notifications_queue.id,
                status="queued",
                priority=1,
                payload={"user_id": 1000 + i, "event": "alert_dispatched"},
                created_at=now - datetime.timedelta(seconds=i * 10),
                updated_at=now - datetime.timedelta(seconds=i * 10)
            )
            db.add(queued_job)
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error seeding mock data: {e}")
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to Orchestrix API. The distributed job orchestration platform."}
