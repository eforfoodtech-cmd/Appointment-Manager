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
import { eq, and, sql, gte, lte, inArray, not } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/auth";

const router = Router();

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  return DATE_RE.test(value);
}

function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

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

  const result = await db.transaction(async (tx) => {
    const [slot] = await tx
      .select()
      .from(appointmentSlotsTable)
      .where(eq(appointmentSlotsTable.id, slotId))
      .limit(1);

    if (!slot) return { status: 404 as const, error: "Slot bulunamadı" };

    if (!slot.isAvailable || slot.isBooked) {
      return { status: 400 as const, error: "Bu slot müsait değil" };
    }

    let customerId: number;

    if (user.role === "barber" && manualCustomerId) {
      customerId = manualCustomerId;
    } else if (user.role === "customer") {
      const [customer] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.userId, user.id))
        .limit(1);

      if (!customer) {
        return { status: 404 as const, error: "Müşteri profili bulunamadı" };
      }
      customerId = customer.id;

      const activeBlocks = await tx
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
        return {
          status: 400 as const,
          error: "No-show nedeniyle bu berberden randevu alamazsınız",
        };
      }

      const todayDate = new Date().toISOString().split("T")[0]!;
      const limitDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]!;

      const weeklyAppts = await tx
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .innerJoin(
          appointmentSlotsTable,
          eq(appointmentSlotsTable.id, appointmentsTable.slotId),
        )
        .where(
          and(
            eq(appointmentsTable.customerId, customerId),
            not(inArray(appointmentsTable.status, ["cancelled"])),
            gte(appointmentSlotsTable.date, todayDate),
            lte(appointmentSlotsTable.date, limitDate),
          ),
        )
        .limit(1);

      if (weeklyAppts.length > 0) {
        return {
          status: 400 as const,
          error:
            "Bu hafta için zaten bir randevunuz var. Yeni randevu almak için mevcut randevunuzu iptal edin.",
        };
      }
    } else {
      return { status: 400 as const, error: "Geçersiz istek" };
    }

    const [appt] = await tx
      .insert(appointmentsTable)
      .values({
        slotId,
        barberId: slot.barberId,
        customerId,
        status: "confirmed",
        notes: notes || null,
      })
      .returning();

    const [updatedSlot] = await tx
      .update(appointmentSlotsTable)
      .set({ isBooked: true })
      .where(
        and(
          eq(appointmentSlotsTable.id, slotId),
          eq(appointmentSlotsTable.isAvailable, true),
          eq(appointmentSlotsTable.isBooked, false),
        ),
      )
      .returning();

    if (!updatedSlot) {
      throw new Error("Bu slot müsait değil");
    }

    return { status: 201 as const, appointmentId: appt.id };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const enriched = await getAppointmentById(result.appointmentId);
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

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!existing) return { status: 404 as const, error: "Randevu bulunamadı" };

    const updates: Partial<typeof appointmentsTable.$inferInsert> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    if (newSlotId && newSlotId !== existing.slotId) {
      const [newSlot] = await tx
        .select()
        .from(appointmentSlotsTable)
        .where(eq(appointmentSlotsTable.id, newSlotId))
        .limit(1);

      if (!newSlot || !newSlot.isAvailable || newSlot.isBooked) {
        return { status: 400 as const, error: "Seçilen slot müsait değil" };
      }

      const [freedOld] = await tx
        .update(appointmentSlotsTable)
        .set({ isBooked: false })
        .where(
          and(
            eq(appointmentSlotsTable.id, existing.slotId),
            eq(appointmentSlotsTable.isBooked, true),
          ),
        )
        .returning();

      if (!freedOld) {
        return { status: 400 as const, error: "Eski slot güncellenemedi" };
      }

      const [bookedNew] = await tx
        .update(appointmentSlotsTable)
        .set({ isBooked: true })
        .where(
          and(
            eq(appointmentSlotsTable.id, newSlotId),
            eq(appointmentSlotsTable.isAvailable, true),
            eq(appointmentSlotsTable.isBooked, false),
          ),
        )
        .returning();

      if (!bookedNew) {
        throw new Error("Seçilen slot müsait değil");
      }

      updates.slotId = newSlotId;
    }

    if (status === "cancelled") {
      const [freedOld] = await tx
        .update(appointmentSlotsTable)
        .set({ isBooked: false })
        .where(
          and(
            eq(appointmentSlotsTable.id, existing.slotId),
            eq(appointmentSlotsTable.isBooked, true),
          ),
        )
        .returning();

      if (!freedOld) {
        return { status: 400 as const, error: "İptal işlemi tamamlanamadı" };
      }
    }

    await tx
      .update(appointmentsTable)
      .set(updates)
      .where(eq(appointmentsTable.id, id));

    return { status: 200 as const };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const enriched = await getAppointmentById(id);
  res.json(enriched);
});

export default router;
