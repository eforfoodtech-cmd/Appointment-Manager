import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { appointmentsTable } from "./appointments";

export const notificationTypeEnum = pgEnum("notification_type", [
  "reminder_1d",
  "reminder_1h",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "processing",
  "sent",
  "cancelled",
  "failed",
]);

export const scheduledNotificationsTable = pgTable("scheduled_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  appointmentId: integer("appointment_id").references(
    () => appointmentsTable.id,
  ),
  type: notificationTypeEnum("type").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export const insertScheduledNotificationSchema = createInsertSchema(
  scheduledNotificationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertScheduledNotification = z.infer<
  typeof insertScheduledNotificationSchema
>;
export type ScheduledNotification =
  typeof scheduledNotificationsTable.$inferSelect;
