import threading
import time
import logging
from sqlalchemy.orm import Session
from app.database import SessionLocal, Base, engine
from app import crud, models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrix-scheduler")

class FailoverDaemon(threading.Thread):
    def __init__(self, check_interval: int = 5):
        super().__init__()
        self.check_interval = check_interval
        self._stop_event = threading.Event()
        self.daemon = True

    def run(self):
        logger.info("Orchestrix Worker Failover Daemon started.")
        while not self._stop_event.is_set():
            db = SessionLocal()
            try:
                # Scan and clean up dead workers
                crud.cleanup_dead_workers(db)
                # Tick cron schedules
                crud.tick_cron_schedules(db)
            except Exception as e:
                logger.error(f"Error in Failover Daemon: {e}")
            finally:
                db.close()
            time.sleep(self.check_interval)

    def stop(self):
        self._stop_event.set()
        logger.info("Orchestrix Worker Failover Daemon stopping.")

def init_db():
    logger.info("Initializing Orchestrix Database Schemas.")
    # Create tables
    Base.metadata.create_all(bind=engine)
