import os
import sys
import time
import socket
import signal
import subprocess

# Configurations
CWD = os.path.dirname(os.path.abspath(__file__))
POSTGRES_DB_URL = "postgresql://orchestrix:orchestrix_pass@localhost:5432/orchestrix"
BACKEND_DIR = os.path.join(CWD, "backend")

processes = []

def cleanup(sig, frame):
    print("\n[Demo Orchestrator] Terminating all processes gracefully...")
    for p in processes:
        try:
            p.terminate()
        except:
            pass
    # Wait a bit for graceful exits (heartbeat updates)
    time.sleep(3)
    for p in processes:
        try:
            p.kill()
        except:
            pass
    print("[Demo Orchestrator] Shutdown complete.")
    sys.exit(0)

# Bind signal handlers
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def wait_for_port(port, host="localhost", timeout=30):
    start_time = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except (socket.timeout, ConnectionRefusedError):
            if time.time() - start_time > timeout:
                return False
            time.sleep(1)

def main():
    print("[Demo Orchestrator] Step 1: Starting PostgreSQL via Docker Compose...")
    # Open Docker Desktop in background just in case
    if sys.platform == "darwin":
        print("[Demo Orchestrator] Attempting to start Docker Desktop (if not already running)...")
        subprocess.run(["open", "-g", "-a", "Docker"])
        
    subprocess.run(["docker-compose", "up", "-d"], cwd=CWD)
    
    print("[Demo Orchestrator] Waiting for PostgreSQL (port 5432) to accept connections...")
    if not wait_for_port(5432, timeout=45):
        print("[Demo Orchestrator] ERROR: PostgreSQL was not ready within 45 seconds. Please ensure Docker is running.")
        sys.exit(1)
    print("[Demo Orchestrator] PostgreSQL is ready!")

    # Wait an extra 2 seconds for Postgres to finish initialization
    time.sleep(2)

    print("[Demo Orchestrator] Step 2: Starting Backend API on http://localhost:8000...")
    backend_env = os.environ.copy()
    backend_env["DATABASE_URL"] = POSTGRES_DB_URL
    backend_env["PYTHONPATH"] = BACKEND_DIR
    
    # Path to virtualenv python
    venv_python = os.path.join(BACKEND_DIR, "venv", "bin", "python")
    if not os.path.exists(venv_python):
        venv_python = "python" # fallback

    backend_proc = subprocess.Popen(
        [os.path.join(BACKEND_DIR, "venv", "bin", "uvicorn"), "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
        env=backend_env
    )
    processes.append(backend_proc)

    print("[Demo Orchestrator] Waiting 5 seconds for Backend API boot...")
    time.sleep(5)

    print("[Demo Orchestrator] Step 3: Spinning up 3 concurrent Worker Clients...")
    for idx in range(1, 4):
        worker_id = f"worker-0{idx}"
        worker_env = os.environ.copy()
        worker_env["WORKER_ID"] = worker_id
        worker_env["API_URL"] = "http://localhost:8000/api"
        worker_env["WORKER_CONCURRENCY"] = "3"
        
        print(f"[Demo Orchestrator] Starting worker node: {worker_id}")
        worker_proc = subprocess.Popen(
            [venv_python, os.path.join(BACKEND_DIR, "worker", "main.py")],
            cwd=BACKEND_DIR,
            env=worker_env
        )
        processes.append(worker_proc)

    print("\n" + "="*60)
    print("  ORCHESTRIX IS ACTIVE (POSTGRESQL DIALECT)")
    print("  Backend API:  http://localhost:8000")
    print("  Active Workers: worker-01, worker-02, worker-03")
    print("  Press Ctrl+C to terminate cleanly.")
    print("="*60 + "\n")

    # Keep main thread alive
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()
