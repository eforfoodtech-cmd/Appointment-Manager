BEGIN;
SELECT pg_advisory_xact_lock(913800);
CREATE TABLE IF NOT EXISTS services (
  id serial PRIMARY KEY, barber_id integer NOT NULL REFERENCES barbers(id),
  name text NOT NULL, description text NOT NULL DEFAULT '', price_kurus integer NOT NULL CHECK (price_kurus >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 5), buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0), is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS barber_access (barber_id integer PRIMARY KEY REFERENCES barbers(id), code text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS barber_customers (
  id serial PRIMARY KEY, barber_id integer NOT NULL REFERENCES barbers(id), customer_id integer NOT NULL REFERENCES customers(id),
  private_notes text NOT NULL DEFAULT '', tags text NOT NULL DEFAULT '', created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS barber_customers_pair ON barber_customers (barber_id, customer_id);
CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id serial PRIMARY KEY, barber_id integer NOT NULL REFERENCES barbers(id), date text NOT NULL,
  start_time text NOT NULL DEFAULT '00:00', end_time text NOT NULL DEFAULT '24:00', reason text NOT NULL DEFAULT 'Kapalı'
);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_id integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_kurus integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0;
INSERT INTO barber_customers (barber_id, customer_id) SELECT DISTINCT barber_id, customer_id FROM appointments WHERE customer_id IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS account_settings (
  user_id integer PRIMARY KEY REFERENCES users(id), avatar text, gallery text[] NOT NULL DEFAULT '{}', email_verified_at timestamp, phone_verified_at timestamp
);
CREATE TABLE IF NOT EXISTS contact_verifications (
  id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), channel text NOT NULL, destination text NOT NULL, code_hash text NOT NULL,
  expires_at timestamp NOT NULL, attempts integer NOT NULL DEFAULT 0, used boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_notifications (
  id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), appointment_id integer, title text NOT NULL, body text NOT NULL, read_at timestamp, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash text PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), device text NOT NULL, revoked boolean NOT NULL DEFAULT false,
  last_seen_at timestamp NOT NULL DEFAULT now(), expires_at timestamp NOT NULL
);
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'appointment_event';
COMMIT;
