import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

function jwtSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return "development-only-tiras-secret-key";
  }
  throw new Error("SESSION_SECRET must be configured");
}

const JWT_SECRET = jwtSecret();

export interface AuthUser {
  id: number;
  email: string;
  role: "barber" | "customer";
  name: string;
  authVersion: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function createToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Kimlik doğrulama gerekli" });
    return;
  }

  let payload: AuthUser;
  try {
    payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as AuthUser;
  } catch {
    res.status(401).json({ error: "Geçersiz token" });
    return;
  }

  try {
    const [user] = await db
      .select({ authVersion: usersTable.authVersion })
      .from(usersTable)
      .where(eq(usersTable.id, payload.id))
      .limit(1);

    // Tokens issued before authVersion was introduced represent version zero.
    const tokenAuthVersion = payload.authVersion ?? 0;
    if (!user || tokenAuthVersion !== user.authVersion) {
      res.status(401).json({ error: "Oturumun süresi dolmuş" });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireBarber(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== "barber") {
    res.status(403).json({ error: "Bu işlem için berber hesabı gerekli" });
    return;
  }
  next();
}

export function requireCustomer(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== "customer") {
    res.status(403).json({ error: "Bu işlem için müşteri hesabı gerekli" });
    return;
  }
  next();
}
