"""Road Accident Risk API (FastAPI). Run: uvicorn main:app --reload"""
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

import joblib
import pandas as pd
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import PredictionRecord, SessionLocal, init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # creates the predictions table if it does not exist
    yield


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI(title="Road Accident Risk API", version="1.1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","), allow_methods=["*"], allow_headers=["*"])

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
def predict(item: RoadInput, db: Session = Depends(get_db)):
    x = item.model_dump()
    rows = [x] + [{**x, k: REF[k]} for k in REF]      # swap one input at a time to a typical value
    preds = MODEL.predict(to_frame(rows)).clip(0, 1)
    risk = float(preds[0])
    drivers = sorted(({"feature": LABELS[k], "effect": round(float(risk - preds[i + 1]), 3)}
                      for i, k in enumerate(REF) if abs(risk - preds[i + 1]) >= 0.005),
                     key=lambda d: -abs(d["effect"]))[:5]
    result = {"risk": round(risk, 3), "level": level(risk), "drivers": drivers}
    db.add(PredictionRecord(inputs=x, risk=result["risk"], level=result["level"]))   # save to PostgreSQL
    db.commit()
    return result


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    risk: float
    level: str
    inputs: dict


@app.get("/history", response_model=list[HistoryItem])
def history(limit: int = 10, db: Session = Depends(get_db)):
    """Latest saved predictions, newest first."""
    return db.query(PredictionRecord).order_by(PredictionRecord.id.desc()).limit(min(max(limit, 1), 100)).all()
