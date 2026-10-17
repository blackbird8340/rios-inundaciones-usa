-- Esquema MySQL 8+. Idempotente: se puede correr varias veces.

CREATE TABLE IF NOT EXISTS states (
  code CHAR(2) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS rivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE
);

-- Un medidor puede venir de NWPS (lid), de USGS (usgs_id) o de ambos.
CREATE TABLE IF NOT EXISTS gauges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(200) NOT NULL UNIQUE,
  lid VARCHAR(10) NULL UNIQUE,
  usgs_id VARCHAR(20) NULL,
  reach_id VARCHAR(20) NULL,
  name VARCHAR(200) NOT NULL,
  river_id INT NULL,
  place_name VARCHAR(128) NULL,
  state_code CHAR(2) NOT NULL,
  county_name VARCHAR(128) NULL,
  county_fips CHAR(5) NULL,
  lat DECIMAL(9,6) NOT NULL,
  lon DECIMAL(9,6) NOT NULL,
  time_zone VARCHAR(40) NULL,
  wfo VARCHAR(8) NULL,
  rfc VARCHAR(8) NULL,
  upstream_lid VARCHAR(10) NULL,
  downstream_lid VARCHAR(10) NULL,
  in_service BOOLEAN NOT NULL DEFAULT TRUE,
  has_forecast BOOLEAN NOT NULL DEFAULT FALSE,
  -- Categorías de crecida NWS (ft)
  action_ft DECIMAL(7,2) NULL,
  minor_ft DECIMAL(7,2) NULL,
  moderate_ft DECIMAL(7,2) NULL,
  major_ft DECIMAL(7,2) NULL,
  -- Estado actual derivado (lo actualiza la ingesta de niveles)
  stage_ft DECIMAL(8,2) NULL,
  flow_cfs DECIMAL(12,1) NULL,
  observed_at DATETIME NULL,
  status ENUM('normal','action','minor','moderate','major','no_data') NOT NULL DEFAULT 'no_data',
  trend ENUM('rising','falling','steady') NULL,
  forecast_crest_ft DECIMAL(8,2) NULL,
  forecast_crest_at DATETIME NULL,
  forecast_status ENUM('normal','action','minor','moderate','major','no_data') NOT NULL DEFAULT 'no_data',
  metadata_updated_at DATETIME NULL,
  levels_updated_at DATETIME NULL,
  INDEX idx_gauges_state (state_code, status),
  INDEX idx_gauges_river (river_id),
  INDEX idx_gauges_county (county_fips),
  INDEX idx_gauges_usgs (usgs_id),
  FOREIGN KEY (river_id) REFERENCES rivers(id)
);

CREATE TABLE IF NOT EXISTS gauge_impacts (
  gauge_id INT NOT NULL,
  stage_ft DECIMAL(7,2) NOT NULL,
  statement TEXT NOT NULL,
  INDEX idx_impacts_gauge (gauge_id, stage_ft),
  FOREIGN KEY (gauge_id) REFERENCES gauges(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gauge_crests (
  gauge_id INT NOT NULL,
  kind ENUM('historic','recent') NOT NULL,
  occurred_at DATE NOT NULL,
  stage_ft DECIMAL(7,2) NOT NULL,
  preliminary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (gauge_id, kind, occurred_at),
  FOREIGN KEY (gauge_id) REFERENCES gauges(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS observations (
  gauge_id INT NOT NULL,
  observed_at DATETIME NOT NULL,
  stage_ft DECIMAL(8,2) NULL,
  flow_cfs DECIMAL(12,1) NULL,
  source ENUM('nwps','usgs') NOT NULL,
  PRIMARY KEY (gauge_id, observed_at),
  FOREIGN KEY (gauge_id) REFERENCES gauges(id) ON DELETE CASCADE
);

-- Se reemplaza entero en cada emisión de pronóstico.
CREATE TABLE IF NOT EXISTS forecasts (
  gauge_id INT NOT NULL,
  valid_at DATETIME NOT NULL,
  issued_at DATETIME NOT NULL,
  stage_ft DECIMAL(8,2) NULL,
  flow_cfs DECIMAL(12,1) NULL,
  PRIMARY KEY (gauge_id, valid_at),
  FOREIGN KEY (gauge_id) REFERENCES gauges(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(255) PRIMARY KEY,
  event VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NULL,
  headline TEXT NULL,
  description MEDIUMTEXT NULL,
  instruction TEXT NULL,
  area_desc TEXT NULL,
  sender_name VARCHAR(120) NULL,
  sent_at DATETIME NULL,
  onset_at DATETIME NULL,
  expires_at DATETIME NULL,
  ends_at DATETIME NULL,
  fetched_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_counties (
  alert_id VARCHAR(255) NOT NULL,
  county_fips CHAR(5) NOT NULL,
  PRIMARY KEY (alert_id, county_fips),
  INDEX idx_alert_counties_fips (county_fips),
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job VARCHAR(40) NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  ok BOOLEAN NULL,
  message TEXT NULL,
  INDEX idx_runs_job (job, started_at)
);
