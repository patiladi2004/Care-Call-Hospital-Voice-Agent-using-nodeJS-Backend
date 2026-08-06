import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST /emergency-escalation
// Expects JSON body: { intent, summary, confirmed, vapiCallId }
// "confirmed" = whether the caller agreed to be transferred.
router.post('/emergency-escalation', async (req, res) => {
  try {
    const { intent, summary, confirmed, vapiCallId } = req.body;

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

    const transferNumber = process.env.EMERGENCY_TRANSFER_NUMBER;
    const shouldTransfer = confirmed === true;

    await pool.query(
      `INSERT INTO call_intents (call_id, intent, summary, urgency, transferred, transferred_to)
       VALUES ($1, $2, $3, 'emergency', $4, $5)`,
      [callId, intent || 'emergency', summary, shouldTransfer, shouldTransfer ? transferNumber : null]
    );

    if (shouldTransfer) {
      res.json({
        result: 'Transferring you now, please hold.',
        transferTo: transferNumber,
      });
    } else {
      res.json({ result: 'Okay, I will not transfer the call. Logged as emergency.' });
    }
  } catch (err) {
    console.error('emergency-escalation error:', err);
    res.status(500).json({ error: 'Failed to process emergency escalation' });
  }
});

export default router;