import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { barbersTable } from "./barbers";

export const appointmentSlotsTable = pgTable("appointment_slots", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbersTable.id),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  isAvailable: boolean("is_available").notNull().default(true),
  isBooked: boolean("is_booked").notNull().default(false),
});

export const insertSlotSchema = createInsertSchema(appointmentSlotsTable).omit({
  id: true,
});

export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type AppointmentSlot = typeof appointmentSlotsTable.$inferSelect;
