/**
 * Auth routes: /api/auth/*
 * Handles registration, login, and current user lookup.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, barbersTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, createToken, type AuthRequest } from "../middlewares/auth";

const router = Router();
const PIN_RE = /^\d{6}$/;
const PHONE_RE = /^0\d{10}$/;

function normalizePhoneIdentifier(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return "";
  }
  if (trimmed.length === 10 && !trimmed.startsWith("0")) {
    return `0${trimmed}`;
  }
  if (PHONE_RE.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function normalizeLoginIdentifier(value: string) {
  const phone = normalizePhoneIdentifier(value);
  if (phone) {
    return { value: phone, isPhone: true };
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return { value: "", isPhone: false };
  }
  return { value: trimmed, isPhone: false };
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password, name, phone, role, shopName, shopAddress } = req.body;
  const normalizedEmail = typeof email === "string" ? normalizePhoneIdentifier(email) : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedPhone = typeof phone === "string" ? normalizePhoneIdentifier(phone) : "";
  const normalizedShopName = typeof shopName === "string" ? shopName.trim() : "";
  const normalizedShopAddress = typeof shopAddress === "string" ? normalizeText(shopAddress) : null;

  if (!normalizedEmail || !password || !normalizedName || !role) {
    res.status(400).json({ error: "Telefon numarası 10 haneli olmalı" });
    return;
  }

  if (!["barber", "customer"].includes(role)) {
    res.status(400).json({ error: "Geçersiz rol" });
    return;
  }

  if (!PIN_RE.test(password)) {
    res.status(400).json({ error: "Şifre 6 haneli rakamlardan oluşmalı" });
    return;
  }

  if (!PHONE_RE.test(normalizedEmail)) {
    res.status(400).json({ error: "Telefon numarası 10 haneli olmalı" });
    return;
  }

  if (role === "barber" && !normalizedShopName) {
    res.status(400).json({ error: "Berber için işletme adı zorunludur" });
    return;
  }

  // Check existing email
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Bu e-posta adresi zaten kullanılıyor" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.transaction(async (tx) => {
    const [insertedUser] = await tx
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: normalizedName,
        phone: normalizedPhone,
        role,
      })
      .returning();

    if (role === "barber") {
      await tx.insert(barbersTable).values({
        userId: insertedUser.id,
        shopName: normalizedShopName,
        shopAddress: normalizedShopAddress,
        isActive: true,
      });
    } else {
      await tx.insert(customersTable).values({ userId: insertedUser.id });
    }

    return insertedUser;
  });

  const token = createToken({
    id: user.id,
    email: user.email,
    role: user.role as "barber" | "customer",
    name: user.name,
  });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const rawEmail = typeof email === "string" ? email : "";
  const { value: normalizedEmail, isPhone } = normalizeLoginIdentifier(rawEmail);

  if (!normalizedEmail || !password || (isPhone && !PHONE_RE.test(normalizedEmail))) {
    res.status(400).json({ error: "Telefon numarası 10 haneli olmalı" });
    return;
  }

  if (!PIN_RE.test(password)) {
    res.status(400).json({ error: "Şifre 6 haneli rakamlardan oluşmalı" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "E-posta veya şifre hatalı" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "E-posta veya şifre hatalı" });
    return;
  }

  const token = createToken({
    id: user.id,
    email: user.email,
    role: user.role as "barber" | "customer",
    name: user.name,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// GET /api/auth/me
router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const user = req.user!;
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  if (!dbUser) {
    res.status(404).json({ error: "Kullanıcı bulunamadı" });
    return;
  }

  res.json({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    phone: dbUser.phone,
    role: dbUser.role,
    createdAt: dbUser.createdAt,
  });
});

export default router;
