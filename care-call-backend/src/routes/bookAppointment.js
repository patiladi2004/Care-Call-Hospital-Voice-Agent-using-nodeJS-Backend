import { Router } from 'express';
import { pool } from '../db.js';
import { isWithinBusinessHours } from '../businessHours.js';

const router = Router();

// Generates a random 4-digit code (as a string, so "0472" stays "0472")
// and keeps trying until it finds one that has never been used before —
// checking against every row ever created, not just active ones, since
// codes are never reused even after cancellation.
async function generateUniqueConfirmationCode() {
  while (true) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const { rows } = await pool.query(
      `SELECT id FROM appointments WHERE confirmation_code = $1`,
      [code]
    );
    if (rows.length === 0) {
      return code;
    }
    // else: collision, loop again and try a new random code
  }
}

// POST /book-appointment
// Expects JSON body: { patientName, patientPhone, specialty, appointmentDate, appointmentTime, vapiCallId }
router.post('/book-appointment', async (req, res) => {
  try {
    const { patientName, patientPhone, specialty, appointmentDate, appointmentTime, vapiCallId } = req.body;

    if (!patientName || !patientPhone || !specialty || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ error: 'patientName, patientPhone, specialty, appointmentDate, and appointmentTime are all required' });
    }

    const hoursCheck = isWithinBusinessHours(appointmentDate, appointmentTime);
    if (!hoursCheck.ok) {
      return res.json({ result: `Sorry, that's outside our booking hours. ${hoursCheck.reason}` });
    }

    // Step 1: check this phone number hasn't already hit today's booking limit,
    // to prevent one caller from spamming the system with repeated bookings
    const dailyLimit = parseInt(process.env.BOOKING_LIMIT_PER_PHONE_PER_DAY || '3', 10);
    const todayCountResult = await pool.query(
      `SELECT COUNT(*) FROM appointments
       WHERE patient_phone = $1 AND created_at::date = CURRENT_DATE`,
      [patientPhone]
    );
    const todayCount = parseInt(todayCountResult.rows[0].count, 10);
    if (todayCount >= dailyLimit) {
      return res.json({ result: `Sorry, you've reached the maximum number of bookings allowed per day. Please try again tomorrow or contact the front desk directly.` });
    }

    // Step 2: find the doctor for this specialty
    const doctorResult = await pool.query(
      `SELECT id, name FROM doctors WHERE specialty = $1 LIMIT 1`,
      [specialty]
    );
    if (doctorResult.rows.length === 0) {
      return res.json({ result: `Sorry, we don't have a doctor on file for ${specialty}.` });
    }
    const doctor = doctorResult.rows[0];

    // Step 3: check if that doctor already has an ACTIVE booking at this exact slot
    const clashResult = await pool.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status = 'booked'`,
      [doctor.id, appointmentDate, appointmentTime]
    );
    if (clashResult.rows.length > 0) {
      return res.json({ result: `Sorry, ${doctor.name} is already booked at ${appointmentTime} on ${appointmentDate}. Would you like a different time?` });
    }

    // Step 4: find/create the call row, same pattern as the other routes
    let callId = null;
    if (vapiCallId) {
      const callResult = await pool.query(
        `INSERT INTO calls (vapi_call_id) VALUES ($1)
         ON CONFLICT (vapi_call_id) DO UPDATE SET vapi_call_id = EXCLUDED.vapi_call_id
         RETURNING id`,
        [vapiCallId]
      );
      callId = callResult.rows[0].id;
    }

    // Step 5: generate a never-used-before confirmation code
    const confirmationCode = await generateUniqueConfirmationCode();

    // Step 6: insert the appointment
    await pool.query(
      `INSERT INTO appointments
        (confirmation_code, call_id, patient_name, patient_phone, doctor_id, appointment_date, appointment_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')`,
      [confirmationCode, callId, patientName, patientPhone, doctor.id, appointmentDate, appointmentTime]
    );

    // Step 7: auto-log this as an intent too, so call_intents stays a complete
    // record of everything that happened on the call, not just explicit /log-intent calls
    await pool.query(
      `INSERT INTO call_intents (call_id, intent, summary, urgency)
       VALUES ($1, 'book_appointment', $2, 'low')`,
      [callId, `Booked ${doctor.name} on ${appointmentDate} at ${appointmentTime}, confirmation code ${confirmationCode}`]
    );

    res.json({
      result: `You're booked with ${doctor.name} on ${appointmentDate} at ${appointmentTime}. Your confirmation code is ${confirmationCode} — please save this to cancel or reschedule later.`,
      confirmationCode,
    });
  } catch (err) {
    console.error('book-appointment error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

export default router;