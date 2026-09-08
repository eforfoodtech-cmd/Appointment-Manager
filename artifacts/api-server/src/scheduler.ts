/**
 * Scheduler entrypoint (Faz 1B).
 *
 * Designed to run as a Replit Scheduled Deployment (e.g. every 5–15 minutes).
 * One-shot run: atomically claims due pending scheduled_notifications, sends
 * them through the Expo Push API, and marks each sent/failed. Does NOT use
 * setInterval.
 *
 * Concurrency/idempotency: due rows are claimed in a single atomic UPDATE that
 * flips status pending → processing and RETURNs the claimed rows. Overlapping
 * runs (or retries) cannot claim the same row twice, so a notification is never
 * sent more than once. Each row is finalized with a status='processing' guard.
 * Before sending, the linked appointment is re-checked so reminders for an
 * appointment cancelled after the claim are dropped instead of delivered.
 */
import { db, pool } from "@workspace/db";
import {
  scheduledNotificationsTable,
  pushTokensTable,
  appointmentsTable,
} from "@workspace/db";
import { and, eq, lte, lt } from "drizzle-orm";
import { logger } from "./lib/logger";
import { sendExpoPushNotifications } from "./lib/notifications";

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed"] as const;

// A claimed row should finalize within seconds. If one stays "processing" past
// this lease it means the previous run died (crash/deploy kill) between claim
// and finalize, so we reclaim it. Must be comfortably longer than a normal run.
const PROCESSING_LEASE_MS = 15 * 60 * 1000;

async function run(): Promise<void> {
  const now = new Date();

  // Recover stale claims: rows stuck in "processing" past the lease belong to a
  // run that never finished. Reset them to "pending" so this run can retry them
  // (nothing is ever stranded in "processing").
  const recovered = await db
    .update(scheduledNotificationsTable)
    .set({ status: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledNotificationsTable.status, "processing"),
        lt(
          scheduledNotificationsTable.updatedAt,
          new Date(now.getTime() - PROCESSING_LEASE_MS),
        ),
      ),
    )
    .returning({ id: scheduledNotificationsTable.id });

  if (recovered.length > 0) {
    logger.warn(
      { count: recovered.length },
      "Scheduler: recovered stale processing notifications",
    );
  }

  // Atomically claim all due pending rows so concurrent runs cannot double-send.
  const claimed = await db
    .update(scheduledNotificationsTable)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledNotificationsTable.status, "pending"),
        lte(scheduledNotificationsTable.scheduledFor, now),
      ),
    )
    .returning();

  logger.info(
    { count: claimed.length },
    "Scheduler: due notifications claimed",
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of claimed) {
    try {
      const [current] = await db
        .select({ status: scheduledNotificationsTable.status })
        .from(scheduledNotificationsTable)
        .where(eq(scheduledNotificationsTable.id, notification.id));
      if (current?.status !== "processing") {
        skipped++;
        continue;
      }
      // Drop reminders whose appointment is no longer active (cancelled after
      // the claim, completed, or no_show).
      if (
        notification.appointmentId != null &&
        notification.type !== "appointment_event"
      ) {
        const [appt] = await db
          .select({ status: appointmentsTable.status })
          .from(appointmentsTable)
          .where(eq(appointmentsTable.id, notification.appointmentId))
          .limit(1);

        const isActive =
          appt != null &&
          (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(
            appt.status,
          );

        if (!isActive) {
          await db
            .update(scheduledNotificationsTable)
            .set({
              status: "cancelled",
              cancelledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(scheduledNotificationsTable.id, notification.id),
                eq(scheduledNotificationsTable.status, "processing"),
              ),
            );
          skipped++;
          continue;
        }
      }

      const tokens = await db
        .select({ token: pushTokensTable.token })
        .from(pushTokensTable)
        .where(eq(pushTokensTable.userId, notification.userId));

      if (tokens.length === 0) {
        await db
          .update(scheduledNotificationsTable)
          .set({
            status: "failed",
            error: "Kullanıcı için kayıtlı push token yok",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(scheduledNotificationsTable.id, notification.id),
              eq(scheduledNotificationsTable.status, "processing"),
            ),
          );
        failed++;
        continue;
      }

      await sendExpoPushNotifications(
        tokens.map((t) => ({
          to: t.token,
          title: notification.title,
          body: notification.body,
        })),
      );

      await db
        .update(scheduledNotificationsTable)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(scheduledNotificationsTable.id, notification.id),
            eq(scheduledNotificationsTable.status, "processing"),
          ),
        );
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(scheduledNotificationsTable)
        .set({
          status: "failed",
          error: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduledNotificationsTable.id, notification.id),
            eq(scheduledNotificationsTable.status, "processing"),
          ),
        );
      failed++;
      logger.error(
        { err, notificationId: notification.id },
        "Scheduler: failed to send notification",
      );
    }
  }

  logger.info({ sent, failed, skipped }, "Scheduler: run complete");
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, "Scheduler: crashed");
    try {
      await pool.end();
    } catch {
      // ignore pool shutdown errors
    }
    process.exit(1);
  });
