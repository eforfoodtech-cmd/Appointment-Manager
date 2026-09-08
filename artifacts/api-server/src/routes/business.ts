import { Router } from "express";
import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  barbersTable,
  customersTable,
  servicesTable,
  barberAccessTable,
  barberCustomersTable,
  calendarExceptionsTable,
} from "@workspace/db";
import {
  authenticate,
  requireBarber,
  requireCustomer,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();
const integer = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
async function myBarber(req: AuthRequest) {
  const [row] = await db
    .select()
    .from(barbersTable)
    .where(eq(barbersTable.userId, req.user!.id));
  if (!row) throw new Error("Berber profili bulunamadı");
  return row;
}

router.get("/barbers/:barberId/services", async (req, res) => {
  const id = Number(req.params.barberId);
  if (!integer(id, 1, 2147483647)) {
    res.status(400).json({ error: "Geçersiz berber" });
    return;
  }
  res.json(
    await db
      .select()
      .from(servicesTable)
      .where(
        and(eq(servicesTable.barberId, id), eq(servicesTable.isActive, true)),
      )
      .orderBy(servicesTable.name),
  );
});

router.post(
  "/barbers/me/services",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const {
      name,
      description = "",
      priceKurus,
      durationMinutes,
      bufferMinutes = 0,
    } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      typeof description !== "string" ||
      description.length > 1000 ||
      !integer(priceKurus, 0, 100000000) ||
      !integer(durationMinutes, 5, 480) ||
      !integer(bufferMinutes, 0, 120)
    ) {
      res
        .status(400)
        .json({ error: "Hizmet adı, fiyatı ve süresini kontrol edin." });
      return;
    }
    const barber = await myBarber(req);
    const [row] = await db
      .insert(servicesTable)
      .values({
        barberId: barber.id,
        name: name.trim(),
        description: description.trim(),
        priceKurus,
        durationMinutes,
        bufferMinutes,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/barbers/me/services/:id",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const {
      name,
      description = "",
      priceKurus,
      durationMinutes,
      bufferMinutes = 0,
    } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      typeof description !== "string" ||
      description.length > 1000 ||
      !integer(priceKurus, 0, 100000000) ||
      !integer(durationMinutes, 5, 480) ||
      !integer(bufferMinutes, 0, 120)
    ) {
      res.status(400).json({ error: "Hizmet bilgilerini kontrol edin." });
      return;
    }
    const barber = await myBarber(req);
    const [row] = await db
      .update(servicesTable)
      .set({
        name: name.trim(),
        description,
        priceKurus,
        durationMinutes,
        bufferMinutes,
      })
      .where(
        and(
          eq(servicesTable.id, Number(req.params.id)),
          eq(servicesTable.barberId, barber.id),
          eq(servicesTable.isActive, true),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Hizmet bulunamadı" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/barbers/me/services/:id",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const barber = await myBarber(req);
    const [row] = await db
      .update(servicesTable)
      .set({ isActive: false })
      .where(
        and(
          eq(servicesTable.id, Number(req.params.id)),
          eq(servicesTable.barberId, barber.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Hizmet bulunamadı" });
      return;
    }
    res.status(204).end();
  },
);

router.get(
  "/barbers/me/access",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const barber = await myBarber(req);
    // Database uniqueness handles both concurrent initialization and random collisions.
    for (let attempt = 0; attempt < 20; attempt++) {
      const [existing] = await db
        .select()
        .from(barberAccessTable)
        .where(eq(barberAccessTable.barberId, barber.id));
      if (existing) {
        res.json(existing);
        return;
      }
      await db
        .insert(barberAccessTable)
        .values({
          barberId: barber.id,
          code: String(randomInt(100000, 1000000)),
        })
        .onConflictDoNothing();
    }
    res.status(503).json({ error: "Kod oluşturulamadı, tekrar deneyin." });
  },
);

router.post(
  "/customers/me/barbers/join",
  authenticate,
  requireCustomer,
  async (req: AuthRequest, res) => {
    const { code } = req.body;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "6 haneli berber kodu girin." });
      return;
    }
    const [access] = await db
      .select({ barberId: barberAccessTable.barberId })
      .from(barberAccessTable)
      .innerJoin(barbersTable, eq(barbersTable.id, barberAccessTable.barberId))
      .where(
        and(eq(barberAccessTable.code, code), eq(barbersTable.isActive, true)),
      );
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.userId, req.user!.id));
    if (!access || !customer) {
      res.status(404).json({ error: "Bu koda ait aktif berber bulunamadı." });
      return;
    }
    await db
      .insert(barberCustomersTable)
      .values({ barberId: access.barberId, customerId: customer.id })
      .onConflictDoNothing();
    res.json(access);
  },
);

router.get(
  "/customers/me/barbers",
  authenticate,
  requireCustomer,
  async (req: AuthRequest, res) => {
    const rows = await db
      .select({
        id: barbersTable.id,
        shopName: barbersTable.shopName,
        shopAddress: barbersTable.shopAddress,
      })
      .from(barberCustomersTable)
      .innerJoin(
        customersTable,
        eq(customersTable.id, barberCustomersTable.customerId),
      )
      .innerJoin(
        barbersTable,
        eq(barbersTable.id, barberCustomersTable.barberId),
      )
      .where(
        and(
          eq(customersTable.userId, req.user!.id),
          eq(barbersTable.isActive, true),
        ),
      );
    res.json(rows);
  },
);

router.get(
  "/barbers/me/customers",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const barber = await myBarber(req);
    const result = await db.execute(sql`
    SELECT bc.id, bc.customer_id AS "customerId", u.name, u.phone,
      bc.private_notes AS "privateNotes", bc.tags,
      count(a.id) FILTER (WHERE a.status = 'completed')::int AS visits,
      count(a.id) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
      max(s.date || ' ' || s.start_time) FILTER (WHERE a.status = 'completed') AS "lastVisit"
    FROM barber_customers bc JOIN customers c ON c.id = bc.customer_id JOIN users u ON u.id = c.user_id
    LEFT JOIN appointments a ON a.customer_id = c.id AND a.barber_id = bc.barber_id
    LEFT JOIN appointment_slots s ON s.id = a.slot_id
    WHERE bc.barber_id = ${barber.id} GROUP BY bc.id, u.id ORDER BY u.name
  `);
    res.json(result.rows);
  },
);

router.patch(
  "/barbers/me/customers/:id",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const { privateNotes = "", tags = "" } = req.body;
    if (
      typeof privateNotes !== "string" ||
      privateNotes.length > 5000 ||
      typeof tags !== "string" ||
      tags.length > 500
    ) {
      res.status(400).json({ error: "Not veya etiket çok uzun." });
      return;
    }
    const barber = await myBarber(req);
    const [row] = await db
      .update(barberCustomersTable)
      .set({ privateNotes, tags })
      .where(
        and(
          eq(barberCustomersTable.id, Number(req.params.id)),
          eq(barberCustomersTable.barberId, barber.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Müşteri bağlantısı bulunamadı" });
      return;
    }
    res.json(row);
  },
);

router.get(
  "/barbers/me/exceptions",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const barber = await myBarber(req);
    res.json(
      await db
        .select()
        .from(calendarExceptionsTable)
        .where(eq(calendarExceptionsTable.barberId, barber.id))
        .orderBy(calendarExceptionsTable.date),
    );
  },
);

router.post(
  "/barbers/me/exceptions",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const {
      date,
      endDate = date,
      startTime = "00:00",
      endTime = "24:00",
      reason = "Kapalı",
    } = req.body;
    const validTime = (v: unknown) =>
      typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      !validTime(startTime) ||
      !(validTime(endTime) || endTime === "24:00") ||
      startTime >= endTime ||
      typeof reason !== "string" ||
      reason.length > 200
    ) {
      res.status(400).json({ error: "Geçerli tarih ve saat aralığı girin." });
      return;
    }
    const count = (Date.parse(endDate) - Date.parse(date)) / 86400000 + 1;
    if (
      typeof endDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 90
    ) {
      res
        .status(400)
        .json({ error: "En fazla 90 günlük tarih aralığı seçin." });
      return;
    }
    const dates = Array.from({ length: count }, (_, i) =>
      new Date(Date.parse(date) + i * 86400000).toISOString().slice(0, 10),
    );
    if (dates[dates.length - 1] !== endDate) {
      res.status(400).json({ error: "Geçersiz bitiş tarihi." });
      return;
    }
    const barber = await myBarber(req);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${barber.id})`);
      const conflicts = await tx.execute(
        sql`SELECT a.id FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE a.barber_id=${barber.id} AND s.date >= ${date} AND s.date <= ${endDate} AND a.status IN ('pending','confirmed') AND s.start_time < ${endTime} AND s.end_time > ${startTime}`,
      );
      if (conflicts.rows.length) return null;
      const [row] = await tx
        .insert(calendarExceptionsTable)
        .values(
          dates.map((day) => ({
            barberId: barber.id,
            date: day,
            startTime,
            endTime,
            reason,
          })),
        )
        .returning();
      return row;
    });
    if (!result) {
      res
        .status(409)
        .json({
          error:
            "Bu aralıkta randevu var. Önce randevuyu taşıyın veya iptal edin.",
        });
      return;
    }
    res.status(201).json(result);
  },
);

router.delete(
  "/barbers/me/exceptions/:id",
  authenticate,
  requireBarber,
  async (req: AuthRequest, res) => {
    const barber = await myBarber(req);
    const [row] = await db
      .delete(calendarExceptionsTable)
      .where(
        and(
          eq(calendarExceptionsTable.id, Number(req.params.id)),
          eq(calendarExceptionsTable.barberId, barber.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
