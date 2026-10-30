-- RoadSafe database schema (PostgreSQL 16, third normal form).
-- Run it in an EMPTY database. It matches the tables the application creates by itself.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(10)  NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_role CHECK (role IN ('user', 'admin'))
);

CREATE TABLE road_types           (id SERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE lighting_conditions  (id SERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE weather_conditions   (id SERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE times_of_day         (id SERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE);

CREATE TABLE risk_levels (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(20)      NOT NULL UNIQUE,
    min_score DOUBLE PRECISION NOT NULL,
    max_score DOUBLE PRECISION NOT NULL
);

CREATE TABLE assessments (
    id                     SERIAL PRIMARY KEY,
    user_id                INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    road_type_id           INTEGER NOT NULL REFERENCES road_types (id),
    lighting_id            INTEGER NOT NULL REFERENCES lighting_conditions (id),
    weather_id             INTEGER NOT NULL REFERENCES weather_conditions (id),
    time_of_day_id         INTEGER NOT NULL REFERENCES times_of_day (id),
    risk_level_id          INTEGER NOT NULL REFERENCES risk_levels (id),
    num_lanes              INTEGER NOT NULL,
    curvature              DOUBLE PRECISION NOT NULL,
    speed_limit            INTEGER NOT NULL,
    road_signs_present     BOOLEAN NOT NULL,
    public_road            BOOLEAN NOT NULL,
    holiday                BOOLEAN NOT NULL,
    school_season          BOOLEAN NOT NULL,
    num_reported_accidents INTEGER NOT NULL,
    risk_score             DOUBLE PRECISION NOT NULL,
    note                   TEXT NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_assessments_curvature CHECK (curvature BETWEEN 0 AND 1),
    CONSTRAINT ck_assessments_lanes     CHECK (num_lanes BETWEEN 1 AND 4),
    CONSTRAINT ck_assessments_speed     CHECK (speed_limit IN (25, 35, 45, 60, 70)),
    CONSTRAINT ck_assessments_accidents CHECK (num_reported_accidents >= 0),
    CONSTRAINT ck_assessments_score     CHECK (risk_score BETWEEN 0 AND 1)
);

CREATE INDEX ix_assessments_user_id ON assessments (user_id);
