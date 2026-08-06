CREATE TABLE IF NOT EXISTS doctors (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  specialty   TEXT NOT NULL CHECK (specialty IN ('General Physician', 'Cardiologist', 'Orthopedic')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
  id            SERIAL PRIMARY KEY,
  vapi_call_id  TEXT UNIQUE,
  transcript    TEXT,
  summary       TEXT,
  cost          NUMERIC(10, 4),
  duration      INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_intents (
  id              SERIAL PRIMARY KEY,
  call_id         INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  intent          TEXT NOT NULL,
  summary         TEXT,
  urgency         TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'emergency')),
  transferred     BOOLEAN NOT NULL DEFAULT false,
  transferred_to  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id                  SERIAL PRIMARY KEY,
  confirmation_code   CHAR(4) NOT NULL UNIQUE,
  call_id             INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  patient_name        TEXT NOT NULL,
  patient_phone       TEXT NOT NULL,
  doctor_id           INTEGER NOT NULL REFERENCES doctors(id),
  appointment_date    DATE NOT NULL,
  appointment_time    TIME NOT NULL,
  status              TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'rescheduled')),
  rescheduled_to_id   INTEGER REFERENCES appointments(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active ("booked") appointment allowed per doctor/date/time.
-- Cancelled or rescheduled rows don't block the slot from being rebooked.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_slot
  ON appointments (doctor_id, appointment_date, appointment_time)
  WHERE status = 'booked';

INSERT INTO doctors (name, specialty) VALUES
  ('Dr. General Physician', 'General Physician'),
  ('Dr. Cardiologist', 'Cardiologist'),
  ('Dr. Orthopedic', 'Orthopedic')
ON CONFLICT DO NOTHING;
