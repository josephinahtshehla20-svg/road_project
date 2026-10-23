"""Road Accident Risk API (FastAPI). The predictor is open to everyone; history needs a login."""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import joblib
import jwt
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import (ADMIN_EMAIL, Assessment, Lighting, RiskLevel, RoadType, SessionLocal, TimeOfDay, User, Weather,
                      init_db)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me")   # set a long random value online
TOKEN_HOURS = 24


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # creates the tables if they do not exist
    yield


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI(title="Road Accident Risk API", version="3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
                   allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])

BUNDLE = joblib.load("model.joblib")          # created by your notebook
MODEL, CATS, COLS = BUNDLE["model"], BUNDLE["cats"], BUNDLE["cols"]
FLAGS = ["road_signs_present", "public_road", "holiday", "school_season"]
REF = {"road_type": "rural", "num_lanes": 2, "curvature": 0.5, "speed_limit": 45, "lighting": "daylight",
       "weather": "clear", "road_signs_present": True, "public_road": True, "time_of_day": "afternoon",
       "holiday": False, "school_season": False, "num_reported_accidents": 1}
LABELS = {"road_type": "Road type", "num_lanes": "Lanes", "curvature": "Curvature", "speed_limit": "Speed limit",
          "lighting": "Lighting", "weather": "Weather", "road_signs_present": "Road signs", "public_road": "Public road",
          "time_of_day": "Time of day", "holiday": "Holiday", "school_season": "School season",
          "num_reported_accidents": "Past reported accidents"}


# ---------- accounts ----------
class Credentials(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=8, max_length=72)


class Token(BaseModel):
    access_token: str
    email: str
    role: str = "user"


class ChangePassword(BaseModel):
    current_password: str = Field(min_length=8, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class ConfirmPassword(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class NoteIn(BaseModel):
    note: str = Field(max_length=500)


def make_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm="HS256")


def user_from_header(authorization: str | None, db: Session):
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Invalid login. Please log in again.")
    try:
        user = db.get(User, int(jwt.decode(token, SECRET_KEY, algorithms=["HS256"])["sub"]))
    except Exception:
        raise HTTPException(401, "Your session expired. Please log in again.")
    if user is None:
        raise HTTPException(401, "Invalid login. Please log in again.")
    return user


def optional_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return user_from_header(authorization, db)


def required_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = user_from_header(authorization, db)
    if user is None:
        raise HTTPException(401, "Please log in to see your history.")
    return user


def admin_user(user: User = Depends(required_user)):
    if user.role != "admin":
        raise HTTPException(403, "Administrators only.")
    return user


def password_bytes(password: str) -> bytes:
    data = password.encode()
    if len(data) > 72:
        raise HTTPException(400, "Password is too long (72 bytes at most).")
    return data


@app.post("/auth/register", response_model=Token)
def register(c: Credentials, db: Session = Depends(get_db)):
    email = c.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "That email is already registered. Try logging in.")
    hashed = bcrypt.hashpw(password_bytes(c.password), bcrypt.gensalt()).decode()
    user = User(email=email, password_hash=hashed, role="admin" if email == ADMIN_EMAIL else "user")
    db.add(user)
    db.commit()
    return {"access_token": make_token(user.id), "email": user.email, "role": user.role}


@app.post("/auth/login", response_model=Token)
def login(c: Credentials, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == c.email.strip().lower()))
    if user is None or not bcrypt.checkpw(password_bytes(c.password), user.password_hash.encode()):
        raise HTTPException(401, "Wrong email or password.")
    return {"access_token": make_token(user.id), "email": user.email, "role": user.role}


@app.get("/auth/me")
def me(user: User = Depends(required_user)):
    return {"email": user.email, "role": user.role}


@app.post("/auth/change-password")
def change_password(c: ChangePassword, db: Session = Depends(get_db), user: User = Depends(required_user)):
    if not bcrypt.checkpw(password_bytes(c.current_password), user.password_hash.encode()):
        raise HTTPException(401, "Current password is wrong.")
    user.password_hash = bcrypt.hashpw(password_bytes(c.new_password), bcrypt.gensalt()).decode()
    db.commit()
    return {"ok": True}


@app.delete("/auth/me")
def delete_account(c: ConfirmPassword, db: Session = Depends(get_db), user: User = Depends(required_user)):
    if not bcrypt.checkpw(password_bytes(c.password), user.password_hash.encode()):
        raise HTTPException(401, "Password is wrong.")
    db.delete(user)          # the user's assessments are deleted with the account
    db.commit()
    return {"ok": True}


# ---------- predictor ----------
class RoadInput(BaseModel):
    road_type: Literal["highway", "rural", "urban"]
    num_lanes: int = Field(ge=1, le=4)
    curvature: float = Field(ge=0, le=1)
    speed_limit: Literal[25, 35, 45, 60, 70]
    lighting: Literal["daylight", "dim", "night"]
    weather: Literal["clear", "foggy", "rainy"]
    road_signs_present: bool
    public_road: bool
    time_of_day: Literal["morning", "afternoon", "evening"]
    holiday: bool
    school_season: bool
    num_reported_accidents: int = Field(ge=0, le=10)


class Driver(BaseModel):
    feature: str
    effect: float


class Prediction(BaseModel):
    risk: float
    level: str
    drivers: list[Driver]
    saved: bool = False


def to_frame(rows: list[dict]) -> pd.DataFrame:
    d = pd.DataFrame(rows)
    for c in FLAGS:
        d[c] = d[c].astype(int)
    for c in CATS:
        d[c] = pd.Categorical(d[c], categories=CATS[c])
    d["curv_x_speed"] = d["curvature"] * d["speed_limit"]
    d["night"] = (d["lighting"] == "night").astype(int)
    d["acc_ge3"] = (d["num_reported_accidents"] >= 3).astype(int)
    return d[COLS]


def level(r: float) -> str:
    return "Low" if r < 0.25 else "Moderate" if r < 0.45 else "High" if r < 0.65 else "Severe"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/options")
def options():
    return CATS


@app.post("/predict", response_model=Prediction)
def predict(item: RoadInput, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    x = item.model_dump()
    rows = [x] + [{**x, k: REF[k]} for k in REF]      # swap one input at a time to a typical value
    preds = MODEL.predict(to_frame(rows)).clip(0, 1)
    risk = float(preds[0])
    drivers = sorted(({"feature": LABELS[k], "effect": round(float(risk - preds[i + 1]), 3)}
                      for i, k in enumerate(REF) if abs(risk - preds[i + 1]) >= 0.005),
                     key=lambda d: -abs(d["effect"]))[:5]
    result = {"risk": round(risk, 3), "level": level(risk), "drivers": drivers, "saved": False}
    if user is not None:                               # only logged-in users get a saved history
        def lid(model, name):
            return db.scalar(select(model.id).where(model.name == name))
        db.add(Assessment(user_id=user.id, road_type_id=lid(RoadType, x["road_type"]), lighting_id=lid(Lighting, x["lighting"]),
                          weather_id=lid(Weather, x["weather"]), time_of_day_id=lid(TimeOfDay, x["time_of_day"]),
                          risk_level_id=lid(RiskLevel, result["level"]), num_lanes=x["num_lanes"], curvature=x["curvature"],
                          speed_limit=x["speed_limit"], road_signs_present=x["road_signs_present"], public_road=x["public_road"],
                          holiday=x["holiday"], school_season=x["school_season"],
                          num_reported_accidents=x["num_reported_accidents"], risk_score=result["risk"]))
        db.commit()
        result["saved"] = True
    return result


class HistoryItem(BaseModel):
    id: int
    created_at: datetime
    risk: float
    level: str
    note: str = ""
    inputs: dict
    owner: str | None = None


def to_out(a: Assessment, owner: bool = False) -> dict:
    return {"id": a.id, "created_at": a.created_at, "risk": a.risk_score, "level": a.risk_level.name, "note": a.note or "",
            "inputs": {"road_type": a.road_type.name, "num_lanes": a.num_lanes, "curvature": a.curvature,
                       "speed_limit": a.speed_limit, "lighting": a.lighting.name, "weather": a.weather.name,
                       "road_signs_present": a.road_signs_present, "public_road": a.public_road,
                       "time_of_day": a.time_of_day.name, "holiday": a.holiday, "school_season": a.school_season,
                       "num_reported_accidents": a.num_reported_accidents},
            "owner": a.user.email if owner else None}


def own_assessment(db: Session, assessment_id: int, user: User) -> Assessment:
    a = db.get(Assessment, assessment_id)
    if a is None or a.user_id != user.id:          # same answer for "not yours" and "missing"
        raise HTTPException(404, "Assessment not found.")
    return a


@app.get("/history", response_model=list[HistoryItem])
def history(limit: int = 10, db: Session = Depends(get_db), user: User = Depends(required_user)):
    """The logged-in user's latest assessments, newest first."""
    q = select(Assessment).where(Assessment.user_id == user.id).order_by(Assessment.id.desc())
    return [to_out(a) for a in db.scalars(q.limit(min(max(limit, 1), 100))).unique()]


@app.patch("/history/{assessment_id}", response_model=HistoryItem)
def update_note(assessment_id: int, body: NoteIn, db: Session = Depends(get_db), user: User = Depends(required_user)):
    a = own_assessment(db, assessment_id, user)
    a.note = body.note.strip()
    db.commit()
    return to_out(a)


@app.delete("/history/{assessment_id}")
def delete_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(required_user)):
    db.delete(own_assessment(db, assessment_id, user))
    db.commit()
    return {"deleted": assessment_id}


# ---------- administrator ----------
@app.get("/admin/users")
def admin_users(db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    q = select(User, func.count(Assessment.id)).outerjoin(Assessment, Assessment.user_id == User.id).group_by(User.id).order_by(User.id)
    return [{"id": u.id, "email": u.email, "role": u.role, "created_at": u.created_at, "assessments": n}
            for u, n in db.execute(q).unique().all()]


@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")
    if target.id == admin.id:
        raise HTTPException(400, "You cannot remove your own account here.")
    db.delete(target)
    db.commit()
    return {"deleted": user_id}


@app.get("/admin/assessments", response_model=list[HistoryItem])
def admin_assessments(limit: int = 20, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    q = select(Assessment).order_by(Assessment.id.desc()).limit(min(max(limit, 1), 100))
    return [to_out(a, owner=True) for a in db.scalars(q).unique()]


@app.delete("/admin/assessments/{assessment_id}")
def admin_delete_assessment(assessment_id: int, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    a = db.get(Assessment, assessment_id)
    if a is None:
        raise HTTPException(404, "Assessment not found.")
    db.delete(a)
    db.commit()
    return {"deleted": assessment_id}
