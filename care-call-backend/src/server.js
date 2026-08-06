import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { vapiAdapter } from './vapiAdapter.js';
import logIntentRoute from './routes/logIntent.js';
import emergencyEscalationRoute from './routes/emergencyEscalation.js';
import bookAppointmentRoute from './routes/bookAppointment.js';
import cancelAppointmentRoute from './routes/cancelAppointment.js';
import rescheduleAppointmentRoute from './routes/rescheduleAppointment.js';
import lookupPatientRoute from './routes/lookupPatient.js';
import appointmentDetailsRoute from './routes/appointmentDetails.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(vapiAdapter);

// Blocks any single IP address from making more than 30 requests per minute
// to any endpoint here. Protects the server itself from being hammered by
// direct requests bypassing Vapi entirely.
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down and try again shortly.' },
});
app.use(limiter);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use(logIntentRoute);
app.use(emergencyEscalationRoute);
app.use(bookAppointmentRoute);
app.use(cancelAppointmentRoute);
app.use(rescheduleAppointmentRoute);
app.use(lookupPatientRoute);
app.use(appointmentDetailsRoute);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Care Call backend listening on port ${port}`);
});