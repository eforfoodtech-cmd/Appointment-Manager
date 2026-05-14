/**
 * Customer routes: /api/customers/*
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  appointmentSlotsTable,
  barbersTable,
  customersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  authenticate,
  requireCustomer,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();

// ─── GET /api/customers/me/upcoming ──────────────────────────────────────────
router.get(
  "/me/upcoming",
  authenticate,
  requireCustomer,
  async (req: AuthRequest, res) => {
    const [customer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.userId, req.user!.id))
      .limit(1);

    if (!customer) {
      res.json([]);
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    const appts = await db
      .select({
        id: appointmentsTable.id,
        slotId: appointmentsTable.slotId,
        barberId: appointmentsTable.barberId,
        customerId: appointmentsTable.customerId,
        status: appointmentsTable.status,
        notes: appointmentsTable.notes,
        createdAt: appointmentsTable.createdAt,
        date: appointmentSlotsTable.date,
        startTime: appointmentSlotsTable.startTime,
        endTime: appointmentSlotsTable.endTime,
        barberName: usersTable.name,
        shopName: barbersTable.shopName,
        customerName: sql<string>`cu.name`,
        customerPhone: sql<string | null>`cu.phone`,
        isManual: sql<boolean>`false`,
      })
      .from(appointmentsTable)
      .innerJoin(
        appointmentSlotsTable,
        eq(appointmentSlotsTable.id, appointmentsTable.slotId),
      )
      .innerJoin(barbersTable, eq(barbersTable.id, appointmentsTable.barberId))
      .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
      .innerJoin(
        customersTable,
        eq(customersTable.id, appointmentsTable.customerId),
      )
      .innerJoin(sql`users cu`, sql`cu.id = ${customersTable.userId}`)
      .where(
        and(
          eq(appointmentsTable.customerId, customer.id),
          gte(appointmentSlotsTable.date, today),
          eq(appointmentsTable.status, "confirmed"),
        ),
      )
      .orderBy(appointmentSlotsTable.date, appointmentSlotsTable.startTime);

    res.json(appts);
  },
);

export default router;
