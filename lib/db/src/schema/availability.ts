import { pgTable, serial, integer, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { barbersTable } from "./barbers";

export const availabilityTable = pgTable("availability", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbersTable.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday … 6=Saturday
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(),     // HH:MM
  isOpen: boolean("is_open").notNull().default(true),
  slotDuration: integer("slot_duration").notNull().default(60), // minutes
}, (table) => ({
  barberDayUnique: uniqueIndex("availability_barber_day_of_week_unique").on(
    table.barberId,
    table.dayOfWeek,
  ),
}));

export const insertAvailabilitySchema = createInsertSchema(availabilityTable).omit({
  id: true,
});

export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Availability = typeof availabilityTable.$inferSelect;
