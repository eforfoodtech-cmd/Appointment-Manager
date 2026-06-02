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
import { eq, and, sql, inArray } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/auth";
import {
  scheduleAppointmentReminders,
  cancelAppointmentReminders,
} from "../lib/notifications";

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

function getNowInIstanbul(): { date: string; minutesOfDay: number } {
  const str = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" });
  const [datePart, timePart] = str.split(" ");
  const [hStr, mStr] = (timePart ?? "00:00").split(":");
  return {
    date: datePart ?? "",
    minutesOfDay: parseInt(hStr ?? "0", 10) * 60 + parseInt(mStr ?? "0", 10),
  };
}

// Returns ms timestamp for "YYYY-MM-DD HH:MM" interpreted as Europe/Istanbul (UTC+3, no DST).
function istanbulToMs(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00+03:00`).getTime();
}

// Lazy auto-complete: any pending/confirmed appointment whose slot date is before
// today (Istanbul time) is auto-marked completed. Today's appointments are left
// active until end of day so the barber can still mark them as no_show after they
// finish. Idempotent; safe to call frequently.
export async function autoCompletePastAppointments(
  txOrDb: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> } = db,
): Promise<void> {
  const { date: nowDate } = getNowInIstanbul();
  // Only auto-complete appointments on past days. Today's pending/confirmed
  // appointments stay active until end of day so the barber can still mark
  // them as no_show after they finish.
  await txOrDb.execute(sql`
    UPDATE appointments SET status='completed', updated_at=NOW()
    WHERE status IN ('pending','confirmed')
      AND slot_id IN (
        SELECT id FROM appointment_slots
        WHERE date < ${nowDate}
      )
  `);
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
      customerName: sql<string>`COALESCE(cu.name, ${appointmentsTable.manualCustomerName}, '')`,
      customerPhone: sql<string | null>`cu.phone`,
      isManual: sql<boolean>`(${appointmentsTable.customerId} IS NULL)`,
    })
    .from(appointmentsTable)
    .innerJoin(
      appointmentSlotsTable,
      eq(appointmentSlotsTable.id, appointmentsTable.slotId),
    )
    .innerJoin(barbersTable, eq(barbersTable.id, appointmentsTable.barberId))
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .leftJoin(
      customersTable,
      eq(customersTable.id, appointmentsTable.customerId),
    )
    .leftJoin(sql`users cu`, sql`cu.id = ${customersTable.userId}`)
    .where(eq(appointmentsTable.id, id))
    .limit(1);

  return appt;
}

// ─── GET /api/appointments ───────────────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res) => {
  await autoCompletePastAppointments();
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
      customerName: sql<string>`COALESCE(cu.name, ${appointmentsTable.manualCustomerName}, '')`,
      customerPhone: sql<string | null>`cu.phone`,
      isManual: sql<boolean>`(${appointmentsTable.customerId} IS NULL)`,
    })
    .from(appointmentsTable)
    .innerJoin(
      appointmentSlotsTable,
      eq(appointmentSlotsTable.id, appointmentsTable.slotId),
    )
    .innerJoin(barbersTable, eq(barbersTable.id, appointmentsTable.barberId))
    .innerJoin(usersTable, eq(usersTable.id, barbersTable.userId))
    .leftJoin(
      customersTable,
      eq(customersTable.id, appointmentsTable.customerId),
    )
    .leftJoin(sql`users cu`, sql`cu.id = ${customersTable.userId}`)
    .where(and(...whereConditions))
    .orderBy(appointmentSlotsTable.date, appointmentSlotsTable.startTime);

  res.json(appts);
});

// ─── POST /api/appointments ──────────────────────────────────────────────────
router.post("/", authenticate, async (req: AuthRequest, res) => {
  const user = req.user!;
  const {
    slotId,
    notes,
    customerId: manualCustomerId,
    manualCustomerName: manualNameRaw,
  } = req.body;

  if (!slotId) {
    res.status(400).json({ error: "slotId zorunludur" });
    return;
  }

  const manualCustomerName =
    typeof manualNameRaw === "string" ? manualNameRaw.trim() : "";
  const isManualByName =
    user.role === "barber" && manualCustomerName.length > 0;

  if (user.role === "barber" && !manualCustomerId && !isManualByName) {
    res.status(400).json({ error: "Müşteri adı zorunlu" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await autoCompletePastAppointments(tx);
    const [slot] = await tx
      .select()
      .from(appointmentSlotsTable)
      .where(eq(appointmentSlotsTable.id, slotId))
      .limit(1);

    if (!slot) return { status: 404 as const, error: "Slot bulunamadı" };

    if (!slot.isAvailable || slot.isBooked) {
      return { status: 400 as const, error: "Bu slot müsait değil" };
    }

    // Barber-only: cannot book for another barber's slot
    if (user.role === "barber") {
      const [b] = await tx
        .select({ id: barbersTable.id })
        .from(barbersTable)
        .where(eq(barbersTable.userId, user.id))
        .limit(1);
      if (!b || b.id !== slot.barberId) {
        return { status: 403 as const, error: "Bu slota randevu ekleyemezsiniz" };
      }
    }

    const { date: nowDate, minutesOfDay: nowMinutes } = getNowInIstanbul();
    if (
      slot.date < nowDate ||
      (slot.date === nowDate && timeToMinutes(slot.startTime) <= nowMinutes)
    ) {
      return { status: 400 as const, error: "Bu randevu saati artık alınamaz" };
    }

    let customerId: number | null = null;

    if (user.role === "barber" && isManualByName) {
      customerId = null; // manual appointment, name only
    } else if (user.role === "barber" && manualCustomerId) {
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

      // One active appointment per (customer, barber). Active = pending|confirmed.
      // Past statuses (completed, cancelled, no_show) do not block re-booking.
      const activeAtBarber = await tx
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.customerId, customerId),
            eq(appointmentsTable.barberId, slot.barberId),
            inArray(appointmentsTable.status, ["pending", "confirmed"]),
          ),
        )
        .limit(1);

      if (activeAtBarber.length > 0) {
        return {
          status: 409 as const,
          error:
            "Bu berberde zaten aktif bir randevunuz var. Yeni randevu almak için mevcut randevunuzu iptal edin.",
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
        manualCustomerName: isManualByName ? manualCustomerName : null,
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

  // Faz 1B: schedule 1-day + 1-hour reminders for app customers.
  // Failure here must never break booking.
  try {
    await scheduleAppointmentReminders({
      appointmentId: result.appointmentId,
      customerId: enriched?.customerId ?? null,
      date: enriched?.date ?? "",
      startTime: enriched?.startTime ?? "",
      shopName: enriched?.shopName ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Randevu hatırlatmaları planlanamadı");
  }

  res.status(201).json(enriched);
});

// ─── GET /api/appointments/:id ───────────────────────────────────────────────
router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  await autoCompletePastAppointments();
  const id = Number(req.params["id"]);
  const appt = await getAppointmentById(id);

  if (!appt) {
    res.status(404).json({ error: "Randevu bulunamadı" });
    return;
  }

  // Ownership check: caller must own this appointment.
  const userRole = req.user!.role;
  if (userRole === "customer") {
    const [c] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.userId, req.user!.id))
      .limit(1);
    if (!c || c.id !== appt.customerId) {
      res.status(403).json({ error: "Bu randevuya erişim yetkiniz yok" });
      return;
    }
  } else if (userRole === "barber") {
    const [b] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, req.user!.id))
      .limit(1);
    if (!b || b.id !== appt.barberId) {
      res.status(403).json({ error: "Bu randevuya erişim yetkiniz yok" });
      return;
    }
  }

  res.json(appt);
});

// ─── PATCH /api/appointments/:id ─────────────────────────────────────────────
router.patch("/:id", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  const { status, slotId: newSlotId, notes } = req.body;
  const userRole = req.user!.role;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!existing) return { status: 404 as const, error: "Randevu bulunamadı" };

    // Ownership check: caller must own this appointment.
    if (userRole === "customer") {
      const [c] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.userId, req.user!.id))
        .limit(1);
      if (!c || c.id !== existing.customerId) {
        return { status: 403 as const, error: "Bu randevuya erişim yetkiniz yok" };
      }
    } else if (userRole === "barber") {
      const [b] = await tx
        .select({ id: barbersTable.id })
        .from(barbersTable)
        .where(eq(barbersTable.userId, req.user!.id))
        .limit(1);
      if (!b || b.id !== existing.barberId) {
        return { status: 403 as const, error: "Bu randevuya erişim yetkiniz yok" };
      }
    }

    // Guard: no_show only valid for active appointments
    if (status === "no_show" && existing.status !== "pending" && existing.status !== "confirmed") {
      return { status: 400 as const, error: "Bu randevu zaten kapatılmış" };
    }

    const updates: Partial<typeof appointmentsTable.$inferInsert> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    // Time-gated transitions: load slot once for no_show / cancelled paths
    if (status === "no_show" || status === "cancelled") {
      const [s] = await tx
        .select({
          date: appointmentSlotsTable.date,
          startTime: appointmentSlotsTable.startTime,
        })
        .from(appointmentSlotsTable)
        .where(eq(appointmentSlotsTable.id, existing.slotId))
        .limit(1);

      if (!s) return { status: 404 as const, error: "Slot bulunamadı" };

      const slotStartMs = istanbulToMs(s.date, s.startTime);
      const nowMs = Date.now();
      const { date: nowDate } = getNowInIstanbul();

      if (status === "no_show") {
        if (nowMs < slotStartMs) {
          return { status: 400 as const, error: "Randevu saati henüz gelmedi" };
        }
        // Past days can no longer be marked no_show; they are auto-completed.
        // Same-day appointments stay markable until end of day (23:59).
        if (s.date < nowDate) {
          return { status: 400 as const, error: "Bu randevu artık kapatılmış" };
        }
        // Manual appointments have no app customer → just mark status, no block
        if (existing.customerId != null) {
          const existingCustomerId = existing.customerId;
          // Idempotently create a 1-month no-show block for this barber/customer
          const blocks = await tx
            .select()
            .from(noShowBlocksTable)
            .where(
              and(
                eq(noShowBlocksTable.barberId, existing.barberId),
                eq(noShowBlocksTable.customerId, existingCustomerId),
              ),
            );
          const now = new Date();
          const hasActive = blocks.some(
            (b) => !b.expiresAt || new Date(b.expiresAt) > now,
          );
          if (!hasActive) {
            const exp = new Date();
            exp.setMonth(exp.getMonth() + 1);
            await tx.insert(noShowBlocksTable).values({
              barberId: existing.barberId,
              customerId: existingCustomerId,
              reason: "No-show",
              expiresAt: exp,
            });
          }
        }
      }

      if (status === "cancelled" && userRole === "customer") {
        const diffMin = (slotStartMs - nowMs) / 60000;
        if (diffMin <= 0) {
          return {
            status: 400 as const,
            error: "Randevu saati geçtiği için iptal edemezsiniz.",
          };
        }
        if (diffMin <= 5 * 60) {
          return {
            status: 400 as const,
            error: "Randevuya 5 saatten az kaldığı için iptal edemezsiniz.",
          };
        }
      }
    }

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

      // Faz 1B: cancel pending reminders atomically within the same tx so we
      // never leave reminders that could still fire after cancellation.
      await cancelAppointmentReminders(id, tx);
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
