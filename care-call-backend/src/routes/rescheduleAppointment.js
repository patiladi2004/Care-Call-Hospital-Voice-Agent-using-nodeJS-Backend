import { Router } from 'express';
import { pool } from '../db.js';
import { isWithinBusinessHours } from '../businessHours.js';

const router = Router();

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
  }
}

// POST /reschedule-appointment
// Expects JSON body: { confirmationCode, newAppointmentDate, newAppointmentTime, vapiCallId }
router.post('/reschedule-appointment', async (req, res) => {
  try {
    const { confirmationCode, newAppointmentDate, newAppointmentTime, vapiCallId } = req.body;

    if (!confirmationCode || !newAppointmentDate || !newAppointmentTime) {
      return res.status(400).json({ error: 'confirmationCode, newAppointmentDate, and newAppointmentTime are required' });
    }

    const hoursCheck = isWithinBusinessHours(newAppointmentDate, newAppointmentTime);
    if (!hoursCheck.ok) {
      return res.json({ result: `Sorry, that's outside our booking hours. ${hoursCheck.reason}` });
    }

    // Step 1: find the existing ACTIVE appointment
    const existingResult = await pool.query(
      `SELECT * FROM appointments WHERE confirmation_code = $1 AND status = 'booked'`,
      [confirmationCode]
    );
    if (existingResult.rows.length === 0) {
      return res.json({ result: `I couldn't find an active appointment with confirmation code ${confirmationCode}. Could you double check the code?` });
    }
    const existing = existingResult.rows[0];

    // Step 2: check the NEW slot is free for the same doctor
    const clashResult = await pool.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status = 'booked'`,
      [existing.doctor_id, newAppointmentDate, newAppointmentTime]
    );
    if (clashResult.rows.length > 0) {
      return res.json({ result: `Sorry, that doctor is already booked at ${newAppointmentTime} on ${newAppointmentDate}. Would you like a different time?` });
    }

    // Step 3: generate a new confirmation code for the new booking
    const newConfirmationCode = await generateUniqueConfirmationCode();

    // Step 4: create the new appointment row
    const newResult = await pool.query(
      `INSERT INTO appointments
        (confirmation_code, call_id, patient_name, patient_phone, doctor_id, appointment_date, appointment_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
       RETURNING id`,
      [newConfirmationCode, existing.call_id, existing.patient_name, existing.patient_phone, existing.doctor_id, newAppointmentDate, newAppointmentTime]
    );
    const newAppointmentId = newResult.rows[0].id;

    // Step 5: mark the OLD row as rescheduled, and link it to the new row
    await pool.query(
      `UPDATE appointments
       SET status = 'rescheduled', rescheduled_to_id = $1, updated_at = now()
       WHERE id = $2`,
      [newAppointmentId, existing.id]
    );

    const doctorResult = await pool.query(`SELECT name FROM doctors WHERE id = $1`, [existing.doctor_id]);
    const doctorName = doctorResult.rows[0].name;

    // Step 6: find/create the call row and auto-log the intent, same pattern as before
    let callId = existing.call_id;
    if (vapiCallId) {
      const callResult = await pool.query(
        `INSERT INTO calls (vapi_call_id) VALUES ($1)
         ON CONFLICT (vapi_call_id) DO UPDATE SET vapi_call_id = EXCLUDED.vapi_call_id
         RETURNING id`,
        [vapiCallId]
      );
      callId = callResult.rows[0].id;
    }

    await pool.query(
      `INSERT INTO call_intents (call_id, intent, summary, urgency)
       VALUES ($1, 'reschedule_appointment', $2, 'low')`,
      [callId, `Rescheduled appointment ${confirmationCode} with ${doctorName} to ${newAppointmentDate} at ${newAppointmentTime}, new confirmation code ${newConfirmationCode}`]
    );

    res.json({
      result: `You're rescheduled with ${doctorName} to ${newAppointmentDate} at ${newAppointmentTime}. Your new confirmation code is ${newConfirmationCode} — the old code ${confirmationCode} is no longer valid.`,
      newConfirmationCode,
    });
  } catch (err) {
    console.error('reschedule-appointment error:', err);
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
});

export default router;