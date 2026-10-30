-- RoadSafe queries and transactions, each tied to a functional requirement (FR) and use case (UC).
-- Run after schema.sql and populate.sql.

-- FR1 / UC2 Register an account
INSERT INTO users (email, password_hash) VALUES ('new.user@roadsafe.local', crypt('Passw0rd123', gen_salt('bf', 10)));

-- FR2 / UC3 Log in (the application then checks the password against the stored bcrypt hash)
SELECT id, password_hash, role FROM users WHERE email = 'analyst1@roadsafe.local';

-- FR6 / UC1 Save an assessment: one transaction, all or nothing
BEGIN;
INSERT INTO assessments (user_id, road_type_id, lighting_id, weather_id, time_of_day_id, risk_level_id,
                         num_lanes, curvature, speed_limit, road_signs_present, public_road, holiday,
                         school_season, num_reported_accidents, risk_score, note)
SELECT u.id, rt.id, li.id, we.id, td.id, rl.id, 2, 0.9, 70, false, true, false, false, 3, 0.821, 'Demo: dangerous highway'
FROM users u, road_types rt, lighting_conditions li, weather_conditions we, times_of_day td, risk_levels rl
WHERE u.email = 'analyst1@roadsafe.local' AND rt.name = 'highway' AND li.name = 'night'
  AND we.name = 'foggy' AND td.name = 'evening' AND rl.name = 'Severe';
COMMIT;

-- FR7 / UC5 View my history
SELECT a.id, a.created_at, rt.name AS road_type, a.speed_limit, li.name AS lighting, we.name AS weather,
       a.risk_score, rl.name AS level, a.note
FROM assessments a
JOIN users u                ON u.id = a.user_id
JOIN road_types rt          ON rt.id = a.road_type_id
JOIN lighting_conditions li ON li.id = a.lighting_id
JOIN weather_conditions we  ON we.id = a.weather_id
JOIN risk_levels rl         ON rl.id = a.risk_level_id
WHERE u.email = 'analyst1@roadsafe.local'
ORDER BY a.id DESC LIMIT 10;

-- FR8 / UC6 Edit the note (only the owner's row can change)
UPDATE assessments SET note = 'Needs a site visit'
WHERE id = 1 AND user_id = (SELECT id FROM users WHERE email = 'analyst1@roadsafe.local');

-- FR9 / UC7 Delete an assessment (only the owner's row)
DELETE FROM assessments
WHERE id = 2 AND user_id = (SELECT id FROM users WHERE email = 'analyst1@roadsafe.local');

-- FR10 / UC8 Change password (succeeds only when the current password is right)
UPDATE users SET password_hash = crypt('NewPass12345', gen_salt('bf', 10))
WHERE email = 'analyst1@roadsafe.local' AND password_hash = crypt('Analyst12345', password_hash);

-- FR11 / UC8 Delete an account and its assessments: one transaction
BEGIN;
DELETE FROM assessments WHERE user_id = (SELECT id FROM users WHERE email = 'analyst2@roadsafe.local');
DELETE FROM users WHERE email = 'analyst2@roadsafe.local';
COMMIT;

-- FR12 / UC9 Administrator: list users with their number of assessments
SELECT u.id, u.email, u.role, COUNT(a.id) AS assessments
FROM users u LEFT JOIN assessments a ON a.user_id = u.id
GROUP BY u.id ORDER BY u.id;

-- FR12 / UC9 Administrator: latest assessments of all users
SELECT a.id, u.email AS owner, rt.name AS road_type, a.speed_limit, a.risk_score, rl.name AS level
FROM assessments a
JOIN users u ON u.id = a.user_id
JOIN road_types rt ON rt.id = a.road_type_id
JOIN risk_levels rl ON rl.id = a.risk_level_id
ORDER BY a.id DESC LIMIT 20;

-- FR12 / UC9 Administrator: remove an assessment
DELETE FROM assessments WHERE id = 3;

-- Integrity check: this must FAIL because curvature must be between 0 and 1
BEGIN;
INSERT INTO assessments (user_id, road_type_id, lighting_id, weather_id, time_of_day_id, risk_level_id,
                         num_lanes, curvature, speed_limit, road_signs_present, public_road, holiday,
                         school_season, num_reported_accidents, risk_score)
VALUES (1, 1, 1, 1, 1, 1, 2, 1.5, 45, true, true, false, false, 0, 0.2);
ROLLBACK;

-- Reports
-- R1 Average risk by lighting
SELECT li.name AS lighting, COUNT(*) AS assessments, ROUND(AVG(a.risk_score)::numeric, 3) AS average_risk
FROM assessments a JOIN lighting_conditions li ON li.id = a.lighting_id
GROUP BY li.name ORDER BY average_risk DESC;

-- R2 Number of assessments per risk level
SELECT rl.name AS level, COUNT(a.id) AS assessments
FROM risk_levels rl LEFT JOIN assessments a ON a.risk_level_id = rl.id
GROUP BY rl.id, rl.name ORDER BY rl.min_score;

-- R3 The five riskiest assessments
SELECT a.id, u.email AS owner, rt.name AS road_type, a.risk_score, a.note
FROM assessments a JOIN users u ON u.id = a.user_id JOIN road_types rt ON rt.id = a.road_type_id
ORDER BY a.risk_score DESC LIMIT 5;

-- R4 Assessments per day
SELECT created_at::date AS day, COUNT(*) AS assessments FROM assessments GROUP BY day ORDER BY day;
