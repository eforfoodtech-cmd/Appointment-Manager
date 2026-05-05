import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { barbersTable } from "./barbers";

export const availabilityTable = pgTable("availability", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbersTable.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday ... 6=Saturday
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  isActive: boolean("is_active").notNull().default(true),
});

export const insertAvailabilitySchema = createInsertSchema(availabilityTable).omit({
  id: true,
});

export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Availability = typeof availabilityTable.$inferSelect;
