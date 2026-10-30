-- RoadSafe sample data. Run after schema.sql, in the same database.
-- Demo passwords below are for a local demo database only. Never use them on the live site.
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gives crypt() and gen_salt() for bcrypt hashes

INSERT INTO road_types (name)          VALUES ('highway'), ('rural'), ('urban');
INSERT INTO lighting_conditions (name) VALUES ('daylight'), ('dim'), ('night');
INSERT INTO weather_conditions (name)  VALUES ('clear'), ('foggy'), ('rainy');
INSERT INTO times_of_day (name)        VALUES ('morning'), ('afternoon'), ('evening');
INSERT INTO risk_levels (name, min_score, max_score) VALUES
  ('Low', 0.0, 0.25), ('Moderate', 0.25, 0.45), ('High', 0.45, 0.65), ('Severe', 0.65, 1.0);

INSERT INTO users (email, password_hash, role) VALUES
  ('admin@roadsafe.local',    crypt('Admin12345',   gen_salt('bf', 10)), 'admin'),
  ('analyst1@roadsafe.local', crypt('Analyst12345', gen_salt('bf', 10)), 'user'),
  ('analyst2@roadsafe.local', crypt('Analyst12345', gen_salt('bf', 10)), 'user');

-- Ten sample assessments. The scores come from the trained model, so they are realistic.
INSERT INTO assessments (user_id, road_type_id, lighting_id, weather_id, time_of_day_id, risk_level_id,
                         num_lanes, curvature, speed_limit, road_signs_present, public_road, holiday,
                         school_season, num_reported_accidents, risk_score, note)
SELECT u.id, rt.id, li.id, we.id, td.id, rl.id,
       v.lanes, v.curv, v.speed, v.signs, v.pub, v.hol, v.school, v.acc, v.score, v.note
FROM (VALUES
  ('analyst1@roadsafe.local','urban','daylight','clear','afternoon','Low',2,0.1,25,true,true,false,false,0,0.054,'Quiet town street near a school'),
  ('analyst1@roadsafe.local','urban','daylight','rainy','morning','Low',3,0.2,35,true,true,false,true,1,0.167,'Wet morning on a busy urban road'),
  ('analyst1@roadsafe.local','rural','daylight','clear','afternoon','Low',2,0.5,45,true,true,false,false,1,0.15,'Baseline: rural road in daylight'),
  ('analyst1@roadsafe.local','rural','dim','foggy','evening','High',1,0.7,60,false,true,false,false,2,0.503,'Foggy evening on a narrow rural road'),
  ('analyst1@roadsafe.local','highway','daylight','clear','morning','Moderate',4,0.15,70,true,true,true,false,0,0.25,'Wide highway in good conditions'),
  ('analyst2@roadsafe.local','highway','night','foggy','evening','Severe',2,0.9,70,false,true,false,false,3,0.821,'Worst case: curved highway, night and fog'),
  ('analyst2@roadsafe.local','rural','night','rainy','evening','Severe',2,0.8,60,false,false,false,false,3,0.81,'Rural bend in the rain after dark'),
  ('analyst2@roadsafe.local','urban','night','clear','evening','Moderate',2,0.4,35,true,true,true,false,1,0.312,'City street at night during a holiday'),
  ('analyst2@roadsafe.local','highway','dim','rainy','morning','High',3,0.6,60,true,true,false,true,2,0.484,'Highway in drizzle, school season'),
  ('analyst2@roadsafe.local','rural','night','foggy','evening','High',1,0.95,45,false,false,false,false,2,0.558,'Sharp rural bend at night in fog')
) AS v (email, road, light, weather, tod, level, lanes, curv, speed, signs, pub, hol, school, acc, score, note)
JOIN users u                ON u.email  = v.email
JOIN road_types rt          ON rt.name  = v.road
JOIN lighting_conditions li ON li.name  = v.light
JOIN weather_conditions we  ON we.name  = v.weather
JOIN times_of_day td        ON td.name  = v.tod
JOIN risk_levels rl         ON rl.name  = v.level;
