/**
 * Message routes: /api/messages/*
 * Handles sending and listing messages.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, usersTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ─── GET /api/messages ───────────────────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const messages = await db
    .select({
      id: messagesTable.id,
      senderId: messagesTable.senderId,
      receiverId: messagesTable.receiverId,
      content: messagesTable.content,
      isRead: messagesTable.isRead,
      createdAt: messagesTable.createdAt,
      senderName: sql<string>`s.name`,
      receiverName: sql<string>`r.name`,
    })
    .from(messagesTable)
    .innerJoin(sql`users s`, sql`s.id = ${messagesTable.senderId}`)
    .innerJoin(sql`users r`, sql`r.id = ${messagesTable.receiverId}`)
    .where(
      or(
        eq(messagesTable.senderId, userId),
        eq(messagesTable.receiverId, userId),
      ),
    )
    .orderBy(messagesTable.createdAt);

  res.json(messages);
});

// ─── POST /api/messages ──────────────────────────────────────────────────────
router.post("/", authenticate, async (req: AuthRequest, res) => {
  const senderId = req.user!.id;
  const { receiverIds, content } = req.body;

  if (
    !receiverIds ||
    !Array.isArray(receiverIds) ||
    receiverIds.length === 0
  ) {
    res.status(400).json({ error: "receiverIds zorunludur" });
    return;
  }

  if (!content || typeof content !== "string" || content.trim() === "") {
    res.status(400).json({ error: "content zorunludur" });
    return;
  }

  const inserted = await db
    .insert(messagesTable)
    .values(
      receiverIds.map((receiverId: number) => ({
        senderId,
        receiverId,
        content: content.trim(),
        isRead: false,
      })),
    )
    .returning();

  // Enrich with names
  const [sender] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, senderId))
    .limit(1);

  const result = await Promise.all(
    inserted.map(async (msg) => {
      const [receiver] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, msg.receiverId))
        .limit(1);

      return {
        ...msg,
        senderName: sender?.name || "",
        receiverName: receiver?.name || "",
      };
    }),
  );

  res.status(201).json(result);
});

export default router;
