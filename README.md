# Orchestrix: Distributed Job Orchestration & Execution Platform

Orchestrix is a high-reliability, highly observable distributed job orchestration platform built using **FastAPI** (Python backend), **React + Vite + Tailwind CSS** (Frontend Dashboard), and **PostgreSQL** (Primary Database) with fully concurrent async **python execution workers**.

Instead of a basic CRUD dashboard, Orchestrix is designed like a production-grade developer platform (modeled after Temporal and Celery) focusing on core systems engineering parameters: database design, concurrency controls, failover reliability, and observability.

---

## 📺 System Diagrams

### High-Level System Architecture
![Orchestrix Architecture](docs/architecture.png)

### Entity-Relationship Diagram (ERD)
![Orchestrix Database Schema (ERD)](docs/er-diagram.png)

---

## 🛠️ System Architecture & Database Design

### Primary Database: PostgreSQL
*SQLite is supported only as an optional local development fallback.*

### 1. Concurrency-Safe Atomic Job Claiming
To prevent duplicate job execution (where two workers pull the same job), Orchestrix uses database-level row locking:
- **PostgreSQL implementation**: Uses `SELECT FOR UPDATE SKIP LOCKED` inside a transaction. Locked jobs are skipped by competing workers, allowing multiple workers to poll concurrently without synchronization bottlenecks.
- **SQLite implementation**: Uses WAL (Write-Ahead Logging) mode and serializes claims inside `IMMEDIATE` write transactions.

### 2. Multi-Tenant Queue & Concurrency Controls
- **Queue Isolation**: Jobs are partitioned into custom queues (e.g. `email-processing`, `payment-processing`, `report-generation`).
- **Concurrency Limits**: Each queue can define a maximum number of concurrent executions (e.g., limit `report-generation` queue to 2 slots to prevent high memory usage). Workers query active slot counts atomically during the claim process.
- **Queue Pause/Resume**: Toggling a queue to paused immediately stops workers from claiming new jobs in that queue, without interrupting currently running jobs.

### 3. Worker Health Intelligence & Failover
- **Telemetry**: Workers report state metrics (CPU, RAM, active tasks count) every 5 seconds.
- **Failover Daemon**: A background failover daemon in the API engine scans for dead workers (heartbeat stopped > 15s).
- **Automatic Recovery**: Running jobs on dead workers are automatically intercepted and either:
  1. Re-queued for retry (with exponential backoff) if under the queue's retry threshold.
  2. Promoted to the **Dead Letter Queue (DLQ)** if max retries are exceeded.

### 4. Orchestrix Insight (Failure Analytics)
When a job fails and moves to the DLQ, Orchestrix analyzes the execution stack trace and logs, classifying the failure (e.g., `NETWORK_TIMEOUT`, `DATABASE_LOCK`, `CODE_BUG`, `AUTHENTICATION_FAILURE`) and generating a structured suggestion.

---

## 📂 Folder Structure

```text
orchestrix/
├── backend/
│   ├── alembic/             # Database migrations
│   │   └── versions/
│   │       └── 001_initial_schema.py
│   ├── app/
│   │   ├── router/          # Auth, Projects, Queues, Jobs, Workers, Metrics APIs
│   │   ├── scheduler/       # Failover daemon
│   │   ├── config.py        # Settings (JWT secrets, DB url)
│   │   ├── database.py      # SQLAlchemy setup & SQLite WAL mode hooks
│   │   ├── models.py        # Relational models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── crud.py          # Atomic claims, failover queries, and insights
│   │   └── main.py          # FastAPI application & Seed data
│   ├── worker/
│   │   └── main.py          # Async python worker client
│   ├── scripts/
│   │   └── seed_demo.py     # Demo database seeder script
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/      # Sidebar, Layouts
    │   ├── context/         # AuthContext (JWT local persistence)
    │   ├── pages/           # Dashboard, Queue Manager, Jobs, DLQ, Settings
    │   ├── App.jsx          # Route mapping
    │   └── index.css        # Tailwind imports & customized styling
    └── package.json
```

---

## 🚀 Setup & Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker & Docker Compose (for PostgreSQL)

Follow these steps in order to spin up the entire system:

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Configure backend
cd backend
cp .env.example .env

# 3. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Windows:
# .\venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start API
PYTHONPATH=. uvicorn app.main:app --reload

# 6. Start worker in another terminal (with venv activated)
PYTHONPATH=. python worker/main.py

# 7. Start frontend
cd ../frontend
npm install
npm run dev
```

### 📺 Quick Demo Terminal Mappings

To demo the fully distributed worker execution system, open the following terminals:

*   **Terminal 1**: PostgreSQL container (`docker compose up -d`)
*   **Terminal 2**: FastAPI Web Server (`PYTHONPATH=. uvicorn app.main:app --reload`)
*   **Terminal 3**: Worker Node 01 (`PYTHONPATH=. python worker/main.py`)
*   **Terminal 4**: Worker Node 02 (`PYTHONPATH=. python worker/main.py`)
*   **Terminal 5**: Worker Node 03 (`PYTHONPATH=. python worker/main.py`)
*   **Terminal 6**: React Frontend Dashboard (`npm run dev`)

*Login credentials on frontend:*
- **Username**: `developer`
- **Password**: `password123`

---

## 🧪 Verification & Testing

Orchestrix has two test suites:

### 1. SQLite/Mock Integration Tests
Verifies basic CRUD routers, JWT authentication, and policy endpoints.
```bash
PYTHONPATH=. pytest app/test_main.py -v
```

### 2. PostgreSQL Concurrency Integration Test
Verifies atomic job claims using parallel threads against PostgreSQL:
```bash
PYTHONPATH=. pytest app/test_postgres_concurrency.py -v -s
```
*Note: This test runs only if a live PostgreSQL database is detected, skipping gracefully otherwise.*

**Expected result:**
```text
Created jobs:       100
Claimed jobs:       100
Unique jobs:        100
Duplicate claims:     0
```
This confirms that the database `FOR UPDATE SKIP LOCKED` locking mechanism is perfectly thread-safe and prevents duplicate claims under high parallel loads.
