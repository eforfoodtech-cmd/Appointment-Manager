import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentSlotsTable } from "./slots";
import { barbersTable } from "./barbers";
import { customersTable } from "./customers";

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull().references(() => appointmentSlotsTable.id),
  barberId: integer("barber_id").notNull().references(() => barbersTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  status: appointmentStatusEnum("status").notNull().default("confirmed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
