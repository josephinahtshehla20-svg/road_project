"""PostgreSQL connection, users table and the table that stores predictions."""
import os
import time
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://road:road@localhost:5432/roaddb")
# hosting platforms give "postgres://..." or "postgresql://..."; SQLAlchemy needs the psycopg2 driver name
DATABASE_URL = _url.replace("postgres://", "postgresql+psycopg2://", 1).replace("postgresql://", "postgresql+psycopg2://", 1)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PredictionRecord(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    inputs: Mapped[dict] = mapped_column(JSON)
    risk: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(20))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)


def init_db(retries: int = 15, delay: int = 2) -> None:
    """Create the tables. Retries because the database can take a few seconds to start."""
    for i in range(retries):
        try:
            Base.metadata.create_all(engine)
            with engine.begin() as conn:   # older databases already have predictions without user_id
                conn.execute(text("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"))
            return
        except Exception as e:
            print(f"Waiting for the database ({i + 1}/{retries}): {type(e).__name__}")
            time.sleep(delay)
    raise RuntimeError("Could not connect to PostgreSQL. Is the database container running?")
