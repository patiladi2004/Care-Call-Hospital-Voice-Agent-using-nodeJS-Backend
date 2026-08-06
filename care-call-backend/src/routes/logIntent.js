import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST /log-intent
// Expects JSON body: { intent, summary, urgency, vapiCallId }
router.post('/log-intent', async (req, res) => {
  try {
    const { intent, summary, urgency, vapiCallId } = req.body;

    if (!intent || !urgency) {
      return res.status(400).json({ error: 'intent and urgency are required' });
    }

    // If a vapiCallId was given, find or create the matching row in "calls"
    // so this intent can be linked back to the call it came from.
    let callId = null;
    if (vapiCallId) {
      const result = await pool.query(
        `INSERT INTO calls (vapi_call_id) VALUES ($1)
         ON CONFLICT (vapi_call_id) DO UPDATE SET vapi_call_id = EXCLUDED.vapi_call_id
         RETURNING id`,
        [vapiCallId]
      );
      callId = result.rows[0].id;
    }

    await pool.query(
      `INSERT INTO call_intents (call_id, intent, summary, urgency)
       VALUES ($1, $2, $3, $4)`,
      [callId, intent, summary, urgency]
    );

    res.json({ result: 'Intent logged successfully.' });
  } catch (err) {
    console.error('log-intent error:', err);
    res.status(500).json({ error: 'Failed to log intent' });
  }
});

export default router;