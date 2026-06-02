---
name: Scheduler idempotency & atomic cancel
description: How the Faz 1B reminder scheduler avoids double-sends and how cancellation stays atomic
---

# One-shot scheduler must atomically claim work

**Rule:** A one-shot scheduler that may overlap with another run (or a slow run)
must claim rows with an atomic `UPDATE ... SET status='processing' WHERE status='pending' RETURNING`
before doing side effects (Expo push send), then finalize only with a
`WHERE status='processing'` guard. Add a `processing` value to the status enum.

**Why:** Replit Scheduled Deployments fire on a fixed interval; if one run is slow,
the next can start and re-send the same reminders. A plain `SELECT pending` then
`UPDATE sent` leaves a double-send window. Claiming first closes it; nothing can
stay stuck in `processing` because every claimed row is finalized to sent/failed/cancelled.

**How to apply:** Before sending, also re-check the parent appointment is still
active — skip + mark `cancelled` if not, so a reminder never fires for a
cancelled/completed appointment.

**Stale-claim recovery (required):** Claiming alone is not enough — if the process
dies between claim and finalize, the row is stranded in `processing` forever. At
run start, reset `processing` rows whose `updated_at` is older than a lease
(e.g. 15 min, must exceed a normal run) back to `pending` so they get retried.
"No row stuck in processing" only holds with this recovery step.

# Cancellation must be atomic with reminder cancel

**Rule:** Cancel pending reminders INSIDE the same transaction that cancels the
appointment. Make the cancel helper accept a `tx` executor (`Pick<typeof db,"update">`)
defaulting to `db`.

**Why:** A post-commit best-effort cancel can fail after the appointment is already
cancelled, leaving live reminders that still fire. In-tx makes it all-or-nothing.
