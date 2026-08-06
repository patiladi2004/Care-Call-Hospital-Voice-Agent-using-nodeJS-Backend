import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST /lookup-patient
// Expects JSON body: { patientPhone }
// Checks if this phone number has any appointment history, and if so,
// returns the name on file from their most recent booking — so the
// assistant can greet a returning caller by name instead of asking again.
router.post('/lookup-patient', async (req, res) => {
  try {
    const { patientPhone } = req.body;

    if (!patientPhone) {
      return res.status(400).json({ error: 'patientPhone is required' });
    }

    const result = await pool.query(
      `SELECT patient_name FROM appointments
       WHERE patient_phone = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientPhone]
    );

    if (result.rows.length === 0) {
      return res.json({
        isReturningPatient: false,
        result: 'This appears to be a new caller with no appointment history.',
      });
    }

    const patientName = result.rows[0].patient_name;
    res.json({
      isReturningPatient: true,
      patientName,
      result: `Welcome back, ${patientName}! This caller has booked with us before.`,
    });
  } catch (err) {
    console.error('lookup-patient error:', err);
    res.status(500).json({ error: 'Failed to look up patient' });
  }
});

export default router;