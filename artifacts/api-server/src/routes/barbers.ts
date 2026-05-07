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
import { eq, and, sql, inArray, or, isNull, gt } from "drizzle-orm";
import {
  authenticate,
  requireBarber,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_DURATIONS = [30, 45, 60, 90];

function isValidTime(t: string, allowMidnight = false): boolean {
  if (!TIME_RE.test(t)) return false;
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  if (allowMidnight && h === 24 && m === 0) return true;
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function timeToMinutes(t: string): number {
  const [hStr, mStr] = t.split(":");
  return parseInt(hStr!, 10) * 60 + parseInt(mStr!, 10);
}

function normalizeDate(date: string): string | null {
  if (!DATE_RE.test(date)) return null;
  return date;
}

function isValidAvailabilityRow(item: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  slotDuration: number;
}): string | null {
  if (typeof item.dayOfWeek !== "number" || item.dayOfWeek < 0 || item.dayOfWeek > 6) {
    return `Geçersiz dayOfWeek: ${item.dayOfWeek}. 0–6 arasında olmalı.`;
  }
  if (typeof item.isOpen !== "boolean") {
    return `dayOfWeek ${item.dayOfWeek}: isOpen boolean olmalı.`;
  }
  if (typeof item.slotDuration !== "number" || !VALID_DURATIONS.includes(item.slotDuration)) {
    return `dayOfWeek ${item.dayOfWeek}: Slot süresi 30, 45, 60 veya 90 dk olmalı.`;
  }
  if (!item.isOpen) return null;
  if (!isValidTime(item.startTime, false)) {
    return `dayOfWeek ${item.dayOfWeek}: Başlangıç saati geçersiz (ÖR: 09:00). 00:00–23:59 arası olmalı.`;
  }
  if (!isValidTime(item.endTime, true)) {
    return `dayOfWeek ${item.dayOfWeek}: Bitiş saati geçersiz (ÖR: 23:00 veya 24:00). 00:01–24:00 arası olmalı.`;
  }
  if (timeToMinutes(item.startTime) >= timeToMinutes(item.endTime)) {
    return `dayOfWeek ${item.dayOfWeek}: Başlangıç saati bitiş saatinden önce olmalı.`;
  }
  return null;
}

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
      .where(eq(availabilityTable.barberId, barber.id))
      .orderBy(availabilityTable.dayOfWeek);

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

    const items: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isOpen: boolean;
      slotDuration: number;
    }> = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.json([]);
      return;
    }

    for (const item of items) {
      const error = isValidAvailabilityRow(item);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      if (!item.isOpen) continue;
    }

    const inserted = await db.transaction(async (tx) => {
      await tx.delete(availabilityTable).where(eq(availabilityTable.barberId, barber.id));
      return tx
        .insert(availabilityTable)
        .values(
          items.map((item) => ({
            barberId: barber.id,
            dayOfWeek: item.dayOfWeek,
            startTime: item.startTime,
            endTime: item.endTime,
            isOpen: item.isOpen,
            slotDuration: item.slotDuration,
          })),
        )
        .returning();
    });

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

    const date = normalizeDate((req.query["date"] as string) || new Date().toISOString().split("T")[0]);
    if (!date) {
      res.status(400).json({ error: "date geçersiz. YYYY-MM-DD formatında olmalı." });
      return;
    }

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

    const activeAppts = todayAppts.filter(
      (a) => a.status === "pending" || a.status === "confirmed",
    );
    const pendingCount = activeAppts.length;
    const completedCount = todayAppts.filter((a) => a.status === "completed").length;
    const noShowCount = todayAppts.filter((a) => a.status === "no_show").length;
    const cancelledCount = todayAppts.filter((a) => a.status === "cancelled").length;

    const now = new Date().toTimeString().slice(0, 5);
    const nextAppt =
      activeAppts.find(
        (a) =>
          a.startTime > now &&
          (a.status === "confirmed" || a.status === "pending"),
      ) || null;

    res.json({
      todayCount: activeAppts.length,
      pendingCount,
      completedCount,
      noShowCount,
      cancelledCount,
      todayAppointments: activeAppts,
      nextAppointment: nextAppt,
    });
  },
);

// ─── Slot generation helper ───────────────────────────────────────────────────
function generateSlotPairs(
  startTime: string,
  endTime: string,
  durationMinutes: number,
): Array<{ startTime: string; endTime: string }> {
  const [sh, sm] = startTime.split(":").map(Number) as [number, number];
  const [eh, em] = endTime.split(":").map(Number) as [number, number];
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const pairs: Array<{ startTime: string; endTime: string }> = [];
  for (let t = startMin; t + durationMinutes <= endMin; t += durationMinutes) {
    const s = t;
    const e = t + durationMinutes;
    pairs.push({
      startTime: `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
      endTime:   `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`,
    });
  }
  return pairs;
}

// ─── POST /api/barbers/me/slots/seed-week ─────────────────────────────────────
// Fills empty days in the next 7 days using the barber's weekly availability template.
//
// Rules:
//  1. If a day already has ANY slots → skip (never overwrite manual edits).
//  2. If barber has NO availability template at all → use default 13-slot schedule.
//  3. If template exists for that day_of_week and is_open=true → generate slots from template.
//  4. If template exists for that day_of_week and is_open=false → no slots (closed day).
//  5. If template exists but has no entry for that day_of_week → no slots.
router.post(
  "/me/slots/seed-week",
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

    // Load the barber's weekly availability template
    const availRows = await db
      .select()
      .from(availabilityTable)
      .where(eq(availabilityTable.barberId, barber.id));

    const hasTemplate = availRows.length > 0;
    // Map dayOfWeek → template row
    const templateMap = new Map(availRows.map((r) => [r.dayOfWeek, r]));

    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split("T")[0]!);
    }

    // Standard fallback schedule: 10:00–23:00 in 1-hour slots (13 slots)
    const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 10);

    let totalInserted = 0;
    const summary: Record<string, { inserted: number; skipped: boolean; closed?: boolean }> = {};

    for (const date of dates) {
      const dayOfWeek = new Date(date + "T12:00:00").getDay(); // 0=Sun…6=Sat

      // If template marks this day as closed → delete unbooked slots, skip insert
      if (hasTemplate) {
        const tmpl = templateMap.get(dayOfWeek);
        if (!tmpl || !tmpl.isOpen) {
          await db
            .delete(appointmentSlotsTable)
            .where(
              and(
                eq(appointmentSlotsTable.barberId, barber.id),
                eq(appointmentSlotsTable.date, date),
                eq(appointmentSlotsTable.isBooked, false),
              ),
            );
          summary[date] = { inserted: 0, skipped: false, closed: true };
          req.log.info({ barberId: barber.id, date, dayOfWeek }, "seed-week: day closed, cleared unbooked slots");
          continue;
        }
      }

      if (hasTemplate) {
        // ── Template sync for open day ─────────────────────────────────────
        // 1. Delete unbooked slots whose startTime is NOT in the template
        // 2. Insert template slots that are missing
        // 3. Never touch booked slots
        const tmpl = templateMap.get(dayOfWeek)!; // already confirmed isOpen above
        const slotPairs = generateSlotPairs(tmpl.startTime, tmpl.endTime, tmpl.slotDuration);
        const templateStartTimes = slotPairs.map((p) => p.startTime);

        const existingSlots = await db
          .select({
            id: appointmentSlotsTable.id,
            startTime: appointmentSlotsTable.startTime,
            isBooked: appointmentSlotsTable.isBooked,
          })
          .from(appointmentSlotsTable)
          .where(
            and(
              eq(appointmentSlotsTable.barberId, barber.id),
              eq(appointmentSlotsTable.date, date),
            ),
          );

        // Delete unbooked slots that are outside the new template
        // Also guard against FK violations: exclude slots that have any appointment row
        const candidateIds = existingSlots
          .filter((s) => !s.isBooked && !templateStartTimes.includes(s.startTime))
          .map((s) => s.id);

        let toDelete: number[] = [];
        if (candidateIds.length > 0) {
          const referenced = await db
            .select({ slotId: appointmentsTable.slotId })
            .from(appointmentsTable)
            .where(inArray(appointmentsTable.slotId, candidateIds));
          const referencedIds = new Set(referenced.map((r) => r.slotId));
          toDelete = candidateIds.filter((id) => !referencedIds.has(id));
        }

        if (toDelete.length > 0) {
          await db
            .delete(appointmentSlotsTable)
            .where(inArray(appointmentSlotsTable.id, toDelete));
        }

        // Insert template slots that don't exist yet
        const existingStartTimes = new Set(existingSlots.map((s) => s.startTime));
        const toInsert = slotPairs
          .filter((p) => !existingStartTimes.has(p.startTime))
          .map((p) => ({
            barberId: barber.id,
            date,
            startTime: p.startTime,
            endTime: p.endTime,
            isAvailable: true,
            isBooked: false,
          }));
        if (toInsert.length > 0) {
          await db.insert(appointmentSlotsTable).values(toInsert);
        }

        totalInserted += toInsert.length;
        summary[date] = { inserted: toInsert.length, skipped: false };
        req.log.info(
          { barberId: barber.id, date, inserted: toInsert.length, deleted: toDelete.length },
          "seed-week: synced open day",
        );
        continue;
      }

      // ── No-template fallback: skip if any slots exist, else insert defaults ──
      const existing = await db
        .select({ id: appointmentSlotsTable.id })
        .from(appointmentSlotsTable)
        .where(
          and(
            eq(appointmentSlotsTable.barberId, barber.id),
            eq(appointmentSlotsTable.date, date),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        summary[date] = { inserted: 0, skipped: true };
        req.log.info({ barberId: barber.id, date }, "seed-week: no template, day has slots, skipped");
        continue;
      }

      const slotPairs = DEFAULT_HOURS.map((hour) => ({
        startTime: `${String(hour).padStart(2, "0")}:00`,
        endTime:   `${String(hour + 1).padStart(2, "0")}:00`,
      }));
      req.log.info({ barberId: barber.id, date, count: slotPairs.length }, "seed-week: no template, using default");

      if (slotPairs.length === 0) {
        summary[date] = { inserted: 0, skipped: false };
        continue;
      }

      const toInsert = slotPairs.map((p) => ({
        barberId: barber.id,
        date,
        startTime: p.startTime,
        endTime: p.endTime,
        isAvailable: true,
        isBooked: false,
      }));

      await db.insert(appointmentSlotsTable).values(toInsert);
      totalInserted += toInsert.length;
      summary[date] = { inserted: toInsert.length, skipped: false };
      req.log.info({ barberId: barber.id, date, inserted: toInsert.length }, "seed-week: day seeded");
    }

    req.log.info({ barberId: barber.id, totalInserted }, "seed-week: completed");
    res.json({ ok: true, totalInserted, summary });
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
    if (!DATE_RE.test(date)) {
      res.status(400).json({ error: "date geçersiz. YYYY-MM-DD formatında olmalı." });
      return;
    }
    if (!isValidTime(startTime, false)) {
      res.status(400).json({ error: "startTime geçersiz (ÖR: 09:00). 00:00–23:59 arası olmalı." });
      return;
    }
    if (!isValidTime(endTime, true)) {
      res.status(400).json({ error: "endTime geçersiz (ÖR: 10:00 veya 24:00). 00:01–24:00 arası olmalı." });
      return;
    }
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      res.status(400).json({ error: "startTime endTime'dan önce olmalı." });
      return;
    }

    const [existingSlot] = await db
      .select({ id: appointmentSlotsTable.id })
      .from(appointmentSlotsTable)
      .where(
        and(
          eq(appointmentSlotsTable.barberId, barber.id),
          eq(appointmentSlotsTable.date, date),
          eq(appointmentSlotsTable.startTime, startTime),
        ),
      )
      .limit(1);

    if (existingSlot) {
      res.status(400).json({ error: "Bu tarih ve saatte zaten slot var" });
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

    if (typeof isAvailable !== "boolean") {
      res.status(400).json({ error: "isAvailable boolean (true/false) olmalı." });
      return;
    }

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
    if (!Number.isInteger(slotId)) {
      res.status(400).json({ error: "slotId geçersiz" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [slot] = await tx
        .select({ id: appointmentSlotsTable.id })
        .from(appointmentSlotsTable)
        .where(
          and(
            eq(appointmentSlotsTable.id, slotId),
            eq(appointmentSlotsTable.barberId, barber.id),
            eq(appointmentSlotsTable.isBooked, false),
          ),
        )
        .limit(1);

      if (!slot) return null;

      await tx.delete(appointmentsTable).where(eq(appointmentsTable.slotId, slotId));
      await tx.delete(appointmentSlotsTable).where(eq(appointmentSlotsTable.id, slotId));
      return slot;
    });

    if (!result) {
      res.status(404).json({ error: "Slot bulunamadı veya dolu slot silinemez" });
      return;
    }

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

    const [customer] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(customersTable)
      .innerJoin(usersTable, eq(usersTable.id, customersTable.userId))
      .where(eq(customersTable.id, customerId))
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Müşteri bulunamadı" });
      return;
    }

    const now = new Date();
    const [existingBlock] = await db
      .select({ id: noShowBlocksTable.id })
      .from(noShowBlocksTable)
      .where(
        and(
          eq(noShowBlocksTable.barberId, barber.id),
          eq(noShowBlocksTable.customerId, customerId),
          or(
            isNull(noShowBlocksTable.expiresAt),
            gt(noShowBlocksTable.expiresAt, now),
          ),
        ),
      )
      .limit(1);

    if (existingBlock) {
      res.status(400).json({ error: "Bu müşteri zaten engellenmiş" });
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

    res.status(201).json({
      ...block,
      customerName: customer.name || "",
      customerPhone: customer.phone || null,
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

  const rows = await db
    .select({
      id: appointmentSlotsTable.id,
      barberId: appointmentSlotsTable.barberId,
      date: appointmentSlotsTable.date,
      startTime: appointmentSlotsTable.startTime,
      endTime: appointmentSlotsTable.endTime,
      isAvailable: appointmentSlotsTable.isAvailable,
      isBooked: appointmentSlotsTable.isBooked,
      appointmentId: appointmentsTable.id,
      appointmentNotes: appointmentsTable.notes,
      appointmentStatus: appointmentsTable.status,
      customerName: sql<string>`cu.name`,
      customerPhone: sql<string>`cu.phone`,
    })
    .from(appointmentSlotsTable)
    .leftJoin(
      appointmentsTable,
      and(
        eq(appointmentsTable.slotId, appointmentSlotsTable.id),
        sql`${appointmentsTable.status} NOT IN ('cancelled', 'no_show')`,
      ),
    )
    .leftJoin(customersTable, eq(customersTable.id, appointmentsTable.customerId))
    .leftJoin(sql`users cu`, sql`cu.id = ${customersTable.userId}`)
    .where(
      and(
        eq(appointmentSlotsTable.barberId, barberId),
        eq(appointmentSlotsTable.date, date),
      ),
    )
    .orderBy(appointmentSlotsTable.startTime);

  const slots = rows.map((r) => ({
    id: r.id,
    barberId: r.barberId,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    isAvailable: r.isAvailable,
    isBooked: r.isBooked,
    appointment:
      r.appointmentId != null
        ? {
            id: r.appointmentId,
            notes: r.appointmentNotes,
            status: r.appointmentStatus,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
          }
        : null,
  }));

  res.json(slots);
});

export default router;
