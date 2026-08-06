# Care Call — Hospital Voice Agent Backend

A Node.js/Express backend powering **CityCare Hospital's** AI voice receptionist, built on [Vapi](https://vapi.ai). Callers can book, cancel, and reschedule appointments, get routed for emergencies, and be recognized as returning patients — all through natural phone conversation, backed by a real Postgres database.

---

## What it does

- **Intent logging** — records what every caller wants and how urgent it is, for every single call.
- **Emergency escalation** — detects urgent medical situations, confirms with the caller, and hands off a real transfer number.
- **Appointment booking** — books a slot with a doctor by specialty, date, and time, with automatic double-booking prevention.
- **Appointment cancellation** — cancels a booking by a 4-digit confirmation code, without deleting the record (soft-delete).
- **Appointment rescheduling** — moves a booking to a new time while preserving a full audit trail linking the old and new appointment.
- **Repeat patient recognition** — greets returning callers by name based on their phone number.
- **Business hours enforcement** — rejects bookings outside clinic hours (9 AM–6 PM, Mon–Sat).
- **Spam protection** — IP-based rate limiting plus a per-phone-number daily booking cap.
- **Vapi integration layer** — a translation middleware that adapts Vapi's webhook format to plain REST, so business logic never needs to know Vapi exists.

---

## Tech stack

- **Node.js** + **Express** — HTTP server and routing
- **PostgreSQL** (`pg` driver) — persistent storage
- **Vapi** — voice AI platform (speech-to-text, LLM reasoning, text-to-speech, telephony)
- **ngrok** — exposes the local server to Vapi during development
- **express-rate-limit** — request-level spam protection

---

## How it works (request flow)

```
Caller (phone) 
   → Vapi (speech-to-text, decides which tool to call)
   → ngrok tunnel
   → Express server (server.js)
   → vapiAdapter middleware (translates Vapi's request/response format)
   → Route handler (e.g. bookAppointment.js)
   → Postgres (via db.js)
   → response flows back out through the same chain
   → Vapi speaks the result to the caller
```

The `vapiAdapter.js` middleware is the key integration piece: every route file is written as plain REST (reads `req.body.fieldName`, responds with `res.json({ result: "..." })`), completely unaware of Vapi's actual nested webhook format. The adapter translates in both directions, so the business logic stays simple and independently testable.

---

## Project structure

```
care-call-backend/
├── package.json
├── .env.example
├── migrations/
│   └── 001_init.sql          # database schema
├── docs/
│   ├── vapi-tools.json       # all Vapi Custom Tool definitions
│   └── system-prompt.md      # the assistant's system prompt
└── src/
    ├── server.js              # entry point, wires up all routes + middleware
    ├── db.js                  # Postgres connection pool
    ├── migrate.js              # runs the migration SQL
    ├── businessHours.js       # shared clinic-hours validation
    ├── vapiAdapter.js         # Vapi <-> plain REST translation middleware
    └── routes/
        ├── logIntent.js
        ├── emergencyEscalation.js
        ├── bookAppointment.js
        ├── cancelAppointment.js
        ├── rescheduleAppointment.js
        ├── lookupPatient.js
        └── appointmentDetails.js
```

---

## Database schema (summary)

- **doctors** — `id`, `name`, `specialty`
- **calls** — `id`, `vapi_call_id`, `transcript`, `summary`, `cost`, `duration`
- **call_intents** — append-only log: `id`, `call_id`, `intent`, `summary`, `urgency`, `transferred`, `transferred_to`
- **appointments** — soft-deleted: `id`, `confirmation_code` (4-digit, unique, never reused), `patient_name`, `patient_phone`, `doctor_id`, `appointment_date`, `appointment_time`, `status` (`booked`/`cancelled`/`rescheduled`), `rescheduled_to_id`

Full definitions are in [`migrations/001_init.sql`](migrations/001_init.sql).

---

## Setup

**Prerequisites:** Node.js (v18+), PostgreSQL, an ngrok account, a Vapi account.

1. Clone the repo and install dependencies:
   ```
   npm install
   ```

2. Copy the environment template and fill in your real values:
   ```
   cp .env.example .env
   ```
   Required variables:
   - `PORT` — defaults to 3000
   - `DATABASE_URL` — your Postgres connection string
   - `EMERGENCY_TRANSFER_NUMBER` — real number for emergency transfers, in E.164 format
   - `BOOKING_LIMIT_PER_PHONE_PER_DAY` — optional, defaults to 3

3. Create the database and run the migration:
   ```
   node src/migrate.js
   ```

4. Start the server:
   ```
   node src/server.js
   ```

5. Expose it for Vapi to reach:
   ```
   ngrok http 3000
   ```

6. In your Vapi dashboard, create an assistant, add each tool from [`docs/vapi-tools.json`](docs/vapi-tools.json) as a Custom Tool (replacing the placeholder URL with your real ngrok/deployed URL), and set the system prompt from [`docs/system-prompt.md`](docs/system-prompt.md).

---

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/log-intent` | Log caller intent + urgency |
| POST | `/emergency-escalation` | Confirm + log an emergency transfer |
| POST | `/book-appointment` | Book a new appointment |
| POST | `/cancel-appointment` | Cancel by confirmation code |
| POST | `/reschedule-appointment` | Reschedule by confirmation code |
| POST | `/lookup-patient` | Check if a phone number is a returning patient |
| POST | `/appointment-details` | Read-only lookup of an appointment by code |

Every POST endpoint accepts both plain flat JSON (for direct testing with curl/Postman/`Invoke-RestMethod`) and Vapi's native webhook format automatically, via the adapter middleware.

---

## Notes

- Confirmation codes are 4-digit strings (leading zeros allowed), globally unique across all appointments ever created — never reused, even after cancellation.
- Cancelling and rescheduling use soft-deletes (`status` column), not row deletion, preserving full history.
- Double-booking prevention is enforced at the database level via a partial unique index, not just application logic.
