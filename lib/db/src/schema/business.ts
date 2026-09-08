import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { barbersTable } from "./barbers";
import { customersTable } from "./customers";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id")
    .notNull()
    .references(() => barbersTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceKurus: integer("price_kurus").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const barberAccessTable = pgTable("barber_access", {
  barberId: integer("barber_id")
    .primaryKey()
    .references(() => barbersTable.id),
  code: text("code").notNull().unique(),
});

export const barberCustomersTable = pgTable(
  "barber_customers",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbersTable.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id),
    privateNotes: text("private_notes").notNull().default(""),
    tags: text("tags").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pair: uniqueIndex("barber_customers_pair").on(
      table.barberId,
      table.customerId,
    ),
  }),
);

export const calendarExceptionsTable = pgTable("calendar_exceptions", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id")
    .notNull()
    .references(() => barbersTable.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull().default("00:00"),
  endTime: text("end_time").notNull().default("24:00"),
  reason: text("reason").notNull().default("Kapalı"),
});
