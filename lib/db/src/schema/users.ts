import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["barber", "customer"]);

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    // `name` remains the display-name field used by existing queries.
    name: text("name").notNull(),
    // Nullable so existing rows can be migrated without a destructive backfill.
    // New registrations always provide and populate both fields.
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    role: roleEnum("role").notNull(),
    authVersion: integer("auth_version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    phoneFormatCheck: check(
      "users_phone_format_check",
      sql`${table.phone} is null or ${table.phone} ~ '^5[0-9]{9}$'`,
    ),
    phoneUnique: uniqueIndex("users_phone_unique").on(table.phone),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
