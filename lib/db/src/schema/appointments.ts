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
  customerId: integer("customer_id").references(() => customersTable.id),
  manualCustomerName: text("manual_customer_name"),
  status: appointmentStatusEnum("status").notNull().default("confirmed"),
  notes: text("notes"),
  serviceId: integer("service_id"),
  serviceName: text("service_name"),
  priceKurus: integer("price_kurus"),
  durationMinutes: integer("duration_minutes"),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
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
