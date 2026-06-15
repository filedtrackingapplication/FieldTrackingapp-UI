from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "TrackForce"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database — swap to PostgreSQL in production:
    # DATABASE_URL=postgresql://user:pass@host:5432/trackforce
    DATABASE_URL: str = "sqlite:///./field_tracking.db"

    # DB connection pool (PostgreSQL)
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800  # recycle connections every 30 min

    # Redis (optional — set to empty string to disable)
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = True

    # Location buffer flush interval (seconds)
    LOCATION_FLUSH_INTERVAL: float = 2.0
    # Max locations to buffer per worker before force-flush
    LOCATION_BUFFER_MAX: int = 200

    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    ALLOWED_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]

    # File Upload
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB

    # Rate limiting (requests per minute per IP)
    RATE_LIMIT_LOCATION: str = "120/minute"   # agents sending GPS
    RATE_LIMIT_DEFAULT: str = "60/minute"

    class Config:
        env_file = ".env"


settings = Settings()

