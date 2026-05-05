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

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password, name, phone, role, shopName, shopAddress } = req.body;

  if (!email || !password || !name || !role) {
    res.status(400).json({ error: "email, password, name ve role zorunludur" });
    return;
  }

  if (!["barber", "customer"].includes(role)) {
    res.status(400).json({ error: "Geçersiz rol" });
    return;
  }

  if (role === "barber" && !shopName) {
    res.status(400).json({ error: "Berber için işletme adı zorunludur" });
    return;
  }

  // Check existing email
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Bu e-posta adresi zaten kullanılıyor" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      phone: phone || null,
      role,
    })
    .returning();

  // Create role-specific profile
  if (role === "barber") {
    await db.insert(barbersTable).values({
      userId: user.id,
      shopName,
      shopAddress: shopAddress || null,
      isActive: true,
    });
  } else {
    await db.insert(customersTable).values({ userId: user.id });
  }

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

  if (!email || !password) {
    res.status(400).json({ error: "email ve password zorunludur" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
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
