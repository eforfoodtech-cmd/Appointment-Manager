/**
 * Auth routes: /api/auth/*
 * Handles registration, login, current-user lookup, and password recovery.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import {
  barbersTable,
  customersTable,
  db,
  passwordResetsTable,
  usersTable,
} from "@workspace/db";
import {
  authenticate,
  createToken,
  type AuthRequest,
} from "../middlewares/auth";
import {
  deliverPasswordResetCode,
  type PasswordResetChannel,
} from "../lib/passwordResetDelivery";
import { logger } from "../lib/logger";
import {
  parseCanonicalTurkishPhone,
  toTurkishPhoneE164,
} from "../lib/phone";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{6}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 100;
const BUSINESS_NAME_MAX_LENGTH = 160;
const ADDRESS_MAX_LENGTH = 500;
const PASSWORD_MIN_BYTES = 6;
const PASSWORD_MAX_BYTES = 72;
const BCRYPT_ROUNDS = 10;
const GENERIC_RESET_MESSAGE =
  "Bilgiler eşleşiyorsa şifre sıfırlama kodu gönderildi.";
const INVALID_RESET_CODE_MESSAGE = "Kod geçersiz veya süresi dolmuş.";
const INVALID_RESET_TOKEN_MESSAGE =
  "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.";

type NormalizedIdentifier = {
  value: string;
  kind: PasswordResetChannel;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const passwordResetRateLimits = new Map<string, RateLimitBucket>();
const MAX_RATE_LIMIT_BUCKETS = 20_000;

function envInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function otpExpiryMinutes() {
  return envInteger("PASSWORD_RESET_OTP_TTL_MINUTES", 10, 1, 60);
}

function tokenExpiryMinutes() {
  return envInteger("PASSWORD_RESET_TOKEN_TTL_MINUTES", 10, 1, 60);
}

function maxOtpAttempts() {
  return envInteger("PASSWORD_RESET_MAX_ATTEMPTS", 5, 3, 10);
}

function rateLimitWindowSeconds() {
  return envInteger("PASSWORD_RESET_RATE_WINDOW_SECONDS", 900, 60, 3_600);
}

function maxIdentifierRequestsPerWindow() {
  return envInteger("PASSWORD_RESET_RATE_MAX_REQUESTS", 5, 2, 20);
}

function maxIpRequestsPerWindow() {
  return envInteger("PASSWORD_RESET_IP_RATE_MAX_REQUESTS", 50, 10, 500);
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return normalized.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(normalized)
    ? normalized
    : "";
}

function normalizeIdentifier(value: unknown): NormalizedIdentifier | null {
  const email = normalizeEmail(value);
  if (email) return { value: email, kind: "email" };

  const phone = parseCanonicalTurkishPhone(value);
  if (phone) return { value: phone, kind: "phone" };

  return null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function normalizeNames(
  firstValue: unknown,
  lastValue: unknown,
  fallbackFullName?: unknown,
) {
  let firstName = normalizeText(firstValue);
  let lastName = normalizeText(lastValue);

  if ((!firstName || !lastName) && typeof fallbackFullName === "string") {
    const parts = normalizeText(fallbackFullName).split(" ").filter(Boolean);
    if (!firstName && parts.length > 0) {
      firstName = parts.shift() ?? "";
    }
    if (!lastName && parts.length > 0) {
      lastName = parts.join(" ");
    }
  }

  return { firstName, lastName };
}

function passwordValidationError(value: unknown) {
  if (typeof value !== "string") {
    return "Şifre zorunludur.";
  }

  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength < PASSWORD_MIN_BYTES || byteLength > PASSWORD_MAX_BYTES) {
    return "Şifre 6 ile 72 karakter arasında olmalıdır.";
  }

  return null;
}

function lookupCondition(identifier: NormalizedIdentifier) {
  return identifier.kind === "email"
    ? eq(usersTable.email, identifier.value)
    : or(
        eq(usersTable.phone, identifier.value),
        // Compatibility for legacy demo rows that stored phone in `email`.
        eq(usersTable.email, identifier.value),
      );
}

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function resetPepper() {
  const pepper =
    process.env.PASSWORD_RESET_SECRET ??
    process.env.PASSWORD_RESET_PEPPER ??
    process.env.SESSION_SECRET;
  if (pepper) return pepper;

  if (process.env.NODE_ENV === "development") {
    return "development-only-password-reset-pepper";
  }

  throw new Error("PASSWORD_RESET_SECRET or SESSION_SECRET must be configured");
}

function hashOtp(resetId: string, code: string) {
  return createHmac("sha256", resetPepper())
    .update(`${resetId}:${code}`)
    .digest("hex");
}

function otpMatches(expectedHash: string, resetId: string, code: string) {
  const actual = Buffer.from(hashOtp(resetId, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashResetToken(token: string) {
  return createHmac("sha256", resetPepper()).update(token).digest("hex");
}

function exposeResetCode() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PASSWORD_RESET_EXPOSE_CODE === "true"
  );
}

function ensurePasswordResetConfigured(res: Response) {
  try {
    resetPepper();
    return true;
  } catch (error) {
    logger.error({ err: error }, "Password reset secret is not configured");
    res.status(503).json({
      error: "Şifre sıfırlama hizmeti şu anda kullanılamıyor.",
    });
    return false;
  }
}

function rateLimitKey(scope: "ip" | "identifier", value: string) {
  return `${scope}:${createHash("sha256").update(value).digest("hex")}`;
}

function cleanupRateLimitBuckets(now: number) {
  for (const [key, bucket] of passwordResetRateLimits) {
    if (bucket.resetAt <= now) passwordResetRateLimits.delete(key);
  }

  while (passwordResetRateLimits.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = passwordResetRateLimits.keys().next().value;
    if (oldestKey === undefined) break;
    passwordResetRateLimits.delete(oldestKey);
  }
}

function consumePasswordResetRateLimit(
  ip: string,
  identifier: NormalizedIdentifier,
) {
  const now = Date.now();
  cleanupRateLimitBuckets(now);

  const windowMs = rateLimitWindowSeconds() * 1_000;
  const limits = [
    {
      key: rateLimitKey("ip", ip),
      maximum: maxIpRequestsPerWindow(),
    },
    {
      key: rateLimitKey("identifier", `${identifier.kind}:${identifier.value}`),
      maximum: maxIdentifierRequestsPerWindow(),
    },
  ];
  const buckets = limits.map(({ key }) => {
    const current = passwordResetRateLimits.get(key);
    return current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };
  });

  const blockedBucket = buckets.find(
    (bucket, index) => bucket.count >= limits[index]!.maximum,
  );
  if (blockedBucket) {
    return Math.max(1, Math.ceil((blockedBucket.resetAt - now) / 1_000));
  }

  limits.forEach(({ key }, index) => {
    const bucket = buckets[index]!;
    passwordResetRateLimits.delete(key);
    passwordResetRateLimits.set(key, {
      count: bucket.count + 1,
      resetAt: bucket.resetAt,
    });
  });
  return 0;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const role = req.body?.role;
  const email = normalizeEmail(req.body?.email);
  const phone = parseCanonicalTurkishPhone(req.body?.phone);
  const password = req.body?.password;

  if (role !== "barber" && role !== "customer") {
    res.status(400).json({ error: "Geçersiz kullanıcı rolü." });
    return;
  }

  if (!email) {
    res.status(400).json({ error: "Geçerli bir e-posta adresi girin." });
    return;
  }

  if (!phone) {
    res.status(400).json({ error: "Geçerli bir telefon numarası girin." });
    return;
  }

  const passwordError = passwordValidationError(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const legacyLastName = req.body?.surname ?? req.body?.lastName;
  const customerNames = normalizeNames(
    req.body?.firstName ?? (legacyLastName ? req.body?.name : undefined),
    req.body?.lastName ?? req.body?.surname,
    req.body?.name,
  );
  const barberNames = normalizeNames(
    req.body?.authorizedFirstName ??
      req.body?.ownerFirstName ??
      (req.body?.surname ? req.body?.name : undefined),
    req.body?.authorizedLastName ??
      req.body?.ownerLastName ??
      req.body?.surname,
    req.body?.ownerName ?? req.body?.name,
  );
  const { firstName, lastName } =
    role === "barber" ? barberNames : customerNames;

  if (!firstName || !lastName) {
    res.status(400).json({ error: "Ad ve soyad zorunludur." });
    return;
  }
  if (firstName.length > NAME_MAX_LENGTH || lastName.length > NAME_MAX_LENGTH) {
    res
      .status(400)
      .json({ error: "Ad ve soyad en fazla 100 karakter olabilir." });
    return;
  }

  const businessName = normalizeText(
    req.body?.businessName ?? req.body?.shopName,
  );
  const address = normalizeText(req.body?.address ?? req.body?.shopAddress);

  if (role === "barber" && (!businessName || !address)) {
    res.status(400).json({ error: "İşletme adı ve açık adres zorunludur." });
    return;
  }
  if (
    role === "barber" &&
    (businessName.length > BUSINESS_NAME_MAX_LENGTH ||
      address.length > ADDRESS_MAX_LENGTH)
  ) {
    res.status(400).json({
      error:
        "İşletme adı en fazla 160, açık adres en fazla 500 karakter olabilir.",
    });
    return;
  }

  const duplicate = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      or(
        eq(usersTable.email, email),
        eq(usersTable.phone, phone),
        // Covers legacy rows before their demo data is migrated.
        eq(usersTable.email, phone),
      ),
    )
    .limit(1);

  if (duplicate.length > 0) {
    res
      .status(409)
      .json({ error: "Bu e-posta veya telefon numarası zaten kullanılıyor." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const displayName = `${firstName} ${lastName}`;

  try {
    const user = await db.transaction(async (tx) => {
      const [insertedUser] = await tx
        .insert(usersTable)
        .values({
          email,
          passwordHash,
          name: displayName,
          firstName,
          lastName,
          phone,
          role,
        })
        .returning();

      if (role === "barber") {
        await tx.insert(barbersTable).values({
          userId: insertedUser.id,
          shopName: businessName,
          shopAddress: address,
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
      role: user.role,
      name: user.name,
      authVersion: user.authVersion,
    });

    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({
        error: "Bu e-posta veya telefon numarası zaten kullanılıyor.",
      });
      return;
    }
    throw error;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const identifier = normalizeIdentifier(
    req.body?.identifier ?? req.body?.email ?? req.body?.phone,
  );
  const password = req.body?.password;

  if (!identifier) {
    res
      .status(400)
      .json({ error: "Geçerli bir e-posta veya telefon numarası girin." });
    return;
  }

  const passwordError = passwordValidationError(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(lookupCondition(identifier))
    .limit(1);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "E-posta/telefon veya şifre hatalı." });
    return;
  }

  const token = createToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    authVersion: user.authVersion,
  });

  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  res.json(publicUser(user));
});

// POST /api/auth/password-reset/request
router.post("/password-reset/request", async (req, res) => {
  if (!ensurePasswordResetConfigured(res)) return;

  const identifier = normalizeIdentifier(req.body?.identifier);
  const requestedChannel = req.body?.channel;

  if (!identifier) {
    res
      .status(400)
      .json({ error: "Geçerli bir e-posta veya telefon numarası girin." });
    return;
  }

  if (
    requestedChannel !== undefined &&
    requestedChannel !== "email" &&
    requestedChannel !== "phone"
  ) {
    res.status(400).json({ error: "Geçersiz şifre sıfırlama yöntemi." });
    return;
  }

  const retryAfterSeconds = consumePasswordResetRateLimit(
    req.ip ?? req.socket.remoteAddress ?? "unknown",
    identifier,
  );
  if (retryAfterSeconds > 0) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error:
        "Çok fazla şifre sıfırlama isteği. Lütfen daha sonra tekrar deneyin.",
    });
    return;
  }

  const channel: PasswordResetChannel = requestedChannel ?? identifier.kind;
  const decoyResetId = randomUUID();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(lookupCondition(identifier))
    .limit(1);

  const canonicalPhone = parseCanonicalTurkishPhone(user?.phone);
  const destination =
    channel === "email"
      ? normalizeEmail(user?.email)
      : canonicalPhone
        ? toTurkishPhoneE164(canonicalPhone)
        : "";

  if (!user || !destination) {
    // Do the same secret-dependent operation used by a real request, without
    // writing a row for an unknown account.
    const decoyCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    hashOtp(decoyResetId, decoyCode);
    res.json({
      message: GENERIC_RESET_MESSAGE,
      resetId: decoyResetId,
      ...(exposeResetCode() ? { testCode: decoyCode } : {}),
    });
    return;
  }

  const resetId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + otpExpiryMinutes() * 60_000);

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetsTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetsTable.userId, user.id),
          isNull(passwordResetsTable.usedAt),
        ),
      );

    await tx.insert(passwordResetsTable).values({
      id: resetId,
      userId: user.id,
      channel,
      codeHash: hashOtp(resetId, code),
      expiresAt,
    });
  });

  res.json({
    message: GENERIC_RESET_MESSAGE,
    resetId,
    ...(exposeResetCode() ? { testCode: code } : {}),
  });

  void deliverPasswordResetCode({
    channel,
    destination,
    code,
    expiresAt,
    resetId,
  }).catch((error) => {
    logger.error(
      { err: error, channel, resetId },
      "Password reset delivery failed",
    );
  });
});

// POST /api/auth/password-reset/verify
router.post("/password-reset/verify", async (req, res) => {
  if (!ensurePasswordResetConfigured(res)) return;

  const resetId =
    typeof req.body?.resetId === "string" ? req.body.resetId.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!UUID_RE.test(resetId) || !OTP_RE.test(code)) {
    res.status(400).json({ error: INVALID_RESET_CODE_MESSAGE });
    return;
  }

  const now = new Date();
  const [challenge] = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.id, resetId),
        isNull(passwordResetsTable.usedAt),
        isNull(passwordResetsTable.verifiedAt),
        gt(passwordResetsTable.expiresAt, now),
        lt(passwordResetsTable.attemptCount, maxOtpAttempts()),
      ),
    )
    .limit(1);

  if (!challenge) {
    res.status(400).json({ error: INVALID_RESET_CODE_MESSAGE });
    return;
  }

  const [attempt] = await db
    .update(passwordResetsTable)
    .set({
      attemptCount: sql`${passwordResetsTable.attemptCount} + 1`,
    })
    .where(
      and(
        eq(passwordResetsTable.id, challenge.id),
        eq(passwordResetsTable.attemptCount, challenge.attemptCount),
        isNull(passwordResetsTable.usedAt),
        isNull(passwordResetsTable.verifiedAt),
      ),
    )
    .returning({ attemptCount: passwordResetsTable.attemptCount });

  if (!attempt) {
    res.status(400).json({ error: INVALID_RESET_CODE_MESSAGE });
    return;
  }

  if (!otpMatches(challenge.codeHash, challenge.id, code)) {
    if (attempt.attemptCount >= maxOtpAttempts()) {
      await db
        .update(passwordResetsTable)
        .set({ usedAt: now })
        .where(eq(passwordResetsTable.id, challenge.id));
    }
    res.status(400).json({ error: INVALID_RESET_CODE_MESSAGE });
    return;
  }

  const resetToken = randomBytes(32).toString("base64url");
  const tokenExpiresAt = new Date(
    now.getTime() + tokenExpiryMinutes() * 60_000,
  );
  const [verified] = await db
    .update(passwordResetsTable)
    .set({
      verifiedAt: now,
      resetTokenHash: hashResetToken(resetToken),
      tokenExpiresAt,
    })
    .where(
      and(
        eq(passwordResetsTable.id, challenge.id),
        isNull(passwordResetsTable.usedAt),
        isNull(passwordResetsTable.verifiedAt),
      ),
    )
    .returning({ id: passwordResetsTable.id });

  if (!verified) {
    res.status(400).json({ error: INVALID_RESET_CODE_MESSAGE });
    return;
  }

  res.json({
    message: "Kod doğrulandı.",
    resetToken,
  });
});

class InvalidResetTokenError extends Error {}

async function resetPassword(req: Request, res: Response) {
  if (!ensurePasswordResetConfigured(res)) return;

  const resetToken =
    typeof req.body?.resetToken === "string" ? req.body.resetToken.trim() : "";
  const newPassword = req.body?.newPassword;

  if (!RESET_TOKEN_RE.test(resetToken)) {
    res.status(400).json({ error: INVALID_RESET_TOKEN_MESSAGE });
    return;
  }

  const passwordError = passwordValidationError(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const now = new Date();
  const tokenHash = hashResetToken(resetToken);
  const [challenge] = await db
    .select({
      id: passwordResetsTable.id,
      userId: passwordResetsTable.userId,
    })
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.resetTokenHash, tokenHash),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.tokenExpiresAt, now),
      ),
    )
    .limit(1);

  if (!challenge) {
    res.status(400).json({ error: INVALID_RESET_TOKEN_MESSAGE });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  try {
    await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(passwordResetsTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetsTable.id, challenge.id),
            eq(passwordResetsTable.resetTokenHash, tokenHash),
            isNull(passwordResetsTable.usedAt),
            gt(passwordResetsTable.tokenExpiresAt, now),
          ),
        )
        .returning({ userId: passwordResetsTable.userId });

      if (!consumed) {
        throw new InvalidResetTokenError();
      }

      await tx
        .update(usersTable)
        .set({
          passwordHash,
          authVersion: sql`${usersTable.authVersion} + 1`,
        })
        .where(eq(usersTable.id, consumed.userId));

      // A successful password change revokes every other active recovery flow.
      await tx
        .update(passwordResetsTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetsTable.userId, consumed.userId),
            isNull(passwordResetsTable.usedAt),
          ),
        );
    });
  } catch (error) {
    if (error instanceof InvalidResetTokenError) {
      res.status(400).json({ error: INVALID_RESET_TOKEN_MESSAGE });
      return;
    }
    throw error;
  }

  res.json({ message: "Şifreniz başarıyla güncellendi." });
}

// POST /api/auth/password-reset/reset
router.post("/password-reset/reset", resetPassword);

export default router;
