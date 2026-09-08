/**
 * Notification helpers (Faz 1B).
 * - Schedules customer appointment reminders (1 day + 1 hour before).
 * - Cancels pending reminders when an appointment is cancelled.
 * - Sends notifications through the Expo Push API.
 */
import { db } from "@workspace/db";
import {
  customersTable,
  barbersTable,
  scheduledNotificationsTable,
  userNotificationsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// Returns ms timestamp for "YYYY-MM-DD HH:MM" interpreted as Europe/Istanbul
// (UTC+3, no DST).
function istanbulToMs(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00+03:00`).getTime();
}

export interface ScheduleReminderParams {
  appointmentId: number;
  customerId: number | null;
  date: string;
  startTime: string;
  shopName: string;
}

/**
 * Create 1-day and 1-hour pending reminders for an appointment.
 * Only for app customers (customerId set). Skips reminders whose time is
 * already in the past. No-op for manual appointments (customerId null).
 */
export async function scheduleAppointmentReminders(
  params: ScheduleReminderParams,
): Promise<void> {
  const { appointmentId, customerId, date, startTime, shopName } = params;
  if (customerId == null) return;

  const [customer] = await db
    .select({ userId: customersTable.userId })
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .limit(1);
  if (!customer) return;

  const userId = customer.userId;
  const startMs = istanbulToMs(date, startTime);
  if (Number.isNaN(startMs)) return;
  const now = Date.now();

  const rows: (typeof scheduledNotificationsTable.$inferInsert)[] = [];

  const oneDayMs = startMs - ONE_DAY_MS;
  if (oneDayMs > now) {
    rows.push({
      userId,
      appointmentId,
      type: "reminder_1d",
      scheduledFor: new Date(oneDayMs),
      status: "pending",
      title: "Yarın randevunuz var",
      body: `${shopName} — yarın saat ${startTime} randevunuz var.`,
    });
  }

  const oneHourMs = startMs - ONE_HOUR_MS;
  if (oneHourMs > now) {
    rows.push({
      userId,
      appointmentId,
      type: "reminder_1h",
      scheduledFor: new Date(oneHourMs),
      status: "pending",
      title: "Randevunuza 1 saat kaldı",
      body: `${shopName} — bugün saat ${startTime} randevunuz var.`,
    });
  }

  if (rows.length > 0) {
    await db.insert(scheduledNotificationsTable).values(rows);
  }
}

// Accepts either the root db or an open transaction so callers can cancel
// reminders atomically within the same transaction as the appointment update.
type DbExecutor = Pick<typeof db, "update">;

/**
 * Cancel all pending reminders for an appointment. Pass the active transaction
 * to keep cancellation atomic with the appointment status change.
 */
export async function cancelAppointmentReminders(
  appointmentId: number,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .update(scheduledNotificationsTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledNotificationsTable.appointmentId, appointmentId),
        inArray(scheduledNotificationsTable.status, ["pending", "processing"]),
        inArray(scheduledNotificationsTable.type, [
          "reminder_1d",
          "reminder_1h",
        ]),
      ),
    );
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
}

export async function notifyAppointmentEvent(
  appointmentId: number,
  barberId: number,
  customerId: number | null,
  title: string,
  body: string,
  executor: Pick<typeof db, "select" | "insert"> = db,
) {
  const [barber] = await executor
    .select()
    .from(barbersTable)
    .where(eq(barbersTable.id, barberId));
  const customer = customerId
    ? (
        await executor
          .select()
          .from(customersTable)
          .where(eq(customersTable.id, customerId))
      )[0]
    : null;
  const ids = [barber?.userId, customer?.userId].filter(
    (id): id is number => id != null,
  );
  if (!ids.length) return;
  await executor
    .insert(userNotificationsTable)
    .values(ids.map((userId) => ({ userId, appointmentId, title, body })));
  await executor
    .insert(scheduledNotificationsTable)
    .values(
      ids.map((userId) => ({
        userId,
        appointmentId,
        type: "appointment_event" as const,
        scheduledFor: new Date(),
        title,
        body,
      })),
    );
}

/**
 * Send one or more messages through the Expo Push API.
 * Throws if the HTTP request fails so callers can mark notifications failed.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: { status: string; message?: string }[];
  };
  const failed = (json.data ?? []).find((d) => d.status !== "ok");
  if (failed) {
    throw new Error(`Expo push rejected: ${failed.message ?? "unknown"}`);
  }
}
