import pytest
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app import models, schemas, crud

# Setup dedicated isolated file SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db_session = TestingSessionLocal()
    
    # Setup baseline data
    # Create default user (which creates default org, project, and queues)
    user_in = schemas.UserCreate(username="testuser", password="testpassword")
    crud.create_user(db_session, user_in)
    
    yield db_session
    
    db_session.close()
    Base.metadata.drop_all(bind=engine)

def test_user_creation(db):
    user = crud.get_user_by_username(db, "testuser")
    assert user is not None
    assert user.username == "testuser"
    
    # Check default project and queues were created
    project = db.query(models.Project).first()
    assert project is not None
    assert project.name == "Default Project"
    
    queues = db.query(models.Queue).all()
    assert len(queues) == 4
    queue_names = [q.name for q in queues]
    assert "email" in queue_names
    assert "payments" in queue_names

def test_job_enqueue_and_priority(db):
    # Enqueue two jobs in the email queue with different priorities
    job1 = schemas.JobCreate(
        name="Low Priority Email",
        queue_name="email",
        priority=1,
        payload={"msg": "hello low"}
    )
    job2 = schemas.JobCreate(
        name="High Priority Email",
        queue_name="email",
        priority=10,
        payload={"msg": "hello high"}
    )
    
    db_job1 = crud.create_job(db, job1)
    db_job2 = crud.create_job(db, job2)
    
    assert db_job1.status == "queued"
    assert db_job2.status == "queued"
    
    # Claim the first job as a worker
    claimed_job = crud.claim_next_job(db, "test-worker-01")
    assert claimed_job is not None
    # High priority job should be claimed first!
    assert claimed_job.id == db_job2.id
    assert claimed_job.status == "claimed"
    assert claimed_job.worker_id == "test-worker-01"
    
    # Claim next job
    next_claimed = crud.claim_next_job(db, "test-worker-01")
    assert next_claimed is not None
    assert next_claimed.id == db_job1.id

def test_queue_concurrency_limit(db):
    # Set concurrency limit of reports queue to 1
    reports_queue = db.query(models.Queue).filter(models.Queue.name == "reports").first()
    crud.update_queue(db, reports_queue.id, schemas.QueueUpdate(concurrency_limit=1))
    
    # Enqueue two jobs in reports
    job1 = schemas.JobCreate(name="Report 1", queue_name="reports", priority=1)
    job2 = schemas.JobCreate(name="Report 2", queue_name="reports", priority=1)
    
    db_job1 = crud.create_job(db, job1)
    db_job2 = crud.create_job(db, job2)
    
    # Claim first job
    claimed1 = crud.claim_next_job(db, "worker-01")
    assert claimed1 is not None
    assert claimed1.id == db_job1.id
    
    # Try to claim second job. Concurrency limit is 1, and 1 is running, so it should NOT be claimable!
    claimed2 = crud.claim_next_job(db, "worker-02")
    assert claimed2 is None  # Skipped because of concurrency limit!
    
    # Complete job 1
    crud.update_execution_success(db, db_job1.id, "worker-01")
    
    # Now job 2 should be claimable
    claimed2 = crud.claim_next_job(db, "worker-02")
    assert claimed2 is not None
    assert claimed2.id == db_job2.id

def test_dead_worker_jobs_are_recovered(db):
    # Enqueue and claim a job
    job = schemas.JobCreate(name="Process Payment", queue_name="payments", priority=5)
    db_job = crud.create_job(db, job)
    
    # Register worker and claim job
    crud.register_worker_heartbeat(db, "worker-dead", "healthy", {"cpu": "10%"})
    claimed = crud.claim_next_job(db, "worker-dead")
    assert claimed is not None
    assert claimed.status == "claimed"
    
    # Mock heartbeat failure by updating worker's last_heartbeat to 30 seconds ago
    worker = db.query(models.Worker).filter(models.Worker.id == "worker-dead").first()
    worker.last_heartbeat = datetime.datetime.utcnow() - datetime.timedelta(seconds=30)
    db.commit()
    
    # Trigger cleanup dead workers (simulating failover daemon)
    crud.cleanup_dead_workers(db)
    
    # Check worker status became 'dead'
    assert worker.status == "dead"
    
    # Check job was recovered and re-queued
    db.refresh(db_job)
    assert db_job.status == "queued"
    assert db_job.retry_count == 1
    assert db_job.worker_id is None

def test_atomic_claim_prevents_duplicate_execution(db):
    import threading
    import time
    
    # Disable email queue concurrency limit to allow all jobs to be claimed
    email_queue = db.query(models.Queue).filter(models.Queue.name == "email").first()
    crud.update_queue(db, email_queue.id, schemas.QueueUpdate(concurrency_limit=None))
    
    # 1. Enqueue 50 jobs
    job_ids = []
    for i in range(50):
        job = schemas.JobCreate(name=f"Concurrency Job {i}", queue_name="email", priority=1)
        db_job = crud.create_job(db, job)
        job_ids.append(db_job.id)
        
    claimed_ids = []
    lock = threading.Lock()
    
    def worker_thread(worker_id):
        # Create a fresh database session for this thread
        thread_db = TestingSessionLocal()
        try:
            while True:
                try:
                    # Claim job
                    claimed = crud.claim_next_job(thread_db, worker_id)
                    if not claimed:
                        break
                    with lock:
                        claimed_ids.append(claimed.id)
                except Exception as ex:
                    import traceback
                    print(f"THREAD EXCEPTION in {worker_id}: {ex}")
                    traceback.print_exc()
                    break
                time.sleep(0.01)
        finally:
            thread_db.close()
            
    # Start 10 concurrent threads simulating 10 workers polling concurrently
    threads = []
    for i in range(10):
        t = threading.Thread(target=worker_thread, args=(f"concurrent-worker-{i}",))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    # Verify that every single job was claimed exactly once with zero duplicates
    assert len(claimed_ids) == 50
    assert len(set(claimed_ids)) == 50

def test_failed_job_retries(db):
    # Enqueue a job
    job = schemas.JobCreate(name="Retry Test Job", queue_name="email", priority=1)
    db_job = crud.create_job(db, job)
    
    # Claim job
    claimed = crud.claim_next_job(db, "worker-01")
    assert claimed is not None
    
    # Fail job execution
    crud.update_execution_failure(db, db_job.id, "worker-01", "Connection reset by peer")
    
    # Verify status is back to queued (or scheduled) and retry_count is 1
    db.refresh(db_job)
    assert db_job.status == "queued"
    assert db_job.retry_count == 1
    assert db_job.worker_id is None

def test_job_moves_to_dlq_after_max_retries(db):
    # Retrieve the email queue and set max retries to 1 for quick testing
    email_queue = db.query(models.Queue).filter(models.Queue.name == "email").first()
    email_queue.retry_policy.max_retries = 1
    db.commit()
    
    # Enqueue a job
    job = schemas.JobCreate(name="DLQ Test Job", queue_name="email", priority=1)
    db_job = crud.create_job(db, job)
    
    # First attempt: claim and fail
    crud.claim_next_job(db, "worker-01")
    crud.update_execution_failure(db, db_job.id, "worker-01", "Attempt 1 failure")
    db.refresh(db_job)
    assert db_job.status == "queued"
    assert db_job.retry_count == 1
    
    # Second attempt (exceeds max_retries = 1): claim and fail
    crud.claim_next_job(db, "worker-01")
    crud.update_execution_failure(db, db_job.id, "worker-01", "Attempt 2 failure")
    db.refresh(db_job)
    
    # Job should be promoted to DLQ
    assert db_job.status == "dlq"
    
    # Assert DLQ table entry exists
    dlq_entry = db.query(models.DeadLetterJob).filter(models.DeadLetterJob.job_id == db_job.id).first()
    assert dlq_entry is not None
    assert dlq_entry.error_message == "Attempt 2 failure"
    assert dlq_entry.failure_category == "APPLICATION_ERROR"

def test_paused_queue_cannot_claim_jobs(db):
    email_queue = db.query(models.Queue).filter(models.Queue.name == "email").first()
    
    # Enqueue a job
    job = schemas.JobCreate(name="Paused Queue Job", queue_name="email", priority=1)
    db_job = crud.create_job(db, job)
    
    # Pause queue
    email_queue.is_paused = True
    db.commit()
    
    # Claim job should return None
    claimed_paused = crud.claim_next_job(db, "worker-01")
    assert claimed_paused is None
    
    # Resume queue
    email_queue.is_paused = False
    db.commit()
    
    # Claim job should succeed now
    claimed_resumed = crud.claim_next_job(db, "worker-01")
    assert claimed_resumed is not None
    assert claimed_resumed.id == db_job.id

def test_user_cannot_access_another_project(db):
    # Retrieve the default testuser and their project created by the db fixture
    user_a = crud.get_user_by_username(db, "testuser")
    user_a_project_id = crud.get_user_project_ids(db, user_id=user_a.id)[0]
    
    # Create user B manually without default queues to avoid UNIQUE constraint conflicts on queue names
    from app.security import get_password_hash
    hashed_pwd = get_password_hash("password123")
    user_b = models.User(username="userb", hashed_password=hashed_pwd)
    db.add(user_b)
    db.commit()
    db.refresh(user_b)
    
    # User A (testuser) should have access to their default project
    assert crud.verify_project_access(db, user_id=user_a.id, project_id=user_a_project_id) is True
    
    # User B should NOT have access to User A's default project
    assert crud.verify_project_access(db, user_id=user_b.id, project_id=user_a_project_id) is False


