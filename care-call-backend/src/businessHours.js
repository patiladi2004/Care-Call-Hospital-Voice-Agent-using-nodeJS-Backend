// Clinic operating hours: 9 AM - 6 PM, Monday-Saturday (closed Sundays).
// Kept as one shared function so booking and rescheduling both enforce
// the exact same rule instead of duplicating it.

const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 18; // 6 PM (24-hour format)

export function isWithinBusinessHours(dateStr, timeStr) {
  // dateStr is "YYYY-MM-DD", timeStr is "HH:MM" (24-hour)
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0 = Sunday

  if (dayOfWeek === 0) {
    return { ok: false, reason: 'The clinic is closed on Sundays.' };
  }

  const [hour, minute] = timeStr.split(':').map(Number);
  const totalMinutes = hour * 60 + minute;
  const openMinutes = OPEN_HOUR * 60;
  const closeMinutes = CLOSE_HOUR * 60;

  if (totalMinutes < openMinutes || totalMinutes >= closeMinutes) {
    return { ok: false, reason: `The clinic is only open from ${OPEN_HOUR}:00 AM to ${CLOSE_HOUR - 12}:00 PM.` };
  }

  return { ok: true };
}