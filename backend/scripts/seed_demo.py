import datetime
import sys
import os

# Adjust path to make sure app imports work
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, Base, engine
from app import models, crud, schemas
from app.security import get_password_hash

def seed_demo_data():
    db = SessionLocal()
    # Re-create all tables
    Base.metadata.create_all(bind=engine)
    
    try:
        print("Cleaning up old database records...")
        db.query(models.JobLog).delete()
        db.query(models.JobExecution).delete()
        db.query(models.DeadLetterJob).delete()
        db.query(models.Job).delete()
        db.query(models.CronSchedule).delete()
        db.query(models.Queue).delete()
        db.query(models.RetryPolicy).delete()
        db.query(models.WorkerHeartbeat).delete()
        db.query(models.Worker).delete()
        db.query(models.Project).delete()
        db.execute(models.organization_members.delete())
        db.query(models.Organization).delete()
        db.query(models.User).delete()
        db.commit()
        
        print("Creating demo developer account...")
        user = models.User(username="developer", hashed_password=get_password_hash("password123"))
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print("Creating demo Organization & Project...")
        org = models.Organization(name="Demo Org")
        db.add(org)
        db.commit()
        db.refresh(org)
        
        project = models.Project(name="Demo Project", organization_id=org.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # Link user to org
        db.execute(
            models.organization_members.insert().values(
                organization_id=org.id,
                user_id=user.id,
                role="owner"
            )
        )
        db.commit()
        
        print("Creating 3 specialized Queues...")
        q_email = crud.create_queue(
            db, 
            schemas.QueueCreate(name="email-processing", priority="HIGH", concurrency_limit=10),
            project.id
        )
        q_payment = crud.create_queue(
            db,
            schemas.QueueCreate(name="payment-processing", priority="HIGH", concurrency_limit=5),
            project.id
        )
        q_report = crud.create_queue(
            db,
            schemas.QueueCreate(name="report-generation", priority="MEDIUM", concurrency_limit=2),
            project.id
        )
        
        # Add mock worker nodes
        worker1 = models.Worker(id="Worker-01", status="healthy", last_heartbeat=datetime.datetime.utcnow())
        worker2 = models.Worker(id="Worker-02", status="healthy", last_heartbeat=datetime.datetime.utcnow())
        worker3 = models.Worker(id="Worker-03", status="busy", last_heartbeat=datetime.datetime.utcnow())
        db.add_all([worker1, worker2, worker3])
        db.commit()
        
        now = datetime.datetime.utcnow()
        
        print("Seeding 70 completed/successful jobs...")
        for i in range(70):
            q_target = q_email if i % 3 == 0 else (q_payment if i % 3 == 1 else q_report)
            completion_time = now - datetime.timedelta(minutes=float(i) * 0.5)
            job = models.Job(
                id=crud.generate_job_id(),
                name=f"Sync Stripe Session {i + 1000}" if q_target.name == "payment-processing" else (f"Render PDF Invoice {i}" if q_target.name == "report-generation" else f"Welcome Email Newsletter {i}"),
                queue_id=q_target.id,
                status="completed",
                priority=1 if i % 2 == 0 else 2,
                payload={"user_id": i + 100, "meta": "demo_seed"},
                worker_id="Worker-01" if i % 2 == 0 else "Worker-02",
                claimed_at=completion_time - datetime.timedelta(seconds=3),
                started_at=completion_time - datetime.timedelta(seconds=2),
                completed_at=completion_time,
                retry_count=0,
                created_at=completion_time - datetime.timedelta(seconds=10),
                updated_at=completion_time
            )
            db.add(job)
            
            # Add execution histories for some of them
            if i % 5 == 0:
                db.flush()
                exec_rec = models.JobExecution(
                    job_id=job.id, worker_id=job.worker_id, status="completed", attempt_number=1,
                    started_at=job.started_at, completed_at=job.completed_at
                )
                db.add(exec_rec)
                
        print("Seeding 20 delayed/scheduled jobs...")
        for i in range(20):
            q_target = q_email if i % 2 == 0 else q_report
            scheduled_time = now + datetime.timedelta(minutes=float(i + 1) * 5)
            job = models.Job(
                id=crud.generate_job_id(),
                name=f"Delayed Report Sync {i}",
                queue_id=q_target.id,
                status="scheduled",
                priority=1,
                payload={"meta": "delayed_seed"},
                scheduled_at=scheduled_time,
                created_at=now,
                updated_at=now
            )
            db.add(job)
            
        print("Seeding 5 retry-demo jobs (currently retrying)...")
        for i in range(5):
            job = models.Job(
                id=crud.generate_job_id(),
                name=f"Retry Active Transaction {i}",
                queue_id=q_payment.id,
                status="queued",
                priority=2,
                payload={"meta": "retry_seed", "txn_id": i * 100},
                retry_count=1,
                created_at=now - datetime.timedelta(minutes=5),
                updated_at=now
            )
            db.add(job)
            
        print("Seeding 5 permanently failed/DLQ jobs...")
        # DLQ Job 1
        job1 = models.Job(
            id="JOB-F81A", name="Stripe Settlement Reconcile", queue_id=q_payment.id,
            status="dlq", priority=5, payload={"amount": 1000}, error_message="HTTPConnectionError: Connection reset by peer stripe.api.com",
            retry_count=3, created_at=now - datetime.timedelta(hours=1), updated_at=now
        )
        db.add(job1)
        db.flush()
        
        dlq_entry1 = models.DeadLetterJob(
            job_id=job1.id, queue_id=q_payment.id, failed_at=now,
            error_message=job1.error_message,
            failure_category="NETWORK_TIMEOUT",
            failure_summary="External settlement requests to stripe.api.com timed out or reset the tcp handshake connection."
        )
        db.add(dlq_entry1)
        
        # DLQ Job 2
        job2 = models.Job(
            id="JOB-F81B", name="Monthly Tax Statement Compilation", queue_id=q_report.id,
            status="dlq", priority=2, payload={"year": 2026}, error_message="KeyError: 'revenue_totals' missing from parameters",
            retry_count=3, created_at=now - datetime.timedelta(hours=2), updated_at=now
        )
        db.add(job2)
        db.flush()
        
        dlq_entry2 = models.DeadLetterJob(
            job_id=job2.id, queue_id=q_report.id, failed_at=now - datetime.timedelta(minutes=30),
            error_message=job2.error_message,
            failure_category="CODE_BUG",
            failure_summary="KeyError occurred inside the report builder function since 'revenue_totals' was not initialized."
        )
        db.add(dlq_entry2)

        # Seeding remaining failed jobs
        for i in range(3):
            failed_job = models.Job(
                id=crud.generate_job_id(), name=f"Bulk User Invocation {i}", queue_id=q_email.id,
                status="dlq", priority=1, payload={"user_id": 999}, error_message="SMTPConnectionError: Could not connect to mailserver port 25",
                retry_count=3, created_at=now - datetime.timedelta(hours=3), updated_at=now
            )
            db.add(failed_job)
            db.flush()
            
            dlq_entry = models.DeadLetterJob(
                job_id=failed_job.id, queue_id=q_email.id, failed_at=now - datetime.timedelta(hours=1),
                error_message=failed_job.error_message,
                failure_category="NETWORK_TIMEOUT",
                failure_summary="Mail host SMTP connection timed out when trying to flush out welcome queues."
            )
            db.add(dlq_entry)
            
        db.commit()
        print("Demo data seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding demo data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_data()
