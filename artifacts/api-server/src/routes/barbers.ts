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
import { autoCompletePastAppointments } from "./appointments";

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

function getNowIstanbul(): { date: string; minutesOfDay: number } {
  const str = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" });
  const [datePart, timePart] = str.split(" ");
  const [hStr, mStr] = (timePart ?? "00:00").split(":");
  return {
    date: datePart ?? "",
    minutesOfDay: parseInt(hStr ?? "0", 10) * 60 + parseInt(mStr ?? "0", 10),
  };
}

function isSlotPast(slotDate: string, slotStartTime: string): boolean {
  const { date: nowDate, minutesOfDay: nowMin } = getNowIstanbul();
  return (
    slotDate < nowDate ||
    (slotDate === nowDate && timeToMinutes(slotStartTime) <= nowMin)
  );
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

    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split("T")[0]!);
    }

    const templateMap = new Map(
      inserted.map((row) => [
        row.dayOfWeek,
        row.isOpen
          ? {
              startTime: row.startTime,
              endTime: row.endTime,
              slotDuration: row.slotDuration,
            }
          : null,
      ]),
    );

    for (const date of dates) {
      const dayOfWeek = new Date(date + "T12:00:00").getDay();
      const tmpl = templateMap.get(dayOfWeek);

      if (!tmpl) {
        await syncDaySlots(barber.id, date, null);
        continue;
      }

      const slotPairs = generateSlotPairs(tmpl.startTime, tmpl.endTime, tmpl.slotDuration);
      await syncDaySlots(barber.id, date, slotPairs);
    }

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

    await autoCompletePastAppointments();
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

// ─── Authoritative slot sync for one day ─────────────────────────────────────
// Three-tier categorisation of existing slots:
//
//  ACTIVE    – slot has a pending|confirmed appointment   → never touch
//  FK-LINKED – slot has only cancelled|completed|no_show  → cannot DELETE (FK
//              RESTRICT); mark is_available=false instead, or restore if the
//              startTime still belongs to the new template
//  FREE      – slot has no appointments at all            → safe to DELETE
//
// After cleanup, insert template slots whose startTime is not already occupied
// by an ACTIVE or FK-LINKED slot.
async function syncDaySlots(
  barberId: number,
  date: string,
  slotPairs: Array<{ startTime: string; endTime: string }> | null,
): Promise<{ inserted: number; deleted: number; hidden: number }> {
  // 1. Fetch all existing slots for this barber+date
  const allSlots = await db
    .select({
      id: appointmentSlotsTable.id,
      startTime: appointmentSlotsTable.startTime,
      endTime: appointmentSlotsTable.endTime,
    })
    .from(appointmentSlotsTable)
    .where(
      and(
        eq(appointmentSlotsTable.barberId, barberId),
        eq(appointmentSlotsTable.date, date),
      ),
    );

  // 2. Categorise by appointments linked to each slot
  const activeSlotIds = new Set<number>();   // pending | confirmed → fully protect
  const fkLinkedSlotIds = new Set<number>(); // cancelled | completed | no_show → FK-blocked

  if (allSlots.length > 0) {
    const slotIds = allSlots.map((s) => s.id);
    const appts = await db
      .select({ slotId: appointmentsTable.slotId, status: appointmentsTable.status })
      .from(appointmentsTable)
      .where(inArray(appointmentsTable.slotId, slotIds));

    for (const appt of appts) {
      if (appt.status === "pending" || appt.status === "confirmed") {
        activeSlotIds.add(appt.slotId);
      } else if (!activeSlotIds.has(appt.slotId)) {
        fkLinkedSlotIds.add(appt.slotId);
      }
    }
    // If a slot has both active and non-active appts, active wins
    for (const id of activeSlotIds) fkLinkedSlotIds.delete(id);
  }

  // 3. Delete FREE slots (no appointments at all)
  const freeSlotIds = allSlots
    .filter((s) => !activeSlotIds.has(s.id) && !fkLinkedSlotIds.has(s.id))
    .map((s) => s.id);

  if (freeSlotIds.length > 0) {
    await db
      .delete(appointmentSlotsTable)
      .where(inArray(appointmentSlotsTable.id, freeSlotIds));
  }

  // 4. Build template lookup (null = closed day)
  const templateByStart = new Map(
    (slotPairs ?? []).map((p) => [p.startTime, p]),
  );

  // 5. Handle FK-LINKED slots: restore if template has same startTime, else hide
  const fkLinkedSlots = allSlots.filter((s) => fkLinkedSlotIds.has(s.id));
  let hidden = 0;
  for (const slot of fkLinkedSlots) {
    const pair = templateByStart.get(slot.startTime);
    if (pair && slotPairs) {
      // Slot startTime is in the new template → update endTime and restore
      await db
        .update(appointmentSlotsTable)
        .set({ endTime: pair.endTime, isAvailable: true, isBooked: false })
        .where(eq(appointmentSlotsTable.id, slot.id));
    } else {
      // Slot startTime not in template (or day closed) → hide from customers
      await db
        .update(appointmentSlotsTable)
        .set({ isAvailable: false, isBooked: false })
        .where(eq(appointmentSlotsTable.id, slot.id));
      hidden++;
    }
  }

  // 6. If closed day, stop here
  if (!slotPairs || slotPairs.length === 0) {
    return { inserted: 0, deleted: freeSlotIds.length, hidden };
  }

  // 7. Insert new slots for template pairs not occupied by ACTIVE/FK-LINKED slots
  // and which do not OVERLAP an ACTIVE (booked) slot's time interval. This
  // prevents creating a free slot like 11:30–12:00 alongside a booked 11:00–12:00
  // when the day's slot duration shrinks.
  const occupiedStartTimes = new Set<string>(
    allSlots
      .filter((s) => activeSlotIds.has(s.id) || fkLinkedSlotIds.has(s.id))
      .map((s) => s.startTime),
  );

  const activeRanges = allSlots
    .filter((s) => activeSlotIds.has(s.id))
    .map((s) => ({
      start: timeToMinutes(s.startTime),
      end: timeToMinutes(s.endTime),
    }));

  const overlapsActive = (startTime: string, endTime: string): boolean => {
    const ns = timeToMinutes(startTime);
    const ne = timeToMinutes(endTime);
    return activeRanges.some((r) => ns < r.end && ne > r.start);
  };

  const toInsert = slotPairs
    .filter((p) => !occupiedStartTimes.has(p.startTime) && !overlapsActive(p.startTime, p.endTime))
    .map((p) => ({
      barberId,
      date,
      startTime: p.startTime,
      endTime: p.endTime,
      isAvailable: true,
      isBooked: false,
    }));

  if (toInsert.length > 0) {
    await db.insert(appointmentSlotsTable).values(toInsert);
  }

  return { inserted: toInsert.length, deleted: freeSlotIds.length, hidden };
}

// ─── POST /api/barbers/me/slots/seed-week ─────────────────────────────────────
// Syncs the next 7 days of slots to the barber's weekly availability template.
// Uses syncDaySlots: nukes all non-protected slots, re-inserts from template.
// Protected = slots with pending|confirmed appointments (never touched).
// No template → default 10:00–23:00 60-min slots (only if day has NO slots yet).
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

    const availRows = await db
      .select()
      .from(availabilityTable)
      .where(eq(availabilityTable.barberId, barber.id));

    const hasTemplate = availRows.length > 0;
    const templateMap = new Map(availRows.map((r) => [r.dayOfWeek, r]));

    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split("T")[0]!);
    }

    let totalInserted = 0;
    const summary: Record<string, { inserted: number; deleted: number; closed?: boolean }> = {};

    for (const date of dates) {
      const dayOfWeek = new Date(date + "T12:00:00").getDay();

      if (hasTemplate) {
        const tmpl = templateMap.get(dayOfWeek);

        // Closed day or no template entry → wipe unprotected slots, insert nothing
        if (!tmpl || !tmpl.isOpen) {
          const result = await syncDaySlots(barber.id, date, null);
          summary[date] = { ...result, closed: true };
          req.log.info({ barberId: barber.id, date, dayOfWeek, ...result }, "seed-week: day closed");
          continue;
        }

        // Open day → full sync against template
        const slotPairs = generateSlotPairs(tmpl.startTime, tmpl.endTime, tmpl.slotDuration);
        const result = await syncDaySlots(barber.id, date, slotPairs);
        totalInserted += result.inserted;
        summary[date] = result;
        req.log.info({ barberId: barber.id, date, ...result }, "seed-week: synced open day");
        continue;
      }

      // No template → only seed if day currently has NO slots at all
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
        summary[date] = { inserted: 0, deleted: 0 };
        req.log.info({ barberId: barber.id, date }, "seed-week: no template, day has slots, skipped");
        continue;
      }

      // Default: 10:00–23:00 in 60-min slots
      const defaultPairs = generateSlotPairs("10:00", "23:00", 60);
      const result = await syncDaySlots(barber.id, date, defaultPairs);
      totalInserted += result.inserted;
      summary[date] = result;
      req.log.info({ barberId: barber.id, date, ...result }, "seed-week: seeded with defaults");
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

    const [slot] = await db
      .select({
        id: appointmentSlotsTable.id,
        date: appointmentSlotsTable.date,
        startTime: appointmentSlotsTable.startTime,
        isBooked: appointmentSlotsTable.isBooked,
      })
      .from(appointmentSlotsTable)
      .where(
        and(
          eq(appointmentSlotsTable.id, slotId),
          eq(appointmentSlotsTable.barberId, barber.id),
        ),
      )
      .limit(1);

    if (!slot) {
      res.status(404).json({ error: "Slot bulunamadı" });
      return;
    }

    if (isSlotPast(slot.date, slot.startTime)) {
      res.status(409).json({ error: "Geçmiş slot değiştirilemez" });
      return;
    }

    if (slot.isBooked) {
      res.status(409).json({ error: "Randevulu slot değiştirilemez" });
      return;
    }

    const [updated] = await db
      .update(appointmentSlotsTable)
      .set({ isAvailable })
      .where(eq(appointmentSlotsTable.id, slotId))
      .returning();

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

    const [slot] = await db
      .select({
        id: appointmentSlotsTable.id,
        date: appointmentSlotsTable.date,
        startTime: appointmentSlotsTable.startTime,
        isBooked: appointmentSlotsTable.isBooked,
      })
      .from(appointmentSlotsTable)
      .where(
        and(
          eq(appointmentSlotsTable.id, slotId),
          eq(appointmentSlotsTable.barberId, barber.id),
        ),
      )
      .limit(1);

    if (!slot) {
      res.status(404).json({ error: "Slot bulunamadı" });
      return;
    }

    if (isSlotPast(slot.date, slot.startTime)) {
      res.status(409).json({ error: "Geçmiş slot silinemez" });
      return;
    }

    if (slot.isBooked) {
      res.status(409).json({ error: "Randevulu slot silinemez" });
      return;
    }

    // isBooked=false garantili — bağlı cancelled/no_show appointment'ları da temizle (FK safety)
    await db.transaction(async (tx) => {
      await tx.delete(appointmentsTable).where(eq(appointmentsTable.slotId, slotId));
      await tx.delete(appointmentSlotsTable).where(eq(appointmentSlotsTable.id, slotId));
    });

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
