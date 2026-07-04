import pytest
import os
import threading
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import Base
from app import models, schemas, crud

# Skip test if database is not PostgreSQL or is not reachable
is_postgres = settings.DATABASE_URL.startswith("postgresql")
postgres_available = False

if is_postgres:
    try:
        # Attempt to establish a test connection
        engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 2})
        conn = engine.connect()
        conn.close()
        postgres_available = True
    except Exception:
        postgres_available = False

@pytest.mark.skipif(not postgres_available, reason="PostgreSQL server must be running and accessible to run this concurrency test")
def test_postgres_atomic_claiming_concurrency():
    # Set up engine and SessionLocal specifically for this PostgreSQL run
    engine = create_engine(settings.DATABASE_URL)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Initialize schema
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    try:
        # Create a fresh test organization, project, user, and queue
        timestamp = int(time.time() * 1000)
        username = f"pg_test_user_{timestamp}"
        org_name = f"pg_test_org_{timestamp}"
        proj_name = f"pg_test_proj_{timestamp}"
        queue_name = f"pg_test_queue_{timestamp}"
        
        # User
        from app.security import get_password_hash
        user = models.User(username=username, hashed_password=get_password_hash("testpassword"))
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Org & Project
        org = models.Organization(name=org_name, owner_id=user.id)
        db.add(org)
        db.commit()
        db.refresh(org)
        
        project = models.Project(name=proj_name, organization_id=org.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # Add user membership
        member = models.UserOrganization(user_id=user.id, organization_id=org.id)
        db.add(member)
        
        # Retry Policy
        retry_policy = models.RetryPolicy(
            strategy="EXPONENTIAL",
            backoff_factor=2,
            backoff_max_delay=60,
            max_retries=3
        )
        db.add(retry_policy)
        db.commit()
        db.refresh(retry_policy)
        
        # Queue
        queue = models.Queue(
            name=queue_name,
            project_id=project.id,
            priority="HIGH",
            concurrency_limit=None, # Allow infinite concurrency for claiming test
            retry_policy_id=retry_policy.id
        )
        db.add(queue)
        db.commit()
        db.refresh(queue)
        
        # 1. Enqueue 100 jobs to our test queue
        job_ids = []
        for i in range(100):
            job = schemas.JobCreate(
                name=f"PG Concurrency Task {i}",
                queue_name=queue_name,
                priority=1
            )
            db_job = crud.create_job(db, job)
            job_ids.append(db_job.id)
            
        claimed_ids = []
        lock = threading.Lock()
        
        # 2. Worker thread target
        def worker_thread(worker_id):
            thread_db = TestingSessionLocal()
            try:
                # Keep claiming until queue is empty
                while True:
                    claimed = crud.claim_next_job(thread_db, worker_id)
                    if not claimed:
                        break
                    with lock:
                        claimed_ids.append(claimed.id)
                    time.sleep(0.005) # Tiny yield
            except Exception as e:
                print(f"Postgres Worker Thread Error: {e}")
            finally:
                thread_db.close()
                
        # 3. Spin up 10 concurrent threads polling concurrently
        threads = []
        for i in range(10):
            t = threading.Thread(target=worker_thread, args=(f"pg-worker-{i}",))
            threads.append(t)
            t.start()
            
        for t in threads:
            t.join()
            
        # 4. Assert claims
        print(f"\n--- PostgreSQL Concurrency Results ---")
        print(f"Created jobs:        {len(job_ids)}")
        print(f"Claimed jobs:        {len(claimed_ids)}")
        print(f"Unique jobs:         {len(set(claimed_ids))}")
        print(f"Duplicate claims:      {len(claimed_ids) - len(set(claimed_ids))}")
        
        assert len(claimed_ids) == 100
        assert len(set(claimed_ids)) == 100
        
    finally:
        # Clean up database tables
        db.close()
