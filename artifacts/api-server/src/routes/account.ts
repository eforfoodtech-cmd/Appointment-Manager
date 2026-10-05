import { Router } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  accountSettingsTable,
  contactVerificationsTable,
  userNotificationsTable,
  pushTokensTable,
  userSessionsTable,
} from "@workspace/db";
import { authenticate, type AuthRequest } from "../middlewares/auth";

const router = Router();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const passwordValid = (p: unknown): p is string =>
  typeof p === "string" &&
  Buffer.byteLength(p) >= 6 &&
  Buffer.byteLength(p) <= 72;
const imageValid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length < 1800000 &&
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
async function settings(userId: number) {
  await db
    .insert(accountSettingsTable)
    .values({ userId })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(accountSettingsTable)
    .where(eq(accountSettingsTable.userId, userId));
  return row;
}

router.get("/account", authenticate, async (req: AuthRequest, res) => {
  const [user] = await db
    .select({
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  res.json({ ...user, ...(await settings(req.user!.id)) });
});

router.patch("/account", authenticate, async (req: AuthRequest, res) => {
  const { name, email, phone } = req.body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100 ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof phone !== "string" ||
    !/^5\d{9}$/.test(phone)
  ) {
    res
      .status(400)
      .json({ error: "Ad, e-posta ve 10 haneli telefonu kontrol edin." });
    return;
  }
  // Contact changes affect login and password recovery; require the current password.
  const [current] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  if (
    typeof req.body.currentPassword !== "string" ||
    !(await bcrypt.compare(req.body.currentPassword, current.passwordHash))
  ) {
    res.status(403).json({ error: "Mevcut şifrenizi doğrulayın." });
    return;
  }
  try {
    await settings(current.id);
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ name: name.trim(), email: email.trim().toLowerCase(), phone })
        .where(eq(usersTable.id, current.id));
      if (
        current.email !== email.trim().toLowerCase() ||
        current.phone !== phone
      ) {
        await tx
          .update(accountSettingsTable)
          .set({
            ...(current.email !== email.trim().toLowerCase()
              ? { emailVerifiedAt: null }
              : {}),
            ...(current.phone !== phone ? { phoneVerifiedAt: null } : {}),
          })
          .where(eq(accountSettingsTable.userId, current.id));
      }
    });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      res
        .status(409)
        .json({ error: "Bu telefon veya e-posta zaten kullanımda." });
      return;
    }
    throw error;
  }
});

router.put("/account/media", authenticate, async (req: AuthRequest, res) => {
  const { avatar = null, gallery = [] } = req.body;
  if (
    (avatar !== null && !imageValid(avatar)) ||
    !Array.isArray(gallery) ||
    gallery.length > 6 ||
    !gallery.every(imageValid) ||
    (req.user!.role !== "barber" && gallery.length)
  ) {
    res.status(400).json({
      error:
        "En fazla 6 JPEG, PNG veya WebP görsel yükleyin (görsel başına yaklaşık 1 MB).",
    });
    return;
  }
  await settings(req.user!.id);
  await db
    .update(accountSettingsTable)
    .set({ avatar, gallery })
    .where(eq(accountSettingsTable.userId, req.user!.id));
  res.json({ ok: true });
});
router.get("/barbers/:id/media", async (req, res) => {
  const result = await db.execute(
    sql`SELECT a.avatar, a.gallery FROM account_settings a JOIN barbers b ON b.user_id=a.user_id WHERE b.id=${Number(req.params.id)} AND b.is_active=true`,
  );
  res.json(result.rows[0] ?? { avatar: null, gallery: [] });
});

router.post(
  "/account/password",
  authenticate,
  async (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!passwordValid(newPassword) || typeof currentPassword !== "string") {
      res.status(400).json({ error: "Şifre 6–72 bayt olmalıdır." });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      res.status(403).json({ error: "Mevcut şifre hatalı." });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash, authVersion: sql`${usersTable.authVersion} + 1` })
      .where(eq(usersTable.id, user.id));
    await db.delete(pushTokensTable).where(eq(pushTokensTable.userId, user.id));
    await db
      .update(userSessionsTable)
      .set({ revoked: true })
      .where(eq(userSessionsTable.userId, user.id));
    res.json({ ok: true });
  },
);
router.post(
  "/account/logout-all",
  authenticate,
  async (req: AuthRequest, res) => {
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ authVersion: sql`${usersTable.authVersion} + 1` })
        .where(eq(usersTable.id, req.user!.id));
      await tx
        .delete(pushTokensTable)
        .where(eq(pushTokensTable.userId, req.user!.id));
      await tx
        .update(userSessionsTable)
        .set({ revoked: true })
        .where(eq(userSessionsTable.userId, req.user!.id));
    });
    res.json({ ok: true });
  },
);

router.post(
  "/account/verification",
  authenticate,
  async (req: AuthRequest, res) => {
    const { channel } = req.body;
    if (!["email", "phone"].includes(channel)) {
      res.status(400).json({ error: "Geçersiz kanal" });
      return;
    }
    const webhook =
      channel === "email"
        ? process.env.CONTACT_EMAIL_WEBHOOK_URL
        : process.env.CONTACT_SMS_WEBHOOK_URL;
    if (!webhook) {
      res
        .status(503)
        .json({ error: "Doğrulama gönderimi henüz yapılandırılmadı." });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    const destination = channel === "email" ? user.email : user.phone;
    if (!destination) {
      res.status(400).json({ error: "Önce iletişim bilgisini kaydedin." });
      return;
    }
    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString("hex");
    const record = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(42, ${user.id})`);
      const recent = await tx.execute(
        sql`SELECT count(*)::int AS count FROM contact_verifications WHERE user_id=${user.id} AND created_at > NOW() - INTERVAL '15 minutes'`,
      );
      if (Number(recent.rows[0]?.count) >= 5) return null;
      const [row] = await tx
        .insert(contactVerificationsTable)
        .values({
          userId: user.id,
          channel,
          destination,
          codeHash: `${salt}:${hash(salt + code)}`,
          expiresAt: new Date(Date.now() + 600000),
        })
        .returning();
      return row;
    });
    if (!record) {
      res
        .status(429)
        .json({ error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." });
      return;
    }
    try {
      const r = await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CONTACT_WEBHOOK_TOKEN
            ? { Authorization: `Bearer ${process.env.CONTACT_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          purpose: "contact_verification",
          channel,
          to: destination,
          code,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error("Delivery failed");
      res.json({ id: record.id });
    } catch {
      await db
        .update(contactVerificationsTable)
        .set({ used: true })
        .where(eq(contactVerificationsTable.id, record.id));
      res.status(503).json({ error: "Kod gönderilemedi. Daha sonra deneyin." });
    }
  },
);

router.post(
  "/account/verification/confirm",
  authenticate,
  async (req: AuthRequest, res) => {
    const { id, code } = req.body;
    if (
      !Number.isInteger(id) ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    ) {
      res.status(400).json({ error: "Geçersiz kod" });
      return;
    }
    const ok = await db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(contactVerificationsTable)
        .where(
          and(
            eq(contactVerificationsTable.id, id),
            eq(contactVerificationsTable.userId, req.user!.id),
          ),
        )
        .for("update");
      if (
        !record ||
        record.used ||
        record.attempts >= 5 ||
        record.expiresAt < new Date()
      )
        return false;
      await tx
        .update(contactVerificationsTable)
        .set({ attempts: record.attempts + 1 })
        .where(eq(contactVerificationsTable.id, id));
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id))
        .for("update");
      if (
        record.codeHash.split(":")[1] !==
          hash(record.codeHash.split(":")[0] + code) ||
        record.destination !==
          (record.channel === "email" ? user.email : user.phone)
      )
        return false;
      await tx
        .insert(accountSettingsTable)
        .values({ userId: user.id })
        .onConflictDoNothing();
      await tx
        .update(accountSettingsTable)
        .set(
          record.channel === "email"
            ? { emailVerifiedAt: new Date() }
            : { phoneVerifiedAt: new Date() },
        )
        .where(eq(accountSettingsTable.userId, user.id));
      await tx
        .update(contactVerificationsTable)
        .set({ used: true })
        .where(eq(contactVerificationsTable.id, id));
      return true;
    });
    res
      .status(ok ? 200 : 400)
      .json(ok ? { ok: true } : { error: "Kod hatalı veya süresi dolmuş." });
  },
);

router.get("/notifications", authenticate, async (req: AuthRequest, res) => {
  res.json(
    await db
      .select()
      .from(userNotificationsTable)
      .where(eq(userNotificationsTable.userId, req.user!.id))
      .orderBy(desc(userNotificationsTable.createdAt))
      .limit(100),
  );
});
router.patch(
  "/notifications/:id/read",
  authenticate,
  async (req: AuthRequest, res) => {
    await db
      .update(userNotificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(userNotificationsTable.id, Number(req.params.id)),
          eq(userNotificationsTable.userId, req.user!.id),
        ),
      );
    res.json({ ok: true });
  },
);

router.get("/account/sessions", authenticate, async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(userSessionsTable)
    .where(
      and(
        eq(userSessionsTable.userId, req.user!.id),
        eq(userSessionsTable.revoked, false),
      ),
    )
    .orderBy(desc(userSessionsTable.lastSeenAt));
  res.json(
    rows
      .filter((row) => row.expiresAt > new Date())
      .map((row) => ({
        id: row.tokenHash,
        device: row.device,
        lastSeenAt: row.lastSeenAt,
        current: row.tokenHash === req.sessionHash,
      })),
  );
});
router.delete(
  "/account/sessions/:id",
  authenticate,
  async (req: AuthRequest, res) => {
    await db
      .update(userSessionsTable)
      .set({ revoked: true })
      .where(
        and(
          eq(userSessionsTable.userId, req.user!.id),
          eq(userSessionsTable.tokenHash, String(req.params.id)),
        ),
      );
    res.json({ ok: true });
  },
);

router.delete("/account", authenticate, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  if (
    req.body.confirmation !== "HESABIMI SİL" ||
    typeof req.body.currentPassword !== "string" ||
    !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))
  ) {
    res
      .status(400)
      .json({ error: "Mevcut şifrenizi ve HESABIMI SİL onayını girin." });
    return;
  }
  const randomHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  const removed = await db.transaction(async (tx) => {
    const active = await tx.execute(
      sql`SELECT a.id FROM appointments a LEFT JOIN customers c ON c.id=a.customer_id JOIN barbers b ON b.id=a.barber_id WHERE (c.user_id=${user.id} OR b.user_id=${user.id}) AND a.status IN ('pending','confirmed')`,
    );
    if (active.rows.length) return false;
    await tx
      .update(usersTable)
      .set({
        name: "Silinmiş hesap",
        firstName: null,
        lastName: null,
        email: `deleted-${user.id}-${randomBytes(8).toString("hex")}@invalid.local`,
        phone: null,
        passwordHash: randomHash,
        authVersion: sql`${usersTable.authVersion} + 1`,
      })
      .where(eq(usersTable.id, user.id));
    await tx.execute(
      sql`UPDATE barbers SET is_active=false, shop_name='Silinmiş işletme', shop_address=NULL, bio=NULL WHERE user_id=${user.id}`,
    );
    await tx.execute(
      sql`UPDATE barber_customers SET private_notes='', tags='' WHERE customer_id IN (SELECT id FROM customers WHERE user_id=${user.id}) OR barber_id IN (SELECT id FROM barbers WHERE user_id=${user.id})`,
    );
    await tx.execute(sql`DELETE FROM password_resets WHERE user_id=${user.id}`);
    await tx.execute(
      sql`DELETE FROM scheduled_notifications WHERE user_id=${user.id}`,
    );
    await tx
      .delete(accountSettingsTable)
      .where(eq(accountSettingsTable.userId, user.id));
    await tx
      .delete(contactVerificationsTable)
      .where(eq(contactVerificationsTable.userId, user.id));
    await tx
      .delete(userNotificationsTable)
      .where(eq(userNotificationsTable.userId, user.id));
    await tx
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.userId, user.id));
    await tx.delete(pushTokensTable).where(eq(pushTokensTable.userId, user.id));
    return true;
  });
  res
    .status(removed ? 200 : 409)
    .json(
      removed
        ? { ok: true }
        : { error: "Önce aktif randevularınızı kapatın veya iptal edin." },
    );
});
export default router;
