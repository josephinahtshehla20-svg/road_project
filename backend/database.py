"""PostgreSQL schema in third normal form: users, lookup tables and assessments."""
import os
import time
from datetime import datetime, timezone

from sqlalchemy import (Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text,
                        create_engine, select, text)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://road:road@localhost:5432/roaddb")
# hosting platforms give "postgres://..." or "postgresql://..."; SQLAlchemy needs the psycopg2 driver name
DATABASE_URL = _url.replace("postgres://", "postgresql+psycopg2://", 1).replace("postgresql://", "postgresql+psycopg2://", 1)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role in ('user','admin')", name="ck_users_role"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10), default="user", server_default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    assessments: Mapped[list["Assessment"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RoadType(Base):
    __tablename__ = "road_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class Lighting(Base):
    __tablename__ = "lighting_conditions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class Weather(Base):
    __tablename__ = "weather_conditions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class TimeOfDay(Base):
    __tablename__ = "times_of_day"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class RiskLevel(Base):
    __tablename__ = "risk_levels"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True)
    min_score: Mapped[float] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float)


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        CheckConstraint("curvature between 0 and 1", name="ck_assessments_curvature"),
        CheckConstraint("num_lanes between 1 and 4", name="ck_assessments_lanes"),
        CheckConstraint("speed_limit in (25,35,45,60,70)", name="ck_assessments_speed"),
        CheckConstraint("num_reported_accidents >= 0", name="ck_assessments_accidents"),
        CheckConstraint("risk_score between 0 and 1", name="ck_assessments_score"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    road_type_id: Mapped[int] = mapped_column(ForeignKey("road_types.id"))
    lighting_id: Mapped[int] = mapped_column(ForeignKey("lighting_conditions.id"))
    weather_id: Mapped[int] = mapped_column(ForeignKey("weather_conditions.id"))
    time_of_day_id: Mapped[int] = mapped_column(ForeignKey("times_of_day.id"))
    risk_level_id: Mapped[int] = mapped_column(ForeignKey("risk_levels.id"))
    num_lanes: Mapped[int] = mapped_column(Integer)
    curvature: Mapped[float] = mapped_column(Float)
    speed_limit: Mapped[int] = mapped_column(Integer)
    road_signs_present: Mapped[bool] = mapped_column(Boolean)
    public_road: Mapped[bool] = mapped_column(Boolean)
    holiday: Mapped[bool] = mapped_column(Boolean)
    school_season: Mapped[bool] = mapped_column(Boolean)
    num_reported_accidents: Mapped[int] = mapped_column(Integer)
    risk_score: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped[User] = relationship(back_populates="assessments", lazy="joined")
    road_type: Mapped[RoadType] = relationship(lazy="joined")
    lighting: Mapped[Lighting] = relationship(lazy="joined")
    weather: Mapped[Weather] = relationship(lazy="joined")
    time_of_day: Mapped[TimeOfDay] = relationship(lazy="joined")
    risk_level: Mapped[RiskLevel] = relationship(lazy="joined")


SEED = {RoadType: ["highway", "rural", "urban"], Lighting: ["daylight", "dim", "night"],
        Weather: ["clear", "foggy", "rainy"], TimeOfDay: ["morning", "afternoon", "evening"]}
LEVELS = [("Low", 0.0, 0.25), ("Moderate", 0.25, 0.45), ("High", 0.45, 0.65), ("Severe", 0.65, 1.0)]


def seed_reference_data() -> None:
    with SessionLocal() as db:
        for model, names in SEED.items():
            have = set(db.scalars(select(model.name)))
            db.add_all(model(name=n) for n in names if n not in have)
        have = set(db.scalars(select(RiskLevel.name)))
        db.add_all(RiskLevel(name=n, min_score=lo, max_score=hi) for n, lo, hi in LEVELS if n not in have)
        db.commit()


def init_db(retries: int = 15, delay: int = 2) -> None:
    """Create tables, add new columns, load lookup data. Retries while the database starts."""
    for i in range(retries):
        try:
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE IF EXISTS predictions"))   # old single-table design, replaced by assessments
            Base.metadata.create_all(engine)
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'user'"))
                if ADMIN_EMAIL:
                    conn.execute(text("UPDATE users SET role='admin' WHERE email = :e"), {"e": ADMIN_EMAIL})
            seed_reference_data()
            return
        except Exception as e:
            print(f"Waiting for the database ({i + 1}/{retries}): {type(e).__name__}")
            time.sleep(delay)
    raise RuntimeError("Could not connect to PostgreSQL. Is the database container running?")
