/**
 * Barber routes: /api/barbers/*
 * Handles barber profiles, availability, slots, dashboard, and no-show blocks.
 *
 * IMPORTANT: Specific routes (/me/*) must be registered BEFORE dynamic (:barberId) routes.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  barbersTable,
  availabilityTable,
  appointmentSlotsTable,
  appointmentsTable,
  customersTable,
  noShowBlocksTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  authenticate,
  requireBarber,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();

// ─── GET /api/barbers ─────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const barbers = await db
    .select({
      id: barbersTable.id,
      userId: barbersTable.userId,
      shopName: barbersTable.shopName,
      shopAddress: barbersTable.shopAddress,
      bio: barbersTable.bio,
      isActive: barbersTable.isActive,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(barbersTable)
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .where(eq(barbersTable.isActive, true));

  res.json(
    barbers.map((b) => ({
      id: b.id,
      userId: b.userId,
      shopName: b.shopName,
      shopAddress: b.shopAddress,
      bio: b.bio,
      isActive: b.isActive,
      name: b.name,
      email: b.email,
      phone: b.phone,
    })),
  );
});

// ─── GET /api/barbers/me ──────────────────────────────────────────────────────
router.get("/me", authenticate, requireBarber, async (req: AuthRequest, res) => {
  const [barber] = await db
    .select({
      id: barbersTable.id,
      userId: barbersTable.userId,
      shopName: barbersTable.shopName,
      shopAddress: barbersTable.shopAddress,
      bio: barbersTable.bio,
      isActive: barbersTable.isActive,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(barbersTable)
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .where(eq(barbersTable.userId, req.user!.id))
    .limit(1);

  if (!barber) {
    res.status(404).json({ error: "Berber profili bulunamadı" });
    return;
  }

  res.json(barber);
});

// ─── PUT /api/barbers/me ──────────────────────────────────────────────────────
router.put("/me", authenticate, requireBarber, async (req: AuthRequest, res) => {
  const { shopName, shopAddress, bio, phone } = req.body;

  await db
    .update(barbersTable)
    .set({
      ...(shopName !== undefined && { shopName }),
      ...(shopAddress !== undefined && { shopAddress }),
      ...(bio !== undefined && { bio }),
    })
    .where(eq(barbersTable.userId, req.user!.id));

  if (phone !== undefined) {
    await db
      .update(usersTable)
      .set({ phone })
      .where(eq(usersTable.id, req.user!.id));
  }

  const [barber] = await db
    .select({
      id: barbersTable.id,
      userId: barbersTable.userId,
      shopName: barbersTable.shopName,
      shopAddress: barbersTable.shopAddress,
      bio: barbersTable.bio,
      isActive: barbersTable.isActive,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(barbersTable)
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .where(eq(barbersTable.userId, req.user!.id))
    .limit(1);

  res.json(barber);
});

// ─── GET /api/barbers/me/availability ────────────────────────────────────────
router.get(
  "/me/availability",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.json([]);
      return;
    }

    const avail = await db
      .select()
      .from(availabilityTable)
      .where(eq(availabilityTable.barberId, barber.id));

    res.json(avail);
  },
);

// ─── PUT /api/barbers/me/availability ────────────────────────────────────────
router.put(
  "/me/availability",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    // Replace all availability records
    await db
      .delete(availabilityTable)
      .where(eq(availabilityTable.barberId, barber.id));

    const items: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }> = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.json([]);
      return;
    }

    const inserted = await db
      .insert(availabilityTable)
      .values(
        items.map((item) => ({
          barberId: barber.id,
          dayOfWeek: item.dayOfWeek,
          startTime: item.startTime,
          endTime: item.endTime,
          isActive: item.isActive ?? true,
        })),
      )
      .returning();

    res.json(inserted);
  },
);

// ─── GET /api/barbers/me/dashboard ───────────────────────────────────────────
router.get(
  "/me/dashboard",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const date =
      (req.query["date"] as string) ||
      new Date().toISOString().split("T")[0];

    // Get today's appointments with full details
    const todayAppts = await db
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
      .innerJoin(
        sql`users cu`,
        sql`cu.id = ${customersTable.userId}`,
      )
      .where(
        and(
          eq(appointmentsTable.barberId, barber.id),
          eq(appointmentSlotsTable.date, date),
        ),
      )
      .orderBy(appointmentSlotsTable.startTime);

    const pendingCount = todayAppts.filter(
      (a) => a.status === "pending" || a.status === "confirmed",
    ).length;
    const completedCount = todayAppts.filter(
      (a) => a.status === "completed",
    ).length;
    const noShowCount = todayAppts.filter(
      (a) => a.status === "no_show",
    ).length;

    const now = new Date().toTimeString().slice(0, 5);
    const nextAppt =
      todayAppts.find(
        (a) =>
          a.startTime > now &&
          (a.status === "confirmed" || a.status === "pending"),
      ) || null;

    res.json({
      todayCount: todayAppts.length,
      pendingCount,
      completedCount,
      noShowCount,
      todayAppointments: todayAppts,
      nextAppointment: nextAppt,
    });
  },
);

// ─── GET /api/barbers/me/slots (all slots for this barber) ───────────────────
router.post(
  "/me/slots",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const { date, startTime, endTime, isAvailable = true } = req.body;

    if (!date || !startTime || !endTime) {
      res.status(400).json({ error: "date, startTime ve endTime zorunludur" });
      return;
    }

    const [slot] = await db
      .insert(appointmentSlotsTable)
      .values({
        barberId: barber.id,
        date,
        startTime,
        endTime,
        isAvailable,
        isBooked: false,
      })
      .returning();

    res.status(201).json(slot);
  },
);

// ─── PATCH /api/barbers/me/slots/:slotId ─────────────────────────────────────
router.patch(
  "/me/slots/:slotId",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const slotId = Number(req.params["slotId"]);
    const { isAvailable } = req.body;

    const [updated] = await db
      .update(appointmentSlotsTable)
      .set({ isAvailable })
      .where(
        and(
          eq(appointmentSlotsTable.id, slotId),
          eq(appointmentSlotsTable.barberId, barber.id),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Slot bulunamadı" });
      return;
    }

    res.json(updated);
  },
);

// ─── DELETE /api/barbers/me/slots/:slotId ────────────────────────────────────
router.delete(
  "/me/slots/:slotId",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const slotId = Number(req.params["slotId"]);

    await db
      .delete(appointmentSlotsTable)
      .where(
        and(
          eq(appointmentSlotsTable.id, slotId),
          eq(appointmentSlotsTable.barberId, barber.id),
          eq(appointmentSlotsTable.isBooked, false),
        ),
      );

    res.status(204).send();
  },
);

// ─── GET /api/barbers/me/blocks ───────────────────────────────────────────────
router.get(
  "/me/blocks",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.json([]);
      return;
    }

    const blocks = await db
      .select({
        id: noShowBlocksTable.id,
        barberId: noShowBlocksTable.barberId,
        customerId: noShowBlocksTable.customerId,
        reason: noShowBlocksTable.reason,
        expiresAt: noShowBlocksTable.expiresAt,
        createdAt: noShowBlocksTable.createdAt,
        customerName: usersTable.name,
        customerPhone: usersTable.phone,
      })
      .from(noShowBlocksTable)
      .innerJoin(
        customersTable,
        eq(customersTable.id, noShowBlocksTable.customerId),
      )
      .innerJoin(usersTable, eq(usersTable.id, customersTable.userId))
      .where(eq(noShowBlocksTable.barberId, barber.id));

    res.set("Cache-Control", "no-store");
    res.json(blocks);
  },
);

// ─── POST /api/barbers/me/blocks ──────────────────────────────────────────────
router.post(
  "/me/blocks",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const { customerId, reason, expiresAt } = req.body;

    if (!customerId) {
      res.status(400).json({ error: "customerId zorunludur" });
      return;
    }

    const [block] = await db
      .insert(noShowBlocksTable)
      .values({
        barberId: barber.id,
        customerId,
        reason: reason || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    const [customer] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(customersTable)
      .innerJoin(usersTable, eq(usersTable.id, customersTable.userId))
      .where(eq(customersTable.id, customerId))
      .limit(1);

    res.status(201).json({
      ...block,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || null,
    });
  },
);

// ─── DELETE /api/barbers/me/blocks/:blockId ───────────────────────────────────
router.delete(
  "/me/blocks/:blockId",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const [barber] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);

    if (!barber) {
      res.status(404).json({ error: "Berber profili bulunamadı" });
      return;
    }

    const blockId = Number(req.params["blockId"]);

    await db
      .delete(noShowBlocksTable)
      .where(
        and(
          eq(noShowBlocksTable.id, blockId),
          eq(noShowBlocksTable.barberId, barber.id),
        ),
      );

    res.status(204).send();
  },
);

// ─── GET /api/barbers/:barberId ───────────────────────────────────────────────
router.get("/:barberId", async (req, res) => {
  const barberId = Number(req.params["barberId"]);

  const [barber] = await db
    .select({
      id: barbersTable.id,
      userId: barbersTable.userId,
      shopName: barbersTable.shopName,
      shopAddress: barbersTable.shopAddress,
      bio: barbersTable.bio,
      isActive: barbersTable.isActive,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(barbersTable)
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .where(eq(barbersTable.id, barberId))
    .limit(1);

  if (!barber) {
    res.status(404).json({ error: "Berber bulunamadı" });
    return;
  }

  res.json(barber);
});

// ─── GET /api/barbers/:barberId/slots ─────────────────────────────────────────
router.get("/:barberId/slots", async (req, res) => {
  const barberId = Number(req.params["barberId"]);
  const date = req.query["date"] as string;

  if (!date) {
    res.status(400).json({ error: "date parametresi zorunludur" });
    return;
  }

  const slots = await db
    .select()
    .from(appointmentSlotsTable)
    .where(
      and(
        eq(appointmentSlotsTable.barberId, barberId),
        eq(appointmentSlotsTable.date, date),
      ),
    )
    .orderBy(appointmentSlotsTable.startTime);

  res.json(slots);
});

export default router;
