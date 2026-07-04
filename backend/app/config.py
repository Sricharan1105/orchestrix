import os

# Load .env manually if it exists in the backend root directory
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_root, ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")

class Settings:
    PROJECT_NAME: str = "Orchestrix"
    
    # Check if default key is overridden in env
    DEFAULT_SECRET_KEY: str = "supersecretkey_orchestrix_2026"
    SECRET_KEY: str = os.getenv("JWT_SECRET", DEFAULT_SECRET_KEY)
    IS_DEFAULT_SECRET: bool = (SECRET_KEY == DEFAULT_SECRET_KEY)
    
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
    
    # Database configuration: defaults to production-inspired PostgreSQL.
    # SQLite can be configured via environment variable override, e.g. DATABASE_URL=sqlite:///./orchestrix.db
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://orchestrix:orchestrix_pass@localhost:5432/orchestrix"
    )
    
    # Worker and failover configurations
    WORKER_HEARTBEAT_TIMEOUT_SECONDS: int = int(os.getenv("WORKER_HEARTBEAT_TIMEOUT_SECONDS", "15"))
    FAILOVER_CHECK_INTERVAL_SECONDS: int = 5
    
    # CORS Configuration
    CORS_ORIGINS_RAW: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    CORS_ORIGINS: list = [
        origin.strip()
        for origin in CORS_ORIGINS_RAW.split(",")
        if origin.strip()
    ]
    
    # Automatic Seeding
    SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "false").lower() in ("true", "1", "yes")

settings = Settings()
