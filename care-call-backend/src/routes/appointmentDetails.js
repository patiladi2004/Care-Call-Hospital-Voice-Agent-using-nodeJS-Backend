import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST /appointment-details
// Expects JSON body: { confirmationCode }
// Read-only lookup — does NOT change anything. Used so the assistant can tell the
// caller what appointment they're about to cancel/reschedule (doctor + date) BEFORE
// asking for confirmation, instead of only knowing that after the action already happened.
router.post('/appointment-details', async (req, res) => {
  try {
    const { confirmationCode } = req.body;

    if (!confirmationCode) {
      return res.status(400).json({ error: 'confirmationCode is required' });
    }

    const result = await pool.query(
      `SELECT a.appointment_date, a.appointment_time, d.specialty, d.name AS doctor_name
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE a.confirmation_code = $1 AND a.status = 'booked'`,
      [confirmationCode]
    );

    if (result.rows.length === 0) {
      return res.json({
        found: false,
        result: `I couldn't find an active appointment with confirmation code ${confirmationCode}. Could you double check the code?`,
      });
    }

    const appt = result.rows[0];
    res.json({
      found: true,
      specialty: appt.specialty,
      appointmentDate: appt.appointment_date,
      appointmentTime: appt.appointment_time,
      result: `Found a ${appt.specialty} appointment on ${appt.appointment_date} at ${appt.appointment_time}.`,
    });
  } catch (err) {
    console.error('appointment-details error:', err);
    res.status(500).json({ error: 'Failed to look up appointment' });
  }
});

export default router;