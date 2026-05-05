import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["SESSION_SECRET"] || "tiras-secret-key";

export interface AuthUser {
  id: number;
  email: string;
  role: "barber" | "customer";
  name: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function createToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Kimlik doğrulama gerekli" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Geçersiz token" });
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
