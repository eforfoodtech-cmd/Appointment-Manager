/**
 * Appointment routes: /api/appointments/*
 * Handles booking, status updates, and listing.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  appointmentSlotsTable,
  barbersTable,
  customersTable,
  usersTable,
  noShowBlocksTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/auth";

const router = Router();

// Build enriched appointment response
async function getAppointmentById(id: number) {
  const [appt] = await db
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
      customerPhone: sql<string>`cu.phone`,
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
    .where(eq(appointmentsTable.id, id))
    .limit(1);

  return appt;
}

// ─── GET /api/appointments ───────────────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = req.query["date"] as string | undefined;
  const status = req.query["status"] as string | undefined;

  let whereConditions;

  if (user.role === "barber") {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, user.id))
      .limit(1);

    if (!barber) {
      res.json([]);
      return;
    }

    whereConditions = [eq(appointmentsTable.barberId, barber.id)];

    if (date) {
      whereConditions.push(eq(appointmentSlotsTable.date, date));
    }
    if (status) {
      whereConditions.push(
        eq(
          appointmentsTable.status,
          status as
            | "pending"
            | "confirmed"
            | "cancelled"
            | "completed"
            | "no_show",
        ),
      );
    }
  } else {
    const [customer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.userId, user.id))
      .limit(1);

    if (!customer) {
      res.json([]);
      return;
    }

    whereConditions = [eq(appointmentsTable.customerId, customer.id)];

    if (status) {
      whereConditions.push(
        eq(
          appointmentsTable.status,
          status as
            | "pending"
            | "confirmed"
            | "cancelled"
            | "completed"
            | "no_show",
        ),
      );
    }
  }

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
      customerPhone: sql<string>`cu.phone`,
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
    .where(and(...whereConditions))
    .orderBy(appointmentSlotsTable.date, appointmentSlotsTable.startTime);

  res.json(appts);
});

// ─── POST /api/appointments ──────────────────────────────────────────────────
router.post("/", authenticate, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { slotId, notes, customerId: manualCustomerId } = req.body;

  if (!slotId) {
    res.status(400).json({ error: "slotId zorunludur" });
    return;
  }

  // Get slot
  const [slot] = await db
    .select()
    .from(appointmentSlotsTable)
    .where(eq(appointmentSlotsTable.id, slotId))
    .limit(1);

  if (!slot) {
    res.status(404).json({ error: "Slot bulunamadı" });
    return;
  }

  if (!slot.isAvailable || slot.isBooked) {
    res.status(400).json({ error: "Bu slot müsait değil" });
    return;
  }

  let customerId: number;

  if (user.role === "barber" && manualCustomerId) {
    // Barber booking on behalf of a customer
    customerId = manualCustomerId;
  } else if (user.role === "customer") {
    // Customer booking for themselves
    const [customer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.userId, user.id))
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Müşteri profili bulunamadı" });
      return;
    }
    customerId = customer.id;

    // Check if customer is blocked by this barber
    const activeBlocks = await db
      .select()
      .from(noShowBlocksTable)
      .where(
        and(
          eq(noShowBlocksTable.barberId, slot.barberId),
          eq(noShowBlocksTable.customerId, customerId),
        ),
      );

    const now = new Date();
    const isBlocked = activeBlocks.some(
      (b) => !b.expiresAt || new Date(b.expiresAt) > now,
    );

    if (isBlocked) {
      res.status(400).json({
        error: "No-show nedeniyle bu berberden randevu alamazsınız",
      });
      return;
    }
  } else {
    res.status(400).json({ error: "Geçersiz istek" });
    return;
  }

  // Mark slot as booked
  await db
    .update(appointmentSlotsTable)
    .set({ isBooked: true })
    .where(eq(appointmentSlotsTable.id, slotId));

  const [appt] = await db
    .insert(appointmentsTable)
    .values({
      slotId,
      barberId: slot.barberId,
      customerId,
      status: "confirmed",
      notes: notes || null,
    })
    .returning();

  const enriched = await getAppointmentById(appt.id);
  res.status(201).json(enriched);
});

// ─── GET /api/appointments/:id ───────────────────────────────────────────────
router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  const appt = await getAppointmentById(id);

  if (!appt) {
    res.status(404).json({ error: "Randevu bulunamadı" });
    return;
  }

  res.json(appt);
});

// ─── PATCH /api/appointments/:id ─────────────────────────────────────────────
router.patch("/:id", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  const { status, slotId: newSlotId, notes } = req.body;

  const [existing] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Randevu bulunamadı" });
    return;
  }

  const updates: Partial<typeof appointmentsTable.$inferInsert> = {};

  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  // Rescheduling: move to a new slot
  if (newSlotId && newSlotId !== existing.slotId) {
    const [newSlot] = await db
      .select()
      .from(appointmentSlotsTable)
      .where(eq(appointmentSlotsTable.id, newSlotId))
      .limit(1);

    if (!newSlot || !newSlot.isAvailable || newSlot.isBooked) {
      res.status(400).json({ error: "Seçilen slot müsait değil" });
      return;
    }

    // Free old slot
    await db
      .update(appointmentSlotsTable)
      .set({ isBooked: false })
      .where(eq(appointmentSlotsTable.id, existing.slotId));

    // Book new slot
    await db
      .update(appointmentSlotsTable)
      .set({ isBooked: true })
      .where(eq(appointmentSlotsTable.id, newSlotId));

    updates.slotId = newSlotId;
  }

  // If cancelling, free the slot
  if (status === "cancelled") {
    await db
      .update(appointmentSlotsTable)
      .set({ isBooked: false })
      .where(eq(appointmentSlotsTable.id, existing.slotId));
  }

  await db
    .update(appointmentsTable)
    .set(updates)
    .where(eq(appointmentsTable.id, id));

  const enriched = await getAppointmentById(id);
  res.json(enriched);
});

export default router;
