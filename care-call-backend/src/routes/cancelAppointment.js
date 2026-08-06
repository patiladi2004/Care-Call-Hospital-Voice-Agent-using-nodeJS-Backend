import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST /cancel-appointment
// Expects JSON body: { confirmationCode, vapiCallId }
router.post('/cancel-appointment', async (req, res) => {
  try {
    const { confirmationCode, vapiCallId } = req.body;

    if (!confirmationCode) {
      return res.status(400).json({ error: 'confirmationCode is required' });
    }

    // Only an appointment that is currently ACTIVE ("booked") can be cancelled —
    // this also naturally rejects codes that were already cancelled/rescheduled,
    // or codes that never existed at all.
    const result = await pool.query(
      `UPDATE appointments
       SET status = 'cancelled', updated_at = now()
       WHERE confirmation_code = $1 AND status = 'booked'
       RETURNING id, patient_name, appointment_date, appointment_time,
                 (SELECT name FROM doctors WHERE doctors.id = appointments.doctor_id) AS doctor_name`,
      [confirmationCode]
    );

    if (result.rows.length === 0) {
      return res.json({ result: `I couldn't find an active appointment with confirmation code ${confirmationCode}. Could you double check the code?` });
    }

    const appt = result.rows[0];

    // Find/create the call row, same pattern as the other routes
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

    // Auto-log this as an intent too, same as booking does
    await pool.query(
      `INSERT INTO call_intents (call_id, intent, summary, urgency)
       VALUES ($1, 'cancel_appointment', $2, 'low')`,
      [callId, `Cancelled appointment with ${appt.doctor_name} on ${appt.appointment_date} at ${appt.appointment_time}, confirmation code ${confirmationCode}`]
    );

    res.json({
      result: `Your appointment with ${appt.doctor_name} on ${appt.appointment_date} at ${appt.appointment_time} has been cancelled.`,
    });
  } catch (err) {
    console.error('cancel-appointment error:', err);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

export default router;