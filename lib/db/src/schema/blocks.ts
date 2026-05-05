import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { barbersTable } from "./barbers";
import { customersTable } from "./customers";

export const noShowBlocksTable = pgTable("no_show_blocks", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbersTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBlockSchema = createInsertSchema(noShowBlocksTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type NoShowBlock = typeof noShowBlocksTable.$inferSelect;
