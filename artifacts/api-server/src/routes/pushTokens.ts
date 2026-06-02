/**
 * Push token routes: /api/push-tokens
 * Authenticated users register/upsert their Expo push token.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db";
import { RegisterPushTokenBody } from "@workspace/api-zod";
import { authenticate, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ─── POST /api/push-tokens ───────────────────────────────────────────────────
router.post("/", authenticate, async (req: AuthRequest, res) => {
  const parsed = RegisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz push token verisi" });
    return;
  }

  const userId = req.user!.id;
  const { token } = parsed.data;
  const platform = parsed.data.platform ?? null;
  const now = new Date();

  const [row] = await db
    .insert(pushTokensTable)
    .values({ userId, token, platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId, platform, lastSeenAt: now, updatedAt: now },
    })
    .returning();

  res.status(201).json(row);
});

export default router;
