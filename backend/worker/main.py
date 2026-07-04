import asyncio
import httpx
import os
import random
import uuid
import sys
import logging
import signal
from typing import Dict, Any

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("orchestrix-worker")

# Configurations
API_URL = os.getenv("API_URL", "http://localhost:8000/api")
WORKER_CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "3"))
HEARTBEAT_INTERVAL = 5.0
POLL_INTERVAL = 2.0

# Generate a unique worker name: Worker-XXXX
WORKER_ID = os.getenv("WORKER_ID", f"Worker-{str(uuid.uuid4())[:4].upper()}")

class OrchestrixWorker:
    def __init__(self, worker_id: str, api_url: str, max_concurrency: int):
        self.worker_id = worker_id
        self.api_url = api_url
        self.max_concurrency = max_concurrency
        self.active_tasks = 0
        self.client = httpx.AsyncClient(timeout=10.0)
        self.is_running = False

    async def send_heartbeat(self):
        while self.is_running:
            try:
                status = "busy" if self.active_tasks >= self.max_concurrency else "healthy"
                # Simulated system metrics
                cpu = round(random.uniform(5.0, 45.0) if status == "healthy" else random.uniform(60.0, 92.0), 1)
                memory = round(random.uniform(30.0, 75.0), 1)
                
                payload = {
                    "status": status,
                    "metadata_info": {
                        "cpu_usage": f"{cpu}%",
                        "memory_usage": f"{memory}%",
                        "active_slots": f"{self.active_tasks}/{self.max_concurrency}",
                        "os": sys.platform
                    }
                }
                url = f"{self.api_url}/workers/{self.worker_id}/heartbeat"
                await self.client.post(url, json=payload)
                logger.debug(f"Heartbeat sent. Status: {status}")
            except Exception as e:
                logger.error(f"Failed to send heartbeat: {e}")
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def execute_job(self, job: Dict[str, Any]):
        self.active_tasks += 1
        job_id = job["id"]
        job_name = job["name"]
        logger.info(f"Starting execution of job {job_id} ({job_name})")
        
        try:
            # 1. Simulate progress and send execution log
            await asyncio.sleep(1.0)
            
            # 2. Determine execution outcome based on payload or job description
            payload = job.get("payload") or {}
            
            # Explicit failure trigger or database simulation
            should_fail = payload.get("simulate_fail", False)
            fail_reason = payload.get("fail_reason", "Unexpected runtime exception")
            
            # Deterministic simulation based on common seed names
            if "paypal" in job_name.lower():
                should_fail = True
                fail_reason = "HTTPConnectionError: Connection timed out after 30 seconds when reaching api.paypal.com"
            elif "financial pdf" in job_name.lower():
                should_fail = True
                fail_reason = "KeyError: 'revenue_totals' missing from payload dictionary"
            elif "crm" in job_name.lower() and random.random() < 0.15:
                # 15% random failure rate for crm contacts sync
                should_fail = True
                fail_reason = "SQLAlchemy.exc.OperationalError: (psycopg2.errors.DeadlockDetected) deadlock detected"

            # Check if job was delayed
            await asyncio.sleep(random.uniform(1.0, 3.0))

            if should_fail:
                logger.warning(f"Job {job_id} failed: {fail_reason}")
                url = f"{self.api_url}/workers/{self.worker_id}/jobs/{job_id}/fail"
                await self.client.post(url, json={"error_msg": fail_reason})
            else:
                logger.info(f"Job {job_id} completed successfully.")
                url = f"{self.api_url}/workers/{self.worker_id}/jobs/{job_id}/complete"
                await self.client.post(url)
                
        except Exception as e:
            logger.error(f"Error executing job {job_id}: {e}")
            try:
                url = f"{self.api_url}/workers/{self.worker_id}/jobs/{job_id}/fail"
                await self.client.post(url, json={"error_msg": str(e)})
            except Exception as api_err:
                logger.error(f"Could not report job failure to API: {api_err}")
        finally:
            self.active_tasks -= 1

    async def poll_and_claim(self):
        while self.is_running:
            # Only poll if we have capacity
            if self.active_tasks < self.max_concurrency:
                try:
                    url = f"{self.api_url}/workers/{self.worker_id}/claim"
                    response = await self.client.post(url)
                    if response.status_code == 200:
                        job = response.json()
                        if job:  # Job successfully claimed
                            asyncio.create_task(self.execute_job(job))
                            # Poll immediately if we got a job
                            continue
                except Exception as e:
                    logger.error(f"Error polling for jobs: {e}")
            try:
                await asyncio.sleep(POLL_INTERVAL)
            except asyncio.CancelledError:
                break

    async def start(self):
        logger.info(f"Starting Orchestrix Worker (ID: {self.worker_id}, Concurrency: {self.max_concurrency})")
        self.is_running = True
        
        # Setup signal handlers for SIGINT/SIGTERM
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(self.shutdown(s.name)))
            except NotImplementedError:
                pass

        # Start heartbeat and poll tasks
        self.heartbeat_task = asyncio.create_task(self.send_heartbeat())
        self.poll_task = asyncio.create_task(self.poll_and_claim())
        
        try:
            await asyncio.gather(self.heartbeat_task, self.poll_task)
        except asyncio.CancelledError:
            logger.info("Worker loops cancelled.")
        finally:
            await self.cleanup()

    async def shutdown(self, sig_name):
        logger.info(f"Shutting down due to {sig_name}...")
        self.is_running = False
        
        # Stop polling immediately
        if hasattr(self, 'poll_task') and not self.poll_task.done():
            self.poll_task.cancel()
            
        # Grace period for active tasks
        grace_seconds = 5
        while self.active_tasks > 0 and grace_seconds > 0:
            logger.info(f"Waiting for {self.active_tasks} active tasks to complete... ({grace_seconds}s remaining)")
            await asyncio.sleep(1.0)
            grace_seconds -= 1
            
        # Send offline status heartbeat
        try:
            url = f"{self.api_url}/workers/{self.worker_id}/heartbeat"
            payload = {
                "status": "offline",
                "metadata_info": {
                    "active_slots": f"0/{self.max_concurrency}",
                    "os": sys.platform,
                    "event": "graceful_shutdown"
                }
            }
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(url, json=payload)
            logger.info("Worker cleanly marked OFFLINE in registry.")
        except Exception as e:
            logger.error(f"Failed to send offline heartbeat during shutdown: {e}")

        # Cancel heartbeat task
        if hasattr(self, 'heartbeat_task') and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()

    async def cleanup(self):
        self.is_running = False
        await self.client.aclose()
        logger.info("Worker stopped.")

if __name__ == "__main__":
    worker = OrchestrixWorker(WORKER_ID, API_URL, WORKER_CONCURRENCY)
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        logger.info("Worker process terminated by user.")
